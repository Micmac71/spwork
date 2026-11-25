/* SP WORK : fabrique des modèles 3D de l'accueil (fichiers glTF binaires dans modeles/).
   Les modèles sont construits avec Three.js r128, fusionnés par matériau (peu d'appels de dessin,
   donc fluide sur téléphone), puis exportés en .glb avec leurs textures intégrées.
   Unités : celles de l'accueil (la caisse fait 2,2 × 1,4 × 1,6). Couleurs de la marque :
   gris #4B5157, rouge #E03A14, typographies Barlow et Barlow Condensed. */
(function () {
  'use strict';
  const THREE = window.THREE;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear(); // couleur de marque exacte à l'écran
  const ROUGE = lin(0xE03A14), GRIS = lin(0x4B5157), ENCRE = '#26303A';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /* ---------- matériaux nommés (les noms servent à l'accueil : « phare », « feu ») ---------- */
  const std = (name, color, roughness, metalness, extra) => Object.assign(new THREE.MeshStandardMaterial({ color, roughness, metalness: metalness || 0 }), { name }, extra || {});
  const phys = (name, color, roughness, metalness, clearcoat, clearcoatRoughness) => Object.assign(new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat, clearcoatRoughness }), { name });
  function texture(c) { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

  /* ---------- textures dessinées ---------- */
  function usure(c, n) {
    const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) { x.fillStyle = 'rgba(0,0,0,' + Math.random() * .9 + ')'; x.beginPath(); x.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 2.4, 0, 7); x.fill(); }
    x.globalCompositeOperation = 'source-over'; return c;
  }
  function bois(w, h, base) {
    const c = cnv(w, h), x = c.getContext('2d');
    x.fillStyle = base || '#DDBE90'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * h, amp = rnd(2, 12), f = rnd(.003, .016), ph = rnd(0, 6);
      x.strokeStyle = 'rgba(120,78,38,' + rnd(.04, .15) + ')'; x.lineWidth = rnd(.6, 2.6); x.beginPath();
      for (let px = 0; px <= w; px += 8) { const py = y + Math.sin(px * f + ph) * amp; if (px) x.lineTo(px, py); else x.moveTo(px, py); }
      x.stroke();
    }
    for (let k = 0; k < 3; k++) if (Math.random() < .7) {
      const cx = rnd(60, w - 60), cy = rnd(14, h - 14), r = rnd(5, 11), g = x.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      g.addColorStop(0, 'rgba(95,58,25,.55)'); g.addColorStop(1, 'rgba(95,58,25,0)'); x.fillStyle = g;
      x.beginPath(); x.ellipse(cx, cy, r * 2.2, r, 0, 0, 7); x.fill();
    }
    for (let i = 0; i < w * h / 110; i++) { x.fillStyle = 'rgba(80,50,20,' + Math.random() * .06 + ')'; x.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
    return c;
  }
  function tourner(src) { // même bois, fil vertical (les tasseaux debout)
    const c = cnv(src.height, src.width), x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.drawImage(src, -src.width / 2, -src.height / 2); return c;
  }
  function fleches(x, cx, cy, s, col) {
    x.strokeStyle = col; x.fillStyle = col; x.lineWidth = s * 0.12;
    for (const dx of [-s * 0.32, s * 0.32]) {
      x.beginPath(); x.moveTo(cx + dx, cy + s * 0.42); x.lineTo(cx + dx, cy - s * 0.2); x.stroke();
      x.beginPath(); x.moveTo(cx + dx - s * 0.2, cy - s * 0.12); x.lineTo(cx + dx, cy - s * 0.42); x.lineTo(cx + dx + s * 0.2, cy - s * 0.12); x.closePath(); x.fill();
    }
    x.fillRect(cx - s * 0.6, cy + s * 0.5, s * 1.2, s * 0.1);
  }
  function texMarquage(logo) { // étiquette logo + « WORK » au pochoir, face avant de la caisse
    const w = 1024, h = 600, c = cnv(w, h), x = c.getContext('2d');
    const ink = cnv(w, h), ix = ink.getContext('2d');
    ix.fillStyle = ENCRE; ix.textAlign = 'center';
    ix.font = '700 210px "Barlow Condensed", "Arial Narrow", sans-serif';
    ix.fillText('WORK', w * 0.5, h * 0.93);
    fleches(ix, w * 0.89, h * 0.17, 74, ENCRE);
    usure(ink, 2600);
    x.globalAlpha = .85; x.drawImage(ink, 0, 0); x.globalAlpha = 1;
    x.save(); x.translate(w * 0.47, h * 0.3); x.rotate(-0.025);
    x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(-220, -96, 452, 204);
    x.fillStyle = '#FFFFFF'; x.fillRect(-226, -102, 452, 204);
    x.drawImage(logo, -200, -93, 400, 187);
    x.fillStyle = '#9AA3AA'; for (const sx of [-206, 206]) x.fillRect(sx - 9, -92, 18, 5);
    x.restore();
    return c;
  }
  function texMarquageCote() {
    const w = 512, h = 512, c = cnv(w, h), x = c.getContext('2d');
    fleches(x, w / 2, h * 0.42, 190, ENCRE);
    x.fillStyle = ENCRE; x.textAlign = 'center'; x.font = '700 56px "Barlow Condensed", sans-serif'; x.fillText('HAUT', w / 2, h * 0.88);
    return usure(c, 1500);
  }
  function ajusterTexte(x, texte, police, maxL, depart) {
    let fs = depart; do { x.font = police.replace('#', fs); fs -= 4; } while (x.measureText(texte).width > maxL && fs > 20);
  }
  function texFlanc(logo) { // flancs du fourgon : « SP EMBALLAGE » aux couleurs de la marque
    const w = 1280, h = 744, c = cnv(w, h), x = c.getContext('2d');
    x.fillStyle = '#F7F7F5'; x.fillRect(0, 0, w, h);
    // vague rouge et liseré gris en pied
    x.fillStyle = '#E03A14'; x.beginPath(); x.moveTo(0, h); x.lineTo(0, h * 0.76);
    x.bezierCurveTo(w * 0.3, h * 0.64, w * 0.6, h * 0.98, w, h * 0.7); x.lineTo(w, h); x.closePath(); x.fill();
    x.fillStyle = '#4B5157'; x.beginPath(); x.moveTo(0, h * 0.86);
    x.bezierCurveTo(w * 0.3, h * 0.75, w * 0.6, h * 1.07, w, h * 0.81); x.lineTo(w, h * 0.88);
    x.bezierCurveTo(w * 0.6, h * 1.13, w * 0.3, h * 0.83, 0, h * 0.93); x.closePath(); x.fill();
    // filet rouge en tête
    x.fillStyle = '#E03A14'; x.fillRect(0, 0, w, 14);
    ajusterTexte(x, 'SP EMBALLAGE', '700 #px "Barlow Condensed", "Arial Narrow", sans-serif', w * 0.86, 260);
    const a = 'SP', b = ' EMBALLAGE', wa = x.measureText(a).width, wb = x.measureText(b).width, sx = (w - wa - wb) / 2;
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#E03A14'; x.fillText(a, sx, h * 0.47);
    x.fillStyle = '#4B5157'; x.fillText(b, sx + wa, h * 0.47);
    x.font = '600 50px Barlow, Arial, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#4B5157';
    x.fillText('Genas · Saint-Priest', w / 2, h * 0.585);
    // petit logo en haut à droite, sur cartouche blanc
    const lw = 190, lh = lw * logo.height / logo.width;
    x.fillStyle = '#FFFFFF'; x.fillRect(w - lw - 46, 40, lw + 16, lh + 16);
    x.drawImage(logo, w - lw - 38, 48, lw, lh);
    return c;
  }
  function texArriere() { // portes arrière du fourgon
    const w = 512, h = 320, c = cnv(w, h), x = c.getContext('2d');
    x.fillStyle = '#F1F1EF'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(38,48,58,.35)'; x.lineWidth = 3; x.strokeRect(10, 10, w - 20, h - 20);
    x.beginPath(); x.moveTo(w / 2, 10); x.lineTo(w / 2, h - 10); x.stroke();
    x.fillStyle = '#E03A14'; x.fillRect(0, h - 46, w, 22);
    x.fillStyle = '#4B5157'; x.fillRect(0, h - 24, w, 24);
    x.font = '700 44px "Barlow Condensed", sans-serif'; x.textAlign = 'center';
    x.fillStyle = '#E03A14'; x.fillText('SP', w * 0.25 - 60, 88); x.fillText('SP', w * 0.75 - 60, 88);
    x.fillStyle = '#4B5157'; x.fillText('EMBALLAGE', w * 0.25 + 22, 88); x.fillText('EMBALLAGE', w * 0.75 + 22, 88);
    return c;
  }
  function texPlaque(logo, w, h) { const c = cnv(w, h), x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h); x.drawImage(logo, 6, 4, w - 12, h - 8); return c; }
  function texCalendrier() {
    const w = 512, c = cnv(w, w), x = c.getContext('2d');
    x.fillStyle = '#F4F2EF'; x.fillRect(0, 0, w, w);
    x.fillStyle = '#E03A14'; x.fillRect(0, 0, w, 96);
    x.fillStyle = '#FFFFFF'; x.font = '700 64px "Barlow Condensed", sans-serif'; x.textBaseline = 'middle'; x.fillText('PLANNING', 28, 52);
    const cols = 5, rows = 4, cw = (w - 56) / cols, ch = (w - 140) / rows;
    x.font = '600 20px Barlow, sans-serif'; x.textBaseline = 'alphabetic';
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const px = 28 + k * cw, py = 118 + r * ch;
      x.strokeStyle = 'rgba(38,48,58,.25)'; x.lineWidth = 2; x.strokeRect(px, py, cw - 6, ch - 6);
      x.fillStyle = 'rgba(38,48,58,.55)'; x.fillText(String(r * 5 + k + 1), px + 8, py + 24);
      if ((r * 3 + k) % 4 !== 1) { x.fillStyle = ['#C69A6B', '#4B5157', '#E03A14'][(r + k) % 3]; x.fillRect(px + 8, py + ch * 0.5, (cw - 22) * (0.4 + ((r + k * 2) % 5) / 8), 14); }
    }
    return c;
  }
  function texItineraire() {
    const s = 512, c = cnv(s, s), x = c.getContext('2d');
    x.fillStyle = '#EEF1F3'; x.fillRect(0, 0, s, s);
    x.fillStyle = '#DCE8D8'; x.beginPath(); x.ellipse(120, 120, 90, 60, .4, 0, 7); x.fill(); x.beginPath(); x.ellipse(400, 380, 80, 50, -.3, 0, 7); x.fill();
    x.strokeStyle = '#C9D2DA'; x.lineWidth = 10;
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, i * 100 + 30); x.lineTo(s, i * 90 + 60); x.stroke(); }
    x.strokeStyle = '#E03A14'; x.lineWidth = 16; x.setLineDash([30, 22]); x.lineCap = 'round';
    x.beginPath(); x.moveTo(60, 440); x.bezierCurveTo(140, 240, 330, 420, 420, 120); x.stroke();
    x.setLineDash([]); x.fillStyle = '#4B5157';
    for (const [px, py] of [[60, 440], [235, 330], [420, 120]]) { x.beginPath(); x.arc(px, py, 18, 0, 7); x.fill(); }
    return c;
  }

  /* ---------- briques ---------- */
  const RB = (w, h, d, r, sg) => new THREE.RoundedBoxGeometry(w, h, d, sg || 2, r);
  function ajout(g, geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; }
  function groupe(nom, parent, x, y, z) { const g = new THREE.Group(); g.name = nom; g.userData.garder = true; if (parent) parent.add(g); g.position.set(x || 0, y || 0, z || 0); return g; }

  /* =========================== CAISSE BOIS =========================== */
  function modeleCaisse(logo) {
    const W = 2.2, D = 1.6, H = 1.4, T = 0.035;
    const racine = new THREE.Group(); racine.name = 'caisse';
    const cb = bois(1024, 256), tBois = texture(cb), tBoisV = texture(tourner(bois(1024, 256)));
    const teintes = [0xFFFFFF, 0xF3E7D6, 0xE9D9C3, 0xF8EFE3];
    const mPl = teintes.map((c, i) => std('planche_' + i, c, .8, 0, { map: tBois }));
    const mIn = std('interieur', 0xC9AE88, .9, 0, { map: tBois });
    const mTas = std('tasseau', 0xD8BE98, .8, 0, { map: tBois });
    const mTasV = std('tasseau_v', 0xD8BE98, .8, 0, { map: tBoisV });
    const mMarq = std('marquage', 0xFFFFFF, .85, 0, { map: texture(texMarquage(logo)), transparent: true });
    const mMarqCote = std('marquage_cote', 0xFFFFFF, .85, 0, { map: texture(texMarquageCote()), transparent: true });
    const piece = (g, w, h, d, x, y, z, mat) => ajout(g, RB(w, h, d, 0.005, 1), mat, x, y, z);
    const pieceF = (g, w, h, d, x, y, z, mats) => ajout(g, new THREE.BoxGeometry(w, h, d), mats, x, y, z);
    const NPL = 4, JEU = 0.014, HPL = (H - JEU * (NPL - 1)) / NPL, CT = 0.03, CW = 0.1;
    for (let i = 0; i < NPL; i++) {
      const y = i * (HPL + JEU) + HPL / 2;
      for (const sz of [-1, 1]) pieceF(racine, W, HPL, T, 0, y, sz * (D / 2 - T / 2), [mPl[(i + 1) % 4], mPl[(i + 1) % 4], mPl[i % 4], mPl[i % 4], sz > 0 ? mPl[i % 4] : mIn, sz > 0 ? mIn : mPl[(i + 2) % 4]]);
      for (const sx of [-1, 1]) pieceF(racine, T, HPL, D - 2 * T, sx * (W / 2 - T / 2), y, 0, [sx > 0 ? mPl[(i + 3) % 4] : mIn, sx > 0 ? mIn : mPl[(i + 3) % 4], mPl[i % 4], mPl[i % 4], mPl[i % 4], mPl[i % 4]]);
    }
    pieceF(racine, W, T, D, 0, T / 2, 0, mIn);
    for (const sz of [-1, 1]) {
      const z = sz * (D / 2 + CT / 2);
      piece(racine, W + 2 * CT, CW, CT, 0, H - CW / 2, z, mTas);
      piece(racine, W + 2 * CT, CW, CT, 0, CW / 2, z, mTas);
      for (const sx of [-1, 1]) piece(racine, CW, H - 2 * CW, CT, sx * (W / 2 + CT - CW / 2), H / 2, z, mTasV);
    }
    const LD = D + 2 * CT - 2 * CW, HD = H - 2 * CW;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + CT / 2);
      piece(racine, CT, CW, D + 2 * CT, x, H - CW / 2, 0, mTas);
      piece(racine, CT, CW, D + 2 * CT, x, CW / 2, 0, mTas);
      for (const sz of [-1, 1]) piece(racine, CT, HD, CW, x, H / 2, sz * (D / 2 + CT - CW / 2), mTasV);
      const ech = piece(racine, CT * 0.9, CW * 0.9, Math.hypot(LD, HD), x + sx * 0.002, H / 2, 0, mTas);
      ech.rotation.x = -Math.atan2(HD, LD) * sx;
    }
    const decal = (w, h, mat, x, y, z, ry) => { const m = ajout(racine, new THREE.PlaneGeometry(w, h), mat, x, y, z); m.rotation.y = ry; };
    decal(W - 2 * CW - 0.06, H - 2 * CW - 0.04, mMarq, 0, H / 2, D / 2 + 0.004, 0);
    decal(W - 2 * CW - 0.06, H - 2 * CW - 0.04, mMarq, 0, H / 2, -D / 2 - 0.004, Math.PI);
    for (const sx of [-1, 1]) decal(D * 0.55, D * 0.55, mMarqCote, sx * (W / 2 + 0.004), H / 2, 0, sx * Math.PI / 2);
    // couvercle, articulé sur l'arête arrière (nœud « couvercle » animé par l'accueil)
    const couv = groupe('couvercle', racine, 0, H, -D / 2 - CT);
    const PZ = D + 2 * CT, NC = 5, LC = (PZ - JEU * (NC - 1)) / NC;
    for (let i = 0; i < NC; i++) pieceF(couv, W + 2 * CT, T, LC, 0, T / 2, i * (LC + JEU) + LC / 2, [mPl[i % 4], mPl[i % 4], mPl[(i + 2) % 4], mIn, mPl[i % 4], mPl[i % 4]]);
    for (const bx of [-1, 0, 1]) piece(couv, CW, CT, PZ, bx * (W / 2 - CW / 2 - 0.02), T + CT / 2, PZ / 2, mTasV);
    // équerres acier et pointes
    const mAcier = std('acier', 0xA3ADB4, .36, .85), mClou = std('pointe', 0x59626A, .42, .9);
    const gClou = new THREE.CylinderGeometry(0.012, 0.012, 0.007, 8);
    const XE = W / 2 + CT, ZE = D / 2 + CT, EQ = 0.17, gEq = RB(EQ, EQ, 0.006, 0.002, 1);
    const clou = (g, x, y, z, ax) => { const m = ajout(g, gClou, mClou, x, y, z); if (ax === 'z') m.rotation.x = Math.PI / 2; if (ax === 'x') m.rotation.z = Math.PI / 2; };
    for (const sz of [-1, 1]) {
      const z = sz * (ZE + 0.004);
      for (const y of [CW / 2, H - CW / 2]) for (let k = 0; k < 6; k++) clou(racine, -W / 2 + 0.3 + k * (W - 0.6) / 5, y, z, 'z');
      for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) clou(racine, sx * (XE - CW / 2), CW + 0.14 + k * (H - 2 * CW - 0.28) / 3, z, 'z');
    }
    for (const sx of [-1, 1]) for (const y of [CW / 2, H - CW / 2]) for (let k = 0; k < 4; k++) clou(racine, sx * (XE + 0.004), y, -D / 2 + 0.3 + k * (D - 0.6) / 3, 'x');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [EQ / 2, H - EQ / 2]) {
      ajout(racine, gEq, mAcier, sx * (XE - EQ / 2), y, sz * (ZE + 0.003));
      ajout(racine, gEq, mAcier, sx * (XE + 0.003), y, sz * (ZE - EQ / 2)).rotation.y = Math.PI / 2;
      clou(racine, sx * (XE - EQ * 0.55), y, sz * (ZE + 0.008), 'z'); clou(racine, sx * (XE + 0.008), y, sz * (ZE - EQ * 0.55), 'x');
    }
    for (const bx of [-1, 0, 1]) for (let k = 0; k < 6; k++) clou(couv, bx * (W / 2 - CW / 2 - 0.02), T + CT + 0.003, 0.08 + k * (PZ - 0.16) / 5, 'y');
    fusionner(couv); fusionner(racine);
    return racine;
  }

  /* =========================== PALETTE =========================== */
  function modelePalette() {
    const racine = new THREE.Group(); racine.name = 'palette';
    const PH = 0.16, t1 = texture(bois(1024, 256, '#D7B27F')), t2 = texture(bois(1024, 256, '#C9A06B'));
    const mPal = std('palette_planche', 0xF2E6D4, .9, 0, { map: t1 }), mPalB = std('palette_planche_b', 0xE6D3B8, .9, 0, { map: t2 });
    const mDe = std('palette_de', 0xC8A57A, .92, 0, { map: t2 });
    for (let i = 0; i < 5; i++) ajout(racine, RB(2.8, 0.03, 0.34, 0.008, 1), i % 2 ? mPalB : mPal, 0, PH - 0.015, -1.1 + 0.17 + i * (2.2 - 0.34) / 4);
    for (const px of [-1.25, 0, 1.25]) for (const pz of [-0.95, 0, 0.95]) ajout(racine, RB(0.22, 0.1, 0.22, 0.01, 1), mDe, px, 0.08, pz);
    for (const pz of [-0.95, 0, 0.95]) ajout(racine, RB(2.8, 0.03, 0.22, 0.008, 1), pz ? mPal : mPalB, 0, 0.015, pz);
    fusionner(racine);
    return racine;
  }

  /* =========================== CAMION =========================== */
  function modeleCamion(logo) {
    const racine = new THREE.Group(); racine.name = 'camion';
    const peinture = phys('carrosserie', ROUGE, .3, .05, 1, .06);
    const blanc = phys('fourgon', new THREE.Color(0xF2F2F0), .42, 0, .6, .2);
    const gris = phys('gris_marque', GRIS, .38, .25, .6, .2);
    const noir = std('noir', 0x15181C, .6, .2), pneu = std('pneu', 0x111316, .92, 0);
    const vitre = phys('vitre', 0x0A1117, .06, .9, 1, .02);
    const chrome = std('chrome', 0xD6DCE0, .14, 1);
    const phare = std('phare', 0xFFFFFF, .2, 0, { emissive: new THREE.Color(0xFFE7B0) });
    const feu = std('feu', 0x8A1408, .3, 0, { emissive: new THREE.Color(0xFF2A10) });
    const orange = std('clignotant', 0xFF9A1E, .3, 0, { emissive: new THREE.Color(0x7A3A00) });
    const mFlanc = std('flanc', 0xFFFFFF, .4, 0, { map: texture(texFlanc(logo)) });
    const mArriere = std('arriere', 0xFFFFFF, .45, 0, { map: texture(texArriere()) });
    const mPlaque = std('plaque_logo', 0xFFFFFF, .35, 0, { map: texture(texPlaque(logo, 256, 120)) });

    // cabine : profil latéral extrudé, nez arrondi, pare-brise incliné, passage de roue
    const s = new THREE.Shape();
    s.moveTo(0.27, 0.17); s.lineTo(0.34302, 0.17);
    s.absarc(0.47, 0.10, 0.145, 2.6376, 0.5040, true);
    s.lineTo(0.66, 0.17); s.quadraticCurveTo(0.70, 0.17, 0.70, 0.21);
    s.lineTo(0.70, 0.40); s.quadraticCurveTo(0.70, 0.45, 0.665, 0.47);
    s.lineTo(0.60, 0.645); s.quadraticCurveTo(0.585, 0.68, 0.55, 0.68);
    s.lineTo(0.30, 0.68); s.quadraticCurveTo(0.27, 0.68, 0.27, 0.65); s.lineTo(0.27, 0.17);
    const gCab = new THREE.ExtrudeGeometry(s, { depth: 0.39, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, curveSegments: 14 });
    gCab.translate(0, 0, -0.195); gCab.deleteAttribute('uv');
    ajout(racine, gCab, peinture, 0, 0, 0);
    // déflecteur de toit
    const sd = new THREE.Shape(); sd.moveTo(0.30, 0.70); sd.lineTo(0.53, 0.70); sd.quadraticCurveTo(0.40, 0.712, 0.30, 0.752); sd.lineTo(0.30, 0.70);
    const gDef = new THREE.ExtrudeGeometry(sd, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
    gDef.translate(0, 0, -0.18); gDef.deleteAttribute('uv'); ajout(racine, gDef, gris, 0, 0, 0);
    // vitrages
    const pb = ajout(racine, RB(0.01, 0.165, 0.37, 0.004, 1), vitre, 0.6587, 0.5672, 0); pb.rotation.z = 0.355;
    const sv = new THREE.Shape(); sv.moveTo(0.31, 0.475); sv.lineTo(0.615, 0.475); sv.lineTo(0.555, 0.64); sv.lineTo(0.31, 0.64); sv.lineTo(0.31, 0.475);
    for (const sz of [-1, 1]) { const gv = new THREE.ExtrudeGeometry(sv, { depth: 0.006, bevelEnabled: false }); gv.deleteAttribute('uv'); gv.translate(0, 0, sz > 0 ? 0.218 : -0.224); ajout(racine, gv, vitre, 0, 0, 0); }
    // portières : joints, poignées, logo
    for (const sz of [-1, 1]) {
      const z = sz * 0.2215;
      ajout(racine, new THREE.BoxGeometry(0.006, 0.36, 0.004), noir, 0.305, 0.465, z);
      ajout(racine, new THREE.BoxGeometry(0.006, 0.17, 0.004), noir, 0.605, 0.385, z);
      ajout(racine, new THREE.BoxGeometry(0.3, 0.006, 0.004), noir, 0.455, 0.29, z);
      ajout(racine, RB(0.045, 0.012, 0.012, 0.004, 1), chrome, 0.345, 0.43, sz * 0.225);
      const p = ajout(racine, new THREE.PlaneGeometry(0.17, 0.08), mPlaque, 0.46, 0.365, sz * 0.2235); p.rotation.y = sz > 0 ? 0 : Math.PI;
    }
    // face avant : calandre, logo, phares, pare-chocs, rétroviseurs
    ajout(racine, RB(0.02, 0.12, 0.27, 0.008, 1), noir, 0.722, 0.315, 0);
    for (let k = 0; k < 4; k++) ajout(racine, RB(0.01, 0.009, 0.25, 0.003, 1), chrome, 0.733, 0.27 + k * 0.03, 0);
    const pl = ajout(racine, new THREE.PlaneGeometry(0.13, 0.06), mPlaque, 0.7265, 0.415, 0); pl.rotation.y = Math.PI / 2;
    for (const sz of [-1, 1]) {
      ajout(racine, RB(0.02, 0.05, 0.085, 0.012, 2), phare, 0.721, 0.315, sz * 0.175);
      ajout(racine, RB(0.016, 0.02, 0.03, 0.006, 1), orange, 0.72, 0.315, sz * 0.2);
      const halo = new THREE.Object3D(); halo.name = 'halo_phare'; halo.position.set(0.76, 0.315, sz * 0.175); racine.add(halo);
      ajout(racine, new THREE.BoxGeometry(0.06, 0.01, 0.012), noir, 0.62, 0.6, sz * 0.245);
      ajout(racine, RB(0.025, 0.1, 0.04, 0.01, 2), noir, 0.645, 0.56, sz * 0.27);
      ajout(racine, new THREE.BoxGeometry(0.004, 0.07, 0.03), vitre, 0.632, 0.56, sz * 0.27);
    }
    ajout(racine, RB(0.07, 0.075, 0.46, 0.025, 3), gris, 0.71, 0.19, 0);
    ajout(racine, RB(0.012, 0.035, 0.12, 0.004, 1), std('plaque', 0xF4F4F0, .5), 0.747, 0.19, 0);

    // caisse fourgon et flancs « SP EMBALLAGE »
    const L = 0.93, HC = 0.56, LG = 0.46, XC = -0.215, YC = 0.19 + HC / 2;
    ajout(racine, RB(L, HC, LG, 0.025, 3), blanc, XC, YC, 0);
    for (const sz of [-1, 1]) { const d = ajout(racine, new THREE.PlaneGeometry(L - 0.03, HC - 0.03), mFlanc, XC, YC, sz * (LG / 2 + 0.0025)); d.rotation.y = sz > 0 ? 0 : Math.PI; }
    const ar = ajout(racine, new THREE.PlaneGeometry(LG - 0.03, HC - 0.03), mArriere, XC - L / 2 - 0.0025, YC, 0); ar.rotation.y = -Math.PI / 2;
    for (const sz of [-0.17, -0.06, 0.06, 0.17]) ajout(racine, RB(0.012, HC - 0.08, 0.012, 0.004, 1), chrome, XC - L / 2 - 0.007, YC, sz);
    for (const sz of [-1, 1]) {
      ajout(racine, RB(0.014, 0.045, 0.065, 0.006, 1), feu, XC - L / 2 - 0.008, 0.235, sz * 0.18);
      ajout(racine, RB(0.012, 0.035, 0.02, 0.004, 1), orange, XC - L / 2 - 0.008, 0.235, sz * 0.13);
    }
    // châssis, jupes, pare-chocs arrière, bavettes
    ajout(racine, new THREE.BoxGeometry(1.32, 0.06, 0.28), noir, 0.0, 0.15, 0);
    for (const sz of [-1, 1]) {
      ajout(racine, RB(0.5, 0.06, 0.012, 0.004, 1), gris, -0.015, 0.18, sz * 0.222);
      ajout(racine, new THREE.BoxGeometry(0.008, 0.09, 0.08), noir, -0.675, 0.11, sz * 0.19);
    }
    ajout(racine, RB(0.04, 0.04, 0.44, 0.01, 1), noir, -0.665, 0.15, 0);

    // roues (nœuds « roue » animés par l'accueil)
    const prof = [[0.062, -0.037], [0.088, -0.0375], [0.097, -0.032], [0.1, -0.022], [0.1, 0.022], [0.097, 0.032], [0.088, 0.0375], [0.062, 0.037]].map(p => new THREE.Vector2(p[0], p[1]));
    const gPneu = new THREE.LatheGeometry(prof, 30); gPneu.rotateX(Math.PI / 2); gPneu.deleteAttribute('uv');
    const gJante = new THREE.CylinderGeometry(0.062, 0.062, 0.07, 24); gJante.rotateX(Math.PI / 2);
    const gLevre = new THREE.TorusGeometry(0.061, 0.006, 8, 28);
    const gMoyeu = new THREE.CylinderGeometry(0.024, 0.03, 0.084, 14); gMoyeu.rotateX(Math.PI / 2);
    const gEcrou = new THREE.CylinderGeometry(0.006, 0.006, 0.088, 6); gEcrou.rotateX(Math.PI / 2);
    const mJante = std('jante', 0xBFC6CB, .28, .9);
    const r0 = groupe('roue');
    ajout(r0, gPneu, pneu, 0, 0, 0); ajout(r0, gJante, mJante, 0, 0, 0); ajout(r0, gMoyeu, gris, 0, 0, 0);
    for (const lz of [-0.036, 0.036]) ajout(r0, gLevre, chrome, 0, 0, lz);
    for (let k = 0; k < 6; k++) ajout(r0, gEcrou, chrome, Math.cos(k * Math.PI / 3) * 0.042, Math.sin(k * Math.PI / 3) * 0.042, 0);
    fusionner(r0);
    for (const wx of [0.47, -0.38, -0.56]) for (const sz of [-1, 1]) { const r = r0.clone(); r.position.set(wx, 0.1, sz * 0.19); racine.add(r); }
    fusionner(racine);
    return racine;
  }

  /* =========================== ÉPINGLE (Ma tournée) =========================== */
  function modeleEpingle() {
    const racine = new THREE.Group(); racine.name = 'tournee';
    const bord = std('socle', 0xCDD5DB, .45, .25);
    const carte = std('carte', 0xFFFFFF, .6, 0, { map: texture(texItineraire()) });
    const socle = ajout(racine, new THREE.CylinderGeometry(0.38, 0.38, 0.045, 56), [bord, carte, bord], 0, 0.022, 0); socle.rotation.y = 0.3;
    ajout(racine, new THREE.TorusGeometry(0.38, 0.012, 10, 56), std('liseré', ROUGE, .35, .1), 0, 0.045, 0).rotation.x = Math.PI / 2;
    const laque = phys('laque_rouge', ROUGE, .22, .15, 1, .06);
    const pin = groupe('epingle', racine, 0.05, 0.045, 0.02);
    ajout(pin, new THREE.ConeGeometry(0.085, 0.26, 40), laque, 0, 0.17, 0).rotation.x = Math.PI;
    ajout(pin, new THREE.SphereGeometry(0.12, 40, 28), laque, 0, 0.36, 0);
    ajout(pin, new THREE.SphereGeometry(0.05, 28, 18), std('blanc', 0xFFFFFF, .3), 0, 0.37, 0.085);
    fusionner(pin); fusionner(racine);
    return racine;
  }

  /* =========================== CALENDRIER (Planning) =========================== */
  function modeleCalendrier() {
    const racine = new THREE.Group(); racine.name = 'calendrier';
    const papier = std('papier', 0xF2EFEA, .8), face = std('page', 0xFFFFFF, .75, 0, { map: texture(texCalendrier()) });
    const dos = std('dos', GRIS, .5, .1);
    ajout(racine, RB(0.6, 0.6, 0.05, 0.02, 2), dos, 0, 0.36, -0.035);
    ajout(racine, new THREE.BoxGeometry(0.57, 0.57, 0.06), [papier, papier, papier, papier, face, papier], 0, 0.355, 0.02);
    for (let k = 1; k <= 3; k++) ajout(racine, new THREE.BoxGeometry(0.57, 0.004, 0.06), std('tranche', 0xDAD5CD, .9), 0, 0.07 + k * 0.004, 0.02);
    const ag = new THREE.TorusGeometry(0.055, 0.012, 10, 24); ag.rotateY(Math.PI / 2);
    for (const rx of [-0.16, 0.16]) ajout(racine, ag, std('anneau', 0xD3DADF, .2, 1), rx, 0.655, 0.01);
    const pied = ajout(racine, RB(0.5, 0.03, 0.22, 0.01, 1), dos, 0, 0.015, -0.06);
    pied.name = 'pied';
    fusionner(racine);
    return racine;
  }

  /* ---------- fusion par matériau (moins d'appels de dessin) ---------- */
  function fusionner(g) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), parMat = new Map(), morts = [];
    (function visite(o) {
      for (const c of o.children) {
        if (c.userData.garder) continue;
        if (c.isMesh) {
          const geo = c.geometry.clone(); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          const mats = Array.isArray(c.material) ? c.material : [c.material], n = geo.attributes.position.count;
          const idx = geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i);
          const grs = Array.isArray(c.material) && geo.groups.length ? geo.groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
          for (const gr of grs) {
            const mt = mats[gr.materialIndex] || mats[0];
            if (!parMat.has(mt)) parMat.set(mt, []);
            parMat.get(mt).push({ geo, idx: idx.slice(gr.start, gr.start + Math.min(gr.count, idx.length - gr.start)) });
          }
          morts.push(c);
        }
        visite(c);
      }
    })(g);
    morts.forEach(c => c.parent.remove(c));
    (function vider(o) { for (const c of [...o.children]) { if (c.userData.garder) continue; vider(c); if (!c.isMesh && c.type === 'Group' && !c.children.length) o.remove(c); } })(g);
    for (const [mt, liste] of parMat) {
      const decal = new Map(); let nv = 0, ni = 0;
      for (const it of liste) { if (!decal.has(it.geo)) { decal.set(it.geo, nv); nv += it.geo.attributes.position.count; } ni += it.idx.length; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), ind = new Uint32Array(ni);
      for (const [geo, o] of decal) {
        pos.set(geo.attributes.position.array, o * 3);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        nor.set(geo.attributes.normal.array, o * 3);
        if (geo.attributes.uv) uv.set(geo.attributes.uv.array, o * 2);
      }
      let k = 0; for (const it of liste) { const o = decal.get(it.geo); for (let i = 0; i < it.idx.length; i++) ind[k++] = it.idx[i] + o; }
      const s = souder(pos, nor, mt.map ? uv : null, ind);
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.BufferAttribute(s.pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(s.nor, 3));
      if (mt.map) mg.setAttribute('uv', new THREE.BufferAttribute(s.uv, 2));
      mg.setIndex(new THREE.BufferAttribute(s.ind, 1));
      const m = new THREE.Mesh(mg, mt); m.name = mt.name; g.add(m);
    }
  }

  // soude les sommets identiques (position, normale, UV) : fichiers bien plus légers
  function souder(pos, nor, uv, ind) {
    const vus = new Map(), P = [], N = [], U = [], out = new Uint32Array(ind.length), r = v => Math.round(v * 1e4);
    for (let k = 0; k < ind.length; k++) {
      const i = ind[k];
      const cle = r(pos[i * 3]) + ',' + r(pos[i * 3 + 1]) + ',' + r(pos[i * 3 + 2]) + '|' + Math.round(nor[i * 3] * 500) + ',' + Math.round(nor[i * 3 + 1] * 500) + ',' + Math.round(nor[i * 3 + 2] * 500) + (uv ? '|' + r(uv[i * 2]) + ',' + r(uv[i * 2 + 1]) : '');
      let j = vus.get(cle);
      if (j === undefined) {
        j = P.length / 3; vus.set(cle, j);
        P.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); N.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
        if (uv) U.push(uv[i * 2], uv[i * 2 + 1]);
      }
      out[k] = j;
    }
    return { pos: new Float32Array(P), nor: new Float32Array(N), uv: uv ? new Float32Array(U) : null, ind: out };
  }

  /* ---------- export glTF binaire ---------- */
  async function versGLB(racine) {
    racine.updateMatrixWorld(true);
    const json = { asset: { version: '2.0', generator: 'SP WORK outils/modeles-3d' }, scene: 0, scenes: [{ name: racine.name, nodes: [] }],
      nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] };
    const blocs = [], ext = new Set(); let lg = 0;
    function vue(u8, target) {
      const pad = (4 - lg % 4) % 4; if (pad) { blocs.push(new Uint8Array(pad)); lg += pad; }
      const v = { buffer: 0, byteOffset: lg, byteLength: u8.byteLength }; if (target) v.target = target;
      blocs.push(u8); lg += u8.byteLength; json.bufferViews.push(v); return json.bufferViews.length - 1;
    }
    function acc(tab, n, type, target, bornes) {
      const ct = tab instanceof Float32Array ? 5126 : tab instanceof Uint32Array ? 5125 : 5123;
      const a = { bufferView: vue(new Uint8Array(tab.buffer.slice(tab.byteOffset, tab.byteOffset + tab.byteLength)), target), componentType: ct, count: tab.length / n, type };
      if (bornes) {
        a.min = new Array(n).fill(Infinity); a.max = new Array(n).fill(-Infinity);
        for (let i = 0; i < tab.length; i++) { const c = i % n; if (tab[i] < a.min[c]) a.min[c] = tab[i]; if (tab[i] > a.max[c]) a.max[c] = tab[i]; }
      }
      json.accessors.push(a); return json.accessors.length - 1;
    }
    const texIdx = new Map(), matIdx = new Map();
    async function tex(t, png) {
      const cle = t.uuid + png; if (texIdx.has(cle)) return texIdx.get(cle);
      const type = png ? 'image/png' : 'image/jpeg';
      const blob = await new Promise(ok => t.image.toBlob(ok, type, 0.86));
      const u8 = new Uint8Array(await blob.arrayBuffer());
      json.images = json.images || []; json.textures = json.textures || [];
      json.samplers = json.samplers || [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
      json.images.push({ bufferView: vue(u8), mimeType: type });
      json.textures.push({ sampler: 0, source: json.images.length - 1 });
      texIdx.set(cle, json.textures.length - 1); return json.textures.length - 1;
    }
    async function mat(m) {
      if (matIdx.has(m)) return matIdx.get(m);
      const o = { name: m.name || undefined, pbrMetallicRoughness: { baseColorFactor: [m.color.r, m.color.g, m.color.b, m.opacity], metallicFactor: m.metalness, roughnessFactor: m.roughness } };
      if (m.map) o.pbrMetallicRoughness.baseColorTexture = { index: await tex(m.map, !!m.transparent) };
      if (m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) o.emissiveFactor = [m.emissive.r, m.emissive.g, m.emissive.b];
      if (m.transparent) o.alphaMode = 'BLEND';
      if (m.side === THREE.DoubleSide) o.doubleSided = true;
      if (m.isMeshPhysicalMaterial && m.clearcoat) { o.extensions = { KHR_materials_clearcoat: { clearcoatFactor: m.clearcoat, clearcoatRoughnessFactor: m.clearcoatRoughness } }; ext.add('KHR_materials_clearcoat'); }
      json.materials.push(o); matIdx.set(m, json.materials.length - 1); return json.materials.length - 1;
    }
    const mailIdx = new Map();
    async function maillage(o) {
      const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material], n = g.attributes.position.count;
      const cleM = g.uuid + mats.map(m => m.uuid).join(); // un même maillage partagé par plusieurs nœuds (les roues)
      if (mailIdx.has(cleM)) return mailIdx.get(cleM);
      const attrs = { POSITION: acc(Float32Array.from(g.attributes.position.array), 3, 'VEC3', 34962, true) };
      if (!g.attributes.normal) g.computeVertexNormals();
      attrs.NORMAL = acc(Float32Array.from(g.attributes.normal.array), 3, 'VEC3', 34962);
      if (g.attributes.uv && mats.some(m => m.map)) { const uv = Float32Array.from(g.attributes.uv.array); for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]; attrs.TEXCOORD_0 = acc(uv, 2, 'VEC2', 34962); }
      const index = g.index ? g.index.array : Uint32Array.from({ length: n }, (_, i) => i);
      const grs = Array.isArray(o.material) && g.groups.length ? g.groups : [{ start: 0, count: index.length, materialIndex: 0 }];
      const prims = [];
      for (const gr of grs) {
        const sub = index.slice(gr.start, gr.start + Math.min(gr.count, index.length - gr.start));
        if (!sub.length) continue;
        prims.push({ attributes: attrs, indices: acc(n > 65535 ? Uint32Array.from(sub) : Uint16Array.from(sub), 1, 'SCALAR', 34963), material: await mat(mats[gr.materialIndex] || mats[0]) });
      }
      json.meshes.push({ name: o.name || undefined, primitives: prims }); mailIdx.set(cleM, json.meshes.length - 1); return json.meshes.length - 1;
    }
    async function noeud(o) {
      const n = { name: o.name || undefined };
      if (o.position.lengthSq()) n.translation = o.position.toArray();
      if (Math.abs(o.quaternion.w) < 0.999999) n.rotation = o.quaternion.toArray();
      if (o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1) n.scale = o.scale.toArray();
      if (o.isMesh) n.mesh = await maillage(o);
      json.nodes.push(n); const i = json.nodes.length - 1;
      const enfants = [];
      for (const c of o.children) if (c.isMesh || c.type === 'Group' || c.type === 'Object3D') enfants.push(await noeud(c));
      if (enfants.length) n.children = enfants;
      return i;
    }
    for (const c of racine.children) json.scenes[0].nodes.push(await noeud(c));
    if (ext.size) json.extensionsUsed = [...ext];
    const padBin = (4 - lg % 4) % 4; if (padBin) { blocs.push(new Uint8Array(padBin)); lg += padBin; }
    json.buffers[0].byteLength = lg;
    let jt = new TextEncoder().encode(JSON.stringify(json));
    const padJ = (4 - jt.length % 4) % 4; if (padJ) { const t = new Uint8Array(jt.length + padJ).fill(0x20); t.set(jt); jt = t; }
    const total = 12 + 8 + jt.length + 8 + lg, out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jt.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(jt, 20);
    let p = 20 + jt.length; dv.setUint32(p, lg, true); dv.setUint32(p + 4, 0x004E4942, true); p += 8;
    for (const b of blocs) { out.set(b, p); p += b.byteLength; }
    return out.buffer;
  }

  /* ---------- page : génération, aperçu relu depuis le .glb, enregistrement ---------- */
  const MODELES = [
    { nom: 'caisse', titre: 'Caisse bois SP Emballage', f: modeleCaisse, vue: [4.2, 3.0, 5.2], cible: [0, 0.75, 0] },
    { nom: 'palette', titre: 'Palette', f: modelePalette, vue: [3.6, 2.4, 4.2], cible: [0, 0.05, 0] },
    { nom: 'camion', titre: 'Camion SP EMBALLAGE', f: modeleCamion, vue: [1.3, 0.8, 1.6], cible: [0, 0.36, 0] },
    { nom: 'epingle', titre: 'Ma tournée', f: modeleEpingle, vue: [0.9, 0.8, 1.1], cible: [0, 0.2, 0] },
    { nom: 'calendrier', titre: 'Planning', f: modeleCalendrier, vue: [0.6, 0.6, 1.2], cible: [0, 0.35, 0] }
  ];
  const fichiers = {};
  const etat = document.getElementById('etat');

  function apercu(canvas, objet, m) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    const sc = new THREE.Scene(), pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    const soleil = new THREE.DirectionalLight(0xFFF1DC, 1.6); soleil.position.set(4, 8, 5); sc.add(soleil);
    sc.add(new THREE.HemisphereLight(0xFFF6EA, 0x3A4550, 0.3));
    sc.add(objet);
    const cam = new THREE.PerspectiveCamera(35, 4 / 3, 0.01, 50), cible = new THREE.Vector3().fromArray(m.cible), dep = new THREE.Vector3().fromArray(m.vue).sub(cible);
    const t0 = performance.now();
    (function boucle() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      const a = (performance.now() - t0) / 4000;
      cam.position.copy(dep).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(cible); cam.lookAt(cible);
      r.render(sc, cam); requestAnimationFrame(boucle);
    })();
  }

  async function generer() {
    document.getElementById('generer').disabled = true;
    etat.textContent = 'Chargement des polices et du logo…';
    await Promise.all(['700 100px "Barlow Condensed"', '600 50px Barlow'].map(f => document.fonts.load(f)));
    const logo = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = '../logo.png'; });
    const cartes = document.getElementById('cartes'); cartes.replaceChildren();
    for (const m of MODELES) {
      etat.textContent = 'Fabrication : ' + m.titre + '…';
      const buf = await versGLB(m.f(logo));
      fichiers[m.nom] = buf;
      const objet = await THREE.lireGLB(buf.slice(0)); // l'aperçu montre le fichier tel que l'accueil le lira
      let nTri = 0, nDraw = 0; objet.traverse(o => { if (o.isMesh) { nDraw++; nTri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
      const carte = document.createElement('div'); carte.className = 'carte';
      const c = document.createElement('canvas'), info = document.createElement('div'), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' })); a.download = m.nom + '.glb'; a.textContent = m.nom + '.glb';
      info.append(Object.assign(document.createElement('span'), { textContent: m.titre + ' · ' + Math.round(buf.byteLength / 1024) + ' Ko · ' + Math.round(nTri / 1000) + ' k triangles · ' + nDraw + ' dessins' }), a);
      carte.append(c, info); cartes.append(carte);
      apercu(c, objet, m);
    }
    etat.textContent = 'Modèles prêts. Vérifiez les aperçus, puis enregistrez-les (serveur local) ou téléchargez-les dans le dossier modeles/.';
    document.getElementById('enregistrer').disabled = false;
    document.getElementById('generer').disabled = false;
    window.modelesPrets = Object.keys(fichiers);
  }
  async function enregistrer() {
    const res = [];
    for (const nom in fichiers) {
      const r = await fetch('/__save/modeles/' + nom + '.glb', { method: 'PUT', body: fichiers[nom] }).catch(() => null);
      res.push(nom + (r && r.ok ? ' ✓' : ' ✗'));
    }
    etat.textContent = 'Enregistrement : ' + res.join(' · ') + (res.some(t => t.endsWith('✗')) ? ' (sans le serveur local, utilisez les liens de téléchargement)' : '');
  }
  document.getElementById('generer').addEventListener('click', generer);
  document.getElementById('enregistrer').addEventListener('click', enregistrer);
  window.genererModeles = generer; window.enregistrerModeles = enregistrer;
})();
