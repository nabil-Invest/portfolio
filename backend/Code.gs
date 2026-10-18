/**
 * Investment Portfolio Dashboard — الخلفية (Google Apps Script مرتبط بجدول Google Sheets)
 *
 * @OnlyCurrentDoc  ← أقل صلاحية: الوصول إلى هذا الجدول فقط (وليس كل Drive)
 *
 * الأمان:
 *  - تطبيق الويب منشور بصلاحية "Anyone" لكن كل طلب يجب أن يحمل Google ID Token صالحاً.
 *  - يتحقق الخادم من التوقيع عبر Google (tokeninfo) ومن aud = CLIENT_ID ومن البريد = OWNER_EMAIL.
 *  - لا توجد أي أسرار في كود الواجهة؛ مفتاح الأسعار (اختياري) في Script Properties فقط.
 *
 * الخصائص المطلوبة (Project Settings → Script properties):
 *   CLIENT_ID    = معرّف عميل OAuth (Web) من Google Cloud
 *   OWNER_EMAIL  = بريدك في Google
 *   PRICE_API_KEY (اختياري) = مفتاح Finnhub لأسعار الأسهم الأمريكية
 */

var ENTITIES = {
  investments: ['id', 'type', 'name', 'ticker', 'market', 'sector', 'currency', 'issuer', 'structure', 'identifier', 'issueDate', 'maturityDate', 'faceValue', 'couponRate', 'frequency', 'notes'],
  transactions: ['id', 'invId', 'date', 'kind', 'incomeType', 'qty', 'price', 'amount', 'fee', 'currency', 'fxRate', 'notes'],
  fx: ['id', 'currency', 'rate', 'date', 'source'],
  prices: ['id', 'price', 'ts', 'source', 'currency'],
  snapshots: ['id', 'date', 'valueBase', 'costBase', 'atCostCount', 'currency'],
  settings: ['id', 'json'],
  audit: ['id', 'ts', 'entity', 'recordId', 'action', 'summary']
};
var META = ['updatedAt', 'deleted', 'rev'];
var NUMERIC = { qty: 1, price: 1, amount: 1, fee: 1, fxRate: 1, rate: 1, faceValue: 1, couponRate: 1, valueBase: 1, costBase: 1, atCostCount: 1, rev: 1 };
var MAX_OPS_KEPT = 5000;
var BACKUPS_KEPT = 10;

