/* طبقة جلب الأسعار وأسعار الصرف — مستقلة عن الواجهة وقابلة للتبديل
 * مزوّد الأسعار يعيد: { SYMBOL: {price, ts} } ويُحدَّد المصدر (live/delayed) بحسب عمر الوقت.
 * لا يوجد كشط لمواقع. الإدخال اليدوي يعمل دائماً. */
(function () {
  'use strict';
  const US = /nasdaq|nyse|amex|arca|\bus\b|usa|أمريك/i;
  const isUS = (inv) => inv.type === 'stock' && (US.test(inv.market || '') || (!inv.market && inv.currency === 'USD'));

  const providers = {
    // يمر عبر الخلفية (Apps Script) حتى لا يظهر أي مفتاح في المتصفح
    server: {
      id: 'server', label: 'الخلفية (Finnhub — أسهم أمريكية)',
      async fetch(invs) {
        const syms = invs.map((i) => i.ticker).filter(Boolean);
        if (!syms.length) return { quotes: {}, errors: {}, configured: true };
        return Store.api('quotes', { symbols: syms });
      }
    }
  };

  function setManual(inv, price, tsIso) {
    return Store.put('prices', { id: inv.id, price: Number(price), ts: tsIso || new Date().toISOString(), source: 'manual', currency: inv.currency }, null, true);
  }

  async function refresh(invs) {
    const res = { updated: 0, failed: [], manualNeeded: [], message: '' };
    const targets = invs.filter(isUS); const others = invs.filter((i) => !isUS(i));
    res.manualNeeded = others.map((i) => i.name);
    if (!Store.remote() || !Store.tokenValid()) { res.message = 'التحديث التلقائي يتطلب الربط مع Google وتسجيل الدخول. أدخل الأسعار يدوياً.'; res.manualNeeded = invs.map((i) => i.name); return res; }
    if (!targets.length) { res.message = 'لا توجد أسهم أمريكية للتحديث التلقائي. أدخل بقية الأسعار يدوياً.'; return res; }
    try {
      const r = await providers.server.fetch(targets);
      if (!r.configured) { res.message = 'لم يُضبط مفتاح الأسعار (PRICE_API_KEY) في الخلفية. أدخل الأسعار يدوياً أو راجع الدليل.'; res.manualNeeded = invs.map((i) => i.name); return res; }
      targets.forEach((inv) => {
        const q = r.quotes[inv.ticker];
        if (!q) { res.failed.push(inv.name + ' (' + (r.errors[inv.ticker] || 'لا بيانات') + ')'); return; }
        const age = (Date.now() - new Date(q.ts).getTime()) / 60000;
        Store.put('prices', { id: inv.id, price: q.price, ts: q.ts, source: age <= 15 ? 'live' : 'delayed', currency: inv.currency }, null, true); res.updated++;
      });
    } catch (e) { res.message = e.auth ? 'انتهت جلسة Google — سجّل الدخول من جديد.' : 'تعذر الحصول على الأسعار (' + (e.message || 'خطأ') + '). تُعرض آخر الأسعار المعروفة بوسمها الحقيقي.'; }
    return res;
  }

  /* أسعار الصرف: ECB عبر frankfurter.app (مجاني، بلا مفتاح، تحديث يومي — ليس لحظياً).
     عملات الخليج المربوطة بالدولار تُحتسب من الربط الرسمي لأن ECB لا ينشرها. */
  const PEGS = { USD: 1, OMR: 0.3845, AED: 3.6725, SAR: 3.75, BHD: 0.376, QAR: 3.64 }; // وحدات العملة لكل 1 دولار
  async function fetchFx(currencies, base) {
    const need = Array.from(new Set(currencies.concat([base]))).filter((c) => PEGS[c] === undefined);
    const perUsd = Object.assign({}, PEGS);
    let date = new Date().toISOString().slice(0, 10), note = '';
    if (need.length) {
      const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=' + need.join(','));
      if (!r.ok) throw new Error('تعذر الاتصال بمصدر أسعار الصرف');
      const j = await r.json(); date = j.date || date; Object.assign(perUsd, j.rates || {});
    }
    const out = [], missing = [];
    currencies.filter((c) => c !== base).forEach((c) => { if (perUsd[c] && perUsd[base]) out.push({ currency: c, rate: perUsd[base] / perUsd[c], date, source: PEGS[c] !== undefined && PEGS[base] !== undefined ? 'peg' : 'ecb' }); else missing.push(c); });
    return { rows: out, missing, note };
  }

  window.Prices = { providers, setManual, refresh, isUS, fetchFx, PEGS };
})();
