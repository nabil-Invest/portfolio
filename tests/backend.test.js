// اختبار منطق Code.gs داخل Node بمحاكاة خدمات Google (جدول، خصائص، تخزين مؤقت، قفل، طلبات)
const vm = require('vm'), fs = require('fs'), assert = require('assert');
let passed = 0; const test = (n, f) => { try { f(); passed++; console.log('✓', n); } catch (e) { console.error('✗', n, '\n  ', e.stack); process.exitCode = 1; } };

function makeEnv(tokenInfo) {
  const sheets = {}; // name -> 2D array
  const mkSheet = (name) => {
    const data = sheets[name] = sheets[name] || [];
    const sh = {
      getMaxRows: () => 1000, getLastRow: () => data.length, setFrozenRows() { },
      getRange(r, c, nr = 1, nc = 1) {
        const rng = {
          setNumberFormat() { return rng; }, setFontWeight() { return rng; },
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (data[r - 1 + i] || [])[c - 1 + j] ?? '')),
          setValues(v) { v.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; }); }); return rng; },
          clearContent() { for (let i = 0; i < nr; i++) data[r - 1 + i] = []; return rng; }
        };
        return rng;
      },
      appendRow(row) { data.push(row.slice()); },
      deleteRows(start, n) { data.splice(start - 1, n); }, deleteRow(i) { data.splice(i - 1, 1); }
    };
    return sh;
  };
  const props = { CLIENT_ID: 'cid', OWNER_EMAIL: 'me@x.com' }; const cache = {};
  const ctx = {
    console, JSON, Date, Math, String, Number, Object, Array, Error, encodeURIComponent,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => (sheets[n] ? mkSheet(n) : null), insertSheet: (n) => { sheets[n] = []; return mkSheet(n); } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props[k] ?? null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
    Utilities: { base64EncodeWebSafe: (x) => String(x), computeDigest: (a, t) => t, DigestAlgorithm: { SHA_256: 'x' }, formatDate: (d) => d.toISOString().slice(0, 10) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => (tokenInfo ? 200 : 400), getContentText: () => JSON.stringify(tokenInfo || {}) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../backend/Code.gs', 'utf8'), ctx);
  const call = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);
  return { call, sheets, props };
}
const good = { aud: 'cid', email: 'me@x.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3000) };
const inv = (id, name, t = '2026-01-01T00:00:00Z') => ({ id, type: 'stock', name, currency: 'OMR', updatedAt: t });

test('يرفض الطلب بلا توكن أو بتوكن غير صالح أو من بريد آخر أو audience خاطئ', () => {
  assert.strictEqual(makeEnv(good).call({ action: 'ping' }).auth, true);
  assert.strictEqual(makeEnv(null).call({ action: 'ping', idToken: 'x' }).error, 'auth_invalid');
  assert.strictEqual(makeEnv(Object.assign({}, good, { email: 'evil@x.com' })).call({ action: 'ping', idToken: 'x' }).error, 'auth_forbidden');
  assert.strictEqual(makeEnv(Object.assign({}, good, { aud: 'other' })).call({ action: 'ping', idToken: 'x' }).error, 'auth_audience');
  assert.strictEqual(makeEnv(good).call({ action: 'ping', idToken: 'x' }).ok, true);
});
test('المزامنة تحفظ وتسترجع، وإعادة إرسال نفس العملية لا تكررها', () => {
  const E = makeEnv(good);
  const op = { opId: 'op1', entity: 'investments', op: 'upsert', record: inv('i1', 'شركة') };
  const r1 = E.call({ action: 'sync', idToken: 't', ops: [op], cursor: 0 });
  assert.ok(r1.ok); assert.deepStrictEqual(r1.applied, ['op1']); assert.strictEqual(r1.changes.investments.length, 1);
  const r2 = E.call({ action: 'sync', idToken: 't', ops: [op], cursor: 0 });          // إعادة محاولة
  assert.strictEqual(E.sheets.Investments.length, 2, 'صف واحد + العنوان');
  assert.strictEqual(r2.changes.investments.length, 1);
  const r3 = E.call({ action: 'sync', idToken: 't', ops: [], cursor: r1.cursor });
  assert.strictEqual(r3.changes.investments, undefined, 'لا تغييرات جديدة بعد المؤشر');
});
test('جهاز ثانٍ يستلم التغييرات؛ التعديل يغيّر نفس الصف؛ الحذف ناعم', () => {
  const E = makeEnv(good);
  const a = E.call({ action: 'sync', idToken: 't', ops: [{ opId: 'a', entity: 'investments', op: 'upsert', record: inv('i1', 'قديم') }], cursor: 0 });
  E.call({ action: 'sync', idToken: 't', ops: [{ opId: 'b', entity: 'investments', op: 'upsert', record: inv('i1', 'جديد', '2026-02-01T00:00:00Z') }], cursor: a.cursor });
  assert.strictEqual(E.sheets.Investments.length, 2);
  const dev2 = E.call({ action: 'sync', idToken: 't', ops: [], cursor: 0 });
  assert.strictEqual(dev2.changes.investments[0].name, 'جديد');
  const d = E.call({ action: 'sync', idToken: 't', ops: [{ opId: 'c', entity: 'investments', op: 'delete', record: inv('i1', 'جديد', '2026-03-01T00:00:00Z') }], cursor: 0 });
  assert.strictEqual(d.changes.investments[0].deleted, true); assert.strictEqual(E.sheets.Investments.length, 2, 'لا حذف فعلي');
});
test('سجل أقدم لا يكتب فوق أحدث (آخر تعديل يفوز)', () => {
  const E = makeEnv(good);
  E.call({ action: 'sync', idToken: 't', ops: [{ opId: 'a', entity: 'investments', op: 'upsert', record: inv('i1', 'الأحدث', '2026-05-01T00:00:00Z') }], cursor: 0 });
  const r = E.call({ action: 'sync', idToken: 't', ops: [{ opId: 'b', entity: 'investments', op: 'upsert', record: inv('i1', 'الأقدم', '2026-01-01T00:00:00Z') }], cursor: 0 });
  assert.strictEqual(r.changes.investments[0].name, 'الأحدث');
});
test('الأرقام والتواريخ تعود بنوعها الصحيح', () => {
  const E = makeEnv(good);
  const rec = { id: 't1', invId: 'i1', date: '2026-01-05', kind: 'buy', qty: 10.5, price: 2.125, fee: 0.5, fxRate: 0.3845, updatedAt: 'x' };
  const r = E.call({ action: 'sync', idToken: 't', ops: [{ opId: 'o', entity: 'transactions', op: 'upsert', record: rec }], cursor: 0 });
  const t = r.changes.transactions[0]; assert.strictEqual(t.qty, 10.5); assert.strictEqual(t.date, '2026-01-05'); assert.strictEqual(t.deleted, false);
});
test('نسخة احتياطية ثم استعادة تعيد البيانات', () => {
  const E = makeEnv(good);
  E.call({ action: 'sync', idToken: 't', ops: [{ opId: 'a', entity: 'investments', op: 'upsert', record: inv('i1', 'أصل') }], cursor: 0 });
  const b = E.call({ action: 'backup', idToken: 't' }); assert.ok(b.ok);
  E.call({ action: 'sync', idToken: 't', ops: [{ opId: 'b', entity: 'investments', op: 'upsert', record: inv('i1', 'معدّل', '2027-01-01T00:00:00Z') }], cursor: 0 });
  assert.strictEqual(E.call({ action: 'listBackups', idToken: 't' }).backups.length, 1);
  const rs = E.call({ action: 'restoreBackup', idToken: 't', backupId: b.backupId }); assert.ok(rs.ok);
  const all = E.call({ action: 'sync', idToken: 't', ops: [], cursor: 0 });
  assert.strictEqual(all.changes.investments[0].name, 'أصل');
  assert.ok(E.call({ action: 'listBackups', idToken: 't' }).backups.length >= 2, 'الاستعادة أخذت نسخة تلقائية');
});
test('الأسعار بلا مفتاح تعيد configured=false دون خطأ', () => {
  const E = makeEnv(good); const r = E.call({ action: 'quotes', idToken: 't', symbols: ['AAPL'] }); assert.strictEqual(r.configured, false);
});
console.log(`\n${passed} اختباراً نجح`);
