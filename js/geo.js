/* SP WORK : géographie hors ligne (communes françaises, contours des départements), carte et calcul de circuit. */
(function () {
  'use strict';
  const SP = window.SP, h = SP.h;
  const geo = SP.geo = { pret: false, communes: [], depts: [] };
  const byCp = new Map(), byName = new Map();
  const D2R = Math.PI / 180;

  const wx = lon => (lon + 180) / 360;
  const wy = lat => (1 - Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2)) / Math.PI) / 2;
  const lonOf = x => x * 360 - 180;
  const latOf = y => (2 * Math.atan(Math.exp((1 - 2 * y) * Math.PI)) - Math.PI / 2) / D2R;

  function nomCle(s) {
    return SP.norm(s).replace(/\bcedex\b.*$/, '').replace(/\b\d+\b/g, '').replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint').replace(/\s+/g, ' ').trim();
  }

  let loading = null;
  geo.load = function () {
    if (loading) return loading;
    loading = (async function () {
      const [csv, depts] = await Promise.all([
        fetch('data/communes.csv').then(r => { if (!r.ok) throw new Error('communes'); return r.text(); }),
        fetch('data/depts.json').then(r => { if (!r.ok) throw new Error('depts'); return r.json(); })
      ]);
      const lines = csv.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const p = lines[i].split(';'); if (p.length < 6) continue;
        const c = { n: p[1], cp: p[2].split('|'), lat: +p[3], lon: +p[4], pop: +p[5], k: nomCle(p[1]) };
        c.x = wx(c.lon); c.y = wy(c.lat);
        geo.communes.push(c);
      }
      geo.communes.sort((a, b) => b.pop - a.pop);
      for (const c of geo.communes) {
        for (const cp of c.cp) { if (!byCp.has(cp)) byCp.set(cp, []); byCp.get(cp).push(c); }
        if (!byName.has(c.k)) byName.set(c.k, []); byName.get(c.k).push(c);
      }
      geo.depts = depts.map(d => {
        let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
        const rings = d.r.map(r => { const a = new Float64Array(r.length); for (let i = 0; i < r.length; i += 2) { a[i] = wx(r[i]); a[i + 1] = wy(r[i + 1]); x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); } return a; });
        return { c: d.c, n: d.n, rings, box: [x0, y0, x1, y1] };
      });
      geo.pret = true;
    })();
    return loading;
  };

  /* Localisation au niveau de la commune (centre de la commune). Renvoie null si introuvable. */
  geo.locate = function (cp, ville) {
    if (!geo.pret) return null;
    cp = String(cp || '').replace(/\s/g, ''); if (/^\d{4}$/.test(cp)) cp = '0' + cp;
    const k = nomCle(ville);
    let c = null;
    const cands = byCp.get(cp);
    if (cands) c = cands.find(x => x.k === k) || (k && cands.find(x => x.k.indexOf(k) >= 0 || k.indexOf(x.k) >= 0)) || cands[0];
    if (!c && k) {
      const named = byName.get(k) || byName.get(k.replace(/ \d*e? ?arrondissement$/, ''));
      if (named) c = (cp.length === 5 && named.find(x => x.cp[0].slice(0, 2) === cp.slice(0, 2))) || (cp.length === 5 ? null : named[0]);
      if (!c && cp.length === 5) {            // code CEDEX : même département, nom approchant
        c = geo.communes.find(x => x.cp[0].slice(0, 2) === cp.slice(0, 2) && (x.k === k || x.k.indexOf(k) === 0 || k.indexOf(x.k) === 0)) || null;
      }
    }
    return c ? { lat: c.lat, lon: c.lon, commune: c.n } : null;
  };

  geo.km = function (a, b) {
    const dLat = (b.lat - a.lat) * D2R, dLon = (b.lon - a.lon) * D2R;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(s));
  };

  /* ---------- circuit le plus court : départ fixe, arrivée fixe (ou libre), ordre des arrêts à trouver ---------- */
  geo.optimise = function (depart, arrets, arrivee) {
    const n = arrets.length;
    if (n < 2) return arrets.map((_, i) => i);
    const P = [depart].concat(arrets); if (arrivee) P.push(arrivee);
    const E = arrivee ? n + 1 : -1;
    const D = P.map(a => P.map(b => geo.km(a, b)));
    const endCost = j => (E >= 0 ? D[j][E] : 0);
    if (n <= 12) {                               // exact (Held-Karp)
      const N = 1 << n, dp = new Float64Array(N * n).fill(Infinity), par = new Int8Array(N * n).fill(-1);
      for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = D[0][j + 1];
      for (let m = 1; m < N; m++) for (let j = 0; j < n; j++) {
        if (!(m & (1 << j))) continue; const cur = dp[m * n + j]; if (cur === Infinity) continue;
        for (let k = 0; k < n; k++) { if (m & (1 << k)) continue; const m2 = m | (1 << k), v = cur + D[j + 1][k + 1]; if (v < dp[m2 * n + k]) { dp[m2 * n + k] = v; par[m2 * n + k] = j; } }
      }
      let best = Infinity, bj = 0; const full = N - 1;
      for (let j = 0; j < n; j++) { const v = dp[full * n + j] + endCost(j + 1); if (v < best) { best = v; bj = j; } }
      const out = []; let m = full, j = bj;
      while (j >= 0) { out.push(j); const pj = par[m * n + j]; m ^= (1 << j); j = pj; }
      return out.reverse();
    }
    // plus proche voisin puis améliorations 2-opt et déplacements de segments
    const left = new Set(arrets.map((_, i) => i + 1)); let t = [0], cur = 0;
    while (left.size) { let b = -1, bd = Infinity; left.forEach(j => { if (D[cur][j] < bd) { bd = D[cur][j]; b = j; } }); t.push(b); left.delete(b); cur = b; }
    if (E >= 0) t.push(E);
    const len = a => { let s = 0; for (let i = 0; i + 1 < a.length; i++) s += D[a[i]][a[i + 1]]; return s; };
    const last = E >= 0 ? t.length - 2 : t.length - 1;
    let improved = true, guard = 0;
    while (improved && guard++ < 200) {
      improved = false;
      for (let i = 1; i < last; i++) for (let j = i + 1; j <= last; j++) {
        const a = t[i - 1], b = t[i], c = t[j], d = t[j + 1];
        const delta = D[a][c] + (d === undefined ? 0 : D[b][d]) - D[a][b] - (d === undefined ? 0 : D[c][d]);
        if (delta < -1e-9) { let x = i, y = j; while (x < y) { const tmp = t[x]; t[x] = t[y]; t[y] = tmp; x++; y--; } improved = true; }
      }
      for (let sz = 1; sz <= 3; sz++) for (let i = 1; i + sz - 1 <= last; i++) {
        const seg = t.slice(i, i + sz), rest = t.slice(0, i).concat(t.slice(i + sz));
        const base = len(t); let bestL = base, bestT = null;
        for (let p = 1; p <= rest.length - (E >= 0 ? 1 : 0); p++) {
          for (const s of [seg, seg.slice().reverse()]) { const cand = rest.slice(0, p).concat(s, rest.slice(p)); const l = len(cand); if (l < bestL - 1e-9) { bestL = l; bestT = cand; } }
        }
        if (bestT) { t = bestT; improved = true; }
      }
    }
    return t.slice(1, E >= 0 ? -1 : undefined).map(i => i - 1);
  };

  /* ---------- carte ---------- */
  /* opts : {onTap({type:'arret',id} | {type:'carte',lat,lon}), note} */
  geo.Map = function (host, opts) {
    opts = opts || {};
    const self = this;
    const canvas = h('canvas');
    const root = h('div', { class: 'map' }, canvas);
    const note = h('div', { class: 'map-note', text: opts.note || '' });
    const ctl = h('div', { class: 'map-ctl' },
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Zoom avant', onclick: () => zoomBy(1.6) }, SP.icon('plus')),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Zoom arrière', onclick: () => zoomBy(1 / 1.6) }, h('span', { text: '−', style: 'font-size:22px;line-height:1' })),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Recadrer sur le circuit', onclick: () => { self.fit(); } }, SP.icon('target')));
    host.append(root, ctl, note);
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let cx = wx(4.9), cy = wy(45.7), scale = 256 * Math.pow(2, 8);   // pixels par unité « monde »
    let data = { depot: null, arrets: [], ligne: [], sel: null, repere: null };
    let raf = 0, userMoved = false, hits = [];

    const sx = x => (x - cx) * scale + W / 2, sy = y => (y - cy) * scale + H / 2;
    function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
    function ask() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
    function clamp() { scale = Math.max(256 * 16, Math.min(256 * 65536, scale)); }
    function zoomBy(f, px, py) {
      const ax = px == null ? W / 2 : px, ay = py == null ? H / 2 : py;
      const wxp = (ax - W / 2) / scale + cx, wyp = (ay - H / 2) / scale + cy;
      scale *= f; clamp();
      cx = wxp - (ax - W / 2) / scale; cy = wyp - (ay - H / 2) / scale; userMoved = true; ask();
    }
    function resize() {
      const r = root.getBoundingClientRect(); if (!r.width || !r.height) return;
      const first = !W;
      dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (first || !userMoved) self.fit(); else ask();
    }
    const ro = new ResizeObserver(resize); ro.observe(root);

    this.set = function (d) { data = Object.assign({ depot: null, arrets: [], ligne: [], sel: null, repere: null }, d); if (!userMoved) self.fit(); else ask(); };
    this.select = function (id) { data.sel = id; ask(); };
    this.fit = function () {
      userMoved = false;
      const pts = data.arrets.slice(); if (data.depot) pts.push(data.depot); if (data.repere) pts.push(data.repere);
      if (!W) return;
      if (!pts.length) { cx = wx(4.9); cy = wy(45.7); scale = 256 * Math.pow(2, 7.6); ask(); return; }
      let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
      for (const p of pts) { const x = wx(p.lon), y = wy(p.lat); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
      const pad = 46;
      scale = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1e-9), (H - 2 * pad) / Math.max(y1 - y0, 1e-9), 256 * Math.pow(2, 11.5));
      clamp(); ask();
    };
    this.center = function (lat, lon, z) { cx = wx(lon); cy = wy(lat); if (z) scale = 256 * Math.pow(2, z); userMoved = true; ask(); };
    this.destroy = function () { ro.disconnect(); cancelAnimationFrame(raf); root.remove(); ctl.remove(); note.remove(); };

    /* gestes */
    const ptrs = new Map(); let tap = null, pinch = 0;
    root.addEventListener('pointerdown', e => {
      root.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      tap = ptrs.size === 1 ? { x: e.offsetX, y: e.offsetY, t: Date.now() } : null;
      if (ptrs.size === 2) { const a = [...ptrs.values()]; pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
    });
    root.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const r = root.getBoundingClientRect(), nx = e.clientX - r.left, ny = e.clientY - r.top;
      if (ptrs.size === 1) { cx -= (nx - p.x) / scale; cy -= (ny - p.y) / scale; if (tap && Math.hypot(nx - tap.x, ny - tap.y) > 6) { tap = null; userMoved = true; } ask(); }
      p.x = nx; p.y = ny;
      if (ptrs.size === 2) { const a = [...ptrs.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (pinch > 0 && d > 0) zoomBy(d / pinch, (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2); pinch = d; }
    });
    function up(e) {
      if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
      if (tap && Date.now() - tap.t < 500 && opts.onTap) {
        let best = null, bd = 22;
        for (const k of hits) { const d = Math.hypot(k.x - tap.x, k.y - tap.y); if (d < bd) { bd = d; best = k; } }
        if (best) opts.onTap({ type: 'arret', id: best.id });
        else opts.onTap({ type: 'carte', lat: latOf((tap.y - H / 2) / scale + cy), lon: lonOf((tap.x - W / 2) / scale + cx) });
      }
      tap = null;
    }
    root.addEventListener('pointerup', up); root.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); tap = null; });
    root.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY); }, { passive: false });

    function draw() {
      if (!W) return;
      const C = { sea: css('--map-sea'), land: css('--map-land'), edge: css('--map-edge'), dot: css('--map-dot'), label: css('--map-label'), accent: css('--accent'), onAccent: css('--on-accent'), brand: css('--brand'), ok: css('--ok'), ink: css('--ink') };
      const font = getComputedStyle(document.body).fontFamily;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = C.sea; ctx.fillRect(0, 0, W, H);
      const vx0 = cx - W / 2 / scale, vx1 = cx + W / 2 / scale, vy0 = cy - H / 2 / scale, vy1 = cy + H / 2 / scale;
      const z = Math.log2(scale / 256);
      if (!geo.pret) { ctx.fillStyle = C.label; ctx.font = '14px ' + font; ctx.fillText('Chargement du fond de carte…', 14, 24); }
      /* départements */
      ctx.lineJoin = 'round'; ctx.fillStyle = C.land; ctx.strokeStyle = C.edge; ctx.lineWidth = 1;
      for (const d of geo.depts) {
        if (d.box[2] < vx0 || d.box[0] > vx1 || d.box[3] < vy0 || d.box[1] > vy1) continue;
        ctx.beginPath();
        for (const r of d.rings) { ctx.moveTo(sx(r[0]), sy(r[1])); for (let i = 2; i < r.length; i += 2) ctx.lineTo(sx(r[i]), sy(r[i + 1])); ctx.closePath(); }
        ctx.fill(); ctx.stroke();
      }
      const boxes = [];
      const free = (x, y, w, hh) => { for (const b of boxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + hh > b[1]) return false; boxes.push([x, y, w, hh]); return true; };
      /* emplacements réservés aux repères du circuit */
      const marks = [];
      if (data.depot) marks.push({ x: sx(wx(data.depot.lon)), y: sy(wy(data.depot.lat)) });
      for (const a of data.arrets) marks.push({ x: sx(wx(a.lon)), y: sy(wy(a.lat)) });
      for (const k of marks) boxes.push([k.x - 15, k.y - 15, 30, 30]);
      /* communes : les plus peuplées d'abord, le seuil baisse quand on zoome */
      const seuil = z < 6.3 ? 150000 : z < 7.2 ? 60000 : z < 8.1 ? 25000 : z < 9 ? 9000 : z < 9.8 ? 3500 : z < 10.6 ? 1200 : 0;
      ctx.textBaseline = 'middle';
      let labels = 0;
      for (const c of geo.communes) {
        if (c.pop < seuil) break;
        if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
        const x = sx(c.x), y = sy(c.y), big = c.pop >= 100000;
        ctx.fillStyle = C.dot; ctx.beginPath(); ctx.arc(x, y, big ? 3.2 : 2, 0, 6.3); ctx.fill();
        if (labels > 70) continue;
        ctx.font = (big ? '600 13px ' : '12px ') + font;
        const w = ctx.measureText(c.n).width;
        if (free(x + 5, y - 8, w + 4, 16)) { ctx.fillStyle = C.label; ctx.fillText(c.n, x + 6, y); labels++; }
      }
      /* circuit */
      if (data.ligne.length > 1) {
        const pts = data.ligne.map(p => [sx(wx(p.lon)), sy(wy(p.lat))]);
        const path = () => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
        ctx.lineCap = 'round';
        path(); ctx.strokeStyle = C.land; ctx.lineWidth = 8; ctx.stroke();
        path(); ctx.strokeStyle = C.accent; ctx.lineWidth = 4.5; ctx.stroke();
        ctx.fillStyle = C.accent;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 44) continue;
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          ctx.save(); ctx.translate(mx, my); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath();
          ctx.strokeStyle = C.land; ctx.lineWidth = 2; ctx.stroke(); ctx.fill(); ctx.restore();
        }
      }
      hits = [];
      ctx.textAlign = 'center';
      if (data.depot) {
        const x = sx(wx(data.depot.lon)), y = sy(wy(data.depot.lat));
        ctx.fillStyle = C.brand; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(x - 11, y - 11, 22, 22); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 12px ' + font; ctx.fillText('SP', x, y + 1);
      }
      data.arrets.forEach(a => {
        const x = sx(wx(a.lon)), y = sy(wy(a.lat)), sel = data.sel === a.id;
        ctx.beginPath(); ctx.arc(x, y, sel ? 15 : 12, 0, 6.3);
        ctx.fillStyle = a.fait ? C.ok : (a.hors ? C.dot : C.accent); ctx.fill();
        ctx.strokeStyle = sel ? C.ink : '#fff'; ctx.lineWidth = sel ? 3 : 2; ctx.stroke();
        ctx.fillStyle = a.fait || a.hors ? '#fff' : C.onAccent; ctx.font = '700 12px ' + font; ctx.fillText(a.label || '', x, y + 1);
        hits.push({ x, y, id: a.id });
      });
      if (data.repere) {
        const x = sx(wx(data.repere.lon)), y = sy(wy(data.repere.lat));
        ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.3); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.moveTo(x, y - 18); ctx.lineTo(x, y + 18); ctx.stroke();
      }
      ctx.textAlign = 'left';
    }
    geo.load().then(ask, ask);
    resize();
  };
})();
