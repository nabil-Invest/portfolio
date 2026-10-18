// تشغيل: node tests/calc.test.js
const PF = require('../js/calc.js');
const assert = require('assert');
let passed = 0;
const near = (a, b, m, eps = 1e-6) => { assert.ok(Math.abs(a - b) < eps, `${m}: متوقع ${b} لكن الناتج ${a}`); };
const test = (name, fn) => { try { fn(); passed++; console.log('✓', name); } catch (e) { console.error('✗', name, '\n  ', e.message); process.exitCode = 1; } };
let seq = 0;
const tx = (o) => Object.assign({ id: 't' + (++seq), createdAt: String(1000 + seq), fxRate: 1 }, o);
const stock = { id: 's1', type: 'stock', name: 'شركة', currency: 'OMR' };
const base = { base: 'OMR', today: '2026-10-17', now: Date.parse('2026-10-17T10:00:00Z') };

const stockTxs = [
  tx({ invId: 's1', date: '2025-01-10', kind: 'buy', qty: 100, price: 10, fee: 5 }),
  tx({ invId: 's1', date: '2025-03-10', kind: 'buy', qty: 50, price: 12, fee: 3 }),
  tx({ invId: 's1', date: '2025-06-10', kind: 'sell', qty: 60, price: 15, fee: 4 }),
  tx({ invId: 's1', date: '2025-07-01', kind: 'income', amount: 20, incomeType: 'dividend' })
];
const price14 = { id: 's1', price: 14, ts: '2026-10-17T09:55:00Z', source: 'live' };

