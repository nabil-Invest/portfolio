/* أدوات الواجهة: الترجمة، التنسيق، النوافذ، النماذج */
(function () {
  'use strict';
  /* الترجمة: المفتاح هو النص العربي نفسه؛ أضف ترجمات إنجليزية في EN لاحقاً دون تغيير الكود */
  const EN = {};
  let LANG = 'ar';
  window.t = (s) => (LANG === 'en' && EN[s]) || s;
  window.setLang = (l) => { LANG = l; document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; };
  window.I18N_EN = EN;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NA = 'غير متاح';
  const DEC = { OMR: 3, KWD: 3, BHD: 3, JOD: 3, JPY: 0 };
  const dec = (c) => (DEC[c] !== undefined ? DEC[c] : 2);
  const nf = {}; const fmtN = (v, d) => { const k = d; nf[k] = nf[k] || new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); return nf[k].format(v); };
  const has = (v) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
  const na = () => '<span class="na">' + NA + '</span>';
  const money = (v, cur, opt) => (!has(v) ? na() : '<span class="num' + (opt && opt.sign ? (v > 0 ? ' pos' : v < 0 ? ' neg' : '') : '') + '">' + (opt && opt.sign && v > 0 ? '+' : '') + fmtN(Number(v), dec(cur)) + ' ' + esc(cur || '') + '</span>');
  const plain = (v, cur) => (!has(v) ? NA : fmtN(Number(v), dec(cur)) + ' ' + (cur || ''));
  const numf = (v, d = 2) => (!has(v) ? na() : '<span class="num">' + fmtN(Number(v), d) + '</span>');
  const qtyf = (v) => (!has(v) ? na() : '<span class="num">' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(Number(v)) + '</span>');
  const pct = (v, opt) => (!has(v) ? na() : '<span class="num' + (opt && opt.sign === false ? '' : v > 0 ? ' pos' : v < 0 ? ' neg' : '') + '">' + (v > 0 && !(opt && opt.sign === false) ? '+' : '') + fmtN(Number(v) * 100, 2) + '%</span>');
  const date = (s) => { if (!s) return '<span class="muted">—</span>'; const [y, m, d] = String(s).slice(0, 10).split('-'); return '<span class="num">' + d + '/' + m + '/' + y + '</span>'; };
  const dateTime = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }); };

  /* ---------- الإشعارات ---------- */
  function toast(msg, err) {
    const el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.textContent = msg;
    document.getElementById('toasts').appendChild(el); setTimeout(() => el.remove(), err ? 6000 : 3200);
  }

  /* ---------- النوافذ ---------- */
  const stack = [];
  function openModal(o) {
    const back = document.createElement('div'); back.className = 'modalback';
    back.innerHTML = '<div class="modal ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '"><div class="mhead"><h2>' + esc(o.title) + '</h2><button class="btn icon sm" data-close aria-label="إغلاق">✕</button></div><div class="mbody"></div>' + (o.footer === false ? '' : '<div class="mfoot"></div>') + '</div>';
    const body = back.querySelector('.mbody'); body.innerHTML = o.body || '';
    const foot = back.querySelector('.mfoot');
    if (foot) (o.buttons || []).forEach((b) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn ' + (b.cls || ''); x.textContent = b.label; x.addEventListener('click', () => b.onClick && b.onClick(api)); foot.appendChild(x); });
    const api = { el: back, body, close() { back.remove(); const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); o.onClose && o.onClose(); }, setBody(h) { body.innerHTML = h; } };
    back.addEventListener('mousedown', (e) => { if (e.target === back && !o.sticky) api.close(); });
    back.querySelector('[data-close]').addEventListener('click', () => api.close());
    document.body.appendChild(back); stack.push(api);
    const f = back.querySelector('input:not([type=hidden]),select,textarea'); if (f) f.focus();
    o.onMount && o.onMount(api);
    return api;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
  const closeAll = () => { while (stack.length) stack[stack.length - 1].close(); };

  function confirmDialog(message, opt) {
    opt = opt || {};
    return new Promise((res) => {
      let done = false; const fin = (v, m) => { if (done) return; done = true; m.close(); res(v); };
      const m = openModal({ title: opt.title || 'تأكيد', body: '<p style="margin:0">' + esc(message) + '</p>' + (opt.extra || ''), sticky: true,
        buttons: [{ label: opt.ok || 'تأكيد', cls: opt.danger ? 'danger' : 'primary', onClick: (a) => fin(true, a) }, { label: 'إلغاء', onClick: (a) => fin(false, a) }], onClose: () => { if (!done) { done = true; res(false); } } });
    });
  }

  /* ---------- النماذج ---------- */
  function field(f) {
    const id = 'f_' + f.name, v = f.value === undefined || f.value === null ? '' : f.value;
    const req = f.req ? ' required' : '';
    let inp;
    if (f.type === 'select') inp = '<select id="' + id + '" name="' + f.name + '"' + req + '>' + f.opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'textarea') inp = '<textarea id="' + id + '" name="' + f.name + '" rows="2">' + esc(v) + '</textarea>';
    else if (f.type === 'number') inp = '<input id="' + id + '" name="' + f.name + '" type="number" inputmode="decimal" step="' + (f.step || 'any') + '"' + (f.min !== undefined ? ' min="' + f.min + '"' : '') + req + ' value="' + esc(v) + '" dir="ltr" style="text-align:end">';
    else if (f.type === 'currency') inp = '<input id="' + id + '" name="' + f.name + '" list="dl_cur" maxlength="3" pattern="[A-Za-z]{3}" placeholder="OMR" style="text-transform:uppercase"' + req + ' value="' + esc(v) + '" dir="ltr">';
    else if (f.list) inp = '<input id="' + id + '" name="' + f.name + '" list="' + f.list + '"' + req + ' value="' + esc(v) + '">';
    else inp = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '"' + req + ' value="' + esc(v) + '"' + (f.type === 'date' ? ' dir="ltr"' : '') + '>';
    return '<div class="field' + (f.full ? ' full' : '') + '" data-f="' + f.name + '"' + (f.hide ? ' hidden' : '') + '><label for="' + id + '">' + esc(f.label) + (f.req ? ' <span class="req">*</span>' : '') + '</label>' + inp + (f.hint ? '<span class="hint">' + esc(f.hint) + '</span>' : '') + '</div>';
  }
  const formHtml = (fields) => '<form class="form" novalidate onsubmit="return false"><div class="formerr full" style="grid-column:1/-1" hidden></div>' + fields.map(field).join('') + '<div class="preview" hidden></div></form>';
  function readForm(root) {
    const o = {}; root.querySelectorAll('[name]').forEach((el) => { if (el.closest('[hidden]')) return; let v = el.value.trim(); if (el.type === 'number') v = v === '' ? '' : Number(v); if (el.getAttribute('list') === 'dl_cur') v = v.toUpperCase(); o[el.name] = v; });
    return o;
  }
  function formErrors(root, errs) {
    const box = root.querySelector('.formerr'); if (!box) return;
    if (!errs || !errs.length) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = errs.map((e) => '• ' + esc(e)).join('<br>'); box.scrollIntoView({ block: 'nearest' });
  }
  // التحقق الأساسي: الحقول المطلوبة المرئية
  function checkRequired(root) {
    const errs = [];
    root.querySelectorAll('[required]').forEach((el) => {
      if (el.closest('[hidden]')) return;
      const lab = root.querySelector('label[for="' + el.id + '"]'); const name = lab ? lab.textContent.replace('*', '').trim() : el.name;
      if (el.value.trim() === '') errs.push('الحقل مطلوب: ' + name);
      else if (el.type === 'number' && el.min !== '' && Number(el.value) < Number(el.min)) errs.push('قيمة غير صالحة: ' + name);
      else if (el.pattern && !new RegExp('^(?:' + el.pattern + ')$').test(el.value)) errs.push('صيغة غير صحيحة: ' + name);
    });
    return errs;
  }

  /* ---------- جداول قابلة للفرز ---------- */
  function table(cols, rows, o) {
    o = o || {};
    const head = cols.map((c) => '<th class="' + (c.n ? 'n ' : '') + (o.sortable ? 'sort' : '') + '"' + (o.sortable ? ' data-sort="' + c.key + '"' : '') + '>' + esc(c.label) + (o.sortKey === c.key ? (o.sortDir === 'asc' ? ' ▲' : ' ▼') : '') + '</th>').join('');
    const body = rows.map((r) => '<tr' + (o.rowAttr ? ' ' + o.rowAttr(r) : '') + (o.click ? ' class="click"' : '') + '>' + cols.map((c) => '<td class="' + (c.n ? 'n' : '') + '">' + c.render(r) + '</td>').join('') + '</tr>').join('');
    const foot = o.foot ? '<tfoot><tr>' + o.foot + '</tr></tfoot>' : '';
    return '<div class="tablewrap"><table class="data"><thead><tr>' + head + '</tr></thead><tbody>' + (body || '<tr><td colspan="' + cols.length + '" class="empty">لا توجد بيانات مطابقة</td></tr>') + '</tbody>' + foot + '</table></div>';
  }
  function sortRows(rows, cols, key, dir) {
    const c = cols.find((x) => x.key === key); if (!c) return rows;
    const g = c.sort || c.render; const m = dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => { const x = g(a), y = g(b); const xn = x === null || x === undefined || x === '', yn = y === null || y === undefined || y === ''; if (xn && yn) return 0; if (xn) return 1; if (yn) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ar')) * m; });
  }

  function download(name, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toCSV(headers, rows) {
    const q = (v) => { v = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [headers].concat(rows).map((r) => r.map(q).join(',')).join('\r\n');
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  Object.assign(window, { esc, NA, fmtN, dec, has, na, money, plain, numf, qtyf, pct, fmtDate: date, dateTime, toast, openModal, closeAll, confirmDialog, field, formHtml, readForm, formErrors, checkRequired, table, sortRows, download, toCSV, uid });
})();
