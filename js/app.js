/* التطبيق: الهيكل، التوجيه، الإعدادات، الاستيراد، معالجة الأحداث */
(function () {
  'use strict';
  const base = () => Store.settings().baseCurrency;
  const ICON = { dashboard: 'M3 12l9-9 9 9M5 10v10h14V10', stocks: 'M3 17l6-6 4 4 8-8M15 7h6v6', sukuk: 'M4 7h16v12H4zM8 7V4h8v3M9 13h6', bonds: 'M6 3h12v18l-6-3-6 3z', other: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', transactions: 'M4 6h16M4 12h16M4 18h10', reports: 'M5 21V10M12 21V4M19 21v-7', import: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3', settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z' };
  const NAV = [['dashboard', 'لوحة التحكم'], ['stocks', 'الأسهم'], ['sukuk', 'الصكوك'], ['bonds', 'السندات'], ['other', 'استثمارات أخرى'], ['transactions', 'سجل العمليات'], ['reports', 'التقارير'], ['import', 'استيراد وتصدير'], ['settings', 'الإعدادات']];
  const svg = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[k] + '"/></svg>';

  const App = { route: 'dashboard', globalQ: '', bump: 0, _k: '', _pf: null, _tk: '', _tl: null, detail: null, plan: null };
  window.App = App;
  App.opts = () => { const s = Store.settings(); return { method: s.costMethod, base: s.baseCurrency, trackCash: s.trackCash, staleHours: Number(s.staleHours) || 24, today: PF.todayStr(), now: Date.now() }; };
  App.portfolio = () => { const k = Store.version + '|' + App.bump + '|' + PF.todayStr(); if (k !== App._k) { App._pf = PF.computePortfolio(Store.state, App.opts()); App._k = k; } return App._pf; };
  App.timeline = () => { const k = Store.version + '|' + App.bump; if (k !== App._tk) { App._tl = PF.timelineFromTxs(Store.state, App.opts()); App._tk = k; } return App._tl; };
  App.extraAlerts = () => {
    const out = [], b = base(); const open = App.portfolio().positions.filter((p) => p.pos.qty > 0); const cur = Array.from(new Set(open.map((p) => p.inv.currency))).filter((c) => c !== b);
    cur.forEach((c) => { const rows = Store.list('fx').filter((f) => f.currency === c).sort((x, y) => (x.date < y.date ? 1 : -1)); if (!rows.length) out.push({ level: 'danger', text: 'لا يوجد سعر صرف حالي لـ ' + c + ' — القيم المحوَّلة غير مكتملة' }); else if (PF.daysBetween(rows[0].date, PF.todayStr()) > 30) out.push({ level: 'warn', text: 'سعر صرف ' + c + ' قديم (آخر تحديث ' + rows[0].date + ')' }); });
    return out;
  };

  /* ---------- السمة ---------- */
  const themePref = () => { try { return localStorage.getItem('ipd.theme') || 'auto'; } catch (e) { return 'auto'; } };
  function applyTheme() { const t = themePref(); if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
  function setTheme(t) { try { localStorage.setItem('ipd.theme', t); } catch (e) { } applyTheme(); }

  /* ---------- الهيكل ---------- */
  function shell() {
    document.getElementById('app').innerHTML = '<div class="shell"><aside class="side" id="side"><div class="brand"><i>◈</i><span>لوحة الاستثمارات</span></div><nav class="nav">' + NAV.map((n) => '<a href="#/' + n[0] + '" data-r="' + n[0] + '">' + svg(n[0]) + '<span>' + n[1] + '</span></a>').join('') + '</nav></aside><div class="scrim" id="scrim"></div><div class="main"><header class="top"><button class="btn icon menubtn" id="menu" aria-label="القائمة">☰</button><div class="search"><input type="search" id="gq" placeholder="بحث سريع في الاستثمارات والعمليات…" aria-label="بحث سريع"></div><span style="flex:1"></span><button class="syncpill" id="sync" title="حالة المزامنة"></button><button class="btn icon" id="theme" title="تبديل الوضع الفاتح/الداكن" aria-label="تبديل السمة"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" style="fill:currentColor"/><path d="M12 4a8 8 0 010 16z" style="fill:currentColor"/></svg></button><button class="btn primary" data-act="add">+ <span class="lbl-long">إضافة استثمار جديد</span></button></header><main class="content" id="view" tabindex="-1"></main></div></div><div id="dl"></div>';
    document.getElementById('menu').onclick = () => { document.getElementById('side').classList.toggle('open'); document.getElementById('scrim').classList.toggle('on'); };
    document.getElementById('scrim').onclick = closeSide;
    document.getElementById('gq').addEventListener('input', (e) => { App.globalQ = e.target.value; if (!['stocks', 'sukuk', 'bonds', 'other', 'transactions'].includes(App.route)) { location.hash = '#/stocks'; } else App.render(); });
    document.getElementById('theme').onclick = () => { const cur = themePref(); const dark = cur === 'dark' || (cur === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); setTheme(dark ? 'light' : 'dark'); };
    document.getElementById('sync').onclick = () => { if (!Store.remote()) { location.hash = '#/settings'; } else if (Store.sync.status === 'auth') { location.hash = '#/settings'; } else Store.doSync(); };
  }
  const closeSide = () => { document.getElementById('side').classList.remove('open'); document.getElementById('scrim').classList.remove('on'); };

  function syncPill() {
    const s = Store.sync, el = document.getElementById('sync'); if (!el) return;
    const M = { local: ['محفوظ على هذا الجهاز فقط', ''], ok: ['تمت المزامنة ' + (s.lastSync ? dateTime(s.lastSync) : ''), 'ok'], busy: ['جارٍ المزامنة…', 'busy'], pending: [Store.pendingCount() + ' تغيير بانتظار المزامنة', 'pend'], offline: ['غير متصل — التغييرات محفوظة محلياً', 'pend'], auth: ['سجّل الدخول بحساب Google لإكمال المزامنة', 'err'], error: ['خطأ في المزامنة: ' + String(s.error || '').slice(0, 40), 'err'] };
    const m = M[s.status] || M.local; el.className = 'syncpill ' + m[1]; el.innerHTML = '<i></i>' + esc(m[0]);
  }

  /* ---------- العرض ---------- */
  const VIEWS = { dashboard: () => Views.dashboard(), stocks: () => Views.stocks(), sukuk: () => Views.sukuk(), bonds: () => Views.bonds(), other: () => Views.other(), transactions: () => Views.transactions(), reports: () => Views.reports(), import: importView, settings: settingsView };
  function render() {
    App.bump++;
    const root = document.getElementById('view'); if (!root) return;
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === App.route));
    const act = document.activeElement; const fk = act && act.dataset ? act.dataset.filter : null; const pos = act && act.selectionStart !== undefined ? act.selectionStart : null; const sy = window.scrollY;
    const keep = act && act.id === 'gq';
    try { root.innerHTML = (VIEWS[App.route] || VIEWS.dashboard)(); } catch (e) { console.error(e); root.innerHTML = '<div class="card"><h2>حدث خطأ أثناء العرض</h2><p class="muted">' + esc(e.message) + '</p></div>'; }
    document.getElementById('dl').innerHTML = Forms.datalists();
    if (fk) { const el = root.querySelector('[data-filter="' + fk + '"]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { } } }
    if (!keep) window.scrollTo(0, sy);
    syncPill();
    if (App.detail && document.body.contains(App.detail.modal.el)) App.detail.modal.setBody(Views.detailHtml(App.detail.id));
    maybeSnapshot(); if (App.route === 'settings') Store.renderSignIn(document.getElementById('gsi-btn'));
  }
  App.render = render;
  function maybeSnapshot() {
    const T = App.portfolio().totals; if (!(T.openCount > 0)) return; const d = PF.todayStr(), b = base();
    const ex = Store.get('snapshots', d); const v = PF.round(T.valueForTotalsBase, 3);
    if (ex && Math.abs(Number(ex.valueBase) - v) < 0.0005 && ex.atCostCount === T.valuedAtCostCount && ex.currency === b) return;
    Store.put('snapshots', { id: d, date: d, valueBase: v, costBase: PF.round(T.investedBase, 3), atCostCount: T.valuedAtCostCount, currency: b }, null, true);
  }

  function openDetail(id) {
    const inv = Store.get('investments', id); if (!inv) return;
    const m = openModal({ title: inv.name, wide: true, body: Views.detailHtml(id), onClose: () => { App.detail = null; },
      buttons: [{ label: 'تسجيل عملية', cls: 'primary', onClick: () => Forms.openTxForm(id) }, { label: 'تعديل البيانات', onClick: () => Forms.openInvestmentForm(inv.type, Store.get('investments', id)) },
        { label: 'حذف الاستثمار', cls: 'danger', onClick: async (a) => { if (await confirmDialog('سيُخفى «' + inv.name + '» من العرض وتبقى عملياته محفوظة ويمكن استرجاعه من الإعدادات ← المحذوفات. متابعة؟', { danger: true, ok: 'حذف' })) { a.close(); Store.remove('investments', id, 'حذف ' + inv.name); toast('تم الحذف (قابل للاسترجاع)'); } } }, { label: 'إغلاق', onClick: (a) => a.close() }] });
    App.detail = { id, modal: m };
  }

  /* ---------- الاستيراد والتصدير ---------- */
  function importView() {
    let prev = '';
    if (App.plan) {
      const p = App.plan, n = p.filter((r) => r.status === 'new').length, d = p.filter((r) => r.status === 'dup').length, e = p.filter((r) => r.status === 'error').length;
      prev = '<div class="card" style="margin-top:14px"><h2>معاينة الاستيراد</h2><p>صفوف جديدة: <b>' + n + '</b> · مكررة (ستُتخطى): <b>' + d + '</b> · بها أخطاء (ستُتخطى): <b>' + e + '</b></p>' +
        table([{ label: 'السطر', render: (r) => '<span class="num">' + r.line + '</span>' }, { label: 'الحالة', render: (r) => (r.status === 'new' ? '<span class="badge pos">جديد</span>' : r.status === 'dup' ? '<span class="badge warn">مكرر</span>' : '<span class="badge danger">خطأ</span>') }, { label: 'الاستثمار', render: (r) => esc(r.inv ? r.inv.name : '') }, { label: 'العملية', render: (r) => esc(Forms.KINDS[r.tx.kind] || '') }, { label: 'التاريخ', render: (r) => esc(r.tx.date) }, { label: 'الكمية', n: 1, render: (r) => esc(r.tx.qty) }, { label: 'السعر/المبلغ', n: 1, render: (r) => esc(r.tx.price || r.tx.amount) }, { label: 'ملاحظات', render: (r) => esc(r.errs.join('، ')) }], p.slice(0, 300)) +
        '<div class="toolbar" style="margin-top:12px"><button class="btn primary" data-act="import-run"' + (n ? '' : ' disabled') + '>استيراد ' + n + ' صف</button><button class="btn" data-act="import-cancel">إلغاء</button></div></div>';
    }
    return Views.page('استيراد وتصدير', '', '<div class="grid g2"><div class="card"><h2>استيراد من CSV أو Excel</h2><p class="note">كل صف = عملية (شراء/بيع/دخل/استرداد/رسوم). تُنشأ الاستثمارات تلقائياً وتُربط العمليات بها. تُكتشف الصفوف المكررة فلا تتضاعف عند إعادة الاستيراد. يمكنك قراءة الأعمدة بأسماء عربية أو إنجليزية.</p><div class="toolbar"><input type="file" id="impFile" accept=".csv,.xlsx,.xls"><button class="btn" data-act="template">تنزيل القالب</button></div></div><div class="card"><h2>تصدير البيانات</h2><p class="note">تصدير جميع العمليات بصيغة قابلة لإعادة الاستيراد. للتقارير استخدم صفحة التقارير. للنسخة الكاملة (بما فيها الإيداعات النقدية وأسعار الصرف) استخدم النسخ الاحتياطي في الإعدادات.</p><div class="toolbar"><button class="btn" data-act="export-all" data-arg="csv">تصدير CSV</button><button class="btn" data-act="export-all" data-arg="xlsx">تصدير Excel</button></div></div></div>' + prev);
  }

  /* ---------- الإعدادات ---------- */
  function settingsView() {
    const s = Store.settings(), c = Store.cfg(), b = s.baseCurrency, A = Store.Auth; const hasTx = Store.list('transactions').length > 0;
    const row = (l, inner, hint) => '<div class="field"><label>' + l + '</label>' + inner + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
    const inp = 'style="padding:8px 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface);width:100%"';
    const general = '<div class="card"><h2>عام</h2><div class="form">' +
      row('العملة الأساسية للمحفظة', '<input id="s_base" list="dl_cur" value="' + esc(b) + '" maxlength="3" ' + (hasTx ? 'disabled ' : '') + inp + ' dir="ltr" style="text-transform:uppercase;padding:8px 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface)">', hasTx ? 'مقفلة بعد تسجيل عمليات حتى لا تتغير معاني أسعار الصرف المخزنة' : 'يمكن تغييرها فقط قبل تسجيل أي عملية') +
      row('طريقة احتساب التكلفة', '<select id="s_cost" ' + inp + '><option value="WAC"' + (s.costMethod === 'WAC' ? ' selected' : '') + '>المتوسط المرجح (WAC)</option><option value="FIFO"' + (s.costMethod === 'FIFO' ? ' selected' : '') + '>الوارد أولاً صادر أولاً (FIFO)</option></select>', 'تُعاد حسابات جميع المراكز فوراً من سجل العمليات') +
      row('اعتبار السعر قديماً بعد (ساعة)', '<input id="s_stale" type="number" min="1" value="' + esc(s.staleHours) + '" ' + inp + ' dir="ltr">') +
      row('المظهر', '<select id="s_theme" ' + inp + '>' + [['auto', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']].map((o) => '<option value="' + o[0] + '"' + (themePref() === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>') +
      row('اللغة', '<select id="s_lang" disabled ' + inp + '><option>العربية</option><option>English (قريباً)</option></select>', 'الواجهة عربية RTL؛ النصوص مهيأة للترجمة لاحقاً') +
      '<div class="field full"><label><input type="checkbox" id="s_cash"' + (s.trackCash ? ' checked' : '') + '> تتبع النقد غير المستثمر (الإيداعات − السحوبات ± أثر العمليات)</label><span class="hint">فعّله فقط إذا سجّلت رصيدك النقدي الافتتاحي كإيداع</span></div></div><div style="margin-top:12px"><button class="btn primary" data-act="save-general">حفظ الإعدادات</button></div></div>';
    const g = '<div class="card"><h2>الربط مع Google (حفظ دائم ومزامنة بين الأجهزة)</h2><p class="note">القيمتان التاليتان غير سريتين. التفاصيل الكاملة في ملف README. بدونهما يعمل التطبيق محلياً على هذا الجهاز فقط.</p><div class="form">' + row('رابط تطبيق الويب (Apps Script — ينتهي بـ /exec)', '<input id="c_url" value="' + esc(c.url) + '" ' + inp + ' dir="ltr">') + row('معرّف عميل OAuth (Client ID)', '<input id="c_cid" value="' + esc(c.clientId) + '" ' + inp + ' dir="ltr">') + '</div><div class="toolbar" style="margin-top:10px"><button class="btn primary" data-act="save-cfg">حفظ الربط</button>' + (Store.remote() ? '<button class="btn" data-act="sync-now">مزامنة الآن</button>' : '') + '</div>' +
      (Store.remote() ? '<p>الحالة: ' + (A.email && Store.tokenValid() ? '<span class="badge pos">مسجَّل الدخول: ' + esc(A.email) + '</span> <button class="btn sm" data-act="signout">تسجيل الخروج</button>' : '<span class="badge warn">غير مسجَّل</span>') + ' · آخر مزامنة: ' + (Store.sync.lastSync ? dateTime(Store.sync.lastSync) : '—') + ' · بانتظار الإرسال: ' + Store.pendingCount() + '</p>' + (Store.sync.error && Store.sync.error !== 'auth' ? '<div class="formerr">آخر خطأ: ' + esc(Store.sync.error) + '</div>' : '') + '<div id="gsi-btn"></div>' : '') + '</div>';
    const fxRows = Store.list('fx').sort((x, y) => (x.date < y.date ? 1 : -1));
    const fx = '<div class="card"><h2>أسعار الصرف (1 وحدة = كم ' + esc(b) + ')</h2>' + table([{ label: 'العملة', render: (r) => esc(r.currency) }, { label: 'السعر', n: 1, render: (r) => '<span class="num">' + fmtN(Number(r.rate), 6) + '</span>' }, { label: 'التاريخ', render: (r) => fmtDate(r.date) }, { label: 'المصدر', render: (r) => esc({ manual: 'يدوي', ecb: 'البنك المركزي الأوروبي', peg: 'ربط رسمي' }[r.source] || r.source || '') }, { label: '', render: (r) => '<button class="btn sm danger" data-act="fx-del" data-id="' + esc(r.id) + '">حذف</button>' }], fxRows.slice(0, 40)) +
      '<div class="toolbar" style="margin-top:12px"><input id="fx_cur" list="dl_cur" placeholder="USD" maxlength="3" style="width:90px;text-transform:uppercase;padding:8px;border:1px solid var(--border);border-radius:9px;background:var(--surface)" dir="ltr"><input id="fx_rate" type="number" step="any" min="0" placeholder="السعر" style="width:130px;padding:8px;border:1px solid var(--border);border-radius:9px;background:var(--surface)" dir="ltr"><input id="fx_date" type="date" value="' + PF.todayStr() + '" style="padding:8px;border:1px solid var(--border);border-radius:9px;background:var(--surface)" dir="ltr"><button class="btn" data-act="fx-add">إضافة سعر</button><button class="btn" data-act="fx-fetch">تحديث تلقائي (ECB + الربط الرسمي)</button></div><p class="note">العمليات التاريخية تحمل سعر الصرف المسجَّل وقت تنفيذها ولا تتغير نتائجها المحققة عند تغيّر السعر الحالي. السعر الحالي يؤثر فقط في تقييم المراكز المفتوحة. التحديث التلقائي يومي من ECB وليس لحظياً، والعملات المربوطة بالدولار (ريال عماني، درهم، ريال سعودي، دينار بحريني، ريال قطري) تُحسب من الربط الرسمي. عملات أخرى مثل الدينار الكويتي تُدخل يدوياً.</p></div>';
    const bk = '<div class="card"><h2>النسخ الاحتياطي والاستعادة</h2><div class="toolbar"><button class="btn" data-act="backup-export">تنزيل نسخة احتياطية (JSON)</button><label class="btn">استعادة من ملف<input type="file" id="restoreFile" accept=".json" hidden></label>' + (Store.remote() ? '<button class="btn" data-act="server-backup">نسخة احتياطية في جدول Google</button><button class="btn" data-act="server-list">عرض النسخ المحفوظة</button>' : '') + '</div><div id="bk-list"></div><p class="note">الاستعادة تستبدل كل البيانات بعد التأكيد، وتُنزَّل تلقائياً نسخة من وضعك الحالي قبل التنفيذ. الخلفية أيضاً تأخذ نسخة تلقائية قبل أي استعادة.</p></div>';
    const del = []; ['investments', 'transactions', 'fx'].forEach((e) => Store.state[e].filter((r) => r.deleted).forEach((r) => del.push({ e, r })));
    const trash = '<div class="card"><h2>المحذوفات (' + del.length + ')</h2>' + (del.length ? table([{ label: 'النوع', render: (x) => ({ investments: 'استثمار', transactions: 'عملية', fx: 'سعر صرف' }[x.e]) }, { label: 'التفاصيل', render: (x) => esc(x.e === 'investments' ? x.r.name : x.e === 'transactions' ? (Views.txLabel(x.r) + ' — ' + x.r.date) : x.r.currency + ' ' + x.r.rate) }, { label: '', render: (x) => '<button class="btn sm" data-act="restore-item" data-arg="' + x.e + '" data-id="' + esc(x.r.id) + '">استرجاع</button>' }], del) : '<p class="muted">لا توجد سجلات محذوفة. لا يُمحى أي سجل مالي نهائياً من الواجهة.</p>') + '</div>';
    const aud = Store.list('audit').slice().sort((x, y) => (x.ts < y.ts ? 1 : -1)).slice(0, 30);
    const log = '<div class="card"><h2>سجل التغييرات (آخر 30)</h2>' + (aud.length ? table([{ label: 'الوقت', render: (a) => dateTime(a.ts) }, { label: 'الإجراء', render: (a) => esc({ create: 'إضافة', update: 'تعديل', delete: 'حذف', restore: 'استرجاع' }[a.action] || a.action) }, { label: 'التفاصيل', render: (a) => esc(a.summary || '') }], aud) : '<p class="muted">لا يوجد سجل بعد.</p>') + '</div>';
    const sec = '<div class="card"><h2>الأمان</h2><ul style="margin:0;padding-inline-start:18px"><li>لا تُخزَّن كلمات مرور أو مفاتيح سرية في المتصفح؛ تسجيل الدخول عبر Google فقط.</li><li>الخلفية تتحقق من توقيع Google ومن أن بريدك هو المالك قبل أي قراءة أو كتابة.</li><li>صلاحية الخلفية محصورة في جدول البيانات الواحد (وليس كل Drive).</li><li>الحذف ناعم دائماً، وسجل التغييرات يُحفظ مع البيانات.</li><li>البيانات المحلية على هذا المتصفح غير مشفّرة؛ لا تستخدم جهازاً مشتركاً.</li></ul></div>';
    return Views.page('الإعدادات', '', '<div class="grid" style="gap:14px">' + general + g + fx + bk + trash + log + sec + '</div>');
  }

  /* ---------- الأحداث ---------- */
  async function act(name, el) {
    const id = el.dataset.id, arg = el.dataset.arg; const $ = (i) => document.getElementById(i);
    switch (name) {
      case 'add': Forms.openAddMenu(); break;
      case 'add-type': Forms.openInvestmentForm(arg); break;
      case 'add-cash': Forms.openCashForm(); break;
      case 'open': openDetail(id); break;
      case 'edit-tx': { const t = Store.get('transactions', id); if (!t) break; if (t.invId && Store.get('investments', t.invId)) Forms.openTxForm(t.invId, { tx: t }); else Forms.openCashForm(t); break; }
      case 'del-tx': if (await confirmDialog('سيُخفى هذا السجل من الحسابات ويمكن استرجاعه من الإعدادات ← المحذوفات. متابعة؟', { danger: true, ok: 'حذف' })) { Store.remove('transactions', id, 'حذف عملية'); toast('تم الحذف (قابل للاسترجاع)'); } break;
      case 'set-price': { const v = $('detPrice').value; if (v === '' || Number(v) < 0) { toast('أدخل سعراً صالحاً', true); break; } Prices.setManual(Store.get('investments', id), Number(v)); App.render(); toast('تم حفظ السعر (مدخل يدوياً)'); break; }
      case 'refresh-prices': {
        const open = App.portfolio().positions.filter((p) => p.pos.qty > 0 && p.inv.type !== 'sukuk' && p.inv.type !== 'bond' && p.inv.type !== 'other').map((p) => p.inv);
        if (!open.length) { toast('لا توجد أسهم مفتوحة'); break; }
        el.disabled = true; const r = await Prices.refresh(open); el.disabled = false; App.render();
        toast((r.updated ? 'تم تحديث ' + r.updated + ' سعر. ' : '') + (r.message || '') + (r.failed.length ? ' تعذر: ' + r.failed.join('، ') : '') + (r.manualNeeded.length && !r.message ? ' تحتاج إدخالاً يدوياً: ' + r.manualNeeded.join('، ') : ''), !r.updated);
        break; }
      case 'manual-prices': Forms.openBulkPrices(); break;
      case 'rep': Views.vs.rep.id = arg; App.render(); break;
      case 'rep-export': Views.exportReport(arg); break;
      case 'print': window.print(); break;
      case 'template': IO.template(); break;
      case 'export-all': IO.exportAll(arg); break;
      case 'import-cancel': App.plan = null; App.render(); break;
      case 'import-run': { const r = IO.commit(App.plan); App.plan = null; App.render(); toast('تم استيراد ' + r.nt + ' عملية و' + r.ni + ' استثماراً جديداً'); break; }
      case 'save-general': {
        const patch = { costMethod: $('s_cost').value, trackCash: $('s_cash').checked, staleHours: Number($('s_stale').value) || 24 };
        const bc = $('s_base'); if (!bc.disabled) { const v = bc.value.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(v)) { toast('رمز العملة غير صحيح', true); break; } patch.baseCurrency = v; }
        setTheme($('s_theme').value); Store.setSettings(patch); toast('تم حفظ الإعدادات'); break; }
      case 'save-cfg': Store.saveCfg({ url: $('c_url').value.trim(), clientId: $('c_cid').value.trim() }); Store.initAuth(); toast('تم حفظ إعدادات الربط'); setTimeout(() => App.render(), 600); break;
      case 'sync-now': Store.doSync(); break;
      case 'signout': Store.Auth && Store.signOut(); break;
      case 'fx-add': { const c = $('fx_cur').value.trim().toUpperCase(), r = Number($('fx_rate').value), d = $('fx_date').value; if (!/^[A-Z]{3}$/.test(c) || !(r > 0) || !d) { toast('أدخل العملة والسعر والتاريخ بشكل صحيح', true); break; } if (c === base()) { toast('هذه هي العملة الأساسية', true); break; } Store.put('fx', { currency: c, rate: r, date: d, source: 'manual' }, 'سعر صرف ' + c + ' = ' + r); toast('تمت إضافة السعر'); break; }
      case 'fx-del': Store.remove('fx', id, 'حذف سعر صرف'); break;
      case 'fx-fetch': {
        const curs = Array.from(new Set(Store.list('investments').map((i) => i.currency).concat(Store.list('fx').map((f) => f.currency)))).filter((c) => c && c !== base());
        if (!curs.length) { toast('لا توجد عملات أجنبية لتحديثها'); break; }
        try { el.disabled = true; const r = await Prices.fetchFx(curs, base()); r.rows.forEach((x) => Store.put('fx', { currency: x.currency, rate: x.rate, date: x.date, source: x.source }, 'تحديث سعر صرف ' + x.currency, true)); Store.setSettings({}); toast('تم تحديث ' + r.rows.length + ' سعر' + (r.missing.length ? ' — يدوي لـ: ' + r.missing.join('، ') : '')); } catch (e) { toast('تعذر التحديث: ' + e.message + ' — أدخل الأسعار يدوياً', true); } finally { el.disabled = false; App.render(); }
        break; }
      case 'backup-export': download('نسخة-احتياطية-' + PF.todayStr() + '.json', JSON.stringify(Store.exportAll(), null, 1), 'application/json'); toast('تم تنزيل النسخة الاحتياطية'); break;
      case 'server-backup': try { await Store.api('backup'); toast('تم حفظ نسخة في جدول Google'); } catch (e) { toast('تعذر الحفظ: ' + e.message, true); } break;
      case 'server-list': try { const r = await Store.api('listBackups'); $('bk-list').innerHTML = r.backups.length ? table([{ label: 'النسخة', render: (b) => dateTime(b.createdAt) }, { label: '', render: (b) => '<button class="btn sm" data-act="server-restore" data-id="' + esc(b.id) + '">استعادة</button>' }], r.backups) : '<p class="muted">لا توجد نسخ.</p>'; } catch (e) { toast('تعذر الجلب: ' + e.message, true); } break;
      case 'server-restore': if (await confirmDialog('ستُستبدل كل البيانات الحالية بهذه النسخة (مع أخذ نسخة تلقائية قبل ذلك). متابعة؟', { danger: true, ok: 'استعادة' })) { try { download('قبل-الاستعادة-' + PF.todayStr() + '.json', JSON.stringify(Store.exportAll(), null, 1), 'application/json'); await Store.api('restoreBackup', { backupId: id }); Store.wipeLocal(); Store.resetCursor(); await Store.doSync(); toast('تمت الاستعادة'); } catch (e) { toast('فشلت الاستعادة: ' + e.message, true); } } break;
      case 'restore-item': Store.restore(arg, id, 'استرجاع'); toast('تم الاسترجاع'); break;
    }
  }
  document.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nav]'); if (n) { location.hash = '#/' + n.dataset.nav; return; }
    const th = e.target.closest('th[data-sort]'); if (th) { const s = Views.st(App.route); const k = th.dataset.sort; s.sortDir = s.sortKey === k && s.sortDir === 'desc' ? 'asc' : 'desc'; s.sortKey = k; render(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.tagName === 'TR' && e.target.closest('button,a,input,select')) { const inner = e.target.closest('[data-act]'); if (inner !== a) return; }
    e.stopPropagation(); act(a.dataset.act, a);
  });
  document.addEventListener('change', async (e) => {
    const f = e.target.closest('[data-filter]'); if (f) { applyFilter(f); return; }
    if (e.target.id === 'impFile' && e.target.files[0]) { try { const rows = await IO.readFile(e.target.files[0]); App.plan = IO.plan(rows); render(); } catch (err) { toast(err.message, true); } }
    if (e.target.id === 'restoreFile' && e.target.files[0]) {
      try { const obj = JSON.parse(await e.target.files[0].text());
        if (await confirmDialog('ستُستبدل جميع البيانات الحالية بمحتوى هذا الملف. ستُنزَّل أولاً نسخة من وضعك الحالي. متابعة؟', { danger: true, ok: 'استعادة' })) { download('قبل-الاستعادة-' + PF.todayStr() + '.json', JSON.stringify(Store.exportAll(), null, 1), 'application/json'); await Store.importAll(obj); toast('تمت الاستعادة'); App.render(); }
      } catch (err) { toast('فشلت الاستعادة: ' + err.message, true); } e.target.value = '';
    }
  });
  document.addEventListener('input', (e) => { const f = e.target.closest('[data-filter]'); if (f && (f.type === 'search' || f.type === 'text')) applyFilter(f); });
  function applyFilter(f) { const [v, k] = f.dataset.filter.split(':'); Views.st(v)[k] = f.value; render(); }

  /* ---------- الإقلاع ---------- */
  function route() { const r = (location.hash || '#/dashboard').replace('#/', '').split('?')[0]; App.route = VIEWS[r] ? r : 'dashboard'; closeSide(); render(); window.scrollTo(0, 0); }
  function boot() {
    setLang('ar'); applyTheme(); shell(); Store.subscribe(() => render());
    window.addEventListener('hashchange', route); route(); Store.initAuth();
    if (Store.remote() && Store.tokenValid()) Store.doSync();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