test('شراء متكرر: الكمية ومتوسط التكلفة المرجح شاملاً الرسوم', () => {
  const p = PF.computePosition(stock, stockTxs.slice(0, 2), base);
  near(p.qty, 150, 'qty'); near(p.costLocal, 1608, 'cost'); near(p.avgCost, 10.72, 'avg');
});
test('بيع جزئي: الربح المحقق وصافي الحصيلة بالمتوسط المرجح', () => {
  const p = PF.computePosition(stock, stockTxs, Object.assign({ price: price14 }, base));
  near(p.soldProceedsLocal, 896, 'net proceeds'); near(p.realizedLocal, 252.8, 'realized');
  near(p.qty, 90, 'rem qty'); near(p.costLocal, 964.8, 'rem cost'); near(p.avgCost, 10.72, 'avg unchanged');
});
test('غير المحقق والعائد الإجمالي دون احتساب مزدوج', () => {
  const p = PF.computePosition(stock, stockTxs, Object.assign({ price: price14 }, base));
  near(p.marketValueLocal, 1260, 'mv'); near(p.unrealizedLocal, 295.2, 'unreal'); near(p.incomeLocal, 20, 'div');
  near(p.totalReturnBase, 252.8 + 295.2 + 20, 'total'); near(p.returnPct, 568 / 1608, 'pct');
  assert.strictEqual(p.priceStatus, 'live');
});
test('FIFO يعطي نتيجة مختلفة ومتسقة', () => {
  const p = PF.computePosition(stock, stockTxs, Object.assign({ price: price14, method: 'FIFO' }, base));
  near(p.realizedLocal, 293, 'fifo realized'); near(p.costLocal, 1005, 'fifo cost'); near(p.unrealizedLocal, 255, 'fifo unreal');
});
test('بيع كامل ثم لا كمية ولا غير محقق', () => {
  const t = stockTxs.concat(tx({ invId: 's1', date: '2025-08-01', kind: 'sell', qty: 90, price: 11, fee: 0 }));
  const p = PF.computePosition(stock, t, base);
  assert.strictEqual(p.qty, 0); assert.strictEqual(p.status, 'sold'); near(p.costLocal, 0, 'cost');
  near(p.realizedLocal, 252.8 + (990 - 964.8), 'realized'); near(p.unrealizedBase, 0, 'unreal');
});
test('بيع أكثر من المملوك يُسجَّل كخطأ ولا يُنتج كمية سالبة', () => {
  const p = PF.computePosition(stock, [tx({ invId: 's1', date: '2025-01-01', kind: 'buy', qty: 10, price: 1 }), tx({ invId: 's1', date: '2025-01-02', kind: 'sell', qty: 11, price: 1 })], base);
  assert.ok(p.errors.some((e) => e.startsWith('oversell'))); assert.ok(p.qty >= 0);
});
test('بدون سعر: التقييم بالتكلفة و«غير متاح» لغير المحقق', () => {
  const p = PF.computePosition(stock, stockTxs, base);
  assert.strictEqual(p.unrealizedBase, null); assert.strictEqual(p.valuedAtCost, true); near(p.valueForTotalsBase, 964.8, 'at cost');
  assert.strictEqual(p.xirr, null);
});
test('تعدد العملات: فصل ربح الاستثمار عن أثر الصرف', () => {
  const usd = { id: 'u1', type: 'stock', name: 'AAPL', currency: 'USD' };
  const t = [tx({ invId: 'u1', date: '2025-01-01', kind: 'buy', qty: 10, price: 100, fee: 0, fxRate: 0.3845 }),
    tx({ invId: 'u1', date: '2025-06-01', kind: 'sell', qty: 5, price: 120, fee: 0, fxRate: 0.385 })];
  const fx = [{ id: 'f', currency: 'USD', rate: 0.386, date: '2026-10-01' }];
  const p = PF.computePosition(usd, t, Object.assign({}, base, { fx, price: { id: 'u1', price: 130, ts: '2026-10-17T09:00:00Z', source: 'manual' } }));
  near(p.realizedLocal, 100, 'local'); near(p.realizedBase, 38.75, 'base'); near(p.realizedInvBase, 38.5, 'inv'); near(p.realizedFxBase, 0.25, 'fx');
  near(p.marketValueBase, 650 * 0.386, 'mv base'); near(p.unrealizedBase, 58.65, 'unreal base'); near(p.unrealizedFxBase, 0.75, 'unreal fx');
});
test('تغيّر سعر الصرف الحالي لا يغيّر النتائج التاريخية المحققة', () => {
  const usd = { id: 'u1', type: 'stock', name: 'AAPL', currency: 'USD' };
  const t = [tx({ invId: 'u1', date: '2025-01-01', kind: 'buy', qty: 10, price: 100, fxRate: 0.3845 }), tx({ invId: 'u1', date: '2025-06-01', kind: 'sell', qty: 10, price: 120, fxRate: 0.385 })];
  const a = PF.computePosition(usd, t, Object.assign({}, base, { fx: [{ currency: 'USD', rate: 0.38, date: '2026-01-01' }] }));
  const b = PF.computePosition(usd, t, Object.assign({}, base, { fx: [{ currency: 'USD', rate: 0.5, date: '2026-10-01' }] }));
  near(a.realizedBase, b.realizedBase, 'same realized');
});
test('سعر صرف ناقص: لا نسبة عائد مختلقة', () => {
  const usd = { id: 'u1', type: 'stock', name: 'X', currency: 'USD' };
  const p = PF.computePosition(usd, [tx({ invId: 'u1', date: '2025-01-01', kind: 'buy', qty: 1, price: 1, fxRate: '' })], base);
  assert.strictEqual(p.missingFx, true); assert.strictEqual(p.returnPct, null);
});
const sukuk = { id: 'k1', type: 'sukuk', name: 'صكوك', currency: 'OMR', faceValue: 100, couponRate: 5, frequency: 'semiannual', issueDate: '2025-01-01', maturityDate: '2028-01-01' };
test('الصكوك: تاريخ الدفعة القادمة والمدة المتبقية والأرباح المتوقعة', () => {
  const t = [tx({ invId: 'k1', date: '2026-01-01', kind: 'buy', qty: 10, price: 98 }), tx({ invId: 'k1', date: '2026-07-01', kind: 'income', amount: 25 })];
  const p = PF.computePosition(sukuk, t, base);
  assert.strictEqual(p.instrument.nextPayment, '2027-01-01');
  assert.strictEqual(p.instrument.daysToMaturity, PF.daysBetween('2026-10-17', '2028-01-01'));
  near(p.instrument.expectedRedemption, 1000, 'redemption'); near(p.instrument.receivedIncome, 25, 'received');
  near(p.instrument.expectedProfitRemaining, 1000 * 0.05 * (p.instrument.daysToMaturity / 365), 'exp remaining');
  assert.strictEqual(p.status, 'active'); assert.strictEqual(p.valuedAtCost, true);
});
test('الاستحقاق والاسترداد: العائد الحقيقي', () => {
  const t = [tx({ invId: 'k1', date: '2026-01-01', kind: 'buy', qty: 10, price: 98 }), tx({ invId: 'k1', date: '2026-07-01', kind: 'income', amount: 25 }),
    tx({ invId: 'k1', date: '2027-01-01', kind: 'income', amount: 25 }), tx({ invId: 'k1', date: '2028-01-01', kind: 'redeem', qty: 10, amount: 1000 })];
  const p = PF.computePosition(sukuk, t, Object.assign({}, base, { today: '2028-01-02' }));
  assert.strictEqual(p.status, 'redeemed'); near(p.realizedLocal, 20, 'realized'); near(p.incomeLocal, 50, 'income'); near(p.totalReturnBase, 70, 'total'); near(p.returnPct, 70 / 980, 'pct');
  assert.ok(p.xirr > 0.03 && p.xirr < 0.06, 'xirr ~ 3.5% got ' + p.xirr);
});
test('صك مستحق ولم يُسترد يظهر كمستحق وينتج تنبيهاً', () => {
  const t = [tx({ invId: 'k1', date: '2026-01-01', kind: 'buy', qty: 10, price: 98 })];
  const o = Object.assign({}, base, { today: '2028-02-01' });
  const r = PF.computePortfolio({ investments: [sukuk], transactions: t, fx: [], prices: [] }, o);
  assert.strictEqual(r.positions[0].pos.status, 'matured'); assert.ok(r.alerts.some((a) => a.text.includes('تجاوز')));
});
test('XIRR: 1000 → 1100 بعد سنة = 10%', () => { near(PF.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }]), 0.1, 'xirr', 1e-5); });
test('XIRR: فترة أقل من 30 يوماً أو تدفق أحادي = غير متاح', () => {
  assert.strictEqual(PF.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2025-01-10', amount: 1100 }]), null);
  assert.strictEqual(PF.xirr([{ date: '2025-01-01', amount: -1000 }]), null);
});
test('المحفظة: مجاميع وتوزيع حسب النوع والعملة ونقد اختياري', () => {
  const s = { investments: [stock, sukuk], transactions: stockTxs.concat([tx({ invId: 'k1', date: '2026-01-01', kind: 'buy', qty: 10, price: 98 }), tx({ date: '2025-01-01', kind: 'deposit', amount: 5000, currency: 'OMR', invId: null })]), fx: [], prices: [price14] };
  const r = PF.computePortfolio(s, Object.assign({ trackCash: true }, base));
  near(r.totals.marketValueBase, 1260, 'mv'); near(r.totals.valueForTotalsBase, 1260 + 980, 'value for totals');
  near(r.totals.unrealizedBase, 295.2, 'unreal'); near(r.totals.realizedBase, 252.8, 'real'); near(r.totals.incomeBase, 20, 'inc');
  assert.strictEqual(r.totals.valuedAtCostCount, 1); near(r.allocation.byType.sukuk, 980, 'sukuk alloc');
  near(r.totals.cashBase, 5000 - 1608 + 896 + 20 - 980, 'cash');
});
test('حالة السعر: لحظي/متأخر/يدوي/قديم/لا يوجد', () => {
  const now = Date.parse('2026-10-17T10:00:00Z');
  assert.strictEqual(PF.priceStatus({ price: 1, ts: '2026-10-17T09:55:00Z', source: 'live' }, now), 'live');
  assert.strictEqual(PF.priceStatus({ price: 1, ts: '2026-10-17T05:00:00Z', source: 'live' }, now), 'delayed');
  assert.strictEqual(PF.priceStatus({ price: 1, ts: '2026-10-17T09:00:00Z', source: 'manual' }, now), 'manual');
  assert.strictEqual(PF.priceStatus({ price: 1, ts: '2026-10-01T09:00:00Z', source: 'live' }, now), 'stale');
  assert.strictEqual(PF.priceStatus(null, now), 'none');
});
test('addMonths يتعامل مع نهاية الشهر', () => { assert.strictEqual(PF.addMonths('2026-08-31', -6), '2026-02-28'); assert.strictEqual(PF.addMonths('2026-01-31', 1), '2026-02-28'); });
test('سعر الصرف يُؤخذ عند التاريخ أو قبله فقط', () => {
  const fx = [{ currency: 'USD', rate: 0.3, date: '2025-01-01' }, { currency: 'USD', rate: 0.4, date: '2026-01-01' }];
  near(PF.fxAt(fx, 'USD', 'OMR', '2025-06-01'), 0.3, 'before'); assert.strictEqual(PF.fxAt(fx, 'USD', 'OMR', '2024-01-01'), null);
});
console.log(`\n${passed} اختباراً نجح`);
