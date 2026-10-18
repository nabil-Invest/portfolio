/* محرك الحسابات المالية المركزي — دوال نقية بلا اعتماد على الواجهة.
 * يعمل في المتصفح (window.PF) وفي Node للاختبار (module.exports).
 *
 * نموذج البيانات:
 *  investment: {id,type:'stock'|'sukuk'|'bond'|'other',name,ticker,market,sector,currency,
 *               issuer,structure,identifier,issueDate,maturityDate,faceValue,couponRate,frequency,notes}
 *  transaction: {id,invId,date,kind:'buy'|'sell'|'income'|'redeem'|'fee'|'deposit'|'withdraw',
 *               qty,price,amount,fee,currency,fxRate,incomeType,notes,createdAt}
 *  price: {id:invId,price,ts,source:'live'|'delayed'|'manual',currency}
 *  fx: {id,currency,rate,date,source}   // 1 وحدة من currency = rate من العملة الأساسية
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EPS = 1e-9;
  const FREQ_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, maturity: 0 };

  /* ---------- التواريخ ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const toStr = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  function addMonths(s, n) {
    const d = parse(s); const day = d.getUTCDate();
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, last));
    return toStr(t);
  }
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v));
  const has = (v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
  const round = (v, d = 2) => { const f = Math.pow(10, d); return Math.round((v + Number.EPSILON) * f) / f; };

  /* ---------- أسعار الصرف ---------- */
  // أحدث سعر صرف في تاريخ date أو قبله (لا يُستخدم سعر لاحق حتى لا تتغير النتائج التاريخية)
  function fxAt(fxRows, currency, base, date) {
    if (currency === base) return 1;
    let best = null;
    for (const r of fxRows || []) {
      if (r.deleted || r.currency !== currency || !has(r.rate) || Number(r.rate) <= 0) continue;
      if (date && r.date > date) continue;
      if (!best || r.date > best.date || (r.date === best.date && (r.updatedAt || '') > (best.updatedAt || ''))) best = r;
    }
    return best ? Number(best.rate) : null;
  }
  const fxNow = (fxRows, currency, base) => fxAt(fxRows, currency, base, '9999-12-31');

  /* ---------- حالة السعر ---------- */
  function priceStatus(p, now, staleHours = 24) {
    if (!p || !has(p.price)) return 'none';
    const ts = p.ts ? new Date(p.ts).getTime() : NaN;
    const ageH = isNaN(ts) ? Infinity : ((now || Date.now()) - ts) / 3600000;
    if (p.source === 'manual') return ageH > staleHours ? 'stale' : 'manual';
    if (ageH > staleHours) return 'stale';
    if (p.source === 'live' && ageH <= 0.25) return 'live';
    return 'delayed';
  }

  /* ---------- طرق احتساب التكلفة (قابلة للتوسعة) ---------- */
  // كل طريقة تستلم lots وكمية للإزالة وتعيد التكلفة المزالة (محلية وأساسية)
  const COST_METHODS = {
    WAC(lots, q) { // المتوسط المرجح
      const tq = lots.reduce((s, l) => s + l.qty, 0);
      const ratio = tq > EPS ? Math.min(q / tq, 1) : 0;
      let cl = 0, cb = 0;
      for (const l of lots) { const c = l.cost * ratio, b = l.costBase * ratio; cl += c; cb += b; l.cost -= c; l.costBase -= b; l.qty -= l.qty * ratio; }
      return { cost: cl, costBase: cb };
    },
    FIFO(lots, q) { // الوارد أولاً صادر أولاً
      let left = q, cl = 0, cb = 0;
      for (const l of lots) {
        if (left <= EPS) break;
        const take = Math.min(left, l.qty), r = l.qty > EPS ? take / l.qty : 0;
        const c = l.cost * r, b = l.costBase * r;
        cl += c; cb += b; l.cost -= c; l.costBase -= b; l.qty -= take; left -= take;
      }
      return { cost: cl, costBase: cb };
    }
  };

  /* ---------- XIRR ---------- */
  function xirr(flows) { // flows: [{date,amount}]
    const f = flows.filter((x) => Math.abs(x.amount) > EPS);
    if (f.length < 2) return null;
    if (!f.some((x) => x.amount < 0) || !f.some((x) => x.amount > 0)) return null;
    f.sort((a, b) => (a.date < b.date ? -1 : 1));
    const t0 = f[0].date;
    if (daysBetween(t0, f[f.length - 1].date) < 30) return null; // الفترة القصيرة تعطي أرقاماً سنوية مضللة
    const npv = (r) => f.reduce((s, x) => s + x.amount / Math.pow(1 + r, daysBetween(t0, x.date) / 365), 0);
    let lo = -0.9999, hi = 10, flo = npv(lo), fhi = npv(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = npv(mid);
      if (Math.abs(fm) < 1e-7) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  /* ---------- مدفوعات الصكوك/السندات ---------- */
  function nextPaymentDate(inv, today) {
    if (!inv.maturityDate) return null;
    const m = FREQ_MONTHS[inv.frequency];
    if (m === undefined) return null;
    if (m === 0) return inv.maturityDate > today ? inv.maturityDate : null;
    let best = null;
    for (let k = 0; k < 600; k++) {
      const d = addMonths(inv.maturityDate, -k * m);
      if (d > today) best = d; else break;
    }
    return best;
  }
  function remainingText(days) {
    if (days === null) return null;
    if (days < 0) return 'مستحق منذ ' + (-days) + ' يوم';
    if (days === 0) return 'يستحق اليوم';
    const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30), d = days - y * 365 - m * 30;
    const parts = [];
    if (y) parts.push(y + (y === 1 ? ' سنة' : ' سنوات'));
    if (m) parts.push(m + (m === 1 ? ' شهر' : ' أشهر'));
    if (!y && (d || !m)) parts.push(d + ' يوم');
    return parts.join(' و');
  }

  /* ---------- حساب مركز استثمار واحد ---------- */
  // opts: {method,base,fx,price,today,now,staleHours}
  function computePosition(inv, allTxs, opts) {
    const o = Object.assign({ method: 'WAC', base: 'OMR', fx: [], today: todayStr(), now: Date.now(), staleHours: 24 }, opts || {});
    const method = COST_METHODS[o.method] || COST_METHODS.WAC;
    const cur = inv.currency;
    const txs = allTxs.filter((t) => t.invId === inv.id && !t.deleted)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || '') < (b.createdAt || '') ? -1 : 1));
    const P = {
      invId: inv.id, currency: cur, qty: 0, costLocal: 0, costBase: 0,
      boughtLocal: 0, boughtBase: 0, soldProceedsLocal: 0, soldProceedsBase: 0,
      realizedLocal: 0, realizedBase: 0, realizedInvBase: 0, realizedFxBase: 0,
      incomeLocal: 0, incomeBase: 0, otherFeesLocal: 0, otherFeesBase: 0,
      feesLocal: 0, events: [], flows: [], errors: [], lastTxDate: null, firstBuyDate: null,
      redeemed: false, hasTx: txs.length > 0
    };
    const lots = [];
    const missingFx = [];
    for (const t of txs) {
      let fx = has(t.fxRate) && Number(t.fxRate) > 0 ? Number(t.fxRate) : (cur === o.base ? 1 : fxAt(o.fx, cur, o.base, t.date));
      if (fx === null) { fx = 0; missingFx.push(t.date); P.errors.push('missing_fx:' + t.date); }
      P.lastTxDate = t.date;
      const q = num(t.qty), pr = num(t.price), fee = num(t.fee);
      if (t.kind === 'buy') {
        const cost = q * pr + fee;
        lots.push({ qty: q, cost, costBase: cost * fx });
        P.qty += q; P.costLocal += cost; P.costBase += cost * fx;
        P.boughtLocal += cost; P.boughtBase += cost * fx; P.feesLocal += fee;
        if (!P.firstBuyDate) P.firstBuyDate = t.date;
        P.flows.push({ date: t.date, amount: -cost * fx });
      } else if (t.kind === 'sell' || t.kind === 'redeem') {
        let sq = q;
        if (t.kind === 'redeem' && !sq) sq = P.qty; // الاسترداد الكامل إن لم تُذكر كمية
        if (sq > P.qty + 1e-7) { P.errors.push('oversell:' + t.date); sq = P.qty; }
        const gross = t.kind === 'sell' ? sq * pr : num(t.amount);
        const proceeds = gross - fee;
        const rem = method(lots, sq);
        P.qty -= sq; if (P.qty < 1e-9) P.qty = 0;
        P.costLocal = lots.reduce((s, l) => s + l.cost, 0); P.costBase = lots.reduce((s, l) => s + l.costBase, 0);
        if (P.qty === 0) { P.costLocal = 0; P.costBase = 0; lots.length = 0; }
        const rl = proceeds - rem.cost, rb = proceeds * fx - rem.costBase, ri = rl * fx;
        P.soldProceedsLocal += proceeds; P.soldProceedsBase += proceeds * fx;
        P.realizedLocal += rl; P.realizedBase += rb; P.realizedInvBase += ri; P.realizedFxBase += rb - ri;
        P.feesLocal += fee;
        if (t.kind === 'redeem') P.redeemed = true;
        P.events.push({ date: t.date, kind: t.kind, realizedBase: rb, realizedLocal: rl, incomeBase: 0 });
        P.flows.push({ date: t.date, amount: proceeds * fx });
      } else if (t.kind === 'income') {
        const a = num(t.amount);
        P.incomeLocal += a; P.incomeBase += a * fx;
        P.events.push({ date: t.date, kind: 'income', realizedBase: 0, realizedLocal: 0, incomeBase: a * fx, incomeType: t.incomeType });
        P.flows.push({ date: t.date, amount: a * fx });
      } else if (t.kind === 'fee') {
        const a = num(t.amount);
        P.otherFeesLocal += a; P.otherFeesBase += a * fx;
        P.events.push({ date: t.date, kind: 'fee', realizedBase: -a * fx, realizedLocal: -a, incomeBase: 0 });
        P.flows.push({ date: t.date, amount: -a * fx });
      }
    }
    P.avgCost = P.qty > EPS ? P.costLocal / P.qty : null;

    /* التقييم الحالي */
    const pinfo = o.price;
    P.priceStatus = priceStatus(pinfo, o.now, o.staleHours);
    P.price = pinfo && has(pinfo.price) ? Number(pinfo.price) : null;
    P.priceTs = pinfo ? pinfo.ts : null;
    const fxCur = cur === o.base ? 1 : fxNow(o.fx, cur, o.base);
    P.fxNow = fxCur;
    P.valuedAtCost = false;
    if (P.qty > EPS) {
      if (P.price !== null && fxCur !== null) {
        P.marketValueLocal = P.qty * P.price;
        P.marketValueBase = P.marketValueLocal * fxCur;
        P.unrealizedLocal = P.marketValueLocal - P.costLocal;
        P.unrealizedBase = P.marketValueBase - P.costBase;
        P.unrealizedInvBase = P.unrealizedLocal * fxCur;
        P.unrealizedFxBase = P.unrealizedBase - P.unrealizedInvBase;
      } else {
        // لا نختلق قيمة: التقييم بالتكلفة لأغراض المجاميع فقط، والربح غير المحقق «غير متاح»
        P.marketValueLocal = null; P.marketValueBase = null;
        P.unrealizedLocal = null; P.unrealizedBase = null; P.unrealizedInvBase = null; P.unrealizedFxBase = null;
        P.valuedAtCost = true;
        if (P.price !== null && fxCur === null) P.errors.push('missing_fx_now');
      }
    } else {
      P.marketValueLocal = 0; P.marketValueBase = 0; P.unrealizedLocal = 0; P.unrealizedBase = 0; P.unrealizedInvBase = 0; P.unrealizedFxBase = 0;
    }
    P.valueForTotalsBase = P.qty > EPS ? (P.valuedAtCost ? P.costBase : P.marketValueBase) : 0;

    /* العائد الإجمالي دون احتساب مزدوج: محقق (من البيع/الاسترداد) + غير محقق (على الكمية المتبقية فقط) + دخل − رسوم أخرى */
    P.totalReturnBase = P.realizedBase + (P.unrealizedBase || 0) + P.incomeBase - P.otherFeesBase;
    P.returnComplete = !P.valuedAtCost;
    P.returnPct = P.boughtBase > EPS && !missingFx.length ? P.totalReturnBase / P.boughtBase : null;
    const flows = P.flows.slice();
    if (P.qty > EPS && !P.valuedAtCost) flows.push({ date: o.today, amount: P.marketValueBase });
    P.xirr = (P.qty <= EPS || !P.valuedAtCost) && !missingFx.length ? xirr(flows) : null;

    /* الحالة */
    const matured = inv.maturityDate && inv.maturityDate <= o.today;
    if (!P.hasTx) P.status = 'empty';
    else if (P.qty <= EPS) P.status = P.redeemed ? 'redeemed' : 'sold';
    else if (matured && (inv.type === 'sukuk' || inv.type === 'bond')) P.status = 'matured';
    else P.status = 'active';

    /* معلومات الصكوك والسندات */
    if (inv.type === 'sukuk' || inv.type === 'bond') {
      const face = num(inv.faceValue), rate = has(inv.couponRate) ? Number(inv.couponRate) / 100 : null;
      const I = { faceTotal: has(inv.faceValue) ? face * P.qty : null, expectedRedemption: has(inv.faceValue) ? face * P.qty : null };
      I.daysToMaturity = inv.maturityDate ? daysBetween(o.today, inv.maturityDate) : null;
      I.remainingText = remainingText(I.daysToMaturity);
      I.nextPayment = P.qty > EPS ? nextPaymentDate(inv, o.today) : null;
      // تقديرات — ليست أرباحاً مضمونة
      if (rate !== null && has(inv.faceValue) && P.qty > EPS && inv.maturityDate) {
        const from = P.firstBuyDate && P.firstBuyDate > (inv.issueDate || '') ? P.firstBuyDate : (inv.issueDate || P.firstBuyDate);
        const totalYears = Math.max(0, daysBetween(from, inv.maturityDate)) / 365;
        const remYears = Math.max(0, I.daysToMaturity) / 365;
        I.expectedProfitTotal = face * P.qty * rate * totalYears;
        I.expectedProfitRemaining = face * P.qty * rate * remYears;
      } else { I.expectedProfitTotal = null; I.expectedProfitRemaining = null; }
      I.receivedIncome = P.incomeLocal;
      I.couponYieldOnCost = rate !== null && has(inv.faceValue) && P.costLocal > EPS ? (face * P.qty * rate) / P.costLocal : null;
      P.instrument = I;
    }
    P.missingFx = missingFx.length > 0;
    return P;
  }

  /* ---------- حساب المحفظة ---------- */
  function computePortfolio(state, opts) {
    const o = Object.assign({ method: 'WAC', base: 'OMR', today: todayStr(), now: Date.now(), staleHours: 24, trackCash: false }, opts || {});
    const invs = (state.investments || []).filter((i) => !i.deleted);
    const txs = (state.transactions || []).filter((t) => !t.deleted);
    const priceMap = {}; (state.prices || []).filter((p) => !p.deleted).forEach((p) => { priceMap[p.id] = p; });
    const positions = invs.map((inv) => ({ inv, pos: computePosition(inv, txs, Object.assign({}, o, { fx: state.fx || [], price: priceMap[inv.id] })) }));

    const T = { investedBase: 0, marketValueBase: 0, valueForTotalsBase: 0, realizedBase: 0, realizedFxBase: 0, unrealizedBase: 0, unrealizedFxBase: 0,
      incomeBase: 0, otherFeesBase: 0, totalReturnBase: 0, boughtBase: 0, valuedAtCostCount: 0, openCount: 0, cashByCurrency: {}, cashBase: null };
    const byType = {}, byCurrency = {}, byMarket = {}, flows = [];
    let xirrExcluded = 0;
    for (const { inv, pos } of positions) {
      T.investedBase += pos.costBase; T.valueForTotalsBase += pos.valueForTotalsBase;
      T.marketValueBase += pos.marketValueBase || 0;
      T.realizedBase += pos.realizedBase; T.realizedFxBase += pos.realizedFxBase;
      T.unrealizedBase += pos.unrealizedBase || 0; T.unrealizedFxBase += pos.unrealizedFxBase || 0;
      T.incomeBase += pos.incomeBase; T.otherFeesBase += pos.otherFeesBase;
      T.totalReturnBase += pos.totalReturnBase; T.boughtBase += pos.boughtBase;
      if (pos.qty > EPS) { T.openCount++; if (pos.valuedAtCost) T.valuedAtCostCount++; }
      if (pos.qty > EPS) {
        const v = pos.valueForTotalsBase;
        const mk = inv.market || '—';
        byType[inv.type] = (byType[inv.type] || 0) + v;
        byCurrency[inv.currency] = (byCurrency[inv.currency] || 0) + v;
        if (inv.type === 'stock') byMarket[mk] = (byMarket[mk] || 0) + v;
      }
      if (pos.qty <= EPS || !pos.valuedAtCost) pos.flows.forEach((f) => flows.push(f)); else xirrExcluded++;
    }
    if (positions.some(({ pos }) => pos.qty > EPS && !pos.valuedAtCost)) {
      const tv = positions.reduce((s, { pos }) => s + (pos.qty > EPS && !pos.valuedAtCost ? pos.marketValueBase : 0), 0);
      flows.push({ date: o.today, amount: tv });
    }
    T.xirr = xirr(flows);
    T.xirrExcluded = xirrExcluded;
    T.returnPct = T.boughtBase > EPS ? T.totalReturnBase / T.boughtBase : null;

    /* النقد (اختياري): إيداع/سحب + أثر العمليات */
    if (o.trackCash) {
      const invById = {}; invs.forEach((i) => { invById[i.id] = i; });
      const cash = {};
      for (const t of txs) {
        const cur = t.invId ? (invById[t.invId] || {}).currency : t.currency;
        if (!cur) continue;
        const q = num(t.qty), pr = num(t.price), fee = num(t.fee), a = num(t.amount);
        let d = 0;
        if (t.kind === 'deposit') d = a; else if (t.kind === 'withdraw') d = -a;
        else if (t.kind === 'buy') d = -(q * pr + fee);
        else if (t.kind === 'sell') d = q * pr - fee;
        else if (t.kind === 'redeem') d = a - fee;
        else if (t.kind === 'income') d = a; else if (t.kind === 'fee') d = -a;
        cash[cur] = (cash[cur] || 0) + d;
      }
      T.cashByCurrency = cash;
      let sum = 0, ok = true;
      for (const c of Object.keys(cash)) { const r = c === o.base ? 1 : fxNow(state.fx || [], c, o.base); if (r === null) ok = false; else sum += cash[c] * r; }
      T.cashBase = ok ? sum : null;
    }

    return { positions, totals: T, allocation: { byType, byCurrency, byMarket }, alerts: buildAlerts(positions, state, o) };
  }

  // السلسلة الزمنية: التكلفة المفتوحة (أساسية) بعد كل عملية + العائد النقدي التراكمي (محقق + دخل)
  function timelineFromTxs(state, o) {
    const invs = (state.investments || []).filter((i) => !i.deleted);
    const txs = (state.transactions || []).filter((t) => !t.deleted);
    const dates = Array.from(new Set(txs.filter((t) => t.invId).map((t) => t.date))).sort();
    const out = [];
    for (const d of dates) {
      const sub = txs.filter((t) => t.date <= d);
      let invested = 0, ret = 0;
      for (const inv of invs) {
        const p = computePosition(inv, sub, Object.assign({}, o, { fx: state.fx || [], price: null, today: d }));
        invested += p.costBase; ret += p.realizedBase + p.incomeBase - p.otherFeesBase;
      }
      out.push({ date: d, invested, cashReturn: ret });
    }
    return out;
  }

  function buildAlerts(positions, state, o) {
    const A = [];
    for (const { inv, pos } of positions) {
      if (pos.qty > EPS && (inv.type === 'sukuk' || inv.type === 'bond') && inv.maturityDate) {
        const d = pos.instrument.daysToMaturity;
        if (d < 0) A.push({ level: 'danger', invId: inv.id, text: inv.name + ': تجاوز تاريخ الاستحقاق ولم يُسجَّل الاسترداد' });
        else if (d <= 30) A.push({ level: 'danger', invId: inv.id, text: inv.name + ': يستحق خلال ' + d + ' يوم' });
        else if (d <= 60) A.push({ level: 'warn', invId: inv.id, text: inv.name + ': يستحق خلال ' + d + ' يوم' });
        else if (d <= 90) A.push({ level: 'info', invId: inv.id, text: inv.name + ': يستحق خلال ' + d + ' يوم' });
        const np = pos.instrument.nextPayment;
        if (np && daysBetween(o.today, np) <= 14 && np !== inv.maturityDate) A.push({ level: 'info', invId: inv.id, text: inv.name + ': موعد دفعة أرباح/فوائد قريب (' + np + ')' });
      }
      if (pos.qty > EPS && inv.type === 'stock') {
        if (pos.priceStatus === 'none') A.push({ level: 'warn', invId: inv.id, text: inv.name + ': لا يوجد سعر حالي — أدخله لحساب القيمة السوقية' });
        else if (pos.priceStatus === 'stale') A.push({ level: 'warn', invId: inv.id, text: inv.name + ': السعر قديم ويحتاج إلى تحديث' });
      }
      if (pos.missingFx) A.push({ level: 'danger', invId: inv.id, text: inv.name + ': سعر صرف ' + inv.currency + ' غير مسجَّل — النتائج غير مكتملة' });
      if (pos.errors.some((e) => e.startsWith('oversell'))) A.push({ level: 'danger', invId: inv.id, text: inv.name + ': عمليات بيع تتجاوز الكمية المملوكة — راجع السجل' });
    }
    const order = { danger: 0, warn: 1, info: 2 };
    return A.sort((a, b) => order[a.level] - order[b.level]);
  }

  return { EPS, FREQ_MONTHS, COST_METHODS, toStr, parse, todayStr, daysBetween, addMonths, num, has, round, fxAt, fxNow, priceStatus, xirr,
    nextPaymentDate, remainingText, computePosition, computePortfolio, timelineFromTxs };
});