/* ---------- نقاط الدخول ---------- */
function doGet() {
  return json_({ ok: true, service: 'Investment Portfolio Dashboard', hint: 'استخدم POST مع ID Token.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse(e.postData.contents);
    var user = verifyToken_(req.idToken);               // يرمي خطأً إذا لم يكن صالحاً
    lock.waitLock(25000);
    var out;
    switch (req.action) {
      case 'ping': out = { ok: true, email: user.email }; break;
      case 'sync': out = sync_(req); break;
      case 'backup': out = backup_(); break;
      case 'listBackups': out = listBackups_(); break;
      case 'restoreBackup': out = restoreBackup_(req.backupId); break;
      case 'restoreData': out = restoreData_(req.data); break;
      case 'quotes': out = quotes_(req.symbols || []); break;
      default: throw new Error('bad_action');
    }
    return json_(out);
  } catch (err) {
    var msg = String(err && err.message || err);
    return json_({ ok: false, error: msg, auth: /^auth_/.test(msg) });
  } finally {
    try { lock.releaseLock(); } catch (x) { }
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- المصادقة ---------- */
function verifyToken_(token) {
  if (!token) throw new Error('auth_missing');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('CLIENT_ID'), owner = (props.getProperty('OWNER_EMAIL') || '').toLowerCase();
  if (!clientId || !owner) throw new Error('auth_not_configured');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('auth_invalid');
  var info = JSON.parse(res.getContentText());
  var now = Math.floor(Date.now() / 1000);
  if (info.aud !== clientId) throw new Error('auth_audience');
  if (String(info.email_verified) !== 'true') throw new Error('auth_unverified');
  if (String(info.email).toLowerCase() !== owner) throw new Error('auth_forbidden');
  if (Number(info.exp) <= now) throw new Error('auth_expired');
  var user = { email: info.email };
  cache.put(key, JSON.stringify(user), Math.max(1, Math.min(300, Number(info.exp) - now)));
  return user;
}

/* ---------- الجداول ---------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheetName_(entity) { return entity.charAt(0).toUpperCase() + entity.slice(1); }
function headers_(entity) { return ENTITIES[entity].concat(META); }

function sheet_(entity) {
  var name = sheetName_(entity), sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    var h = headers_(entity);
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@'); // نص صريح: يمنع تحويل التواريخ والأرقام تلقائياً
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_(entity) {
  var sh = sheet_(entity), last = sh.getLastRow(), h = headers_(entity);
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, h.length).getValues(), out = [];
  for (var r = 0; r < vals.length; r++) {
    var o = {};
    for (var c = 0; c < h.length; c++) {
      var v = vals[r][c];
      if (h[c] === 'deleted') v = (v === true || v === 'true');
      else if (NUMERIC[h[c]]) v = (v === '' || v === null) ? '' : Number(v);
      else if (v instanceof Date) v = Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd');
      else v = (v === null) ? '' : String(v);
      o[h[c]] = v;
    }
    o._row = r + 2;
    if (o.id !== '') out.push(o);
  }
  return out;
}

function toRow_(entity, rec) {
  return headers_(entity).map(function (k) {
    var v = rec[k];
    if (v === undefined || v === null) return '';
    if (k === 'deleted') return v ? 'true' : 'false';
    return typeof v === 'object' ? JSON.stringify(v) : v;
  });
}

/* ---------- المزامنة (idempotent) ---------- */
function nextRev_(n) {
  var p = PropertiesService.getScriptProperties();
  var cur = Number(p.getProperty('REV') || 0);
  p.setProperty('REV', String(cur + n));
  return cur;
}

function opsSheet_() {
  var sh = ss_().getSheetByName('Ops');
  if (!sh) { sh = ss_().insertSheet('Ops'); sh.getRange(1, 1, 1, 2).setValues([['opId', 'ts']]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}

function sync_(req) {
  var ops = req.ops || [], cursor = Number(req.cursor || 0);
  var osh = opsSheet_(), seen = {}, olast = osh.getLastRow();
  if (olast > 1) osh.getRange(2, 1, olast - 1, 1).getValues().forEach(function (r) { seen[r[0]] = 1; });

  var applied = [], newOps = [], byEntity = {};
  ops.forEach(function (op) {
    if (!ENTITIES[op.entity] || !op.record || !op.record.id || !op.opId) { applied.push(op.opId); return; } // عملية تالفة: تُسقط
    if (seen[op.opId]) { applied.push(op.opId); return; }   // أُعيدت المحاولة: لا تُطبَّق مرتين
    (byEntity[op.entity] = byEntity[op.entity] || []).push(op);
  });

  var total = 0; Object.keys(byEntity).forEach(function (k) { total += byEntity[k].length; });
  var revBase = total ? nextRev_(total) : Number(PropertiesService.getScriptProperties().getProperty('REV') || 0);
  var rev = revBase;

  Object.keys(byEntity).forEach(function (entity) {
    var sh = sheet_(entity), rows = readAll_(entity), idx = {};
    var byId = {}; rows.forEach(function (r) { idx[r.id] = r._row; byId[r.id] = r; });
    var h = headers_(entity);
    byEntity[entity].forEach(function (op) {
      var rec = op.record;
      if (op.op === 'delete') rec.deleted = true;
      var existing = null;
      if (idx[rec.id]) existing = byId[rec.id];
      // آخر تعديل يفوز؛ لكن لا نسمح لسجل أقدم بالكتابة فوق أحدث
      if (existing && existing.updatedAt && rec.updatedAt && existing.updatedAt > rec.updatedAt) { applied.push(op.opId); newOps.push([op.opId, new Date().toISOString()]); return; }
      rev++; rec.rev = rev;
      var row = toRow_(entity, rec);
      if (idx[rec.id]) { sh.getRange(idx[rec.id], 1, 1, h.length).setValues([row]); byId[rec.id] = rec; }
      else { sh.appendRow(row); idx[rec.id] = sh.getLastRow(); byId[rec.id] = rec; }
      applied.push(op.opId); newOps.push([op.opId, new Date().toISOString()]);
    });
  });

  if (newOps.length) {
    osh.getRange(osh.getLastRow() + 1, 1, newOps.length, 2).setValues(newOps);
    var n = osh.getLastRow();
    if (n - 1 > MAX_OPS_KEPT) osh.deleteRows(2, n - 1 - MAX_OPS_KEPT);
  }

  var changes = {}, maxRev = rev;
  Object.keys(ENTITIES).forEach(function (entity) {
    var list = readAll_(entity).filter(function (r) { return Number(r.rev || 0) > cursor; });
    if (list.length) changes[entity] = list;
    list.forEach(function (r) { if (r.rev > maxRev) maxRev = r.rev; });
  });
  return { ok: true, applied: applied, changes: changes, cursor: maxRev, serverTime: new Date().toISOString() };
}

/* ---------- النسخ الاحتياطي والاستعادة ---------- */
function snapshotAll_() {
  var d = {};
  Object.keys(ENTITIES).forEach(function (e) { d[e] = readAll_(e); });
  return d;
}

function backup_() {
  var data = JSON.stringify({ version: 1, createdAt: new Date().toISOString(), data: snapshotAll_() });
  var sh = ss_().getSheetByName('Backups') || ss_().insertSheet('Backups');
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, 4).setValues([['backupId', 'createdAt', 'part', 'json']]).setFontWeight('bold');
  var id = 'bk_' + Date.now() + '_' + Math.floor(Math.random() * 1e6), CH = 45000, parts = [];
  for (var i = 0, p = 0; i < data.length; i += CH, p++) parts.push([id, new Date().toISOString(), p, data.substr(i, CH)]);
  sh.getRange(sh.getLastRow() + 1, 1, parts.length, 4).setNumberFormat('@').setValues(parts);
  pruneBackups_(sh);
  return { ok: true, backupId: id, size: data.length };
}

function listBackups_() {
  var sh = ss_().getSheetByName('Backups');
  if (!sh || sh.getLastRow() < 2) return { ok: true, backups: [] };
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues(), seen = {}, out = [];
  v.forEach(function (r) { if (!seen[r[0]]) { seen[r[0]] = 1; out.push({ id: r[0], createdAt: String(r[1]) }); } });
  return { ok: true, backups: out.reverse() };
}

function pruneBackups_(sh) {
  var ids = listBackups_().backups.map(function (b) { return b.id; });
  if (ids.length <= BACKUPS_KEPT) return;
  var drop = {}; ids.slice(BACKUPS_KEPT).forEach(function (i) { drop[i] = 1; });
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var r = v.length - 1; r >= 0; r--) if (drop[v[r][0]]) sh.deleteRow(r + 2);
}

function restoreBackup_(backupId) {
  var sh = ss_().getSheetByName('Backups');
  if (!sh) throw new Error('no_backups');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().filter(function (r) { return r[0] === backupId; });
  if (!v.length) throw new Error('backup_not_found');
  v.sort(function (a, b) { return Number(a[2]) - Number(b[2]); });
  var parsed = JSON.parse(v.map(function (r) { return r[3]; }).join(''));
  return restoreData_(parsed.data);
}

// الاستعادة تأخذ نسخة احتياطية تلقائية أولاً ثم تستبدل البيانات
function restoreData_(data) {
  if (!data || typeof data !== 'object') throw new Error('bad_data');
  backup_();
  var rev = nextRev_(100000); // قفزة كبيرة تضمن أن كل الأجهزة تلتقط البيانات المستعادة
  var r = rev;
  Object.keys(ENTITIES).forEach(function (entity) {
    var sh = sheet_(entity), list = data[entity] || [], h = headers_(entity);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, h.length).clearContent();
    if (!list.length) return;
    var rows = list.map(function (rec) { rec.rev = ++r; return toRow_(entity, rec); });
    sh.getRange(2, 1, rows.length, h.length).setValues(rows);
  });
  return { ok: true, restored: true };
}

/* ---------- أسعار الأسهم (اختياري) ---------- */
// المصدر: Finnhub (أسهم أمريكية). لا يوجد مصدر مجاني رسمي لسوق مسقط — استخدم الإدخال اليدوي.
function quotes_(symbols) {
  var key = PropertiesService.getScriptProperties().getProperty('PRICE_API_KEY');
  if (!key) return { ok: true, configured: false, quotes: {}, errors: {} };
  var quotes = {}, errors = {};
  symbols.slice(0, 40).forEach(function (s) {
    try {
      var res = UrlFetchApp.fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(s) + '&token=' + encodeURIComponent(key), { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) { errors[s] = 'http_' + res.getResponseCode(); return; }
      var q = JSON.parse(res.getContentText());
      if (!q || !q.c || !q.t) { errors[s] = 'no_data'; return; }
      quotes[s] = { price: q.c, ts: new Date(q.t * 1000).toISOString() };
    } catch (e) { errors[s] = 'fetch_failed'; }
  });
  return { ok: true, configured: true, quotes: quotes, errors: errors };
}
