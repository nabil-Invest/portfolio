/* صفحات العرض */
(function () {
  'use strict';
  const base = () => Store.settings().baseCurrency;
  const M = (v, o) => money(v, base(), o);
  const TYPES = Forms.TYPES;
  const vs = {}; // حالة كل صفحة: بحث/فرز/فلاتر
  const st = (v, d) => (vs[v] = vs[v] || Object.assign({ q: '', sortKey: '', sortDir: 'desc' }, d || {}));

  /* ---------- شارات ---------- */
  const PB = { live: ['لحظي', 'pos'], delayed: ['متأخر', 'warn'], manual: ['مدخل يدوياً', 'info'], stale: ['قديم', 'danger'] };
  const priceBadge = (s) => (PB[s] ? '<span class="badge ' + PB[s][1] + '">' + PB[s][0] + '</span>' : '');
  const SB = { active: ['نشط', 'pos'], matured: ['مستحق', 'warn'], sold: ['مباع', ''], redeemed: ['مسترد', ''], empty: ['بلا عمليات', ''] };
  const statusBadge = (s) => '<span class="badge ' + (SB[s] || ['', ''])[1] + '">' + (SB[s] || [s])[0] + '</span>';
  const atCost = '<span class="badge" title="لا يوجد سعر سوقي؛ تُحتسب القيمة بالتكلفة في المجاميع فقط">بالتكلفة</span>';
  const link = (inv) => '<a href="javascript:void 0" data-act="open" data-id="' + esc(inv.id) + '" style="color:inherit;font-weight:600;text-decoration:none">' + esc(inv.name) + '</a>';
  const subline = (s) => (s ? '<div class="muted" style="font-size:.78rem">' + esc(s) + '</div>' : '');

  const page = (title, actions, body) => '<div class="pagehead"><h1>' + esc(title) + '</h1><div style="display:flex;gap:8px;flex-wrap:wrap">' + (actions || '') + '</div></div>' + body;
  const addBtn = '<button class="btn primary" data-act="add">+ إضافة استثمار جديد</button>';

  /* ---------- لوحة التحكم ---------- */
  function dashboard() {
    const pf = App.portfolio(), T = pf.totals, b = base();
    if (!Store.list('investments').length && !Store.list('transactions').length) {
      return page('لوحة التحكم', '', '<div class="card empty"><h2>ابدأ بتسجيل أول استثمار</h2><p>لا توجد بيانات بعد — لن تُعرض أي أرقام تجريبية. أضف سهماً أو صكاً أو سنداً، أو استورد ملف CSV/Excel.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' + addBtn + '<button class="btn" data-nav="import">استيراد من ملف</button></div></div>');
    }
    const kpi = (l, v, s, cls) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v ' + (cls || '') + '">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>';
    const unr = T.openCount === T.valuedAtCostCount && T.openCount > 0 ? na() : M(T.unrealizedBase, { sign: true });
    const kp = [
      kpi('إجمالي رأس المال المستثمر (التكلفة الحالية)', M(T.investedBase), 'إجمالي المشتريات التاريخية: ' + M(T.boughtBase)),
      kpi('القيمة السوقية الحالية', M(T.valueForTotalsBase), T.valuedAtCostCount ? 'تشمل ' + T.valuedAtCostCount + ' استثمار مقيَّماً بالتكلفة (لا سعر سوقي)' : 'جميع المراكز بأسعار سوقية'),
      kpi('الأرباح/الخسائر المحققة', M(T.realizedBase, { sign: true }), 'منها أثر تغيّر الصرف: ' + M(T.realizedFxBase, { sign: true })),
      kpi('الأرباح/الخسائر غير المحققة', unr, (T.valuedAtCostCount ? 'يستثني ' + T.valuedAtCostCount + ' بلا سعر · ' : '') + 'أثر الصرف: ' + M(T.unrealizedFxBase, { sign: true })),
      kpi('الأرباح المستلمة (توزيعات/أرباح صكوك/فوائد)', M(T.incomeBase, { sign: true })),
      kpi('صافي العائد الاستثماري', M(T.totalReturnBase, { sign: true }), 'محقق + غير محقق + مستلم − رسوم (دون احتساب مزدوج)'),
      kpi('نسبة العائد', pct(T.returnPct), 'العائد السنوي الفعلي (XIRR): ' + (T.xirr === null ? na() : pct(T.xirr)) + (T.xirrExcluded ? ' — يستثني ' + T.xirrExcluded + ' بلا تقييم' : '')),
      Store.settings().trackCash ? kpi('النقد المتاح وغير المستثمر', T.cashBase === null ? na() : M(T.cashBase), Object.keys(T.cashByCurrency).map((c) => plain(T.cashByCurrency[c], c)).join(' · ')) : kpi('النقد المتاح', '<span class="na">غير مفعّل</span>', 'فعّل تتبع النقد من الإعدادات بعد تسجيل الإيداعات')
    ].join('');
    const lbl = (m, k) => m[k] || k;
    const donutType = Charts.donut(Object.keys(pf.allocation.byType).map((k) => ({ label: TYPES[k] || k, value: pf.allocation.byType[k] })), (v) => plain(v, b), 'التوزيع حسب النوع');
    const donutCur = Charts.donut(Object.keys(pf.allocation.byCurrency).map((k) => ({ label: k, value: pf.allocation.byCurrency[k] })), (v) => plain(v, b), 'التوزيع حسب العملة');
    const tl = App.timeline(); const snaps = Store.list('snapshots').filter((s) => s.currency === b).sort((a, c) => (a.date < c.date ? -1 : 1));
    const chart = Charts.line([
      { name: 'التكلفة المستثمرة (' + b + ')', points: tl.map((p) => ({ x: p.date, y: p.invested })), step: true },
      { name: 'العائد النقدي التراكمي (محقق + مستلم)', points: tl.map((p) => ({ x: p.date, y: p.cashReturn })), step: true },
      { name: 'القيمة السوقية (لقطات حقيقية يومية)', points: snaps.map((s) => ({ x: s.date, y: Number(s.valueBase) })) }
    ], (v, ax) => (ax ? fmtN(v, 0) : plain(v, b)));
    const alerts = pf.alerts.concat(App.extraAlerts());
    const alertHtml = alerts.length ? '<div class="card" style="margin-bottom:14px"><h2>تنبيهات (' + alerts.length + ')</h2>' + alerts.slice(0, 8).map((a) => '<div class="alert ' + a.level + '" ' + (a.invId ? 'data-act="open" data-id="' + esc(a.invId) + '"' : '') + '>• ' + esc(a.text) + '</div>').join('') + (alerts.length > 8 ? '<div class="note">و' + (alerts.length - 8) + ' تنبيهات أخرى</div>' : '') + '</div>' : '';
    const mats = pf.positions.filter((p) => p.pos.qty > 0 && p.pos.instrument && p.inv.maturityDate).sort((x, y) => (x.inv.maturityDate < y.inv.maturityDate ? -1 : 1)).slice(0, 6);
    const matHtml = mats.length ? '<ul class="list">' + mats.map((p) => '<li><div><div class="t">' + link(p.inv) + '</div><div class="sub">' + TYPES[p.inv.type] + ' · ' + esc(p.pos.instrument.remainingText || '') + '</div></div><div style="text-align:end">' + fmtDate(p.inv.maturityDate) + '<div class="sub">' + (p.pos.instrument.nextPayment ? 'الدفعة القادمة: ' + fmtDate(p.pos.instrument.nextPayment) : '') + '</div></div></li>').join('') + '</ul>' : '<div class="empty" style="padding:18px">لا توجد صكوك أو سندات مفتوحة</div>';
    const byId = {}; Store.list('investments').forEach((i) => { byId[i.id] = i; });
    const recent = Store.list('transactions').slice().sort((a, c) => (a.date < c.date ? 1 : a.date > c.date ? -1 : (c.createdAt || '') < (a.createdAt || '') ? -1 : 1)).slice(0, 8);
    const recHtml = recent.length ? '<ul class="list">' + recent.map((t) => { const i = byId[t.invId]; const amt = txAmount(t); return '<li><div><div class="t">' + esc(txLabel(t)) + (i ? ' — ' + esc(i.name) : '') + '</div><div class="sub">' + fmtDate(t.date) + '</div></div><div>' + money(amt, t.currency) + '</div></li>'; }).join('') + '</ul>' : '<div class="empty" style="padding:18px">لا توجد عمليات</div>';
    return page('لوحة التحكم', '<button class="btn" data-act="refresh-prices">↻ تحديث الأسعار</button>' + addBtn,
      alertHtml + '<div class="grid kpis" style="margin-bottom:14px">' + kp + '</div>' +
      '<div class="grid g2" style="margin-bottom:14px"><div class="card"><h2>توزيع المحفظة حسب نوع الاستثمار</h2>' + donutType + '</div><div class="card"><h2>توزيع المحفظة حسب العملة</h2>' + donutCur + '</div></div>' +
      '<div class="card" style="margin-bottom:14px"><h2>تطور المحفظة والأرباح</h2>' + chart + '<p class="note">الخطان الأولان محسوبان من عملياتك الفعلية. خط القيمة السوقية يُبنى من لقطات تُحفظ تلقائياً عند فتح التطبيق، فلا يُختلق تاريخ لم يُسجَّل.</p></div>' +
      '<div class="grid g2"><div class="card"><h2>أقرب مواعيد الاستحقاق</h2>' + matHtml + '</div><div class="card"><h2>أحدث العمليات</h2>' + recHtml + '</div></div>');
  }
  function txLabel(t) { if (t.kind === 'income') return ({ dividend: 'توزيعات أرباح', profit: 'أرباح صكوك', interest: 'فوائد سندات' }[t.incomeType] || 'دخل'); return Forms.KINDS[t.kind] || t.kind; }
  function txAmount(t) { if (t.kind === 'buy') return Number(t.qty) * Number(t.price) + Number(t.fee || 0); if (t.kind === 'sell') return Number(t.qty) * Number(t.price) - Number(t.fee || 0); return Number(t.amount); }

  /* ---------- جداول الاستثمارات ---------- */
  function filterBar(view, opts) {
    const s = st(view);
    const sel = (key, label, items) => '<select data-filter="' + view + ':' + key + '" aria-label="' + label + '"><option value="">' + label + '</option>' + items.map((i) => { const [v, l] = Array.isArray(i) ? i : [i, i]; return '<option value="' + esc(v) + '"' + (s[key] === v ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
    return '<div class="toolbar"><input type="search" placeholder="بحث بالاسم أو الرمز…" data-filter="' + view + ':q" value="' + esc(s.q) + '" style="min-width:200px">' + opts.map((o) => sel(o.key, o.label, o.items)).join('') + '</div>';
  }
  function applyFilters(view, rows) {
    const s = st(view), q = (s.q || '').toLowerCase() + (App.globalQ ? '' : '');
    const gq = (App.globalQ || '').toLowerCase();
    return rows.filter((r) => {
      const hay = (r.inv.name + ' ' + r.inv.ticker + ' ' + r.inv.issuer + ' ' + r.inv.market + ' ' + r.inv.identifier).toLowerCase();
      if (q && !hay.includes(q)) return false; if (gq && !hay.includes(gq)) return false;
      if (s.market && r.inv.market !== s.market) return false; if (s.currency && r.inv.currency !== s.currency) return false;
      if (s.status === 'open' && !(r.pos.qty > 0)) return false; if (s.status === 'closed' && r.pos.qty > 0) return false;
      if (s.pl === 'profit' && !(r.pos.totalReturnBase > 0)) return false; if (s.pl === 'loss' && !(r.pos.totalReturnBase < 0)) return false;
      if (s.structure && r.inv.structure !== s.structure) return false;
      return true;
    });
  }
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort();
  function listTable(view, rows, cols, foot) {
    const s = st(view); const sorted = s.sortKey ? sortRows(rows, cols, s.sortKey, s.sortDir) : rows;
    return table(cols, sorted, { sortable: true, sortKey: s.sortKey, sortDir: s.sortDir, click: true, rowAttr: (r) => 'data-act="open" data-id="' + esc(r.inv.id) + '"', foot });
  }

  function stocks() {
    const all = App.portfolio().positions.filter((p) => p.inv.type === 'stock'), b = base();
    const rows = applyFilters('stocks', all);
    const cols = [
      { key: 'name', label: 'الشركة', render: (r) => link(r.inv) + subline(r.inv.ticker + (r.inv.sector ? ' · ' + r.inv.sector : '')), sort: (r) => r.inv.name },
      { key: 'market', label: 'السوق', render: (r) => esc(r.inv.market) }, { key: 'cur', label: 'العملة', render: (r) => esc(r.inv.currency) },
      { key: 'qty', label: 'الكمية', n: 1, render: (r) => qtyf(r.pos.qty), sort: (r) => r.pos.qty },
      { key: 'avg', label: 'متوسط التكلفة', n: 1, render: (r) => (r.pos.avgCost === null ? '<span class="muted">—</span>' : '<span class="num">' + fmtN(r.pos.avgCost, 4) + '</span>'), sort: (r) => r.pos.avgCost },
      { key: 'price', label: 'السعر الحالي', n: 1, render: (r) => (r.pos.price === null ? na() : '<span class="num">' + fmtN(r.pos.price, 4) + '</span> ' + priceBadge(r.pos.priceStatus) + (r.pos.priceTs ? '<div class="muted" style="font-size:.72rem">' + dateTime(r.pos.priceTs) + '</div>' : '')), sort: (r) => r.pos.price },
      { key: 'mv', label: 'القيمة السوقية', n: 1, render: (r) => (r.pos.qty > 0 ? money(r.pos.marketValueLocal, r.inv.currency) : '<span class="muted">—</span>'), sort: (r) => r.pos.marketValueLocal },
      { key: 'mvb', label: 'القيمة (' + b + ')', n: 1, render: (r) => (r.pos.qty > 0 ? (r.pos.marketValueBase === null ? money(r.pos.valueForTotalsBase, b) + ' ' + atCost : money(r.pos.marketValueBase, b)) : '<span class="muted">—</span>'), sort: (r) => r.pos.valueForTotalsBase },
      { key: 'unr', label: 'غير محقق (' + b + ')', n: 1, render: (r) => (r.pos.qty > 0 ? money(r.pos.unrealizedBase, b, { sign: true }) : '<span class="muted">—</span>'), sort: (r) => r.pos.unrealizedBase },
      { key: 'real', label: 'محقق (' + b + ')', n: 1, render: (r) => money(r.pos.realizedBase, b, { sign: true }), sort: (r) => r.pos.realizedBase },
      { key: 'inc', label: 'توزيعات مستلمة', n: 1, render: (r) => money(r.pos.incomeBase, b), sort: (r) => r.pos.incomeBase },
      { key: 'ret', label: 'العائد الإجمالي', n: 1, render: (r) => pct(r.pos.returnPct), sort: (r) => r.pos.returnPct },
      { key: 'st', label: 'الحالة', render: (r) => statusBadge(r.pos.status) }
    ];
    const totals = rows.reduce((a, r) => { a.v += r.pos.valueForTotalsBase; a.u += r.pos.unrealizedBase || 0; a.r += r.pos.realizedBase; a.i += r.pos.incomeBase; return a; }, { v: 0, u: 0, r: 0, i: 0 });
    const foot = '<td colspan="7">الإجمالي (' + rows.length + ')</td><td class="n">' + M(totals.v) + '</td><td class="n">' + M(totals.u, { sign: true }) + '</td><td class="n">' + M(totals.r, { sign: true }) + '</td><td class="n">' + M(totals.i) + '</td><td colspan="2"></td>';
    return page('الأسهم', '<button class="btn" data-act="manual-prices">إدخال الأسعار يدوياً</button><button class="btn" data-act="refresh-prices">↻ تحديث الأسعار</button><button class="btn primary" data-act="add-type" data-arg="stock">+ إضافة سهم</button>',
      filterBar('stocks', [{ key: 'market', label: 'كل الأسواق', items: uniq(all.map((r) => r.inv.market)) }, { key: 'currency', label: 'كل العملات', items: uniq(all.map((r) => r.inv.currency)) }, { key: 'status', label: 'كل الحالات', items: [['open', 'مفتوحة'], ['closed', 'مغلقة']] }, { key: 'pl', label: 'ربح وخسارة', items: [['profit', 'رابحة'], ['loss', 'خاسرة']] }]) +
      (all.length ? listTable('stocks', rows, cols, foot) : '<div class="card empty"><p>لا توجد أسهم مسجَّلة.</p><button class="btn primary" data-act="add-type" data-arg="stock">+ إضافة سهم</button></div>') +
      '<p class="note">الأسعار: «لحظي» = آخر 15 دقيقة من مصدر مباشر، «متأخر» = من مصدر لكن ليس لحظياً، «مدخل يدوياً» = أدخلتُه أنا، «قديم» = تجاوز المدة المحددة في الإعدادات. لا يُعرض سعر قديم على أنه لحظي.</p>');
  }

  function fixed(view, type) {
    const all = App.portfolio().positions.filter((p) => p.inv.type === type);
    const rows = applyFilters(view, all);
    const sk = type === 'sukuk';
    const cols = [
      { key: 'name', label: sk ? 'الصك / الجهة المصدرة' : 'السند / الجهة المصدرة', render: (r) => link(r.inv) + subline(r.inv.issuer + (r.inv.identifier ? ' · ' + r.inv.identifier : '')), sort: (r) => r.inv.name },
      { key: 'structure', label: sk ? 'الهيكل' : 'النوع', render: (r) => esc(r.inv.structure || '—') }, { key: 'cur', label: 'العملة', render: (r) => esc(r.inv.currency) },
      { key: 'qty', label: 'الوحدات', n: 1, render: (r) => qtyf(r.pos.qty), sort: (r) => r.pos.qty },
      { key: 'inv', label: 'المبلغ المستثمر', n: 1, render: (r) => money(r.pos.boughtLocal, r.inv.currency), sort: (r) => r.pos.boughtLocal },
      { key: 'face', label: 'الأصل المتوقع استرداده', n: 1, render: (r) => (r.pos.qty > 0 ? money(r.pos.instrument.expectedRedemption, r.inv.currency) : '<span class="muted">—</span>'), sort: (r) => r.pos.instrument.expectedRedemption },
      { key: 'rate', label: (sk ? 'معدل الربح المعلن' : 'الكوبون'), n: 1, render: (r) => (has(r.inv.couponRate) ? '<span class="num">' + fmtN(Number(r.inv.couponRate), 2) + '%</span>' : na()), sort: (r) => Number(r.inv.couponRate) },
      { key: 'rec', label: 'المستلم فعلياً', n: 1, render: (r) => money(r.pos.incomeLocal, r.inv.currency), sort: (r) => r.pos.incomeLocal },
      { key: 'exp', label: 'المتوقع المتبقي (تقديري)', n: 1, render: (r) => (r.pos.qty > 0 ? money(r.pos.instrument.expectedProfitRemaining, r.inv.currency) : '<span class="muted">—</span>'), sort: (r) => r.pos.instrument.expectedProfitRemaining },
      { key: 'mat', label: 'الاستحقاق', render: (r) => fmtDate(r.inv.maturityDate) + (r.pos.qty > 0 && r.pos.instrument.remainingText ? '<div class="muted" style="font-size:.75rem">' + esc(r.pos.instrument.remainingText) + '</div>' : ''), sort: (r) => r.inv.maturityDate },
      { key: 'cv', label: 'القيمة الحالية', n: 1, render: (r) => (r.pos.qty > 0 ? (r.pos.marketValueLocal === null ? na() : money(r.pos.marketValueLocal, r.inv.currency)) : '<span class="muted">—</span>'), sort: (r) => r.pos.marketValueLocal },
      { key: 'ret', label: 'العائد الفعلي', n: 1, render: (r) => (r.pos.qty > 0 && r.pos.valuedAtCost ? na() : pct(r.pos.returnPct)), sort: (r) => r.pos.returnPct },
      { key: 'st', label: 'الحالة', render: (r) => statusBadge(r.pos.status) }
    ];
    return page(sk ? 'الصكوك الإسلامية' : 'السندات', '<button class="btn primary" data-act="add-type" data-arg="' + type + '">+ إضافة ' + (sk ? 'صك' : 'سند') + '</button>',
      filterBar(view, [{ key: 'currency', label: 'كل العملات', items: uniq(all.map((r) => r.inv.currency)) }, { key: 'status', label: 'كل الحالات', items: [['open', 'مفتوحة'], ['closed', 'مغلقة']] }, { key: 'structure', label: sk ? 'كل الهياكل' : 'كل الأنواع', items: uniq(all.map((r) => r.inv.structure)) }]) +
      (all.length ? listTable(view, rows, cols) : '<div class="card empty"><p>لا توجد سجلات.</p><button class="btn primary" data-act="add-type" data-arg="' + type + '">+ إضافة</button></div>') +
      '<p class="note">' + (sk ? 'معدل الربح المعلن والأرباح المتوقعة تقديرات وليست مضمونة؛ العائد الفعلي يُحسب من التدفقات المسجَّلة فقط ويظهر «غير متاح» حتى توفر قيمة حالية أو يُسجَّل الاسترداد.' : 'الكوبون ليس هو العائد الفعلي؛ العائد الفعلي يُحسب من التدفقات المسجَّلة ويظهر «غير متاح» ما لم تتوفر قيمة سوقية أو يُسجَّل الاسترداد.') + '</p>');
  }

  function others() {
    const all = App.portfolio().positions.filter((p) => p.inv.type === 'other'), b = base();
    const rows = applyFilters('other', all);
    const cols = [
      { key: 'name', label: 'الاستثمار', render: (r) => link(r.inv) + subline(r.inv.structure), sort: (r) => r.inv.name }, { key: 'cur', label: 'العملة', render: (r) => esc(r.inv.currency) },
      { key: 'inv', label: 'المبلغ المستثمر', n: 1, render: (r) => money(r.pos.boughtLocal, r.inv.currency), sort: (r) => r.pos.boughtLocal },
      { key: 'cv', label: 'القيمة الحالية', n: 1, render: (r) => (r.pos.qty > 0 ? (r.pos.marketValueLocal === null ? na() : money(r.pos.marketValueLocal, r.inv.currency)) : '<span class="muted">—</span>'), sort: (r) => r.pos.marketValueLocal },
      { key: 'unr', label: 'غير محقق (' + b + ')', n: 1, render: (r) => (r.pos.qty > 0 ? money(r.pos.unrealizedBase, b, { sign: true }) : '<span class="muted">—</span>'), sort: (r) => r.pos.unrealizedBase },
      { key: 'real', label: 'محقق (' + b + ')', n: 1, render: (r) => money(r.pos.realizedBase, b, { sign: true }), sort: (r) => r.pos.realizedBase },
      { key: 'inc', label: 'عوائد مستلمة', n: 1, render: (r) => money(r.pos.incomeBase, b), sort: (r) => r.pos.incomeBase }, { key: 'st', label: 'الحالة', render: (r) => statusBadge(r.pos.status) }
    ];
    return page('استثمارات أخرى', '<button class="btn primary" data-act="add-type" data-arg="other">+ إضافة استثمار آخر</button>', filterBar('other', [{ key: 'currency', label: 'كل العملات', items: uniq(all.map((r) => r.inv.currency)) }, { key: 'status', label: 'كل الحالات', items: [['open', 'مفتوحة'], ['closed', 'مغلقة']] }]) + (all.length ? listTable('other', rows, cols) : '<div class="card empty"><p>لا توجد سجلات.</p></div>'));
  }

  /* ---------- سجل العمليات ---------- */
  function transactions() {
    const s = st('tx', { kind: '', inv: '', from: '', to: '' }), b = base();
    const invs = {}; Store.list('investments').forEach((i) => { invs[i.id] = i; });
    const gq = (App.globalQ || '').toLowerCase();
    let rows = Store.list('transactions').filter((t) => (!s.kind || t.kind === s.kind) && (!s.inv || t.invId === s.inv) && (!s.from || t.date >= s.from) && (!s.to || t.date <= s.to) && (!s.q || ((invs[t.invId] || {}).name || '').toLowerCase().includes(s.q.toLowerCase())) && (!gq || ((invs[t.invId] || {}).name || '').toLowerCase().includes(gq)));
    rows.sort((a, c) => (a.date < c.date ? 1 : a.date > c.date ? -1 : (c.createdAt || '') < (a.createdAt || '') ? -1 : 1));
    const cols = [{ key: 'date', label: 'التاريخ', render: (t) => fmtDate(t.date) }, { key: 'kind', label: 'العملية', render: (t) => '<span class="badge">' + esc(txLabel(t)) + '</span>' }, { key: 'inv', label: 'الاستثمار', render: (t) => (invs[t.invId] ? link(invs[t.invId]) : '<span class="muted">حساب نقدي</span>') },
      { key: 'qty', label: 'الكمية', n: 1, render: (t) => (t.qty ? qtyf(t.qty) : '') }, { key: 'price', label: 'السعر', n: 1, render: (t) => (t.price ? '<span class="num">' + fmtN(Number(t.price), 4) + '</span>' : '') },
      { key: 'fee', label: 'الرسوم', n: 1, render: (t) => (Number(t.fee) ? '<span class="num">' + fmtN(Number(t.fee), dec(t.currency)) + '</span>' : '') }, { key: 'amt', label: 'المبلغ', n: 1, render: (t) => money(txAmount(t), t.currency) },
      { key: 'fx', label: 'سعر الصرف', n: 1, render: (t) => (t.currency !== b ? '<span class="num">' + fmtN(Number(t.fxRate), 5) + '</span>' : '') }, { key: 'notes', label: 'ملاحظات', render: (t) => esc(t.notes || '') },
      { key: 'act', label: '', render: (t) => '<button class="btn sm" data-act="edit-tx" data-id="' + esc(t.id) + '">تعديل</button> <button class="btn sm danger" data-act="del-tx" data-id="' + esc(t.id) + '">حذف</button>' }];
    const kinds = Object.keys(Forms.KINDS).map((k) => '<option value="' + k + '"' + (s.kind === k ? ' selected' : '') + '>' + Forms.KINDS[k] + '</option>').join('');
    const invOpts = Object.keys(invs).map((id) => '<option value="' + esc(id) + '"' + (s.inv === id ? ' selected' : '') + '>' + esc(invs[id].name) + '</option>').join('');
    return page('سجل العمليات', '<button class="btn" data-act="add-cash">+ عملية نقدية / توزيعات</button>' + addBtn,
      '<div class="toolbar"><select data-filter="tx:kind"><option value="">كل العمليات</option>' + kinds + '</select><select data-filter="tx:inv"><option value="">كل الاستثمارات</option>' + invOpts + '</select><label class="muted">من <input type="date" data-filter="tx:from" value="' + esc(s.from) + '"></label><label class="muted">إلى <input type="date" data-filter="tx:to" value="' + esc(s.to) + '"></label></div>' + table(cols, rows) + '<p class="note">الحذف «ناعم»: يُخفي السجل ويمكن استرجاعه من الإعدادات ← المحذوفات.</p>');
  }

  /* ---------- نافذة تفاصيل الاستثمار ---------- */
  function detailHtml(id) {
    const rec = App.portfolio().positions.find((p) => p.inv.id === id); if (!rec) return '<p>غير موجود</p>';
    const { inv, pos } = rec, c = inv.currency, b = base();
    const kv = (l, v) => '<div><div class="l">' + l + '</div><div class="v">' + v + '</div></div>';
    let k = kv('الكمية', qtyf(pos.qty)) + kv('متوسط التكلفة', pos.avgCost === null ? '—' : '<span class="num">' + fmtN(pos.avgCost, 4) + '</span>') + kv('التكلفة الحالية', money(pos.costLocal, c)) +
      kv('السعر/القيمة الحالية', pos.price === null ? na() : '<span class="num">' + fmtN(pos.price, 4) + '</span> ' + priceBadge(pos.priceStatus)) + kv('القيمة السوقية', pos.qty > 0 ? money(pos.marketValueLocal, c) : '—') +
      kv('غير محقق (' + c + ')', pos.qty > 0 ? money(pos.unrealizedLocal, c, { sign: true }) : '—') + kv('محقق (' + c + ')', money(pos.realizedLocal, c, { sign: true })) + kv('المستلم (' + c + ')', money(pos.incomeLocal, c)) +
      kv('محقق (' + b + ')', money(pos.realizedBase, b, { sign: true })) + kv('غير محقق (' + b + ')', pos.qty > 0 ? money(pos.unrealizedBase, b, { sign: true }) : '—') + kv('منه أثر الصرف', money(pos.realizedFxBase + (pos.unrealizedFxBase || 0), b, { sign: true })) +
      kv('العائد الإجمالي', pct(pos.returnPct)) + kv('العائد السنوي الفعلي (XIRR)', pos.xirr === null ? na() : pct(pos.xirr));
    let inst = '';
    if (pos.instrument) { const I = pos.instrument; inst = '<h3 style="margin-top:16px">بيانات ' + (inv.type === 'sukuk' ? 'الصك' : 'السند') + '</h3><div class="kv">' + kv('الأصل المتوقع استرداده', money(I.expectedRedemption, c)) + kv('الاستحقاق', fmtDate(inv.maturityDate)) + kv('المدة المتبقية', esc(I.remainingText || '—')) + kv('الدفعة القادمة', I.nextPayment ? fmtDate(I.nextPayment) : '—') + kv('الأرباح المستلمة', money(I.receivedIncome, c)) + kv('المتوقع المتبقي (تقديري)', money(I.expectedProfitRemaining, c)) + kv('المتوقع الكلي (تقديري)', money(I.expectedProfitTotal, c)) + kv('العائد الجاري على التكلفة (تقديري)', I.couponYieldOnCost === null ? na() : pct(I.couponYieldOnCost, { sign: false })) + '</div><p class="note">القيم «تقديري» محسوبة من معدل ' + (inv.type === 'sukuk' ? 'الربح المعلن' : 'الكوبون') + ' ولا تمثل ربحاً مضموناً.</p>'; }
    const txs = Store.list('transactions').filter((t) => t.invId === id).sort((a, x) => (a.date < x.date ? 1 : -1));
    const tx = txs.length ? table([{ label: 'التاريخ', render: (t) => fmtDate(t.date) }, { label: 'العملية', render: (t) => esc(txLabel(t)) }, { label: 'الكمية', n: 1, render: (t) => (t.qty ? qtyf(t.qty) : '') }, { label: 'السعر', n: 1, render: (t) => (t.price ? '<span class="num">' + fmtN(Number(t.price), 4) + '</span>' : '') }, { label: 'الرسوم', n: 1, render: (t) => (Number(t.fee) ? '<span class="num">' + fmtN(Number(t.fee), dec(c)) + '</span>' : '') }, { label: 'المبلغ', n: 1, render: (t) => money(txAmount(t), c) }, { label: 'الصرف', n: 1, render: (t) => (c !== b ? '<span class="num">' + fmtN(Number(t.fxRate), 5) + '</span>' : '') }, { label: '', render: (t) => '<button class="btn sm" data-act="edit-tx" data-id="' + esc(t.id) + '">تعديل</button> <button class="btn sm danger" data-act="del-tx" data-id="' + esc(t.id) + '">حذف</button>' }], txs) : '<p class="muted">لا توجد عمليات.</p>';
    const head = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px"><span class="badge">' + TYPES[inv.type] + '</span>' + statusBadge(pos.status) + (inv.ticker ? '<span class="badge">' + esc(inv.ticker) + '</span>' : '') + (inv.market ? '<span class="badge">' + esc(inv.market) + '</span>' : '') + '<span class="badge">' + esc(c) + '</span>' + (pos.valuedAtCost && pos.qty > 0 ? atCost : '') + '</div>';
    const errs = pos.errors.length ? '<div class="alert danger">• توجد مشكلات في بيانات هذا الاستثمار: ' + pos.errors.map((e) => esc(e.startsWith('oversell') ? 'بيع يتجاوز الكمية المملوكة' : e.startsWith('missing_fx') ? 'سعر صرف ناقص' : e)).filter((x, i, a) => a.indexOf(x) === i).join('، ') + '</div>' : '';
    const priceForm = pos.qty > 0 ? '<div class="toolbar" style="margin-top:12px"><label class="muted">تحديث السعر/القيمة الحالية للوحدة (' + esc(c) + ')</label><input type="number" step="any" min="0" id="detPrice" dir="ltr" style="width:140px" placeholder="' + (pos.price !== null ? pos.price : '') + '"><button class="btn sm" data-act="set-price" data-id="' + esc(id) + '">حفظ كمدخل يدوياً</button></div>' : '';
    return head + errs + '<div class="kv">' + k + '</div>' + inst + priceForm + (inv.notes ? '<p class="note">ملاحظات: ' + esc(inv.notes) + '</p>' : '') + '<h3 style="margin-top:16px">سجل العمليات</h3>' + tx;
  }

  /* ---------- التقارير ---------- */
  const REPORTS = [['all', 'تقرير شامل لجميع الاستثمارات'], ['stocks', 'تقرير الأسهم'], ['fixed', 'تقرير الصكوك والسندات'], ['pnl', 'تقرير الأرباح والخسائر'], ['income', 'الأرباح والفوائد المستلمة'], ['mat', 'الاستحقاقات خلال 30/60/90 يوماً'], ['annual', 'العائد السنوي لكل استثمار'], ['alloc', 'توزيع المحفظة'], ['compare', 'مقارنة الأداء عبر فترات'], ['cashflow', 'التدفقات النقدية']];
  function reportData(id, f) {
    const b = base(), today = PF.todayStr(), o = App.opts(); const fxRows = Store.list('fx');
    const priceMap = {}; Store.list('prices').forEach((p) => { priceMap[p.id] = p; });
    const invs = Store.list('investments').filter((i) => (!f.type || i.type === f.type) && (!f.currency || i.currency === f.currency) && (!f.market || i.market === f.market));
    const allTx = Store.list('transactions'); const txs = allTx.filter((t) => !f.to || t.date <= f.to);
    const pos = invs.map((inv) => ({ inv, pos: PF.computePosition(inv, txs, Object.assign({}, o, { fx: fxRows, price: priceMap[inv.id], today })) }));
    const inRange = (d) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
    const C = (label, html, raw, n) => ({ label, html, raw, n });
    const name = (r) => r.inv.name, typ = (r) => TYPES[r.inv.type];
    const money0 = (get, cur) => C(null, null, null);
    const sum = (rows, g) => rows.reduce((s, r) => s + (g(r) || 0), 0);
    let R = { title: (REPORTS.find((x) => x[0] === id) || [])[1], cols: [], rows: [], foot: null, note: '' };
    const sharedCols = (extra) => [C('الاستثمار', (r) => esc(name(r)), name), C('النوع', (r) => typ(r), typ), C('العملة', (r) => esc(r.inv.currency), (r) => r.inv.currency)].concat(extra);
    if (id === 'all' || id === 'stocks') {
      R.rows = pos.filter((r) => id === 'all' || r.inv.type === 'stock');
      R.cols = sharedCols([C('الكمية', (r) => qtyf(r.pos.qty), (r) => r.pos.qty, 1), C('التكلفة (' + b + ')', (r) => M(r.pos.costBase), (r) => PF.round(r.pos.costBase, 3), 1), C('القيمة (' + b + ')', (r) => (r.pos.valuedAtCost && r.pos.qty > 0 ? M(r.pos.valueForTotalsBase) + ' ' + atCost : M(r.pos.valueForTotalsBase)), (r) => PF.round(r.pos.valueForTotalsBase, 3) + (r.pos.valuedAtCost && r.pos.qty > 0 ? ' (بالتكلفة)' : ''), 1),
        C('محقق (' + b + ')', (r) => M(r.pos.realizedBase, { sign: true }), (r) => PF.round(r.pos.realizedBase, 3), 1), C('غير محقق (' + b + ')', (r) => M(r.pos.unrealizedBase, { sign: true }), (r) => (r.pos.unrealizedBase === null ? NA : PF.round(r.pos.unrealizedBase, 3)), 1),
        C('مستلم (' + b + ')', (r) => M(r.pos.incomeBase), (r) => PF.round(r.pos.incomeBase, 3), 1), C('العائد الإجمالي (' + b + ')', (r) => M(r.pos.totalReturnBase, { sign: true }), (r) => PF.round(r.pos.totalReturnBase, 3), 1), C('النسبة', (r) => pct(r.pos.returnPct), (r) => (r.pos.returnPct === null ? NA : PF.round(r.pos.returnPct * 100, 2) + '%'), 1)]);
      R.foot = { ['القيمة (' + b + ')']: sum(R.rows, (r) => r.pos.valueForTotalsBase), ['محقق (' + b + ')']: sum(R.rows, (r) => r.pos.realizedBase), ['غير محقق (' + b + ')']: sum(R.rows, (r) => r.pos.unrealizedBase), ['مستلم (' + b + ')']: sum(R.rows, (r) => r.pos.incomeBase), ['العائد الإجمالي (' + b + ')']: sum(R.rows, (r) => r.pos.totalReturnBase), ['التكلفة (' + b + ')']: sum(R.rows, (r) => r.pos.costBase) };
      R.note = 'العائد الإجمالي = محقق + غير محقق + مستلم − رسوم، دون احتساب أي بند مرتين. الاستثمارات بلا سعر سوقي تُحتسب بالتكلفة في «القيمة» ويظهر غير المحقق «غير متاح».' + (f.to ? ' (حتى تاريخ ' + f.to + ')' : '');
    } else if (id === 'fixed') {
      R.rows = pos.filter((r) => r.inv.type === 'sukuk' || r.inv.type === 'bond');
      R.cols = sharedCols([C('الهيكل/النوع', (r) => esc(r.inv.structure || '—'), (r) => r.inv.structure || ''), C('المبلغ المستثمر', (r) => money(r.pos.boughtLocal, r.inv.currency), (r) => PF.round(r.pos.boughtLocal, 3), 1), C('الأصل المتوقع استرداده', (r) => (r.pos.qty > 0 ? money(r.pos.instrument.expectedRedemption, r.inv.currency) : '—'), (r) => (r.pos.qty > 0 ? r.pos.instrument.expectedRedemption : ''), 1),
        C('المعدل المعلن %', (r) => (has(r.inv.couponRate) ? '<span class="num">' + r.inv.couponRate + '%</span>' : na()), (r) => r.inv.couponRate, 1), C('المستلم فعلياً', (r) => money(r.pos.incomeLocal, r.inv.currency), (r) => PF.round(r.pos.incomeLocal, 3), 1), C('المتوقع المتبقي (تقديري)', (r) => (r.pos.qty > 0 ? money(r.pos.instrument.expectedProfitRemaining, r.inv.currency) : '—'), (r) => (r.pos.qty > 0 && r.pos.instrument.expectedProfitRemaining !== null ? PF.round(r.pos.instrument.expectedProfitRemaining, 3) : NA), 1),
        C('الاستحقاق', (r) => fmtDate(r.inv.maturityDate), (r) => r.inv.maturityDate), C('المتبقي', (r) => esc(r.pos.qty > 0 ? r.pos.instrument.remainingText || '—' : '—'), (r) => (r.pos.qty > 0 ? r.pos.instrument.remainingText : '')), C('العائد الفعلي', (r) => (r.pos.qty > 0 && r.pos.valuedAtCost ? na() : pct(r.pos.returnPct)), (r) => (r.pos.qty > 0 && r.pos.valuedAtCost) || r.pos.returnPct === null ? NA : PF.round(r.pos.returnPct * 100, 2) + '%', 1), C('الحالة', (r) => statusBadge(r.pos.status), (r) => (SB[r.pos.status] || [''])[0])]);
      R.note = 'المتوقع = تقديرات من المعدل المعلن، وليس ربحاً مضموناً. العائد الفعلي من التدفقات المسجَّلة فقط.';
    } else if (id === 'pnl') {
      const evs = (r) => r.pos.events.filter((e) => inRange(e.date));
      R.rows = pos.filter((r) => evs(r).length || r.pos.qty > 0);
      const col = (label, g) => C(label, (r) => M(g(r), { sign: true }), (r) => PF.round(g(r), 3), 1);
      R.cols = sharedCols([col('محقق من البيع/الاسترداد (' + b + ')', (r) => sum(evs(r).filter((e) => e.kind === 'sell' || e.kind === 'redeem'), (e) => e.realizedBase)), col('دخل مستلم (' + b + ')', (r) => sum(evs(r), (e) => e.incomeBase)), col('رسوم أخرى (' + b + ')', (r) => sum(evs(r).filter((e) => e.kind === 'fee'), (e) => e.realizedBase)), C('غير محقق حالياً (' + b + ')', (r) => M(r.pos.unrealizedBase, { sign: true }), (r) => (r.pos.unrealizedBase === null ? NA : PF.round(r.pos.unrealizedBase, 3)), 1),
        col('إجمالي العائد (' + b + ')', (r) => sum(evs(r), (e) => e.realizedBase + e.incomeBase) + (r.pos.unrealizedBase || 0))]);
      R.foot = { ['محقق من البيع/الاسترداد (' + b + ')']: sum(R.rows, (r) => sum(evs(r).filter((e) => e.kind === 'sell' || e.kind === 'redeem'), (e) => e.realizedBase)), ['دخل مستلم (' + b + ')']: sum(R.rows, (r) => sum(evs(r), (e) => e.incomeBase)), ['رسوم أخرى (' + b + ')']: sum(R.rows, (r) => sum(evs(r).filter((e) => e.kind === 'fee'), (e) => e.realizedBase)), ['غير محقق حالياً (' + b + ')']: sum(R.rows, (r) => r.pos.unrealizedBase), ['إجمالي العائد (' + b + ')']: sum(R.rows, (r) => sum(evs(r), (e) => e.realizedBase + e.incomeBase) + (r.pos.unrealizedBase || 0)) };
      R.note = 'المحقق والدخل ضمن الفترة المختارة؛ غير المحقق يخص الكمية المتبقية اليوم. الأعمدة مفصولة لتجنب احتساب الأرباح مرتين.';
    } else if (id === 'income') {
      const byId = {}; invs.forEach((i) => { byId[i.id] = i; });
      R.rows = allTx.filter((t) => t.kind === 'income' && byId[t.invId] && inRange(t.date)).sort((a, c) => (a.date < c.date ? 1 : -1)).map((t) => ({ t, inv: byId[t.invId], fx: Number(t.fxRate) || fxRows && PF.fxAt(fxRows, byId[t.invId].currency, b, t.date) || 0 }));
      R.cols = [C('التاريخ', (r) => fmtDate(r.t.date), (r) => r.t.date), C('الاستثمار', (r) => esc(r.inv.name), (r) => r.inv.name), C('النوع', (r) => esc(txLabel(r.t)), (r) => txLabel(r.t)), C('المبلغ', (r) => money(r.t.amount, r.inv.currency), (r) => r.t.amount, 1), C('العملة', (r) => r.inv.currency, (r) => r.inv.currency), C('بـ ' + b, (r) => M(r.t.amount * r.fx), (r) => PF.round(r.t.amount * r.fx, 3), 1)];
      R.foot = { ['بـ ' + b]: sum(R.rows, (r) => r.t.amount * r.fx) }; R.note = 'يشمل التوزيعات النقدية وأرباح الصكوك وفوائد السندات المستلمة فعلياً.';
    } else if (id === 'mat') {
      const rows = []; pos.filter((r) => r.pos.qty > 0 && r.inv.maturityDate).forEach((r) => { const d = PF.daysBetween(today, r.inv.maturityDate); const bucket = d < 0 ? 'متأخر' : d <= 30 ? 'خلال 30 يوماً' : d <= 60 ? 'خلال 60 يوماً' : d <= 90 ? 'خلال 90 يوماً' : null; if (bucket) rows.push(Object.assign({ days: d, bucket }, r)); });
      R.rows = rows.sort((a, c) => a.days - c.days);
      R.cols = [C('الفترة', (r) => '<span class="badge ' + (r.days <= 30 ? 'danger' : r.days <= 60 ? 'warn' : 'info') + '">' + r.bucket + '</span>', (r) => r.bucket), C('الاستثمار', (r) => esc(r.inv.name), (r) => r.inv.name), C('النوع', (r) => typ(r), typ), C('الاستحقاق', (r) => fmtDate(r.inv.maturityDate), (r) => r.inv.maturityDate), C('الأيام', (r) => '<span class="num">' + r.days + '</span>', (r) => r.days, 1), C('الأصل المتوقع', (r) => money(r.pos.instrument.expectedRedemption, r.inv.currency), (r) => r.pos.instrument.expectedRedemption, 1), C('العملة', (r) => r.inv.currency, (r) => r.inv.currency)];
    } else if (id === 'annual') {
      R.rows = pos.filter((r) => r.pos.hasTx);
      R.cols = sharedCols([C('أول شراء', (r) => fmtDate(r.pos.firstBuyDate), (r) => r.pos.firstBuyDate || ''), C('مدة الحيازة (يوم)', (r) => (r.pos.firstBuyDate ? '<span class="num">' + PF.daysBetween(r.pos.firstBuyDate, r.pos.qty > 0 ? today : r.pos.lastTxDate) + '</span>' : '—'), (r) => (r.pos.firstBuyDate ? PF.daysBetween(r.pos.firstBuyDate, r.pos.qty > 0 ? today : r.pos.lastTxDate) : ''), 1), C('العائد الإجمالي', (r) => pct(r.pos.returnPct), (r) => (r.pos.returnPct === null ? NA : PF.round(r.pos.returnPct * 100, 2) + '%'), 1), C('العائد السنوي الفعلي (XIRR)', (r) => (r.pos.xirr === null ? na() : pct(r.pos.xirr)), (r) => (r.pos.xirr === null ? NA : PF.round(r.pos.xirr * 100, 2) + '%'), 1)]);
      R.note = 'XIRR يتطلب تدفقات مسجَّلة وقيمة حالية (أو استثماراً مغلقاً) ومدة لا تقل عن 30 يوماً؛ وإلا يظهر «غير متاح».';
    } else if (id === 'alloc') {
      const open = pos.filter((r) => r.pos.qty > 0), tot = sum(open, (r) => r.pos.valueForTotalsBase);
      const grp = (title, key) => { const m = {}; open.forEach((r) => { const k = key(r) || '—'; m[k] = (m[k] || 0) + r.pos.valueForTotalsBase; }); return Object.keys(m).map((k) => ({ g: title, k, v: m[k], p: tot ? m[k] / tot : 0 })).sort((a, c) => c.v - a.v); };
      R.rows = grp('حسب النوع', (r) => TYPES[r.inv.type]).concat(grp('حسب العملة', (r) => r.inv.currency), grp('حسب السوق (الأسهم)', (r) => (r.inv.type === 'stock' ? r.inv.market : null)).filter((x) => x.k !== '—'));
      R.cols = [C('التصنيف', (r) => r.g, (r) => r.g), C('البند', (r) => esc(r.k), (r) => r.k), C('القيمة (' + b + ')', (r) => M(r.v), (r) => PF.round(r.v, 3), 1), C('النسبة', (r) => pct(r.p, { sign: false }), (r) => PF.round(r.p * 100, 2) + '%', 1)];
    } else if (id === 'compare') {
      const W = [['شهر', 30], ['3 أشهر', 91], ['6 أشهر', 182], ['12 شهراً', 365], ['منذ البداية', 100000]];
      const val = (r, days) => { const from = PF.toStr(new Date(Date.parse(today) - days * 86400000)); return sum(r.pos.events.filter((e) => e.date >= from), (e) => e.realizedBase + e.incomeBase); };
      R.rows = pos.filter((r) => r.pos.hasTx);
      R.cols = sharedCols(W.map((w) => C(w[0] + ' (' + b + ')', (r) => M(val(r, w[1]), { sign: true }), (r) => PF.round(val(r, w[1]), 3), 1)));
      R.foot = {}; W.forEach((w) => { R.foot[w[0] + ' (' + b + ')'] = sum(R.rows, (r) => val(r, w[1])); });
      R.note = 'المقارنة تخص العائد النقدي المحقق (أرباح بيع + دخل مستلم) خلال كل فترة حتى اليوم. التغيّر السعري غير المحقق لا يُقارَن لأن الأسعار التاريخية غير مسجَّلة.';
    } else if (id === 'cashflow') {
      const byId = {}; invs.forEach((i) => { byId[i.id] = i; }); const mm = {};
      allTx.filter((t) => byId[t.invId] && inRange(t.date)).forEach((t) => { const k = t.date.slice(0, 7); const x = (mm[k] = mm[k] || { m: k, buy: 0, sell: 0, inc: 0, fee: 0 }); const fx = Number(t.fxRate) || PF.fxAt(fxRows, byId[t.invId].currency, b, t.date) || 0; const q = Number(t.qty || 0), p = Number(t.price || 0), fe = Number(t.fee || 0), a = Number(t.amount || 0);
        if (t.kind === 'buy') x.buy += (q * p + fe) * fx; else if (t.kind === 'sell') x.sell += (q * p - fe) * fx; else if (t.kind === 'redeem') x.sell += (a - fe) * fx; else if (t.kind === 'income') x.inc += a * fx; else if (t.kind === 'fee') x.fee += a * fx; });
      R.rows = Object.values(mm).sort((a, c) => (a.m < c.m ? -1 : 1));
      R.cols = [C('الشهر', (r) => '<span class="num">' + r.m + '</span>', (r) => r.m), C('خارج: مشتريات', (r) => M(r.buy), (r) => PF.round(r.buy, 3), 1), C('خارج: رسوم أخرى', (r) => M(r.fee), (r) => PF.round(r.fee, 3), 1), C('داخل: مبيعات واستردادات', (r) => M(r.sell), (r) => PF.round(r.sell, 3), 1), C('داخل: دخل مستلم', (r) => M(r.inc), (r) => PF.round(r.inc, 3), 1), C('صافي التدفق', (r) => M(r.sell + r.inc - r.buy - r.fee, { sign: true }), (r) => PF.round(r.sell + r.inc - r.buy - r.fee, 3), 1)];
      R.foot = { 'خارج: مشتريات': sum(R.rows, (r) => r.buy), 'خارج: رسوم أخرى': sum(R.rows, (r) => r.fee), 'داخل: مبيعات واستردادات': sum(R.rows, (r) => r.sell), 'داخل: دخل مستلم': sum(R.rows, (r) => r.inc), 'صافي التدفق': sum(R.rows, (r) => r.sell + r.inc - r.buy - r.fee) };
      R.note = 'التدفقات بالعملة الأساسية حسب سعر الصرف المسجَّل وقت كل عملية. الإيداعات والسحوبات النقدية ليست تدفقات استثمارية ولا تدخل هنا.';
    }
    return R;
  }
  function reports() {
    const s = st('rep', { id: 'all', type: '', currency: '', market: '', from: '', to: '' });
    const R = reportData(s.id, s);
    const invs = Store.list('investments');
    const opts = (items, cur) => items.map((i) => { const [v, l] = Array.isArray(i) ? i : [i, i]; return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
    const tabs = REPORTS.map((r) => '<button class="' + (s.id === r[0] ? 'on' : '') + '" data-act="rep" data-arg="' + r[0] + '">' + r[1] + '</button>').join('');
    const bar = '<div class="toolbar"><select data-filter="rep:type"><option value="">كل الأنواع</option>' + opts(Object.keys(TYPES).map((k) => [k, TYPES[k]]), s.type) + '</select><select data-filter="rep:currency"><option value="">كل العملات</option>' + opts(uniq(invs.map((i) => i.currency)), s.currency) + '</select><select data-filter="rep:market"><option value="">كل الأسواق</option>' + opts(uniq(invs.map((i) => i.market)), s.market) + '</select><label class="muted">من <input type="date" data-filter="rep:from" value="' + esc(s.from) + '"></label><label class="muted">إلى <input type="date" data-filter="rep:to" value="' + esc(s.to) + '"></label><span style="flex:1"></span><button class="btn" data-act="rep-export" data-arg="csv">تصدير CSV</button><button class="btn" data-act="rep-export" data-arg="xlsx">تصدير Excel</button><button class="btn" data-act="print">طباعة</button></div>';
    const cols = R.cols.map((c, i) => ({ key: 'c' + i, label: c.label, n: c.n, render: c.html }));
    const foot = R.foot ? '<td>الإجمالي</td>' + R.cols.slice(1).map((c) => '<td class="n">' + (R.foot[c.label] !== undefined ? M(R.foot[c.label], { sign: /محقق|غير|صافي|إجمالي العائد/.test(c.label) }) : '') + '</td>').join('') : '';
    return page('التقارير', '', '<div class="tabs">' + tabs + '</div>' + bar + '<div class="card" style="margin-bottom:12px"><h2>' + esc(R.title) + '</h2>' + table(cols, R.rows, { foot }) + (R.note ? '<p class="note">' + esc(R.note) + '</p>' : '') + '<p class="note">فلتر «من/إلى» يخص التقارير التي تعتمد على فترة (الأرباح والخسائر، المستلم، التدفقات، المقارنة). في بقية التقارير يعمل «إلى» كتاريخ احتساب.</p></div>');
  }
  function exportReport(fmt) { const s = st('rep'); const R = reportData(s.id, s); const headers = R.cols.map((c) => c.label); const rows = R.rows.map((r) => R.cols.map((c) => { const v = c.raw(r); return v === null || v === undefined ? '' : v; })); if (R.foot) rows.push(['الإجمالي'].concat(R.cols.slice(1).map((c) => (R.foot[c.label] !== undefined ? PF.round(R.foot[c.label], 3) : '')))); IO.exportFile('تقرير-' + s.id + '-' + PF.todayStr(), headers, rows, fmt); }

  window.Views = { dashboard, stocks, sukuk: () => fixed('sukuk', 'sukuk'), bonds: () => fixed('bonds', 'bond'), other: others, transactions, reports, detailHtml, exportReport, vs, st, priceBadge, statusBadge, txLabel, txAmount, page, REPORTS };
})();
