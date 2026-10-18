/* الاستيراد والتصدير: CSV وExcel */
(function () {
  'use strict';
  const COLS = ['type', 'name', 'ticker', 'market', 'sector', 'currency', 'kind', 'date', 'qty', 'price', 'fee', 'amount', 'fxRate', 'issuer', 'structure', 'identifier', 'issueDate', 'maturityDate', 'faceValue', 'couponRate', 'frequency', 'notes'];
  const SYN = {
    type: ['type', 'النوع', 'نوع الاستثمار'], name: ['name', 'الاسم', 'اسم الشركة', 'اسم الصك', 'اسم السند'], ticker: ['ticker', 'symbol', 'الرمز', 'رمز السهم'], market: ['market', 'السوق', 'السوق المالي'], sector: ['sector', 'القطاع'],
    currency: ['currency', 'العملة'], kind: ['kind', 'العملية', 'نوع العملية'], date: ['date', 'التاريخ', 'تاريخ العملية'], qty: ['qty', 'quantity', 'الكمية', 'العدد'], price: ['price', 'السعر'], fee: ['fee', 'fees', 'الرسوم', 'العمولة'],
    amount: ['amount', 'المبلغ'], fxRate: ['fxrate', 'fx', 'سعر الصرف'], issuer: ['issuer', 'الجهة المصدرة'], structure: ['structure', 'الهيكل', 'التصنيف'], identifier: ['identifier', 'isin', 'الرمز التعريفي', 'رقم الصك'],
    issueDate: ['issuedate', 'تاريخ الإصدار'], maturityDate: ['maturitydate', 'تاريخ الاستحقاق'], faceValue: ['facevalue', 'القيمة الاسمية'], couponRate: ['couponrate', 'rate', 'معدل الربح', 'معدل الكوبون'], frequency: ['frequency', 'الدورية'], notes: ['notes', 'ملاحظات']
  };
  const TYPE_MAP = { stock: 'stock', 'سهم': 'stock', 'أسهم': 'stock', sukuk: 'sukuk', 'صك': 'sukuk', 'صكوك': 'sukuk', bond: 'bond', 'سند': 'bond', 'سندات': 'bond', other: 'other', 'أخرى': 'other', 'استثمار آخر': 'other' };
  const KIND_MAP = { buy: 'buy', 'شراء': 'buy', sell: 'sell', 'بيع': 'sell', income: 'income', dividend: 'income', profit: 'income', interest: 'income', 'توزيع': 'income', 'توزيعات': 'income', 'أرباح': 'income', 'ربح': 'income', 'فائدة': 'income', 'فوائد': 'income', 'دخل': 'income', redeem: 'redeem', 'استرداد': 'redeem', fee: 'fee', 'رسوم': 'fee' };
  const FREQ_MAP = { monthly: 'monthly', 'شهرية': 'monthly', quarterly: 'quarterly', 'ربع سنوية': 'quarterly', semiannual: 'semiannual', 'نصف سنوية': 'semiannual', annual: 'annual', 'سنوية': 'annual', maturity: 'maturity', 'عند الاستحقاق': 'maturity' };
  const INCOME_TYPE = { stock: 'dividend', sukuk: 'profit', bond: 'interest', other: 'other' };

  function parseCSV(text) {
    text = text.replace(/^﻿/, ''); const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row); return rows;
  }
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('تعذر تحميل مكتبة Excel (يلزم اتصال بالإنترنت). استخدم CSV.')); document.head.appendChild(s); });
  }
  const iso = (v) => {
    if (v instanceof Date) { const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); }
    v = String(v == null ? '' : v).trim(); if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    let m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return 'invalid:' + v;
  };
  async function readFile(file) {
    const name = file.name.toLowerCase(); let table;
    if (/\.xlsx?$/.test(name)) {
      const X = await loadXLSX(); const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      table = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
    } else table = parseCSV(await file.text());
    if (table.length < 2) throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات');
    const keys = table[0].map((h) => { const n = String(h).trim().toLowerCase().replace(/\s+/g, ''); const nn = String(h).trim().toLowerCase(); return Object.keys(SYN).find((k) => SYN[k].some((s) => s.replace(/\s+/g, '') === n || s === nn)) || null; });
    if (!keys.includes('name') || !keys.includes('date')) throw new Error('لم يتم التعرف على الأعمدة. يجب وجود عمودي name/الاسم وdate/التاريخ على الأقل — نزّل القالب.');
    return table.slice(1).map((r, i) => { const o = { _line: i + 2 }; keys.forEach((k, j) => { if (k) o[k] = r[j]; }); return o; }).filter((o) => Object.keys(o).some((k) => k !== '_line' && String(o[k]).trim() !== '')).filter((o) => !String(o.notes || '').startsWith('صف توضيحي'));
  }

  const nz = (v) => (v === '' || v === undefined || v === null ? '' : Number(String(v).replace(/,/g, '')));
  function plan(rows) {
    const base = Store.settings().baseCurrency, fx = Store.list('fx'), invs = Store.list('investments'), txs = Store.list('transactions');
    const invKey = (type, tk, nm, cur) => type + '|' + String(tk || nm).trim().toLowerCase() + '|' + cur;
    const byKey = {}; invs.forEach((i) => { byKey[invKey(i.type, i.ticker, i.name, i.currency)] = i; });
    const invOf = {}; invs.forEach((i) => { invOf[i.id] = i; });
    const txKey = (t) => { const i = invOf[t.invId]; return i ? [invKey(i.type, i.ticker, i.name, i.currency), t.date, t.kind, Number(t.qty || 0), Number(t.price || 0), Number(t.amount || 0)].join('|') : null; };
    const existing = new Set(txs.map(txKey).filter(Boolean));
    const out = [], newInvs = {};
    for (const r of rows) {
      const errs = []; const type = TYPE_MAP[String(r.type || '').trim().toLowerCase()] || TYPE_MAP[String(r.type || '').trim()];
      const kind = KIND_MAP[String(r.kind || 'buy').trim().toLowerCase()] || KIND_MAP[String(r.kind || '').trim()];
      const cur = String(r.currency || base).trim().toUpperCase(); const date = iso(r.date);
      if (!type) errs.push('نوع الاستثمار غير معروف'); if (!kind) errs.push('نوع العملية غير معروف');
      if (!String(r.name || '').trim()) errs.push('الاسم مطلوب'); if (!/^[A-Z]{3}$/.test(cur)) errs.push('العملة غير صحيحة');
      if (!date || date.startsWith('invalid') || isNaN(Date.parse(date))) errs.push('تاريخ غير صالح'); else if (date > PF.todayStr() && kind !== 'income') errs.push('تاريخ في المستقبل');
      const qty = nz(r.qty), price = nz(r.price), amount = nz(r.amount), fee = nz(r.fee) || 0;
      if ((kind === 'buy' || kind === 'sell') && !(qty > 0 && price > 0)) errs.push('الكمية والسعر مطلوبان');
      if ((kind === 'income' || kind === 'fee') && !(amount > 0)) errs.push('المبلغ مطلوب');
      if (kind === 'redeem' && !(amount >= 0)) errs.push('مبلغ الاسترداد مطلوب');
      let fxr = nz(r.fxRate); if (cur !== base && !(fxr > 0)) { const f = PF.fxAt(fx, cur, base, date); if (f === null) errs.push('سعر الصرف غير متوفر'); else fxr = f; } if (cur === base) fxr = 1;
      const tx = { date, kind, qty: qty || '', price: price || '', amount: amount || '', fee, currency: cur, fxRate: fxr, notes: String(r.notes || ''), incomeType: kind === 'income' ? INCOME_TYPE[type] : '' };
      const k = type ? invKey(type, r.ticker, r.name, cur) : null;
      const inv = type ? { type, name: String(r.name || '').trim(), ticker: String(r.ticker || '').trim(), market: String(r.market || ''), sector: String(r.sector || ''), currency: cur, issuer: String(r.issuer || ''), structure: String(r.structure || ''), identifier: String(r.identifier || ''), issueDate: iso(r.issueDate).startsWith('invalid') ? '' : iso(r.issueDate), maturityDate: iso(r.maturityDate).startsWith('invalid') ? '' : iso(r.maturityDate), faceValue: nz(r.faceValue), couponRate: nz(r.couponRate), frequency: FREQ_MAP[String(r.frequency || '').trim().toLowerCase()] || FREQ_MAP[String(r.frequency || '').trim()] || (type === 'sukuk' || type === 'bond' ? 'semiannual' : ''), notes: '' } : null;
      if (type && (type === 'sukuk' || type === 'bond') && !inv.maturityDate && !byKey[k]) errs.push('تاريخ الاستحقاق مطلوب للصكوك والسندات');
      let status = errs.length ? 'error' : 'new';
      if (!errs.length) { const sig = [k, date, kind, Number(tx.qty || 0), Number(tx.price || 0), Number(tx.amount || 0)].join('|'); if (existing.has(sig)) status = 'dup'; }
      out.push({ line: r._line, status, errs, k, inv, tx });
    }
    // فحص تجاوز الكمية عند البيع لكل استثمار
    const groups = {}; out.filter((o) => o.status === 'new').forEach((o) => { (groups[o.k] = groups[o.k] || []).push(o); });
    Object.keys(groups).forEach((k) => {
      const ex = byKey[k]; const id = ex ? ex.id : 'new_' + k; const invObj = ex || Object.assign({ id }, groups[k][0].inv);
      const base0 = ex ? txs.filter((t) => t.invId === ex.id) : [];
      const cand = groups[k].map((o, i) => Object.assign({ id: 'c' + i, invId: id, createdAt: String(1000 + i) }, o.tx));
      const p = PF.computePosition(invObj, base0.concat(cand), { base, fx });
      if (p.errors.some((e) => e.startsWith('oversell'))) groups[k].forEach((o) => { o.status = 'error'; o.errs.push('بيع يتجاوز الكمية المملوكة'); });
    });
    return out;
  }
  function commit(planRows) {
    const base = Store.settings().baseCurrency; const byKey = {}; Store.list('investments').forEach((i) => { byKey[i.type + '|' + String(i.ticker || i.name).trim().toLowerCase() + '|' + i.currency] = i; });
    let nt = 0, ni = 0;
    planRows.filter((p) => p.status === 'new').forEach((p) => {
      let inv = byKey[p.k]; if (!inv) { inv = Store.put('investments', p.inv, 'استيراد: ' + p.inv.name, true); byKey[p.k] = inv; ni++; }
      Store.put('transactions', Object.assign({ invId: inv.id }, p.tx), 'استيراد عملية', true); nt++;
      if (p.tx.currency !== base && p.tx.fxRate > 0 && PF.fxAt(Store.list('fx'), p.tx.currency, base, p.tx.date) === null) Store.put('fx', { currency: p.tx.currency, rate: p.tx.fxRate, date: p.tx.date, source: 'manual' }, null, true);
    });
    return { ni, nt };
  }
  const TEMPLATE = [COLS, ['stock', 'شركة مثال', 'EXMP', 'NASDAQ', 'تقنية', 'USD', 'buy', '2025-01-15', '10', '150', '1.5', '', '0.3845', '', '', '', '', '', '', '', '', 'صف توضيحي — احذفه قبل الاستيراد'], ['sukuk', 'صك مثال', '', '', '', 'OMR', 'buy', '2025-02-01', '100', '98.5', '0', '', '', 'جهة مصدرة', 'إجارة', '', '2025-01-01', '2028-01-01', '100', '5.2', 'semiannual', 'صف توضيحي']];
  const template = () => download('قالب-الاستيراد.csv', toCSV(TEMPLATE[0], TEMPLATE.slice(1)), 'text/csv;charset=utf-8');

  async function exportFile(name, headers, rows, fmt) {
    if (fmt === 'xlsx') {
      try { const X = await loadXLSX(); const ws = X.utils.aoa_to_sheet([headers].concat(rows)); const wb = X.utils.book_new(); ws['!rtl'] = true; wb.Workbook = { Views: [{ RTL: true }] }; X.utils.book_append_sheet(wb, ws, 'Sheet1'); X.writeFile(wb, name + '.xlsx'); return; }
      catch (e) { toast(e.message + ' — تم التصدير كملف CSV بدلاً من ذلك', true); }
    }
    download(name + '.csv', toCSV(headers, rows), 'text/csv;charset=utf-8');
  }
  // تصدير كل العمليات بصيغة قابلة لإعادة الاستيراد
  function exportAll(fmt) {
    const invs = {}; Store.list('investments').forEach((i) => { invs[i.id] = i; });
    const rows = Store.list('transactions').filter((t) => invs[t.invId]).sort((a, b) => (a.date < b.date ? -1 : 1)).map((t) => { const i = invs[t.invId]; const o = Object.assign({}, i, t, { kind: t.kind, currency: i.currency, notes: t.notes || '' }); return COLS.map((c) => (o[c] === undefined ? '' : o[c])); });
    return exportFile('الاستثمارات-' + PF.todayStr(), COLS, rows, fmt);
  }

  window.IO = { readFile, plan, commit, template, exportFile, exportAll, COLS };
})();
