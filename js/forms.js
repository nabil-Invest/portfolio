/* نماذج الإضافة والتعديل: الاستثمارات، العمليات، النقد، الأسعار */
(function () {
  'use strict';
  const TYPES = { stock: 'سهم', sukuk: 'صك', bond: 'سند', other: 'استثمار آخر' };
  const KINDS = { buy: 'شراء', sell: 'بيع', income: 'دخل', redeem: 'استرداد', fee: 'رسوم/تكاليف', deposit: 'إيداع نقدي', withdraw: 'سحب نقدي' };
  const FREQ = [['quarterly', 'ربع سنوية'], ['semiannual', 'نصف سنوية'], ['annual', 'سنوية'], ['monthly', 'شهرية'], ['maturity', 'عند الاستحقاق فقط']];
  const STRUCT = { sukuk: ['إجارة', 'مرابحة', 'مضاربة', 'وكالة', 'مشاركة', 'سلم', 'استصناع', 'أخرى'], bond: ['حكومي', 'شركات', 'بلدية', 'تحويلي', 'أخرى'], other: ['عقار', 'ذهب ومعادن', 'صندوق استثمار', 'وديعة', 'مشروع/أعمال', 'أخرى'] };
  const MARKETS = ['NASDAQ', 'NYSE', 'سوق مسقط (MSM)', 'تداول (السعودية)', 'سوق أبوظبي (ADX)', 'سوق دبي (DFM)', 'بورصة الكويت', 'بورصة البحرين', 'بورصة قطر', 'أخرى'];
  const CURRENCIES = ['OMR', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'BHD', 'QAR', 'JPY', 'CHF'];
  const INCOME_TYPE = { stock: 'dividend', sukuk: 'profit', bond: 'interest', other: 'other' };
  const INCOME_LABEL = { stock: 'توزيعات أرباح نقدية', sukuk: 'أرباح صكوك مستلمة', bond: 'فوائد سندات مستلمة', other: 'عائد مستلم' };
  const base = () => Store.settings().baseCurrency;
  const today = () => PF.todayStr();
  const fxFor = (cur, date) => { if (!cur || cur === base()) return 1; const r = PF.fxAt(Store.list('fx'), cur, base(), date); return r === null ? '' : r; };

  function datalists() {
    const used = Array.from(new Set(CURRENCIES.concat(Store.list('investments').map((i) => i.currency), Store.list('fx').map((f) => f.currency)).filter(Boolean)));
    return '<datalist id="dl_cur">' + used.map((c) => '<option value="' + c + '">').join('') + '</datalist><datalist id="dl_market">' + MARKETS.map((m) => '<option value="' + esc(m) + '">').join('') + '</datalist>';
  }

  /* ربط ديناميكي: إظهار سعر الصرف، تعبئته تلقائياً، المعاينة */
  function wire(root, o) {
    const q = (n) => root.querySelector('[name="' + n + '"]');
    const fxEl = q('fxRate');
    if (fxEl) fxEl.addEventListener('input', () => { fxEl.dataset.touched = '1'; });
    const refresh = () => {
      const cur = o.cur ? o.cur() : base();
      const need = cur && cur !== base() && /^[A-Z]{3}$/.test(cur);
      const wrap = root.querySelector('[data-f="fxRate"]');
      if (wrap) { wrap.hidden = !need || (o.fxHidden && o.fxHidden()); if (need && fxEl && !fxEl.dataset.touched) { const d = q('date') ? q('date').value : today(); const r = fxFor(cur, d); fxEl.value = r === '' ? '' : r; const h = wrap.querySelector('.hint'); if (h) h.textContent = r === '' ? 'لا يوجد سعر صرف مسجّل لهذه العملة — أدخله (1 ' + cur + ' = ؟ ' + base() + ')' : 'مأخوذ من جدول أسعار الصرف — يمكنك تعديله'; } }
      o.onChange && o.onChange(root, q);
      const pv = root.querySelector('.preview'); if (pv && o.preview) { const h = o.preview(root, q); pv.hidden = !h; pv.innerHTML = h || ''; }
    };
    root.addEventListener('input', refresh); root.addEventListener('change', refresh);
    refresh(); return refresh;
  }

  /* ---------- القائمة الرئيسية للإضافة ---------- */
  function openAddMenu() {
    const m = openModal({
      title: 'إضافة استثمار جديد', footer: false,
      body: '<div class="choices">' +
        [['stock', 'سهم', 'من أي سوق مالي'], ['sukuk', 'صك', 'صكوك إسلامية'], ['bond', 'سند', 'سندات بكوبون'], ['other', 'استثمار آخر', 'عقار، ذهب، صندوق، وديعة…'], ['cash', 'عملية نقدية أو توزيعات أرباح', 'توزيعات، أرباح صكوك، فوائد، إيداع، سحب']]
          .map((c) => '<button class="choice" data-pick="' + c[0] + '"><b>' + c[1] + '</b><span>' + c[2] + '</span></button>').join('') + '</div>'
    });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; m.close(); b.dataset.pick === 'cash' ? openCashForm() : openInvestmentForm(b.dataset.pick); });
  }

  /* ---------- نموذج الاستثمار ---------- */
  function invFields(type, v) {
    v = v || {}; const f = [];
    if (type === 'stock') f.push({ name: 'name', label: 'اسم الشركة', req: 1, value: v.name }, { name: 'ticker', label: 'رمز السهم (Ticker)', req: 1, value: v.ticker, hint: 'للأسهم الأمريكية مثل AAPL، ولسوق مسقط الرمز المعتمد' }, { name: 'market', label: 'السوق المالي', list: 'dl_market', req: 1, value: v.market }, { name: 'sector', label: 'القطاع', value: v.sector });
    else if (type === 'other') f.push({ name: 'name', label: 'اسم الاستثمار', req: 1, value: v.name, full: 1 }, { name: 'structure', label: 'التصنيف', type: 'select', opts: STRUCT.other, value: v.structure });
    else f.push({ name: 'name', label: type === 'sukuk' ? 'اسم الصك' : 'اسم السند', req: 1, value: v.name }, { name: 'issuer', label: 'الجهة المصدرة', req: 1, value: v.issuer }, { name: 'structure', label: type === 'sukuk' ? 'نوع الصك وهيكله' : 'نوع السند', type: 'select', opts: [['', '— غير محدد —']].concat(STRUCT[type].map((x) => [x, x])), value: v.structure }, { name: 'identifier', label: type === 'sukuk' ? 'رقم الصك / رمز التعريف' : 'رمز السند (ISIN)', value: v.identifier });
    f.push({ name: 'currency', label: 'العملة', type: 'currency', req: 1, value: v.currency || base() });
    if (type === 'sukuk' || type === 'bond') f.push({ name: 'issueDate', label: 'تاريخ الإصدار', type: 'date', value: v.issueDate }, { name: 'maturityDate', label: 'تاريخ الاستحقاق', type: 'date', req: 1, value: v.maturityDate }, { name: 'faceValue', label: 'القيمة الاسمية للوحدة', type: 'number', min: 0, req: 1, value: v.faceValue }, { name: 'couponRate', label: type === 'sukuk' ? 'معدل الربح المعلن/المتوقع (% سنوياً)' : 'معدل الكوبون (% سنوياً)', type: 'number', min: 0, value: v.couponRate, hint: type === 'sukuk' ? 'تقدير وليس ربحاً مضموناً' : '' }, { name: 'frequency', label: 'دورية دفع ' + (type === 'sukuk' ? 'الأرباح' : 'الفوائد'), type: 'select', opts: FREQ, value: v.frequency || 'semiannual' });
    if (type === 'other') f.push({ name: 'maturityDate', label: 'تاريخ الاستحقاق (إن وجد)', type: 'date', value: v.maturityDate });
    return f;
  }
  const qtyLabel = { stock: 'عدد الأسهم', sukuk: 'عدد الصكوك/الوحدات', bond: 'عدد السندات', other: 'الكمية' };
  const priceLabel = { stock: 'سعر شراء السهم', sukuk: 'سعر الشراء للوحدة', bond: 'سعر الشراء للسند', other: 'المبلغ المستثمر' };

  function openInvestmentForm(type, inv) {
    const edit = !!inv; const v = inv || {};
    let fields = invFields(type, v);
    if (!edit) {
      fields = fields.concat([{ name: 'date', label: 'تاريخ الشراء', type: 'date', req: 1, value: today() }]);
      if (type !== 'other') fields.push({ name: 'qty', label: qtyLabel[type], type: 'number', min: 0, req: 1 });
      fields.push({ name: 'price', label: priceLabel[type], type: 'number', min: 0, req: 1 }, { name: 'fee', label: 'عمولة ورسوم الشراء', type: 'number', min: 0, value: 0 },
        { name: 'fxRate', label: 'سعر الصرف إلى ' + base(), type: 'number', min: 0, hint: '', hide: true },
        { name: 'curPrice', label: type === 'other' ? 'القيمة الحالية (اختياري)' : 'السعر/القيمة الحالية للوحدة (اختياري)', type: 'number', min: 0, hint: type === 'sukuk' || type === 'bond' ? 'إن لم تتوفر قيمة سوقية اتركه فارغاً: سيُعرض «غير متاح» لا رقم مختلق' : '' });
    }
    fields.push({ name: 'notes', label: 'ملاحظات', type: 'textarea', full: 1, value: v.notes });
    const m = openModal({
      title: (edit ? 'تعديل: ' : 'إضافة ') + TYPES[type], body: datalists() + formHtml(fields), sticky: true,
      buttons: [{ label: 'حفظ', cls: 'primary', onClick: () => save() }, { label: 'إلغاء', onClick: (a) => a.close() }],
      onMount: (a) => { const form = a.body.querySelector('form'); if (!edit) wire(form, { cur: () => (form.querySelector('[name=currency]').value || '').toUpperCase(), preview: (r, q) => { const qty = type === 'other' ? 1 : Number(q('qty').value), pr = Number(q('price').value), fee = Number(q('fee').value || 0); if (!qty || !pr) return ''; const tot = qty * pr + fee; const cur = (q('currency').value || '').toUpperCase(); return 'إجمالي كلفة الشراء شاملة الرسوم: <b class="num">' + fmtN(tot, dec(cur)) + ' ' + esc(cur) + '</b>'; } }); }
    });
    const form = m.body.querySelector('form');
    function save() {
      const errs = checkRequired(form); const d = readForm(form);
      const cur = (d.currency || '').toUpperCase();
      if (!edit) {
        if (d.date && d.date > today()) errs.push('تاريخ الشراء في المستقبل');
        if (!(Number(type === 'other' ? 1 : d.qty) > 0)) errs.push('الكمية يجب أن تكون أكبر من صفر');
        if (!(Number(d.price) > 0)) errs.push('سعر الشراء يجب أن يكون أكبر من صفر');
        if (cur && cur !== base() && !(Number(d.fxRate) > 0)) errs.push('سعر الصرف مطلوب لأن عملة الاستثمار تختلف عن العملة الأساسية');
      }
      if ((type === 'sukuk' || type === 'bond')) {
        if (d.issueDate && d.maturityDate && d.maturityDate <= d.issueDate) errs.push('تاريخ الاستحقاق يجب أن يكون بعد تاريخ الإصدار');
        if (d.couponRate !== '' && d.couponRate !== undefined && (d.couponRate < 0 || d.couponRate > 100)) errs.push('معدل الربح/الكوبون يجب أن يكون بين 0 و100');
        if (!edit && d.date && d.maturityDate && d.maturityDate < d.date) errs.push('تاريخ الاستحقاق قبل تاريخ الشراء');
      }
      if (type === 'stock' && !edit) { const dup = Store.list('investments').find((i) => i.type === 'stock' && i.ticker && i.ticker.toUpperCase() === String(d.ticker).toUpperCase() && i.market === d.market && i.currency === cur); if (dup) errs.push('هذا السهم مسجَّل مسبقاً — افتحه وأضف «شراء إضافي» بدل إنشاء سجل جديد'); }
      formErrors(form, errs); if (errs.length) return;
      const rec = { id: edit ? inv.id : undefined, type, name: d.name, ticker: d.ticker || '', market: d.market || '', sector: d.sector || '', currency: cur, issuer: d.issuer || '', structure: d.structure || '', identifier: d.identifier || '', issueDate: d.issueDate || '', maturityDate: d.maturityDate || '', faceValue: d.faceValue === undefined ? '' : d.faceValue, couponRate: d.couponRate === undefined ? '' : d.couponRate, frequency: d.frequency || '', notes: d.notes || '' };
      if (edit && inv.createdAt) rec.createdAt = inv.createdAt;
      const saved = Store.put('investments', rec, (edit ? 'تعديل ' : 'إضافة ') + TYPES[type] + ': ' + d.name);
      if (!edit) {
        const fx = cur === base() ? 1 : Number(d.fxRate);
        Store.put('transactions', { invId: saved.id, date: d.date, kind: 'buy', qty: type === 'other' ? 1 : Number(d.qty), price: Number(d.price), fee: Number(d.fee || 0), currency: cur, fxRate: fx, notes: '' }, 'شراء أولي: ' + d.name);
        rememberFx(cur, d.date, fx);
        if (d.curPrice !== '' && d.curPrice !== undefined) Prices.setManual(saved, d.curPrice);
      }
      m.close(); toast(edit ? 'تم حفظ التعديلات' : 'تمت إضافة الاستثمار'); App.render();
    }
  }
  function rememberFx(cur, date, rate) {
    if (!cur || cur === base() || !(rate > 0)) return;
    const ex = PF.fxAt(Store.list('fx'), cur, base(), date); if (ex !== null && Math.abs(ex - rate) < 1e-12) return;
    Store.put('fx', { currency: cur, rate, date, source: 'manual' }, 'سعر صرف ' + cur + ' = ' + rate, true);
  }

  /* ---------- نموذج العملية على استثمار موجود ---------- */
  function openTxForm(invId, opt) {
    opt = opt || {}; const inv = Store.get('investments', invId); const tx = opt.tx; const type = inv.type;
    const P = App.portfolio().positions.find((p) => p.inv.id === invId); const pos = P ? P.pos : null;
    const kinds = [['buy', 'شراء إضافي'], ['sell', 'بيع (جزئي أو كامل)'], ['income', INCOME_LABEL[type]]]; if (type !== 'stock') kinds.push(['redeem', 'استرداد الأصل عند الاستحقاق']); kinds.push(['fee', 'إضافة رسوم أو تكاليف']);
    const v = tx || {}; const kind0 = v.kind || opt.kind || 'buy';
    const fields = [{ name: 'kind', label: 'نوع العملية', type: 'select', opts: kinds, value: kind0, full: 1 }, { name: 'date', label: 'التاريخ', type: 'date', req: 1, value: v.date || today() },
      { name: 'qty', label: qtyLabel[type], type: 'number', min: 0, value: v.qty, hint: pos ? 'المتبقي حالياً: ' + pos.qty : '' }, { name: 'price', label: type === 'other' ? 'السعر للوحدة' : 'السعر للوحدة', type: 'number', min: 0, value: v.price },
      { name: 'amount', label: 'المبلغ (' + inv.currency + ')', type: 'number', min: 0, value: v.amount, hint: '' }, { name: 'fee', label: 'عمولة ورسوم', type: 'number', min: 0, value: v.fee === undefined ? 0 : v.fee },
      { name: 'fxRate', label: 'سعر الصرف إلى ' + base(), type: 'number', min: 0, value: v.fxRate, hide: true }, { name: 'notes', label: 'ملاحظات', type: 'textarea', full: 1, value: v.notes }];
    const m = openModal({
      title: (tx ? 'تعديل عملية — ' : 'تسجيل عملية — ') + inv.name, body: datalists() + formHtml(fields), sticky: true,
      buttons: [{ label: 'حفظ', cls: 'primary', onClick: () => save() }, { label: 'إلغاء', onClick: (a) => a.close() }],
      onMount: (a) => {
        const form = a.body.querySelector('form'); const q = (n) => form.querySelector('[name="' + n + '"]');
        const vis = () => {
          const k = q('kind').value; const show = { qty: ['buy', 'sell', 'redeem'], price: ['buy', 'sell'], amount: ['income', 'redeem', 'fee'], fee: ['buy', 'sell', 'redeem'] };
          Object.keys(show).forEach((n) => { form.querySelector('[data-f="' + n + '"]').hidden = !show[n].includes(k); });
          q('qty').required = ['buy', 'sell'].includes(k); q('price').required = ['buy', 'sell'].includes(k); q('amount').required = ['income', 'redeem', 'fee'].includes(k);
          const hint = form.querySelector('[data-f="amount"] .hint'); if (hint) hint.textContent = k === 'redeem' ? 'إجمالي المبلغ المسترد فعلياً (الأصل + أي ربح نهائي يخص الاسترداد)' : k === 'income' ? 'المبلغ الصافي المستلم' : '';
          if (k === 'redeem' && !tx && !q('qty').value && pos) { q('qty').value = pos.qty; if (has(inv.faceValue) && !q('amount').value) q('amount').value = Number(inv.faceValue) * pos.qty; }
        };
        q('kind').addEventListener('change', vis);
        if (pos && pos.qty > 0) { const w = form.querySelector('[data-f="qty"] .hint'); const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = 'كامل الكمية'; b.style.alignSelf = 'flex-start'; b.addEventListener('click', () => { q('qty').value = pos.qty; q('qty').dispatchEvent(new Event('input', { bubbles: true })); }); w.after(b); }
        wire(form, { cur: () => inv.currency, onChange: vis, preview: (r, qq) => { const k = qq('kind').value, n = (x) => Number(qq(x).value || 0); if (k === 'buy' && n('qty') && n('price')) return 'إجمالي الشراء شاملاً الرسوم: <b class="num">' + fmtN(n('qty') * n('price') + n('fee'), dec(inv.currency)) + ' ' + inv.currency + '</b>'; if (k === 'sell' && n('qty') && n('price')) return 'صافي حصيلة البيع بعد الرسوم: <b class="num">' + fmtN(n('qty') * n('price') - n('fee'), dec(inv.currency)) + ' ' + inv.currency + '</b>'; return ''; } });
        vis();
      }
    });
    const form = m.body.querySelector('form');
    function save() {
      const d = readForm(form), k = d.kind, errs = checkRequired(form);
      if (d.date > today() && k !== 'income') errs.push('التاريخ في المستقبل');
      if (['buy', 'sell'].includes(k) && !(d.qty > 0)) errs.push('الكمية يجب أن تكون أكبر من صفر');
      if (['buy', 'sell'].includes(k) && !(d.price > 0)) errs.push('السعر يجب أن يكون أكبر من صفر');
      if (['income', 'fee'].includes(k) && !(d.amount > 0)) errs.push('المبلغ يجب أن يكون أكبر من صفر');
      if (k === 'redeem' && !(d.amount >= 0)) errs.push('أدخل المبلغ المسترد فعلياً');
      if (inv.currency !== base() && !(d.fxRate > 0)) errs.push('سعر الصرف مطلوب');
      const cand = { id: tx ? tx.id : 'tmp', invId, date: d.date, kind: k, qty: ['buy', 'sell', 'redeem'].includes(k) ? d.qty || 0 : 0, price: ['buy', 'sell'].includes(k) ? d.price : '', amount: ['income', 'redeem', 'fee'].includes(k) ? d.amount : '', fee: ['buy', 'sell', 'redeem'].includes(k) ? d.fee || 0 : 0, currency: inv.currency, fxRate: inv.currency === base() ? 1 : d.fxRate, incomeType: k === 'income' ? INCOME_TYPE[type] : '', notes: d.notes || '', createdAt: tx ? tx.createdAt : new Date().toISOString() };
      if (!errs.length) {
        const all = Store.list('transactions').filter((t) => !tx || t.id !== tx.id).concat([cand]);
        const chk = PF.computePosition(inv, all, { base: base(), fx: Store.list('fx'), method: Store.settings().costMethod });
        if (chk.errors.some((e) => e.startsWith('oversell'))) errs.push('الكمية المباعة/المستردة تتجاوز الكمية المملوكة في ذلك التاريخ');
      }
      formErrors(form, errs); if (errs.length) return;
      if (tx) cand.id = tx.id; else delete cand.id;
      Store.put('transactions', cand, (tx ? 'تعديل عملية ' : 'عملية ') + KINDS[k] + ' — ' + inv.name);
      rememberFx(inv.currency, d.date, cand.fxRate);
      m.close(); toast('تم حفظ العملية'); App.render();
    }
  }

  /* ---------- عملية نقدية / توزيعات ---------- */
  function openCashForm(tx) {
    const invs = Store.list('investments');
    const v = tx || {}; let kind0 = 'dividend'; if (tx) kind0 = tx.kind === 'deposit' ? 'deposit' : tx.kind === 'withdraw' ? 'withdraw' : ({ dividend: 'dividend', profit: 'profit', interest: 'interest' }[tx.incomeType] || 'dividend');
    const opts = [['dividend', 'توزيعات أرباح أسهم'], ['profit', 'أرباح صكوك'], ['interest', 'فوائد سندات'], ['deposit', 'إيداع نقدي'], ['withdraw', 'سحب نقدي']];
    const fields = [{ name: 'ctype', label: 'نوع العملية', type: 'select', opts, value: kind0, full: 1 }, { name: 'invId', label: 'الاستثمار', type: 'select', opts: [], value: v.invId }, { name: 'currency', label: 'العملة', type: 'currency', value: v.currency || base() },
      { name: 'date', label: 'التاريخ', type: 'date', req: 1, value: v.date || today() }, { name: 'amount', label: 'المبلغ', type: 'number', min: 0, req: 1, value: v.amount, hint: 'المبلغ الصافي المستلم' }, { name: 'fxRate', label: 'سعر الصرف إلى ' + base(), type: 'number', min: 0, value: v.fxRate, hide: true }, { name: 'notes', label: 'ملاحظات', type: 'textarea', full: 1, value: v.notes }];
    const m = openModal({
      title: tx ? 'تعديل عملية نقدية' : 'عملية نقدية أو توزيعات أرباح', body: datalists() + formHtml(fields), sticky: true,
      buttons: [{ label: 'حفظ', cls: 'primary', onClick: () => save() }, { label: 'إلغاء', onClick: (a) => a.close() }],
      onMount: (a) => {
        const form = a.body.querySelector('form'); const q = (n) => form.querySelector('[name="' + n + '"]');
        const typeOf = { dividend: 'stock', profit: 'sukuk', interest: 'bond' };
        const fill = () => {
          const ct = q('ctype').value, cash = ct === 'deposit' || ct === 'withdraw';
          form.querySelector('[data-f="invId"]').hidden = cash; form.querySelector('[data-f="currency"]').hidden = !cash;
          if (!cash) { const list = invs.filter((i) => i.type === typeOf[ct]); const sel = q('invId'); const cur = sel.value; sel.innerHTML = list.length ? list.map((i) => '<option value="' + esc(i.id) + '"' + (i.id === (cur || v.invId) ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.currency) + ')</option>').join('') : '<option value="">— لا توجد استثمارات من هذا النوع —</option>'; }
        };
        q('ctype').addEventListener('change', () => { fill(); const x = q('fxRate'); delete x.dataset.touched; });
        wire(form, { cur: () => { const ct = q('ctype').value; if (ct === 'deposit' || ct === 'withdraw') return (q('currency').value || '').toUpperCase(); const i = Store.get('investments', q('invId').value); return i ? i.currency : base(); }, onChange: () => { }, });
        q('invId').addEventListener('change', () => { delete q('fxRate').dataset.touched; q('fxRate').dispatchEvent(new Event('input', { bubbles: true })); });
        fill();
      }
    });
    const form = m.body.querySelector('form');
    function save() {
      const d = readForm(form), errs = checkRequired(form), cash = d.ctype === 'deposit' || d.ctype === 'withdraw';
      let cur = d.currency, inv = null;
      if (!cash) { inv = Store.get('investments', d.invId); if (!inv) errs.push('اختر الاستثمار'); else cur = inv.currency; } else if (!/^[A-Z]{3}$/.test(cur || '')) errs.push('العملة غير صحيحة');
      if (!(d.amount > 0)) errs.push('المبلغ يجب أن يكون أكبر من صفر');
      if (cur && cur !== base() && !(d.fxRate > 0)) errs.push('سعر الصرف مطلوب');
      formErrors(form, errs); if (errs.length) return;
      const rec = { id: tx ? tx.id : undefined, invId: cash ? '' : inv.id, date: d.date, kind: cash ? d.ctype : 'income', incomeType: cash ? '' : { dividend: 'dividend', profit: 'profit', interest: 'interest' }[d.ctype], amount: d.amount, qty: '', price: '', fee: 0, currency: cur, fxRate: cur === base() ? 1 : d.fxRate, notes: d.notes || '' };
      if (tx && tx.createdAt) rec.createdAt = tx.createdAt;
      Store.put('transactions', rec, (cash ? KINDS[d.ctype] : 'دخل') + (inv ? ' — ' + inv.name : ''));
      rememberFx(cur, d.date, rec.fxRate); m.close(); toast('تم الحفظ'); App.render();
    }
  }

  /* ---------- تحديث الأسعار يدوياً ---------- */
  function openBulkPrices() {
    const P = App.portfolio().positions.filter((p) => p.pos.qty > 0);
    if (!P.length) { toast('لا توجد مراكز مفتوحة'); return; }
    const rows = P.map(({ inv, pos }) => '<tr><td>' + esc(inv.name) + '<div class="muted" style="font-size:.78rem">' + esc(TYPES[inv.type]) + ' · ' + esc(inv.currency) + '</div></td><td class="n">' + (pos.price !== null ? '<span class="num">' + fmtN(pos.price, 4) + '</span>' : na()) + '</td><td><input type="number" step="any" min="0" data-p="' + esc(inv.id) + '" dir="ltr" style="width:130px;text-align:end;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface)"></td></tr>').join('');
    const m = openModal({ title: 'إدخال الأسعار الحالية يدوياً', wide: true, sticky: true, body: '<p class="note">يُسجَّل السعر بوسم «مدخل يدوياً» وبتاريخ ووقت الإدخال. اترك الحقل فارغاً لإبقاء السعر الحالي. للصكوك والسندات أدخل القيمة السوقية للوحدة إن توفرت.</p><div class="tablewrap"><table class="data"><thead><tr><th>الاستثمار</th><th class="n">آخر سعر</th><th>السعر الجديد</th></tr></thead><tbody>' + rows + '</tbody></table></div>', buttons: [{ label: 'حفظ الأسعار', cls: 'primary', onClick: (a) => { let n = 0; a.body.querySelectorAll('[data-p]').forEach((i) => { if (i.value !== '' && Number(i.value) >= 0) { Prices.setManual(Store.get('investments', i.dataset.p), Number(i.value)); n++; } }); a.close(); toast('تم تحديث ' + n + ' سعر'); App.render(); } }, { label: 'إلغاء', onClick: (a) => a.close() }] });
    return m;
  }

  window.Forms = { TYPES, KINDS, FREQ, openAddMenu, openInvestmentForm, openTxForm, openCashForm, openBulkPrices, INCOME_LABEL, CURRENCIES, MARKETS, datalists };
})();
