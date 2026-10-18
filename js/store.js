/* المخزن المحلي أولاً + المزامنة مع Google Apps Script + تسجيل الدخول عبر Google Identity */
(function () {
  'use strict';
  const K = { state: 'ipd.v1.state', queue: 'ipd.v1.queue', cursor: 'ipd.v1.cursor', cfg: 'ipd.v1.cfg', tok: 'ipd.v1.idt' };
  const ENT = ['investments', 'transactions', 'fx', 'prices', 'snapshots', 'settings', 'audit'];
  const NOAUDIT = { prices: 1, snapshots: 1, audit: 1 };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const DEFAULT_SETTINGS = { baseCurrency: 'OMR', costMethod: 'WAC', trackCash: false, staleHours: 24, lang: 'ar' };

  let state = ls.get(K.state, null) || {}; ENT.forEach((e) => { state[e] = state[e] || []; });
  let queue = ls.get(K.queue, []); let cursor = ls.get(K.cursor, 0);
  let version = 0; const subs = []; let syncing = false, timer = null;
  const sync = { status: 'local', error: null, lastSync: ls.get('ipd.v1.last', null) };

  const emit = () => { version++; subs.forEach((f) => f()); };
  const persist = () => { const ok = ls.set(K.state, state); ls.set(K.queue, queue); ls.set(K.cursor, cursor); if (!ok) window.toast && toast('تعذر الحفظ المحلي — مساحة المتصفح ممتلئة أو التخزين معطّل', true); };
  const nowIso = () => new Date().toISOString();

  function cfg() { const l = ls.get(K.cfg, {}) || {}; const g = window.IPD_CONFIG || {}; return { url: l.url || g.APPS_SCRIPT_URL || '', clientId: l.clientId || g.GOOGLE_CLIENT_ID || '' }; }
  const remote = () => { const c = cfg(); return !!(c.url && c.clientId); };

  function setStatus() {
    if (!remote()) sync.status = 'local';
    else if (syncing) sync.status = 'busy';
    else if (sync.error === 'auth') sync.status = 'auth';
    else if (sync.error === 'offline') sync.status = 'offline';
    else if (sync.error) sync.status = 'error';
    else if (queue.length) sync.status = 'pending';
    else sync.status = 'ok';
  }

  /* ---------- القراءة والكتابة ---------- */
  const list = (e) => state[e].filter((r) => !r.deleted);
  const get = (e, id) => state[e].find((r) => r.id === id);
  function enqueue(entity, op, record) {
    queue = queue.filter((q) => !(q.entity === entity && q.record.id === record.id));
    queue.push({ opId: window.uid(), entity, op, record: JSON.parse(JSON.stringify(record)) });
  }
  function audit(entity, id, action, summary) {
    if (NOAUDIT[entity]) return;
    const r = { id: window.uid(), ts: nowIso(), entity, recordId: id, action, summary: summary || '', updatedAt: nowIso() };
    state.audit.push(r); enqueue('audit', 'upsert', r);
  }
  function put(entity, rec, summary, quiet) {
    rec = Object.assign({}, rec); if (!rec.id) rec.id = window.uid();
    const prev = get(entity, rec.id);
    rec.updatedAt = nowIso(); rec.deleted = false; if (!prev && !rec.createdAt && entity === 'transactions') rec.createdAt = rec.updatedAt;
    const i = state[entity].findIndex((r) => r.id === rec.id);
    if (i >= 0) state[entity][i] = Object.assign({}, state[entity][i], rec); else state[entity].push(rec);
    enqueue(entity, 'upsert', get(entity, rec.id));
    audit(entity, rec.id, prev ? 'update' : 'create', summary);
    persist(); if (!quiet) emit(); schedule(); return get(entity, rec.id);
  }
  function remove(entity, id, summary) { // حذف ناعم فقط: لا يُمحى أي سجل مالي نهائياً
    const r = get(entity, id); if (!r) return;
    r.deleted = true; r.updatedAt = nowIso(); enqueue(entity, 'delete', r); audit(entity, id, 'delete', summary);
    persist(); emit(); schedule();
  }
  function restore(entity, id, summary) {
    const r = get(entity, id); if (!r) return; r.deleted = false; r.updatedAt = nowIso(); enqueue(entity, 'upsert', r); audit(entity, id, 'restore', summary);
    persist(); emit(); schedule();
  }
  function settings() {
    const r = get('settings', 'main'); let s = {}; try { s = r && r.json ? JSON.parse(r.json) : {}; } catch (e) { }
    return Object.assign({}, DEFAULT_SETTINGS, s);
  }
  function setSettings(patch) { const s = Object.assign(settings(), patch); put('settings', { id: 'main', json: JSON.stringify(s) }, 'تحديث الإعدادات'); }

  /* ---------- المزامنة ---------- */
  const Auth = { token: null, email: null, exp: 0, ready: false };
  function loadToken() { const t = ls.get(K.tok, null); if (t && t.exp * 1000 > Date.now() + 60000) { Auth.token = t.token; Auth.email = t.email; Auth.exp = t.exp; } }
  function parseJwt(j) { try { const p = j.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(p)))); } catch (e) { return null; } }
  function onCredential(resp) {
    const p = parseJwt(resp.credential); if (!p) return;
    Auth.token = resp.credential; Auth.email = p.email; Auth.exp = p.exp; ls.set(K.tok, { token: Auth.token, email: p.email, exp: p.exp });
    sync.error = null; setStatus(); emit(); doSync();
  }
  function initAuth() {
    loadToken();
    const c = cfg(); if (!c.clientId || Auth.ready) return;
    if (!window.google || !google.accounts) { if (!document.getElementById('gsi')) { const s = document.createElement('script'); s.id = 'gsi'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = initAuth; s.onerror = () => { }; document.head.appendChild(s); } return; }
    google.accounts.id.initialize({ client_id: c.clientId, callback: onCredential, auto_select: true, cancel_on_tap_outside: false });
    Auth.ready = true;
    if (!Auth.token) google.accounts.id.prompt();
  }
  function renderSignIn(el) { if (Auth.ready && el) google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ar' }); }
  function signOut() { Auth.token = null; Auth.email = null; ls.del(K.tok); try { google.accounts.id.disableAutoSelect(); } catch (e) { } sync.error = null; setStatus(); emit(); }
  const tokenValid = () => Auth.token && Auth.exp * 1000 > Date.now() + 30000;

  async function api(action, body) {
    const c = cfg(); if (!c.url) throw new Error('not_configured');
    if (!tokenValid()) { if (Auth.ready) try { google.accounts.id.prompt(); } catch (e) { } const e = new Error('auth_expired'); e.auth = true; throw e; }
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 40000);
    try {
      const res = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, idToken: Auth.token }, body || {})), signal: ctl.signal, redirect: 'follow' });
      const j = await res.json();
      if (!j.ok) { const e = new Error(j.error || 'server_error'); e.auth = !!j.auth; throw e; }
      return j;
    } finally { clearTimeout(to); }
  }

  function merge(changes) {
    let n = 0;
    Object.keys(changes || {}).forEach((entity) => {
      if (!state[entity]) return;
      changes[entity].forEach((rec) => {
        delete rec._row; delete rec.rev;
        const pend = queue.find((q) => q.entity === entity && q.record.id === rec.id);
        const loc = get(entity, rec.id);
        if (pend && loc && (loc.updatedAt || '') >= (rec.updatedAt || '')) return; // تغيير محلي معلّق أحدث: يُحفظ ويُرسل
        if (loc && (loc.updatedAt || '') > (rec.updatedAt || '')) return;
        const i = state[entity].findIndex((r) => r.id === rec.id);
        if (i >= 0) state[entity][i] = rec; else state[entity].push(rec);
        n++;
      });
    });
    return n;
  }

  async function doSync(force) {
    if (!remote() || syncing) return;
    if (!tokenValid()) { sync.error = 'auth'; setStatus(); emit(); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { sync.error = 'offline'; setStatus(); emit(); return; }
    syncing = true; setStatus(); emit();
    try {
      for (let round = 0; round < 5; round++) {
        const batch = queue.slice(0, 150);
        const r = await api('sync', { ops: batch.map((q) => ({ opId: q.opId, entity: q.entity, op: q.op, record: q.record })), cursor });
        const done = {}; (r.applied || []).forEach((id) => { done[id] = 1; });
        queue = queue.filter((q) => !done[q.opId]);
        merge(r.changes); if (r.cursor > cursor) cursor = r.cursor;
        sync.error = null; sync.lastSync = nowIso(); ls.set('ipd.v1.last', sync.lastSync);
        persist();
        if (!queue.length) break;
      }
    } catch (e) {
      if (e.auth) sync.error = 'auth'; else if (e.name === 'AbortError' || /Failed to fetch|NetworkError|Load failed/i.test(e.message)) sync.error = 'offline'; else sync.error = String(e.message || e);
    } finally { syncing = false; setStatus(); emit(); if (queue.length && sync.error !== 'auth') schedule(15000); }
  }
  function schedule(ms) { if (!remote()) { setStatus(); return; } setStatus(); clearTimeout(timer); timer = setTimeout(doSync, ms || 1200); }

  /* ---------- نسخ احتياطي ---------- */
  const exportAll = () => ({ app: 'investment-portfolio-dashboard', version: 1, createdAt: nowIso(), data: JSON.parse(JSON.stringify(state)) });
  async function importAll(obj) {
    if (!obj || obj.app !== 'investment-portfolio-dashboard' || !obj.data) throw new Error('ملف النسخة الاحتياطية غير صالح');
    const d = obj.data; const ns = {}; ENT.forEach((e) => { if (d[e] && !Array.isArray(d[e])) throw new Error('بنية البيانات غير صحيحة: ' + e); ns[e] = (d[e] || []).map((r) => Object.assign({}, r)); });
    ns.investments.forEach((r) => { if (!r.id || !r.type) throw new Error('سجل استثمار تالف'); });
    ns.transactions.forEach((r) => { if (!r.id || !r.kind || !r.date) throw new Error('سجل عملية تالف'); });
    state = ns; queue = []; persist();
    if (remote() && tokenValid()) { await api('restoreData', { data: ns }); cursor = 0; state = Object.assign({}, state); persist(); await doSync(); }
    emit();
  }
  function wipeLocal() { ENT.forEach((e) => { state[e] = []; }); queue = []; cursor = 0; persist(); emit(); }

  window.addEventListener('online', () => { if (remote()) doSync(); });
  setInterval(() => { if (remote() && !document.hidden) doSync(); }, 90000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && remote()) doSync(); });

  setStatus();
  window.Store = {
    get state() { return state; }, get version() { return version; }, sync, Auth, ENT,
    list, get, put, remove, restore, settings, setSettings, cfg, remote,
    saveCfg(c) { ls.set(K.cfg, c); setStatus(); emit(); }, subscribe(f) { subs.push(f); },
    initAuth, renderSignIn, signOut, doSync, api, tokenValid, exportAll, importAll, wipeLocal, pendingCount: () => queue.length,
    resetCursor() { cursor = 0; persist(); }
  };
})();
