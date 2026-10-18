/* رسوم بيانية SVG خفيفة بلا مكتبات خارجية (تعمل دون اتصال) */
(function () {
  'use strict';
  const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

  function donut(items, fmt, centerLabel) {
    items = items.filter((i) => i.value > 0);
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return '<div class="empty" style="padding:24px">لا توجد بيانات</div>';
    const R = 42, C = 2 * Math.PI * R; let off = 0;
    const arcs = items.map((it, i) => {
      const len = (it.value / total) * C;
      const s = '<circle r="' + R + '" cx="60" cy="60" fill="none" stroke="' + COLORS[i % COLORS.length] + '" stroke-width="16" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 60 60)"><title>' + esc(it.label) + ': ' + esc(fmt(it.value)) + '</title></circle>';
      off += len; return s;
    }).join('');
    const leg = items.map((it, i) => '<li><i style="background:' + COLORS[i % COLORS.length] + '"></i><span>' + esc(it.label) + '</span><span class="p num">' + (it.value / total * 100).toFixed(1) + '%</span></li>').join('');
    return '<div class="donutbox"><svg class="chart" viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="' + esc(centerLabel || 'توزيع') + '">' + arcs + '</svg><ul class="legend">' + leg + '</ul></div>';
  }

  // series: [{name,color,points:[{x:'YYYY-MM-DD',y}]}]
  function line(series, fmt) {
    const all = series.flatMap((s) => s.points);
    if (!all.length) return '<div class="empty" style="padding:24px">لا توجد بيانات كافية بعد. تظهر النقاط مع تسجيل العمليات وتحديث الأسعار.</div>';
    const W = 640, H = 230, pl = 58, pr = 14, pt = 14, pb = 28;
    const xs = all.map((p) => Date.parse(p.x)), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    let y0 = Math.min.apply(null, all.map((p) => p.y).concat(0)), y1 = Math.max.apply(null, all.map((p) => p.y).concat(0));
    if (y1 === y0) y1 = y0 + 1;
    const pad = (y1 - y0) * 0.08; y1 += pad; if (y0 < 0) y0 -= pad;
    const X = (d) => (x1 === x0 ? (pl + W - pr) / 2 : pl + ((Date.parse(d) - x0) / (x1 - x0)) * (W - pl - pr));
    const Y = (v) => pt + (1 - (v - y0) / (y1 - y0)) * (H - pt - pb);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = y0 + ((y1 - y0) * i) / 4, y = Y(v); g += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pl - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + esc(fmt(v, true)) + '</text>'; }
    const labs = [x0, (x0 + x1) / 2, x1].filter((v, i, a) => a.indexOf(v) === i);
    g += labs.map((v, i) => '<text x="' + X(new Date(v).toISOString().slice(0, 10)) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 && labs.length > 1 ? 'start' : i === labs.length - 1 && labs.length > 1 ? 'end' : 'middle') + '">' + new Date(v).toISOString().slice(0, 10) + '</text>').join('');
    const lines = series.map((s, i) => {
      const col = s.color || COLORS[i % COLORS.length], pts = s.points.slice().sort((a, b) => (a.x < b.x ? -1 : 1));
      const path = pts.length > 1 ? '<polyline fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" ' + (s.step ? '' : '') + 'points="' + (s.step ? stepPts(pts, X, Y) : pts.map((p) => X(p.x) + ',' + Y(p.y)).join(' ')) + '"/>' : '';
      return path + pts.map((p) => '<circle cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="3.2" fill="' + col + '"><title>' + esc(s.name) + ' — ' + p.x + ': ' + esc(fmt(p.y)) + '</title></circle>').join('');
    }).join('');
    const leg = series.map((s, i) => '<span style="display:inline-flex;align-items:center;gap:6px;margin-inline-end:14px;font-size:.82rem"><i style="width:10px;height:10px;border-radius:3px;background:' + (s.color || COLORS[i % COLORS.length]) + '"></i>' + esc(s.name) + '</span>').join('');
    return '<div style="margin-bottom:6px">' + leg + '</div><svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="رسم بياني">' + g + lines + '</svg>';
  }
  function stepPts(pts, X, Y) { const out = []; pts.forEach((p, i) => { if (i) out.push(X(p.x) + ',' + Y(pts[i - 1].y)); out.push(X(p.x) + ',' + Y(p.y)); }); return out.join(' '); }

  window.Charts = { donut, line };
})();
