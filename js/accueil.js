/* SP WORK : écran d'accueil. Une caisse bois SP Emballage s'ouvre et libère les apps :
   les apps en service flottent au-dessus de la caisse (maquettes 3D), les apps à construire
   tournent autour dans leurs petites caisses. Repli automatique sur les tuiles si la 3D
   n'est pas disponible, et bouton « Vue liste » pour basculer à la main. */
(function () {
  'use strict';
  const SP = window.SP, h = SP.h;

  const A_VENIR = [
    { id: 'planning', nom: 'Planning', icone: 'calendar', desc: 'Qui fait quoi, où et quand, par site et par semaine.',
      contenu: ['Planning hebdomadaire des équipes de Genas et de Saint-Priest', 'Chantiers d\'emballage chez les clients et affectation des camions', 'Absences visibles directement dans le planning', 'Vue du jour pour chaque responsable sur téléphone'],
      besoin: 'La liste des salariés par site et un exemple de votre planning actuel.' },
    { id: 'rh', nom: 'RH', icone: 'users', desc: 'Congés, absences, heures et intégration des nouveaux.',
      contenu: ['Demandes de congés et validation par le responsable', 'Saisie des heures de la semaine par salarié', 'Récapitulatif mensuel prêt pour le cabinet comptable', 'Parcours d\'intégration des nouveaux arrivants'],
      besoin: 'Votre fichier Excel annuel des heures et les règles de validation des congés.' },
    { id: 'production', nom: 'Production', icone: 'factory', desc: 'Suivi détaillé de l\'atelier, en complément du Planning.',
      contenu: ['Import des commandes en cours depuis Cegid PMI', 'Affectation par poste ou par équipe', 'Temps passés et charge de l\'atelier', 'Les fabrications alimentent directement le Planning'],
      besoin: 'Un export des commandes en cours depuis Cegid PMI.' },
    { id: 'stock', nom: 'Stock', icone: 'box', desc: 'Bois, panneaux et fournitures : niveaux et seuils d\'alerte.',
      contenu: ['Niveaux de stock par site', 'Seuils d\'alerte et liste de réapprovisionnement', 'Inventaire rapide sur téléphone'],
      besoin: 'La liste des articles suivis et leurs seuils minimums.' },
    { id: 'qualite', nom: 'Qualité et sécurité', icone: 'shield', desc: 'Non-conformités, réclamations, contrôles matières dangereuses.',
      contenu: ['Déclaration d\'une non-conformité avec photo', 'Suivi des réclamations clients et des actions', 'Listes de contrôle ADR, IMDG et IATA avant expédition', 'Registre des presqu\'accidents'],
      besoin: 'Vos listes de contrôle actuelles et la manière dont les réclamations sont suivies aujourd\'hui.' },
    { id: 'materiel', nom: 'Matériel', icone: 'wrench', desc: 'Camions, chariots et machines : entretiens et contrôles.',
      contenu: ['Fiche par véhicule, chariot et machine', 'Échéances de contrôle périodique et d\'entretien', 'Signalement d\'une panne depuis le téléphone'],
      besoin: 'L\'inventaire du parc avec les dates des derniers contrôles.' },
    { id: 'commercial', nom: 'Commercial', icone: 'euro', desc: 'Prospects, devis en cours, relances et carnet de commandes.',
      contenu: ['Suivi des prospects et des prochaines relances', 'Devis en cours et taux de transformation', 'Carnet de commandes par client', 'Poids des principaux clients dans le chiffre d\'affaires'],
      besoin: 'Votre liste de prospects et un export des devis.' },
    { id: 'pilotage', nom: 'Pilotage', icone: 'chart', desc: 'Le tableau de bord du dirigeant, à jour chaque lundi.',
      contenu: ['Heures et absences par site', 'Commandes et carnet', 'Production et retards de livraison', 'Les chiffres remontent tout seuls des autres apps SP WORK'],
      besoin: 'Cette app prend toute sa valeur une fois Livraison, RH et Production en service.' }
  ];

  function fiche(a) {
    const m = SP.modal({ titre: a.nom });
    m.body.append(
      h('p', { text: a.desc, style: 'margin:0' }),
      h('div', null, h('b', { text: 'Ce que l\'app contiendra' }), h('ul', { style: 'margin:6px 0 0;padding-left:20px' }, a.contenu.map(c => h('li', { text: c })))),
      h('div', { class: 'notice info' }, h('b', { text: 'Pour la construire : ' }), a.besoin),
      h('p', { class: 'small muted', style: 'margin:0', text: 'Demandez à Claude : « Ajoute l\'app ' + a.nom + ' à SP WORK ». Elle apparaîtra ici, avec les mêmes données partagées.' }));
    m.setActions(h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, 'Fermer'));
  }

  /* ---------- préférences d'affichage ---------- */
  const VUE_CLE = 'sp-accueil-vue';
  function vueListe() { try { return localStorage.getItem(VUE_CLE) === 'liste'; } catch (e) { return false; } }
  function setVue(v) { try { localStorage.setItem(VUE_CLE, v); } catch (e) { /* rien */ } }
  function webglOK() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }
  let threeP = null;
  function charger(src) {
    return new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = () => ok(); s.onerror = () => ko(new Error(src));
      document.head.appendChild(s);
    });
  }
  function chargerThree() {
    if (window.THREE && window.THREE.RoundedBoxGeometry) return Promise.resolve();
    if (!threeP) threeP = (window.THREE ? Promise.resolve() : charger('js/vendor/three.min.js'))
      .then(() => window.THREE.RoundedBoxGeometry ? null : charger('js/vendor/three-extras.js').catch(() => null))
      .catch(e => { threeP = null; throw e; });
    return threeP;
  }
  const descApp = id => (A_VENIR.find(a => a.id === id) || {});

  /* ---------- vue en tuiles (l'ancienne présentation, gardée en repli) ---------- */
  function vueTuiles(actives, aVenir, info, basculer) {
    const tiles = h('div', { class: 'tiles' },
      actives.map(a => h('button', { class: 'tile on', type: 'button', onclick: () => SP.go(a.id) },
        h('span', { class: 'ticon' }, SP.icon(a.icone)), h('b', { text: a.nom }), h('span', { class: 'tdesc', text: a.desc }),
        a.id === 'livraison' ? info.pill() : h('span', { class: 'pill ok', text: 'En service' }))));
    const soon = h('div', { class: 'tiles' },
      aVenir.map(a => h('button', { class: 'tile soon', type: 'button', onclick: () => fiche(a) },
        h('span', { class: 'ticon' }, SP.icon(a.icone)), h('b', { text: a.nom }), h('span', { class: 'tdesc', text: a.desc }), h('span', { class: 'pill neutral', text: 'À construire' }))));
    return h('div', { class: 'home' },
      h('div', { class: 'home-head' },
        h('div', null, h('h1', { text: 'SP WORK' }), h('div', { class: 'muted', text: 'Les outils du quotidien de SP Emballage · ' + SP.frDate(SP.today()) })),
        basculer ? h('button', { class: 'btn sm', type: 'button', onclick: basculer }, 'Vue 3D') : null),
      h('h2', { text: 'Apps en service' }), tiles,
      h('h2', { text: 'Prochaines apps' }), soon);
  }

  /* ---------- écran ---------- */
  let dejaJoue = false;
  function mount(main) {
    const actives = SP.apps.filter(a => a.id !== 'accueil' && a.mount);
    const aVenir = A_VENIR.filter(a => !actives.some(x => x.id === a.id));

    // état du jour des BL, partagé entre la vue 3D et les tuiles
    const info = {
      texte: 'En service', classe: 'neutral', pills: new Set(),
      pill() { const p = h('span', { class: 'pill num ' + this.classe, text: this.texte }); this.pills.add(p); return p; },
      maj(texte, classe) { this.texte = texte; this.classe = classe; this.pills.forEach(p => { p.className = 'pill num ' + classe; p.textContent = texte; }); }
    };
    const offBL = SP.store.watch({ coll: 'bls', where: ['date', '==', SP.today()] }, m => {
      if (!m) return;
      const tot = m.size, reste = [...m.values()].filter(b => b.statut !== 'livre').length;
      info.maj(!tot ? 'Aucun BL aujourd\'hui' : reste ? reste + ' BL à livrer aujourd\'hui' : tot + ' BL livrés aujourd\'hui',
        tot && !reste ? 'ok' : reste ? 'warn' : 'neutral');
    });

    let detruire = null, fini = false;
    function afficherTuiles(proposer3D) {
      if (detruire) { detruire(); detruire = null; }
      info.pills.clear();
      main.replaceChildren(vueTuiles(actives, aVenir, info, proposer3D ? () => { setVue('3d'); afficher3D(); } : null));
    }
    function afficher3D() {
      info.pills.clear();
      const scene = h('div', { class: 'home3d' });
      main.replaceChildren(scene);
      chargerThree().then(() => {
        if (fini || !scene.isConnected) return;
        detruire = scene3D(scene, actives, aVenir, info, {
          ouvrir: id => SP.go(id),
          fiche: a => fiche(a),
          liste: () => { setVue('liste'); afficherTuiles(true); }
        });
      }).catch(() => { if (!fini) afficherTuiles(false); });
    }
    if (!webglOK()) afficherTuiles(false);
    else if (vueListe()) afficherTuiles(true);
    else afficher3D();

    return () => { fini = true; if (detruire) detruire(); if (offBL) offBL(); };
  }

  /* =====================================================================
     Scène 3D
     ===================================================================== */
  function scene3D(root, actives, aVenir, info, act) {
    const THREE = window.THREE;
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const petit = Math.min(innerWidth, innerHeight) < 700;
    const W = 2.2, D = 1.6, H = 1.4, T = 0.035, PH = 0.16;
    const ACCENT = 0xE03A14, GRIS = 0x4B5157, ENCRE = '#26303A';

    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
    const outBack = x => { const c1 = 1.55, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    const inOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const outBounce = x => { const n = 7.5625, d = 2.75;
      if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75;
      if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375; return n * (x -= 2.625 / d) * x + .984375; };
    const lerp = (a, b, t) => a + (b - a) * t;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const sombre = () => {
      const t = document.documentElement.dataset.theme;
      return t === 'dark' ? true : t === 'light' ? false : matchMedia('(prefers-color-scheme: dark)').matches;
    };

    /* --- habillage de l'écran --- */
    const canvas = h('canvas', { 'aria-hidden': 'true' });
    const labels = h('div', { class: 'l3d-box' });
    const btnListe = h('button', { class: 'btn sm', type: 'button', onclick: act.liste }, 'Vue liste');
    root.append(canvas, labels,
      h('div', { class: 'h3-head' },
        h('div', null, h('h1', { text: 'SP WORK' }), h('div', { class: 'muted small' }, h('span', { class: 'h3-long', text: 'Les outils du quotidien de SP Emballage · ' }), SP.frDate(SP.today()))),
        btnListe),
      h('div', { class: 'h3-hint', text: 'Touchez une app pour l’ouvrir. Glissez pour faire tourner la caisse.' }));

    /* --- textures --- */
    const cnv = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
    function use(c, n) {
      const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < n; i++) { x.fillStyle = 'rgba(0,0,0,' + Math.random() * .9 + ')'; x.beginPath(); x.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 2.4, 0, 7); x.fill(); }
      x.globalCompositeOperation = 'source-over'; return c;
    }
    function fleches(x, cx, cy, s, col) {
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = s * 0.12;
      for (const dx of [-s * 0.32, s * 0.32]) {
        x.beginPath(); x.moveTo(cx + dx, cy + s * 0.42); x.lineTo(cx + dx, cy - s * 0.2); x.stroke();
        x.beginPath(); x.moveTo(cx + dx - s * 0.2, cy - s * 0.12); x.lineTo(cx + dx, cy - s * 0.42); x.lineTo(cx + dx + s * 0.2, cy - s * 0.12); x.closePath(); x.fill();
      }
      x.fillRect(cx - s * 0.6, cy + s * 0.5, s * 1.2, s * 0.1);
    }
    function icone(x, nom, cx, cy, taille, col, epaisseur) {
      const svg = SP.icon(nom), d = svg.querySelector('path').getAttribute('d');
      x.save(); x.translate(cx - taille / 2, cy - taille / 2); x.scale(taille / 24, taille / 24);
      x.strokeStyle = col; x.lineWidth = epaisseur || 1.8; x.lineCap = 'round'; x.lineJoin = 'round';
      x.stroke(new Path2D(d)); x.restore();
    }
    const tex = c => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; };

    function bois(w, hh, base) {
      const c = cnv(w, hh), x = c.getContext('2d');
      x.fillStyle = base || '#DDBE90'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 70; i++) {
        const y = Math.random() * hh, amp = rnd(2, 10), f = rnd(.004, .02), ph = rnd(0, 6);
        x.strokeStyle = 'rgba(120,78,38,' + rnd(.04, .14) + ')'; x.lineWidth = rnd(.6, 2.2); x.beginPath();
        for (let px = 0; px <= w; px += 8) { const py = y + Math.sin(px * f + ph) * amp; if (px) x.lineTo(px, py); else x.moveTo(px, py); }
        x.stroke();
      }
      for (let k = 0; k < 2; k++) if (Math.random() < .7) {
        const cx = rnd(40, w - 40), cy = rnd(12, hh - 12), r = rnd(4, 9), g = x.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
        g.addColorStop(0, 'rgba(95,58,25,.55)'); g.addColorStop(1, 'rgba(95,58,25,0)'); x.fillStyle = g;
        x.beginPath(); x.ellipse(cx, cy, r * 2.2, r, 0, 0, 7); x.fill();
      }
      for (let i = 0; i < w * hh / 120; i++) { x.fillStyle = 'rgba(80,50,20,' + Math.random() * .06 + ')'; x.fillRect(Math.random() * w, Math.random() * hh, 2, 1); }
      return c;
    }
    // marquage de la face avant : étiquette avec le logo + « WORK » au pochoir
    function texMarquage(logo) {
      const w = 1024, hh = 600, c = cnv(w, hh), x = c.getContext('2d');
      const ink = cnv(w, hh), ix = ink.getContext('2d');
      ix.fillStyle = ENCRE; ix.textAlign = 'center';
      ix.font = '700 210px "Barlow Condensed", "Arial Narrow", sans-serif';
      ix.fillText('WORK', w * 0.5, hh * 0.93);
      fleches(ix, w * 0.89, hh * 0.17, 74, ENCRE);
      use(ink, 2600);
      x.globalAlpha = .85; x.drawImage(ink, 0, 0); x.globalAlpha = 1;
      x.save(); x.translate(w * 0.47, hh * 0.3); x.rotate(-0.025);
      x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(-220, -96, 452, 204);
      x.fillStyle = '#FFFFFF'; x.fillRect(-226, -102, 452, 204);
      if (logo) x.drawImage(logo, -200, -93, 400, 187);
      else { x.fillStyle = '#E03A14'; x.font = '700 90px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('SP EMBALLAGE', 0, 30); }
      x.fillStyle = '#9AA3AA'; for (const sx of [-206, 206]) x.fillRect(sx - 9, -92, 18, 5); // agrafes
      x.restore();
      return c;
    }
    function texMarquageCote() {
      const w = 600, hh = 600, c = cnv(w, hh), x = c.getContext('2d');
      fleches(x, w / 2, hh * 0.42, 220, ENCRE);
      x.fillStyle = ENCRE; x.textAlign = 'center'; x.font = '700 64px "Barlow Condensed", sans-serif'; x.fillText('HAUT', w / 2, hh * 0.88);
      use(c, 1800);
      return tex(c);
    }
    function texMiniCaisse(nom, rouge) {
      const s = 256, c = bois(s, s, '#D9B886'), x = c.getContext('2d');
      x.fillStyle = 'rgba(90,55,25,.55)'; for (let i = 1; i < 4; i++) x.fillRect(0, i * s / 4 - 2, s, 4); // planches
      x.strokeStyle = 'rgba(150,105,60,.95)'; x.lineWidth = 30; x.strokeRect(15, 15, s - 30, s - 30); // tasseaux
      x.strokeStyle = 'rgba(90,55,25,.45)'; x.lineWidth = 2; x.strokeRect(30, 30, s - 60, s - 60);
      x.fillStyle = '#8E989F';
      for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [s, 0, -1, 1], [0, s, 1, -1], [s, s, -1, -1]]) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + dx * 46, cy); x.lineTo(cx, cy + dy * 46); x.closePath(); x.fill(); }
      x.fillStyle = '#4A5156';
      for (const k of [0.3, 0.5, 0.7]) for (const [px, py] of [[k * s, 15], [k * s, s - 15], [15, k * s], [s - 15, k * s]]) { x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
      icone(x, nom, s / 2, s / 2, s * 0.5, rouge ? '#E03A14' : ENCRE, 2.2);
      return tex(use(c, 300));
    }
    function texCalendrier() {
      const w = 512, c = cnv(w, w), x = c.getContext('2d');
      x.fillStyle = '#F4F2EF'; x.fillRect(0, 0, w, w);
      x.fillStyle = '#E03A14'; x.fillRect(0, 0, w, 96);
      x.fillStyle = '#FFFFFF'; x.font = '700 64px "Barlow Condensed", sans-serif'; x.textBaseline = 'middle'; x.fillText('PLANNING', 28, 52);
      const cols = 5, rows = 4, cw = (w - 56) / cols, ch = (w - 140) / rows;
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const px = 28 + k * cw, py = 118 + r * ch;
        x.strokeStyle = 'rgba(38,48,58,.25)'; x.lineWidth = 2; x.strokeRect(px, py, cw - 6, ch - 6);
        if ((r * 3 + k) % 4 !== 1) { x.fillStyle = ['#C69A6B', '#4B5157', '#E03A14'][(r + k) % 3]; x.fillRect(px + 8, py + ch * 0.45, (cw - 22) * (0.4 + ((r + k * 2) % 5) / 8), 14); }
      }
      return tex(c);
    }
    function texItineraire() {
      const s = 512, c = cnv(s, s), x = c.getContext('2d');
      x.fillStyle = '#EEF1F3'; x.fillRect(0, 0, s, s);
      x.strokeStyle = '#C9D2DA'; x.lineWidth = 10;
      for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, i * 100 + 30); x.lineTo(s, i * 90 + 60); x.stroke(); }
      x.strokeStyle = '#E03A14'; x.lineWidth = 16; x.setLineDash([30, 22]); x.lineCap = 'round';
      x.beginPath(); x.moveTo(60, 440); x.bezierCurveTo(140, 240, 330, 420, 420, 120); x.stroke();
      x.setLineDash([]); x.fillStyle = '#4B5157';
      for (const [px, py] of [[60, 440], [235, 330], [420, 120]]) { x.beginPath(); x.arc(px, py, 18, 0, 7); x.fill(); }
      return tex(c);
    }
    function texLivree() {
      const w = 1024, hh = 560, c = cnv(w, hh), x = c.getContext('2d');
      x.fillStyle = '#F6F5F2'; x.fillRect(0, 0, w, hh);
      x.fillStyle = '#E03A14'; x.beginPath(); x.moveTo(0, hh); x.lineTo(0, hh * 0.74);
      x.bezierCurveTo(w * 0.3, hh * 0.62, w * 0.58, hh * 0.98, w, hh * 0.7); x.lineTo(w, hh); x.closePath(); x.fill();
      x.fillStyle = '#4B5157'; x.beginPath(); x.moveTo(0, hh * 0.84);
      x.bezierCurveTo(w * 0.3, hh * 0.73, w * 0.58, hh * 1.06, w, hh * 0.8); x.lineTo(w, hh * 0.87);
      x.bezierCurveTo(w * 0.58, hh * 1.12, w * 0.3, hh * 0.82, 0, hh * 0.92); x.closePath(); x.fill();
      let fs = 170; x.textBaseline = 'alphabetic';
      do { x.font = '700 ' + fs + 'px "Barlow Condensed", "Arial Narrow", sans-serif'; fs -= 6; } while (x.measureText('SP EMBALLAGE').width > w * 0.88 && fs > 60);
      const a = 'SP', b = ' EMBALLAGE', wa = x.measureText(a).width, wb = x.measureText(b).width, sx = (w - wa - wb) / 2;
      x.fillStyle = '#E03A14'; x.fillText(a, sx, hh * 0.47);
      x.fillStyle = '#4B5157'; x.fillText(b, sx + wa, hh * 0.47);
      x.font = '600 46px "Barlow", Arial, sans-serif'; x.textAlign = 'center'; x.fillText('Genas · Saint-Priest', w / 2, hh * 0.6);
      return tex(c);
    }
    function texPorte(logo) {
      const w = 256, hh = 120, c = cnv(w, hh), x = c.getContext('2d');
      x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, hh);
      if (logo) x.drawImage(logo, 8, 4, w - 16, hh - 8);
      return c;
    }
    function texHalo() {
      const c = cnv(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.22, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
    }
    function texFaisceau() {
      const c = cnv(4, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.75, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      x.fillStyle = g; x.fillRect(0, 0, 4, 256); return new THREE.CanvasTexture(c);
    }

    /* --- moteur --- */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, petit ? 1.75 : 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
    let envTex = null;
    if (THREE.RoomEnvironment) { const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; pm.dispose(); scene.environment = envTex; }
    const RB = (w, hh, d, r, sg) => THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, hh, d, sg || 3, r) : new THREE.BoxGeometry(w, hh, d);
    const tHalo = texHalo();
    const halo = (color, taille) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tHalo, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.set(taille, taille, 1); return sp; };
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const monde = new THREE.Group(); scene.add(monde);

    scene.add(new THREE.HemisphereLight(0xFFF6EA, 0x3A4550, envTex ? 0.32 : 0.78));
    const soleil = new THREE.DirectionalLight(0xFFF1DC, envTex ? 1.0 : 1.1);
    soleil.position.set(4, 9, 6); soleil.castShadow = true;
    soleil.shadow.mapSize.set(petit ? 1024 : 2048, petit ? 1024 : 2048);
    Object.assign(soleil.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
    soleil.shadow.bias = -0.0006; scene.add(soleil);
    const contre = new THREE.DirectionalLight(0xA9C4DA, 0.35); contre.position.set(-6, 4, -5); scene.add(contre);

    const sol = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .2 }));
    sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; monde.add(sol);
    const Mat = (color, rough, metal) => new THREE.MeshStandardMaterial({ color, roughness: rough == null ? .85 : rough, metalness: metal || 0 });
    const ombre = m => { m.castShadow = true; m.receiveShadow = true; return m; };

    // palette
    const mPal = Mat(0xCDA676, .9), mPalF = Mat(0xA9824F, .9);
    for (let i = 0; i < 5; i++) { const b = ombre(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.03, 0.34), mPal)); b.position.set(0, PH - 0.015, -1.1 + 0.17 + i * (2.2 - 0.34) / 4); monde.add(b); }
    for (const px of [-1.25, 0, 1.25]) for (const pz of [-0.95, 0, 0.95]) { const k = ombre(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.22), mPalF)); k.position.set(px, 0.08, pz); monde.add(k); }
    for (const pz of [-0.95, 0, 0.95]) { const b = ombre(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.03, 0.22), mPal)); b.position.set(0, 0.015, pz); monde.add(b); }

    // caisse bois
    const tBois = tex(bois(512, 128)), tBoisV = tex(bois(512, 128));
    tBoisV.center.set(.5, .5); tBoisV.rotation = Math.PI / 2;
    const teintes = [0xFFFFFF, 0xF3E7D6, 0xE9D9C3, 0xF8EFE3];
    const mPl = teintes.map(c => new THREE.MeshStandardMaterial({ map: tBois, bumpMap: tBois, bumpScale: 0.004, color: c, roughness: .8 }));
    const mIn = new THREE.MeshStandardMaterial({ map: tBois, color: 0xC9AE88, roughness: .9 });
    const mTas = new THREE.MeshStandardMaterial({ map: tBois, bumpMap: tBois, bumpScale: 0.004, color: 0xD8BE98, roughness: .8 });
    const mTasV = new THREE.MeshStandardMaterial({ map: tBoisV, bumpMap: tBoisV, bumpScale: 0.004, color: 0xD8BE98, roughness: .8 });
    const marqCanvas = texMarquage(null), marqTex = tex(marqCanvas);
    const mMarq = new THREE.MeshStandardMaterial({ map: marqTex, transparent: true, roughness: .85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mMarqCote = new THREE.MeshStandardMaterial({ map: texMarquageCote(), transparent: true, roughness: .85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const logo = new Image(), surLogo = [];
    logo.onload = () => surLogo.forEach(f => f());
    surLogo.push(() => { const x = marqCanvas.getContext('2d'); x.clearRect(0, 0, marqCanvas.width, marqCanvas.height); x.drawImage(texMarquage(logo), 0, 0); marqTex.needsUpdate = true; });

    const caisse = new THREE.Group(); monde.add(caisse);
    const piece = (g, w, hh, d, x, y, z, mat) => { const o = ombre(new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat)); o.position.set(x, y, z); g.add(o); return o; };
    const NPL = 4, JEU = 0.014, HPL = (H - JEU * (NPL - 1)) / NPL, CT = 0.03, CW = 0.1;
    for (let i = 0; i < NPL; i++) {
      const y = i * (HPL + JEU) + HPL / 2;
      for (const sz of [-1, 1]) piece(caisse, W, HPL, T, 0, y, sz * (D / 2 - T / 2), [mPl[(i + 1) % 4], mPl[(i + 1) % 4], mPl[i % 4], mPl[i % 4], sz > 0 ? mPl[i % 4] : mIn, sz > 0 ? mIn : mPl[(i + 2) % 4]]);
      for (const sx of [-1, 1]) piece(caisse, T, HPL, D - 2 * T, sx * (W / 2 - T / 2), y, 0, [sx > 0 ? mPl[(i + 3) % 4] : mIn, sx > 0 ? mIn : mPl[(i + 3) % 4], mPl[i % 4], mPl[i % 4], mPl[i % 4], mPl[i % 4]]);
    }
    piece(caisse, W, T, D, 0, T / 2, 0, mIn);
    // tasseaux des faces avant et arrière
    for (const sz of [-1, 1]) {
      const z = sz * (D / 2 + CT / 2);
      piece(caisse, W + 2 * CT, CW, CT, 0, H - CW / 2, z, mTas);
      piece(caisse, W + 2 * CT, CW, CT, 0, CW / 2, z, mTas);
      for (const sx of [-1, 1]) piece(caisse, CW, H - 2 * CW, CT, sx * (W / 2 + CT - CW / 2), H / 2, z, mTasV);
    }
    // tasseaux et écharpe des côtés
    const LD = D + 2 * CT - 2 * CW, HD = H - 2 * CW;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + CT / 2);
      piece(caisse, CT, CW, D + 2 * CT, x, H - CW / 2, 0, mTas);
      piece(caisse, CT, CW, D + 2 * CT, x, CW / 2, 0, mTas);
      for (const sz of [-1, 1]) piece(caisse, CT, HD, CW, x, H / 2, sz * (D / 2 + CT - CW / 2), mTasV);
      const ech = piece(caisse, CT * 0.9, CW * 0.9, Math.hypot(LD, HD), x + sx * 0.002, H / 2, 0, mTas);
      ech.rotation.x = -Math.atan2(HD, LD) * sx;
    }
    // marquages
    const decal = (w, hh, mat, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; caisse.add(m); };
    decal(W - 2 * CW - 0.06, H - 2 * CW - 0.04, mMarq, 0, H / 2, D / 2 + 0.002, 0);
    decal(W - 2 * CW - 0.06, H - 2 * CW - 0.04, mMarq, 0, H / 2, -D / 2 - 0.002, Math.PI);
    for (const sx of [-1, 1]) decal(D * 0.55, D * 0.55, mMarqCote, sx * (W / 2 + 0.002), H / 2, 0, sx * Math.PI / 2);
    // couvercle, articulé sur l'arête arrière
    const couvercle = new THREE.Group(); couvercle.position.set(0, H, -D / 2 - CT); caisse.add(couvercle);
    const PZ = D + 2 * CT, NC = 5, LC = (PZ - JEU * (NC - 1)) / NC;
    for (let i = 0; i < NC; i++) piece(couvercle, W + 2 * CT, T, LC, 0, T / 2, i * (LC + JEU) + LC / 2, [mPl[i % 4], mPl[i % 4], mPl[(i + 2) % 4], mIn, mPl[i % 4], mPl[i % 4]]);
    for (const bx of [-1, 0, 1]) piece(couvercle, CW, CT, PZ, bx * (W / 2 - CW / 2 - 0.02), T + CT / 2, PZ / 2, mTasV);
    // équerres acier et clous
    const mAcier = new THREE.MeshStandardMaterial({ color: 0xA3ADB4, metalness: .85, roughness: .36 });
    const mClou = new THREE.MeshStandardMaterial({ color: 0x59626A, metalness: .9, roughness: .42 });
    const gClou = new THREE.CylinderGeometry(0.012, 0.012, 0.007, 10);
    const clous = [], clousCouv = [];
    const XE = W / 2 + CT, ZE = D / 2 + CT, EQ = 0.17;
    const gEq = new THREE.BoxGeometry(EQ, EQ, 0.006);
    for (const sz of [-1, 1]) {
      const z = sz * (ZE + 0.004);
      for (const y of [CW / 2, H - CW / 2]) for (let k = 0; k < 6; k++) clous.push([-W / 2 + 0.3 + k * (W - 0.6) / 5, y, z, 'z']);
      for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) clous.push([sx * (XE - CW / 2), CW + 0.14 + k * (H - 2 * CW - 0.28) / 3, z, 'z']);
    }
    for (const sx of [-1, 1]) for (const y of [CW / 2, H - CW / 2]) for (let k = 0; k < 4; k++) clous.push([sx * (XE + 0.004), y, -D / 2 + 0.3 + k * (D - 0.6) / 3, 'x']);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [EQ / 2, H - EQ / 2]) {
      const a = ombre(new THREE.Mesh(gEq, mAcier)); a.position.set(sx * (XE - EQ / 2), y, sz * (ZE + 0.003)); caisse.add(a);
      const b = ombre(new THREE.Mesh(gEq, mAcier)); b.position.set(sx * (XE + 0.003), y, sz * (ZE - EQ / 2)); b.rotation.y = Math.PI / 2; caisse.add(b);
      clous.push([sx * (XE - EQ * 0.55), y, sz * (ZE + 0.008), 'z'], [sx * (XE + 0.008), y, sz * (ZE - EQ * 0.55), 'x']);
    }
    for (const bx of [-1, 0, 1]) for (let k = 0; k < 6; k++) clousCouv.push([bx * (W / 2 - CW / 2 - 0.02), T + CT + 0.003, 0.08 + k * (PZ - 0.16) / 5, 'y']);
    function clouer(groupe, liste) {
      const im = new THREE.InstancedMesh(gClou, mClou, liste.length), o = new THREE.Object3D();
      liste.forEach((c, i) => { o.position.set(c[0], c[1], c[2]); o.rotation.set(c[3] === 'z' ? Math.PI / 2 : 0, 0, c[3] === 'x' ? Math.PI / 2 : 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      groupe.add(im);
    }
    clouer(caisse, clous); clouer(couvercle, clousCouv);
    caisse.traverse(o => { o.userData.caisse = true; });

    // lumière intérieure, faisceau, poussières
    const lueur = new THREE.PointLight(0xFFC46E, 0, 6, 1.6); lueur.position.set(0, H * 0.65, 0); caisse.add(lueur);
    const haloCaisse = halo(0xFFC46E, 2.6); haloCaisse.position.set(0, H + 0.15, 0); caisse.add(haloCaisse);
    const mFaisceau = new THREE.MeshBasicMaterial({ map: texFaisceau(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const faisceau = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.78, 3.4, 48, 1, true), mFaisceau); faisceau.position.set(0, H + 1.7, 0); caisse.add(faisceau);
    const ND = 160, dPos = new Float32Array(ND * 3), dV = new Float32Array(ND);
    for (let i = 0; i < ND; i++) { const a = Math.random() * 7, r = Math.sqrt(Math.random()) * 0.85; dPos[i * 3] = Math.cos(a) * r; dPos[i * 3 + 1] = H + Math.random() * 3.2; dPos[i * 3 + 2] = Math.sin(a) * r; dV[i] = rnd(.15, .5); }
    const gPous = new THREE.BufferGeometry(); gPous.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    const mPous = new THREE.PointsMaterial({ size: 0.035, transparent: true, opacity: 0, depthWrite: false });
    caisse.add(new THREE.Points(gPous, mPous));
    function theme() {
      const dk = sombre();
      mFaisceau.blending = dk ? THREE.AdditiveBlending : THREE.NormalBlending; mFaisceau.color.set(dk ? 0xFFC76A : 0xF0B04A); mFaisceau.needsUpdate = true;
      mPous.blending = dk ? THREE.AdditiveBlending : THREE.NormalBlending; mPous.color.set(dk ? 0xFFE3A8 : 0xB07A2E); mPous.needsUpdate = true;
      sol.material.opacity = dk ? .4 : .2;
    }
    theme();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener ? mq.addEventListener('change', theme) : mq.addListener(theme);

    // frisure de bois (calage)
    const NP = petit ? 60 : 110;
    const chips = new THREE.InstancedMesh(new THREE.TorusGeometry(0.06, 0.013, 5, 16, Math.PI * 1.7), Mat(0xE4CA9C, .8), NP);
    chips.castShadow = true; chips.receiveShadow = true; monde.add(chips);
    const P = [], mannequin = new THREE.Object3D();
    function chipsInit() {
      P.length = 0;
      for (let i = 0; i < NP; i++) P.push({ x: rnd(-W / 2 + .18, W / 2 - .18), y: PH + H * rnd(.55, .88), z: rnd(-D / 2 + .18, D / 2 - .18), vx: 0, vy: 0, vz: 0, rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), wx: 0, wy: 0, wz: 0, s: rnd(.8, 1.25), repos: true });
    }
    function eclat() {
      for (const p of P) { const a = Math.random() * 7, v = rnd(.9, 2.7); p.vx = Math.cos(a) * v; p.vz = Math.sin(a) * v; p.vy = rnd(3.4, 6.2); p.wx = rnd(-9, 9); p.wy = rnd(-9, 9); p.wz = rnd(-9, 9); p.repos = false; }
    }
    function chipsPas(dt) {
      for (const p of P) {
        if (p.repos) continue;
        p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        const dedans = Math.abs(p.x) < W / 2 - 0.05 && Math.abs(p.z) < D / 2 - 0.05, palette = Math.abs(p.x) < 1.4 && Math.abs(p.z) < 1.1;
        const fond = dedans ? PH + H * 0.62 : palette ? PH + 0.03 : 0.03;
        if (p.y < fond) { p.y = fond; if (Math.abs(p.vy) > 0.9) { p.vy = -p.vy * 0.33; p.vx *= .55; p.vz *= .55; p.wx *= .5; p.wy *= .5; p.wz *= .5; } else p.repos = true; }
      }
    }
    function chipsDessin() {
      for (let i = 0; i < NP; i++) { const p = P[i]; mannequin.position.set(p.x, p.y, p.z); mannequin.rotation.set(p.rx, p.ry, p.rz); mannequin.scale.setScalar(p.s); mannequin.updateMatrix(); chips.setMatrixAt(i, mannequin.matrix); }
      chips.instanceMatrix.needsUpdate = true;
    }

    /* --- maquettes des apps --- */
    const papier = Mat(0xF2EFEA, .8);
    function ajout(g, geo, mat, x, y, z) { const m = ombre(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); g.add(m); return m; }
    function camion() {
      const g = new THREE.Group();
      const peinture = new THREE.MeshPhysicalMaterial({ color: 0xC22A0C, metalness: .05, roughness: .35, clearcoat: 1, clearcoatRoughness: .1 });
      const blanc = new THREE.MeshPhysicalMaterial({ color: 0xF6F5F2, metalness: .05, roughness: .35, clearcoat: .7, clearcoatRoughness: .2 });
      const noir = Mat(0x1B2026, .6, .2), pneu = Mat(0x15191D, .92);
      const vitre = new THREE.MeshPhysicalMaterial({ color: 0x0C151C, metalness: .9, roughness: .05, clearcoat: 1 });
      const chrome = new THREE.MeshStandardMaterial({ color: 0xD3DADF, metalness: 1, roughness: .16 });
      const phare = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFFE7B0, emissiveIntensity: 0.15, roughness: .2 });
      const feu = new THREE.MeshStandardMaterial({ color: 0x8A1408, emissive: 0xFF2A10, emissiveIntensity: 0.4, roughness: .3 });
      // châssis et caisse fourgon
      ajout(g, new THREE.BoxGeometry(1.3, 0.06, 0.3), noir, 0.02, 0.15, 0);
      const L = 0.92, HC = 0.54, LG = 0.44, XC = -0.2, YC = 0.19 + HC / 2;
      ajout(g, RB(L, HC, LG, 0.025), blanc, XC, YC, 0);
      const mLiv = new THREE.MeshStandardMaterial({ map: texLivree(), roughness: .38, polygonOffset: true, polygonOffsetFactor: -2 });
      for (const sz of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.05, HC - 0.05), mLiv); d.position.set(XC, YC, sz * (LG / 2 + 0.002)); d.rotation.y = sz > 0 ? 0 : Math.PI; g.add(d); }
      for (const sz of [-1, 1]) ajout(g, new THREE.BoxGeometry(0.012, HC - 0.06, 0.012), chrome, XC - L / 2 - 0.004, YC, sz * 0.1);
      for (const sz of [-1, 1]) ajout(g, new THREE.BoxGeometry(0.012, 0.035, 0.06), feu, XC - L / 2 - 0.006, 0.23, sz * 0.17);
      // cabine
      const XK = 0.47, HK = 0.46, YK = 0.18 + HK / 2;
      ajout(g, RB(0.36, HK, 0.44, 0.06, 4), peinture, XK, YK, 0);
      const def = ajout(g, RB(0.3, 0.09, 0.42, 0.035), peinture, XK - 0.02, YK + HK / 2 + 0.03, 0); def.rotation.z = 0.28;
      const pb = ajout(g, RB(0.022, 0.19, 0.38, 0.008), vitre, XK + 0.178, YK + 0.09, 0); pb.rotation.z = -0.1;
      for (const sz of [-1, 1]) ajout(g, new THREE.BoxGeometry(0.17, 0.15, 0.006), vitre, XK + 0.04, YK + 0.1, sz * 0.222);
      const mPorte = new THREE.MeshStandardMaterial({ map: tex(texPorte(null)), roughness: .4, polygonOffset: true, polygonOffsetFactor: -2 });
      surLogo.push(() => { mPorte.map.image = texPorte(logo); mPorte.map.needsUpdate = true; });
      for (const sz of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.094), mPorte); d.position.set(XK - 0.01, YK - 0.07, sz * 0.2235); d.rotation.y = sz > 0 ? 0 : Math.PI; g.add(d); }
      for (const sz of [-1, 1]) ajout(g, new THREE.BoxGeometry(0.035, 0.01, 0.008), chrome, XK - 0.09, YK + 0.0, sz * 0.224);
      // face avant : calandre, phares, pare-chocs
      ajout(g, new THREE.BoxGeometry(0.012, 0.12, 0.26), noir, XK + 0.182, YK - 0.1, 0);
      for (let k = 0; k < 4; k++) ajout(g, new THREE.BoxGeometry(0.014, 0.008, 0.25), chrome, XK + 0.184, YK - 0.15 + k * 0.032, 0);
      const halos = [];
      for (const sz of [-1, 1]) {
        ajout(g, RB(0.016, 0.05, 0.075, 0.01), phare, XK + 0.183, YK - 0.115, sz * 0.165);
        const hl = halo(0xFFE2A6, 0.42); hl.position.set(XK + 0.22, YK - 0.115, sz * 0.165); g.add(hl); halos.push(hl);
      }
      ajout(g, RB(0.06, 0.07, 0.47, 0.02), noir, XK + 0.19, 0.2, 0);
      for (const sz of [-1, 1]) {
        ajout(g, new THREE.BoxGeometry(0.06, 0.012, 0.012), noir, XK + 0.12, YK + 0.12, sz * 0.25);
        ajout(g, RB(0.02, 0.1, 0.04, 0.008), noir, XK + 0.15, YK + 0.1, sz * 0.27);
      }
      // roues
      const roues = [];
      const gPneu = new THREE.CylinderGeometry(0.1, 0.1, 0.075, 28); gPneu.rotateX(Math.PI / 2);
      const gJante = new THREE.CylinderGeometry(0.062, 0.062, 0.08, 20); gJante.rotateX(Math.PI / 2);
      const gMoyeu = new THREE.CylinderGeometry(0.024, 0.024, 0.086, 12); gMoyeu.rotateX(Math.PI / 2);
      for (const wx of [XK, -0.38, -0.56]) for (const sz of [-1, 1]) {
        const r = new THREE.Group(); r.position.set(wx, 0.1, sz * 0.19); g.add(r);
        ajout(r, gPneu, pneu, 0, 0, 0); ajout(r, gJante, chrome, 0, 0, 0); ajout(r, gMoyeu, noir, 0, 0, 0);
        for (let k = 0; k < 5; k++) { const b = ajout(r, new THREE.BoxGeometry(0.012, 0.012, 0.084), noir, Math.cos(k * 1.2566) * 0.042, Math.sin(k * 1.2566) * 0.042, 0); b.userData.boulon = true; }
        roues.push(r);
      }
      for (const sz of [-1, 1]) ajout(g, new THREE.BoxGeometry(0.42, 0.025, 0.085), noir, -0.47, 0.225, sz * 0.19);
      g.userData = { roues, phare, halos, feu, taille: 1 };
      return g;
    }
    function tournee() {
      const g = new THREE.Group();
      const socle = ajout(g, new THREE.CylinderGeometry(0.38, 0.38, 0.045, 48), [Mat(0xCDD5DB, .5, .2), new THREE.MeshStandardMaterial({ map: texItineraire(), roughness: .6 }), Mat(0xCDD5DB, .5, .2)], 0, 0.022, 0);
      socle.rotation.y = 0.3;
      const laque = new THREE.MeshPhysicalMaterial({ color: ACCENT, metalness: .2, roughness: .25, clearcoat: 1, clearcoatRoughness: .08 });
      const pin = new THREE.Group(); pin.position.set(0.05, 0.045, 0.02); g.add(pin);
      ajout(pin, new THREE.ConeGeometry(0.085, 0.26, 32), laque, 0, 0.17, 0).rotation.x = Math.PI;
      ajout(pin, new THREE.SphereGeometry(0.12, 32, 24), laque, 0, 0.36, 0);
      ajout(pin, new THREE.SphereGeometry(0.05, 24, 16), Mat(0xFFFFFF, .3), 0, 0.37, 0.085);
      const onde = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 48), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false }));
      onde.rotation.x = -Math.PI / 2; onde.position.set(0.05, 0.047, 0.02); g.add(onde);
      g.userData.pin = pin; g.userData.onde = onde;
      return g;
    }
    function calendrier() {
      const g = new THREE.Group(), face = new THREE.MeshStandardMaterial({ map: texCalendrier(), roughness: .8 });
      ajout(g, new THREE.BoxGeometry(0.58, 0.58, 0.1), [papier, papier, papier, papier, face, papier], 0, 0.36, 0);
      const ag = new THREE.TorusGeometry(0.055, 0.013, 8, 20); ag.rotateY(Math.PI / 2);
      for (const rx of [-0.16, 0.16]) ajout(g, ag, new THREE.MeshStandardMaterial({ color: 0xD3DADF, metalness: 1, roughness: .2 }), rx, 0.66, 0);
      return g;
    }
    function equipe() {
      const g = new THREE.Group();
      const perso = (x, hh, c) => { ajout(g, new THREE.CylinderGeometry(0.07, 0.1, hh, 22), Mat(c, .7), x, hh / 2, 0); ajout(g, new THREE.SphereGeometry(0.075, 20, 16), Mat(c, .6), x, hh + 0.09, 0); };
      perso(-0.18, 0.27, 0xC69A6B); perso(0, 0.34, ACCENT); perso(0.18, 0.25, GRIS);
      return g;
    }
    function caisseApp(nomIcone, taille, enService) {
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ map: texMiniCaisse(nomIcone, enService), roughness: .85 });
      const dessus = new THREE.MeshStandardMaterial({ map: tBois, color: 0xE9D9C3, roughness: .85 });
      ajout(g, new THREE.BoxGeometry(taille, taille * 0.86, taille), [m, m, dessus, dessus, m, m], 0, taille * 0.43, 0);
      for (const bx of [-1, 1]) ajout(g, new THREE.BoxGeometry(taille * 0.16, 0.012, taille + 0.01), mTasV, bx * taille * 0.32, taille * 0.86 + 0.006, 0);
      return g;
    }
    const MAQUETTES = { livraison: camion, 'ma-tournee': tournee, planning: calendrier, rh: equipe };

    /* --- les apps dans la scène --- */
    const btn = (cls, enfants, onclick) => { const b = h('button', { class: 'l3d ' + cls, type: 'button', tabindex: '-1', onclick }, enfants); labels.appendChild(b); return b; };
    const mods = [];
    actives.forEach((a, i) => {
      const g = MAQUETTES[a.id] ? MAQUETTES[a.id]() : caisseApp(a.icone, 0.5, true);
      g.visible = false; scene.add(g);
      const pill = a.id === 'livraison' ? info.pill() : h('span', { class: 'pill ok', text: 'En service' });
      const lb = btn('actif', [h('b', { text: a.nom }), pill], () => ouvrir(mods.find(m => m.app === a)));
      mods.push({ app: a, actif: true, g, lb, rang: i, f: 0 });
    });
    aVenir.forEach((a, i) => {
      const g = caisseApp(a.icone, 0.42, false); g.visible = false; monde.add(g);
      const lb = btn('soon', [h('b', { text: a.nom }), h('span', { class: 'small muted', text: 'À construire' })], () => act.fiche(a));
      mods.push({ app: a, actif: false, g, lb, rang: i, f: 0 });
    });
    mods.forEach((m, k) => m.g.traverse(o => { o.userData.mod = k; o.castShadow = false; }));
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (mt.isMeshStandardMaterial && !mt.isMeshPhysicalMaterial && mt.metalness < 0.5) mt.envMapIntensity = 0.5; }); });
    logo.src = 'logo.png';

    let ouverture = null; // { m, t }
    function ouvrir(m) {
      if (!m || ouverture) return;
      if (reduit) { act.ouvrir(m.app.id); return; }
      ouverture = { m, t: performance.now() / 1000 };
    }

    /* --- interactions --- */
    let lacet = 0, vit = 0, glisse = null;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const onDown = e => { glisse = { x: e.clientX, lx: e.clientX, d: 0 }; try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* rien */ } };
    const onMove = e => { if (!glisse) return; const dx = e.clientX - glisse.lx; glisse.lx = e.clientX; glisse.d += Math.abs(dx); lacet += dx * 0.008; vit = dx * 0.008; };
    const onUp = e => {
      if (!glisse) return;
      if (glisse.d < 6) {
        const r = canvas.getBoundingClientRect();
        ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const cibles = mods.filter(m => m.g.visible).map(m => m.g).concat(caisse);
        const hit = ray.intersectObjects(cibles, true)[0];
        if (hit && hit.object.userData.mod != null) { const m = mods[hit.object.userData.mod]; m.actif ? ouvrir(m) : act.fiche(m.app); }
        else if (hit && tempsScene() > 5) rejouer();
        vit = 0;
      }
      glisse = null;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', () => { glisse = null; });
    let sourisX = 0, sourisY = 0, lisX = 0, lisY = 0;
    const onSurvol = e => { if (e.pointerType !== 'mouse' || glisse) return; const r = canvas.getBoundingClientRect(); sourisX = (e.clientX - r.left) / r.width * 2 - 1; sourisY = (e.clientY - r.top) / r.height * 2 - 1; };
    const onSortie = () => { sourisX = 0; sourisY = 0; };
    canvas.addEventListener('pointermove', onSurvol); canvas.addEventListener('pointerleave', onSortie);

    /* --- cadrage --- */
    let portrait = false, rAnneau = 2.9, ecart = 1.6;
    const camPos = new THREE.Vector3(), camVise = new THREE.Vector3(), camOff = new THREE.Vector3();
    function cadrer() {
      const w = root.clientWidth || 1, hh = root.clientHeight || 1, a = w / hh;
      renderer.setSize(w, hh, false); camera.aspect = a;
      portrait = a < 0.85;
      if (portrait) { camera.fov = 50; rAnneau = 1.85; ecart = 1.55; camPos.set(0, 4.0, 8.7); camVise.set(0, 1.6, 0); }
      else { camera.fov = 38; rAnneau = 2.9; ecart = 1.6; camPos.set(0, 4.1, 9.6); camVise.set(0, 1.3, 0); }
      camera.position.copy(camPos); camera.lookAt(camVise);
      const n = actives.length; if (n > 3) ecart *= 3 / n;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(cadrer); ro.observe(root); cadrer();

    /* --- chronologie --- */
    let t0 = 0, eclate = false, phase = 0, dernier = performance.now() / 1000, raf = 0;
    const tempsScene = () => performance.now() / 1000 - t0;
    function rejouer(court) {
      t0 = performance.now() / 1000; eclate = false; ouverture = null;
      chipsInit();
      if (reduit) { t0 -= 9; eclat(); eclate = true; for (let i = 0; i < 360; i++) chipsPas(1 / 60); }
      else if (court) { t0 -= 3.0; eclat(); eclate = true; for (let i = 0; i < 360; i++) chipsPas(1 / 60); }
    }
    rejouer(dejaJoue); dejaJoue = true;

    const v = new THREE.Vector3(), dir = new THREE.Vector3(), cible = new THREE.Vector3(), depart = new THREE.Vector3();
    const angLerp = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

    function image() {
      raf = requestAnimationFrame(image);
      const now = performance.now() / 1000, dt = Math.min(now - dernier, 1 / 30); dernier = now;
      const t = now - t0;
      if (!glisse) { lacet += vit; vit *= 0.93; }
      monde.rotation.y = lacet;

      // caméra : plongée d'entrée, secousse à l'atterrissage, parallaxe au survol
      const ci = reduit ? 1 : inOut(prog(t, 0, 3.6));
      lisX += (sourisX - lisX) * 0.05; lisY += (sourisY - lisY) * 0.05;
      camOff.copy(camPos).sub(camVise);
      const rc = camOff.length() * (1 - (1 - ci) * 0.22);
      const az = Math.atan2(camOff.x, camOff.z) + (1 - ci) * 0.9 + lisX * 0.12;
      const el = clamp(Math.asin(camOff.y / camOff.length()) + (1 - ci) * 0.38 - lisY * 0.06, 0.05, 1.35);
      camera.position.set(camVise.x + rc * Math.cos(el) * Math.sin(az), camVise.y + rc * Math.sin(el), camVise.z + rc * Math.cos(el) * Math.cos(az));
      if (!reduit) {
        const choc = (t > 0.364 ? 0.07 * Math.exp(-(t - 0.364) * 11) : 0) + (t > 0.727 ? 0.025 * Math.exp(-(t - 0.727) * 13) : 0);
        camera.position.y += Math.sin(now * 75) * choc;
      }
      camera.lookAt(camVise);

      const pc = prog(t, 0, 1.0);
      caisse.position.y = PH + (1 - outBounce(pc)) * 3.6; caisse.rotation.y = (1 - inOut(pc)) * 0.5;
      // le couvercle force sur ses pointes, saute, puis bascule en arrière
      const tremble = t > 1.15 && t < 1.95 && !reduit ? prog(t, 1.15, 1.95) : 0;
      const ouvre = outBack(prog(t, 1.95, 2.9));
      couvercle.position.y = H + (tremble ? Math.abs(Math.sin(now * 48)) * 0.035 * tremble : 0) + Math.sin(prog(t, 1.95, 2.5) * Math.PI) * 0.18;
      couvercle.rotation.z = tremble ? Math.sin(now * 37) * 0.012 * tremble : 0;
      couvercle.rotation.x = -2.3 * ouvre;

      const allume = prog(t, 2.3, 3.3), pouls = reduit ? 1 : 0.85 + 0.15 * Math.sin(now * 2.2);
      lueur.intensity = 1.7 * allume * pouls;
      haloCaisse.material.opacity = (sombre() ? 0.6 : 0.2) * allume * pouls;
      mFaisceau.opacity = (sombre() ? 0.5 : 0.28) * allume * pouls;
      mPous.opacity = 0.9 * allume;
      if (allume > 0 && !reduit) { for (let i = 0; i < ND; i++) { dPos[i * 3 + 1] += dV[i] * dt; if (dPos[i * 3 + 1] > H + 3.4) dPos[i * 3 + 1] = H; } gPous.attributes.position.needsUpdate = true; }

      if (!eclate && t > 2.6) { eclat(); eclate = true; }
      chipsPas(dt); chipsDessin();

      if (t > 4.4 && !reduit) phase += dt * 0.16;
      camera.getWorldDirection(dir);
      cible.copy(camera.position).addScaledVector(dir, portrait ? 5.2 : 4.0);
      depart.set(0, PH + H * 0.5, 0); monde.localToWorld(depart);
      const lw = root.clientWidth, lh = root.clientHeight;

      mods.forEach(m => {
        const st = m.actif ? 3.05 + m.rang * 0.2 : 3.45 + m.rang * 0.12;
        const p = prog(t, st, st + 1.1);
        if (p <= 0) { m.g.visible = false; m.lb.classList.remove('on'); m.lb.tabIndex = -1; return; }
        m.g.visible = true;
        const e = outBack(p), saut = Math.sin(Math.min(p, 1) * Math.PI) * 0.9;
        const flotte = reduit ? 0 : Math.sin(now * 1.3 + m.rang * 1.7) * 0.07;
        let x, y, z, rotY, echelle;
        if (m.actif) {
          const n = actives.length, k = m.rang - (n - 1) / 2, centre = n >= 3 && Math.abs(k) < 0.5;
          const ex = portrait && n >= 3 ? 1.2 : ecart;
          const ox = k * ex, oy = PH + H + (portrait ? 1.15 : 0.95) + flotte + (centre ? 0.4 : 0), oz = centre ? 0.5 : 0.9;
          x = lerp(depart.x, ox, e); y = lerp(depart.y, oy, e) + saut; z = lerp(depart.z, oz, e);
          rotY = (m.app.id === 'livraison' ? -0.45 : 0.25) + (reduit ? 0 : Math.sin(now * 0.8 + m.rang) * 0.22);
          echelle = 0.25 + 0.75 * Math.min(1, p);
          const ud = m.g.userData;
          let vitRoues = reduit ? 0 : 4;
          if (ud.pin) ud.pin.position.y = 0.045 + (reduit ? 0 : Math.abs(Math.sin(now * 2.4)) * 0.06);
          if (ud.onde) { const c = (now * 0.7) % 1; ud.onde.scale.setScalar(1 + c * 4); ud.onde.material.opacity = reduit ? 0 : 0.7 * (1 - c); }
          if (ud.phare) { const on = prog(t, st + 1.0, st + 1.4); const clig = on > 0 && on < 1 ? (Math.sin(now * 40) > 0 ? 1 : 0.3) : 1; ud.phare.emissiveIntensity = 0.15 + 2.2 * on * clig; ud.halos.forEach(hl => { hl.material.opacity = (sombre() ? 0.9 : 0.55) * on * clig; }); }
          // ouverture : le camion démarre et sort de l'écran, les autres apps viennent vers l'écran
          if (ouverture && ouverture.m === m) {
            const dtO = now - ouverture.t;
            if (ud.roues) {
              const q = prog(dtO, 0.12, 0.8), d = q * q * 7;
              x += Math.cos(rotY) * d; z -= Math.sin(rotY) * d; vitRoues = 4 + q * 40;
              ud.feu.emissiveIntensity = 2.5;
              if (dtO > 0.8) { const id = m.app.id; ouverture = null; act.ouvrir(id); return; }
            } else {
              const q = inOut(prog(dtO, 0, 0.5));
              x = lerp(x, cible.x, q); y = lerp(y, cible.y - 0.3, q); z = lerp(z, cible.z, q); echelle *= 1 + 1.4 * q;
              if (dtO > 0.55) { const id = m.app.id; ouverture = null; act.ouvrir(id); return; }
            }
          }
          if (ud.roues) ud.roues.forEach(r => { r.rotation.z -= dt * vitRoues; });
          m.g.position.set(x, y, z); m.g.rotation.y = rotY; m.g.scale.setScalar(echelle * (ud.taille || 1) * (portrait && ud.roues ? 0.8 : 1));
        } else {
          const n = aVenir.length, phi = m.rang * (Math.PI * 2 / n) + phase;
          const ox = Math.sin(phi) * rAnneau, oz = Math.cos(phi) * rAnneau, oy = PH + 0.55 + flotte;
          const dl = new THREE.Vector3(); dl.copy(depart); monde.worldToLocal(dl);
          x = lerp(dl.x, ox, e); y = lerp(dl.y, oy, e) + saut; z = lerp(dl.z, oz, e);
          m.g.position.set(x, y, z); m.g.rotation.y = phi + (reduit ? 0 : Math.sin(now * 0.9 + m.rang) * 0.25);
          m.g.scale.setScalar(0.25 + 0.75 * Math.min(1, p));
        }
        // étiquette
        v.set(0, m.actif ? 0.95 : 0.85, 0); m.g.localToWorld(v);
        const devant = m.actif || (m.g.getWorldPosition(dir.clone()).z > -0.2);
        v.project(camera);
        const on = p >= 1 && devant && v.z < 1 && !(ouverture && ouverture.m === m);
        m.lb.classList.toggle('on', on); m.lb.tabIndex = on ? 0 : -1;
        m.lb.style.transform = 'translate(' + clamp((v.x * 0.5 + 0.5) * lw, 56, lw - 56) + 'px,' + ((-v.y * 0.5 + 0.5) * lh) + 'px) translate(-50%,-100%)';
      });
      camera.getWorldDirection(dir);
      renderer.render(scene, camera);
    }
    image();

    return function detruire() {
      cancelAnimationFrame(raf); ro.disconnect();
      mq.removeEventListener ? mq.removeEventListener('change', theme) : mq.removeListener(theme);
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (mt.map) mt.map.dispose(); mt.dispose(); });
      });
      if (envTex) envTex.dispose(); tHalo.dispose();
      canvas.removeEventListener('pointermove', onSurvol); canvas.removeEventListener('pointerleave', onSortie);
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* rien */ }
    };
  }

  SP.registerApp({ id: 'accueil', nom: 'Accueil', mount });
  SP.start();
})();
