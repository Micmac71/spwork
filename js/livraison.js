/* SP WORK : app Livraison (clients et points de livraison, bons de livraison, tournée optimisée sur carte). */
(function () {
  'use strict';
  const SP = window.SP, h = SP.h, store = SP.store, geo = SP.geo;

  const SITES = {
    'genas': { nom: 'Genas', adresse: '10 rue Lionel Terray, ZI Revoisson', cp: '69740', ville: 'Genas' },
    'saint-priest': { nom: 'Saint-Priest', adresse: '16 rue Alexandre Grammont, ZI Maréchal', cp: '69800', ville: 'Saint-Priest' }
  };
  const DEF = { vitesse: 55, arret: 20, coef: 1.3 };
  const hasPos = p => p && typeof p.lat === 'number' && typeof p.lon === 'number';
  const adr = p => [p.adresse, [p.cp, p.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const prefs = { get(k, d) { try { return localStorage.getItem('spwork.' + k) || d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('spwork.' + k, v); } catch (e) { /* sans mémoire locale */ } } };

  let S = null;   // état de l'app montée

  function mount(main) {
    S = {
      tab: prefs.get('lv.tab', 'tournee'), site: prefs.get('lv.site', 'genas'), date: SP.today(), vueBL: 'jour',
      clients: new Map(), blsJour: new Map(), attente: new Map(), tournees: new Map(), reglages: {},
      charge: { clients: false, bls: false }, lent: false, sel: null, filtre: '', map: null, subs: [], subsDate: []
    };
    if (!SITES[S.site]) S.site = 'genas';
    const st = S;
    const dateIn = h('input', { type: 'date', id: 'lv-date', value: S.date, 'aria-label': 'Date de livraison', onchange: () => { if (dateIn.value) setDate(dateIn.value); } });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Site de départ' }, Object.keys(SITES).map(k =>
      h('button', { type: 'button', 'data-site': k, onclick: () => { S.site = k; prefs.set('lv.site', k); S.sel = null; syncBar(); if (S.map) S.map.fit(); refresh(); } }, SITES[k].nom)));
    const bar = h('div', { class: 'lv-bar' },
      h('div', { class: 'lv-date' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Jour précédent', onclick: () => setDate(SP.addDays(S.date, -1)) }, SP.icon('left')),
        dateIn,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Jour suivant', onclick: () => setDate(SP.addDays(S.date, 1)) }, SP.icon('right'))),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => setDate(SP.today()) }, 'Aujourd\'hui'),
      h('span', { class: 'grow' }), seg,
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Réglages de la livraison', onclick: openReglages }, SP.icon('gear')));
    const body = h('div', { class: 'lv-body' });
    const tabs = h('div', { class: 'lv-tabs', role: 'tablist' }, [['tournee', 'Tournée', 'route'], ['bl', 'Bons de livraison', 'doc'], ['clients', 'Clients', 'users']].map(t =>
      h('button', { type: 'button', role: 'tab', 'data-tab': t[0], onclick: () => { S.tab = t[0]; prefs.set('lv.tab', t[0]); showTab(); } }, SP.icon(t[2]), h('span', { text: t[1] }))));
    main.appendChild(h('div', { class: 'lv' }, bar, body, tabs));
    S.el = { body, tabs, seg, dateIn };

    function syncBar() {
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.site === S.site)));
      tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
      dateIn.value = S.date;
    }
    S.syncBar = syncBar;

    S.subs.push(store.watch({ coll: 'clients' }, (m, i) => { if (m) { st.clients = m; st.charge.clients = true; } else st.charge.clients = true; refresh(); }));
    S.subs.push(store.watch({ coll: 'reglages' }, m => { if (m) { st.reglages = m.get('livraison') || {}; refresh(); } }));
    S.subs.push(store.watch({ coll: 'bls', where: ['statut', '==', 'a-livrer'] }, m => { if (m) { st.attente = m; refresh(); } }));
    subDate();
    const slow = setTimeout(() => { if (S === st && !(st.charge.clients && st.charge.bls)) { st.lent = true; refresh(); } }, 10000);
    geo.load().then(() => { if (S === st) refresh(); }, () => SP.toast('Fond de carte indisponible : la localisation automatique est désactivée.', true));
    showTab();
    return () => { clearTimeout(slow); st.subs.concat(st.subsDate).forEach(f => f()); if (st.map) st.map.destroy(); if (S === st) S = null; };
  }

  function subDate() {
    const st = S;
    st.subsDate.forEach(f => f()); st.subsDate = []; st.charge.bls = false; st.blsJour = new Map(); st.tournees = new Map();
    st.subsDate.push(store.watch({ coll: 'bls', where: ['date', '==', st.date] }, m => { if (S !== st) return; if (m) st.blsJour = m; st.charge.bls = true; refresh(); }));
    st.subsDate.push(store.watch({ coll: 'tournees', where: ['date', '==', st.date] }, m => { if (S !== st) return; if (m) { st.tournees = m; refresh(); } }));
  }
  function setDate(d) { S.date = d; S.sel = null; S.syncBar(); subDate(); if (S.map) S.map.fit(); refresh(); }

  /* ---------- données dérivées ---------- */
  function reglage(k) { const v = Number(S.reglages[k]); return v > 0 ? v : DEF[k]; }
  function depot(site) {
    const d = Object.assign({}, SITES[site], (S.reglages.depots || {})[site] || {});
    if (!hasPos(d)) { const g = geo.locate(d.cp, d.ville); if (g) { d.lat = g.lat; d.lon = g.lon; } }
    return d;
  }
  function lieuBL(bl) {
    const c = S.clients.get(bl.clientId);
    const client = c ? c.nom : (bl.clientNom || 'Client à préciser');
    if (bl.lieu && (bl.lieu.adresse || bl.lieu.ville || hasPos(bl.lieu)))
      return Object.assign({ client, libelle: 'Lieu propre à ce BL' }, bl.lieu, { key: 'x:' + SP.norm([client, bl.lieu.adresse, bl.lieu.cp, bl.lieu.ville].join(' ')).replace(/ /g, '-') });
    const pts = (c && c.points) || [];
    const p = pts.find(x => x.id === bl.pointId) || pts[0];
    if (p) return Object.assign({ client }, p, { key: 'p:' + bl.clientId + ':' + p.id });
    return { key: 'c:' + (bl.clientId || SP.norm(client).replace(/ /g, '-')), client, adresse: '', cp: '', ville: '' };
  }
  function tourId() { return S.date + '_' + S.site; }
  function computeTour() {
    const dep = depot(S.site), t = S.tournees.get(tourId()) || {};
    const boucle = t.boucle !== false;
    const map = new Map();
    S.blsJour.forEach((bl, id) => {
      if ((bl.site || 'genas') !== S.site) return;
      const l = lieuBL(bl);
      if (!map.has(l.key)) map.set(l.key, { key: l.key, lieu: l, bls: [] });
      map.get(l.key).bls.push(Object.assign({ id }, bl));
    });
    const all = [...map.values()];
    all.forEach(s => { s.fait = s.bls.every(b => b.statut === 'livre'); s.bls.sort((a, b) => String(a.numero).localeCompare(String(b.numero))); });
    const loc = all.filter(s => hasPos(s.lieu)), sans = all.filter(s => !hasPos(s.lieu));
    const ordre = (t.ordre || []).filter(k => map.has(k) && hasPos(map.get(k).lieu));
    const connus = new Set(ordre);
    const nouveaux = loc.filter(s => !connus.has(s.key)).sort((a, b) => a.lieu.client.localeCompare(b.lieu.client));
    const stops = ordre.map(k => map.get(k)).concat(nouveaux);
    const coef = reglage('coef');
    let km = 0, prev = hasPos(dep) ? dep : null;
    stops.forEach(s => { s.km = prev ? geo.km(prev, s.lieu) * coef : 0; km += s.km; prev = s.lieu; });
    const retour = boucle && prev && hasPos(dep) && stops.length ? geo.km(prev, dep) * coef : 0;
    km += retour;
    const nbBL = all.reduce((n, s) => n + s.bls.length, 0);
    const poids = all.reduce((n, s) => n + s.bls.reduce((m, b) => m + (Number(b.poids) || 0), 0), 0);
    const minutes = km / reglage('vitesse') * 60 + stops.length * reglage('arret');
    return { dep, boucle, stops, sans, km, retour, nbBL, poids, minutes, aOptimiser: stops.length > 1 && (nouveaux.length > 0 || !t.ordre), nouveaux: nouveaux.length, dejaOptimise: !!t.ordre };
  }
  function saveTour(patch) {
    const t = Object.assign({ date: S.date, site: S.site, boucle: true }, S.tournees.get(tourId()) || {}, patch, { maj: new Date().toISOString() });
    return store.set('tournees', tourId(), t);
  }
  function optimiser() {
    const T = computeTour();
    if (!hasPos(T.dep)) { SP.toast('Le dépôt n\'est pas localisé. Vérifiez son adresse dans les réglages.', true); return; }
    if (!T.stops.length) return;
    const faits = T.stops.filter(s => s.fait), reste = T.stops.filter(s => !s.fait);
    const depart = faits.length ? faits[faits.length - 1].lieu : T.dep;
    const idx = geo.optimise(depart, reste.map(s => s.lieu), T.boucle ? T.dep : null);
    const ordre = faits.map(s => s.key).concat(idx.map(i => reste[i].key));
    saveTour({ ordre }).then(ok => { if (ok) { const n = computeTour(); SP.toast('Circuit optimisé : environ ' + SP.fmt(n.km) + ' km pour ' + n.stops.length + ' arrêts.'); if (S.map) S.map.fit(); } });
  }
  function deplacer(key, sens) {
    const keys = computeTour().stops.map(s => s.key), i = keys.indexOf(key), j = i + sens;
    if (i < 0 || j < 0 || j >= keys.length) return;
    keys[i] = keys[j]; keys[j] = key; saveTour({ ordre: keys });
  }
  function marquer(stop, livre) {
    stop.bls.forEach(b => { const d = Object.assign({}, b); delete d.id; d.statut = livre ? 'livre' : 'a-livrer'; d.maj = new Date().toISOString(); store.set('bls', b.id, d); });
  }
  function liensMaps(T) {
    const pt = p => (p.geo === 'manuel' && hasPos(p)) || !p.ville ? (hasPos(p) ? p.lat + ',' + p.lon : '') : adr(p);
    const reste = T.stops.filter(s => !s.fait).map(s => pt(s.lieu)).filter(Boolean);
    if (!reste.length) return [];
    const faits = T.stops.filter(s => s.fait);
    let origine = faits.length ? pt(faits[faits.length - 1].lieu) : pt(T.dep);
    const seq = reste.slice(); if (T.boucle) seq.push(pt(T.dep));
    const out = [];
    while (seq.length) {
      const part = seq.splice(0, 10), dest = part.pop();
      const q = new URLSearchParams({ api: '1', origin: origine, destination: dest, travelmode: 'driving' });
      if (part.length) q.set('waypoints', part.join('|'));
      out.push('https://www.google.com/maps/dir/?' + q.toString());
      origine = dest;
    }
    return out;
  }
  function duree(min) { const m = Math.round(min / 5) * 5; return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); }

  /* ---------- affichage ---------- */
  function showTab() {
    S.syncBar();
    if (S.map) { S.map.destroy(); S.map = null; }
    S.el.body.replaceChildren();
    S.pane = {};
    if (S.tab === 'tournee') buildTournee(); else if (S.tab === 'bl') buildBL(); else buildClients();
    refresh();
  }
  function refresh() {
    if (!S || !S.pane) return;
    if (S.tab === 'tournee') drawTournee(); else if (S.tab === 'bl') drawBL(); else drawClients();
  }
  function etatChargement() {
    if (S.charge.clients && S.charge.bls) return null;
    return h('div', { class: S.lent ? 'notice' : 'empty', text: S.lent ? 'Les données partagées ne répondent pas encore. Vérifiez votre connexion : l\'affichage se mettra à jour tout seul.' : 'Chargement des données…' });
  }

  /* --- Tournée --- */
  function buildTournee() {
    const P = S.pane;
    P.titre = h('h2');
    P.stats = h('div', { class: 'stats' });
    P.infos = h('div', { class: 'stack' });
    P.liste = h('div', { class: 'stack' });
    P.mapBox = h('div', { class: 'tour-map' });
    S.el.body.appendChild(h('div', { class: 'pane' },
      h('div', { class: 'pane-head' }, P.titre,
        h('button', { class: 'btn', type: 'button', onclick: () => editBL(null) }, SP.icon('plus'), 'Ajouter un BL'),
        P.btnOpt = h('button', { class: 'btn primary', type: 'button', onclick: optimiser }, SP.icon('route'), 'Optimiser le circuit')),
      P.stats, P.infos,
      h('div', { class: 'tour' }, P.mapBox, P.liste)));
    S.map = new geo.Map(P.mapBox, {
      note: 'Carte schématique : tracé en ligne droite, points au centre de la commune sauf position précisée.',
      onTap: e => { if (e.type === 'arret') { S.sel = e.id; drawTournee(); const el = P.liste.querySelector('[data-key="' + CSS.escape(e.id) + '"]'); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
    });
  }
  function drawTournee() {
    const P = S.pane, T = computeTour();
    P.titre.textContent = 'Tournée du ' + SP.frDate(S.date);
    P.btnOpt.disabled = T.stops.length < 2;
    P.stats.replaceChildren(
      h('div', null, h('b', { text: String(T.stops.length) }), h('span', { text: 'Arrêts' })),
      h('div', null, h('b', { text: String(T.nbBL) }), h('span', { text: 'BL' })),
      h('div', null, h('b', { text: T.stops.length ? '≈ ' + SP.fmt(T.km) + ' km' : '0 km' }), h('span', { text: 'Distance estimée' })),
      h('div', null, h('b', { text: T.stops.length ? '≈ ' + duree(T.minutes) : '0 h 00' }), h('span', { text: 'Durée estimée' })));
    const infos = [];
    const ch = etatChargement(); if (ch) infos.push(ch);
    if (T.aOptimiser) infos.push(h('div', { class: 'notice', text: T.dejaOptimise ? T.nouveaux + ' arrêt(s) ajouté(s) depuis le dernier calcul : relancez « Optimiser le circuit ».' : 'L\'ordre ci-dessous n\'est pas encore optimisé : appuyez sur « Optimiser le circuit ».' }));
    if (T.sans.length) infos.push(h('div', { class: 'notice' },
      h('b', { text: T.sans.length + ' livraison(s) hors circuit, lieu à localiser : ' }),
      T.sans.map((s, i) => [i ? ', ' : '', h('button', { class: 'btn sm', type: 'button', style: 'margin:2px', onclick: () => editBL(s.bls[0].id) }, s.lieu.client + ' (BL ' + s.bls[0].numero + ')')])));
    if (!ch && !S.clients.size && !S.blsJour.size) infos.push(demarrage());
    P.infos.replaceChildren(...infos);

    const items = [];
    if (T.stops.length) {
      items.push(h('div', { class: 'stop' }, h('div', { class: 'stop-n depot', text: 'SP' }),
        h('div', null, h('h3', { text: 'Départ : dépôt de ' + SITES[S.site].nom }), h('div', { class: 'adr', text: adr(T.dep) })), h('span')));
      T.stops.forEach((s, i) => {
        items.push(h('div', { class: 'leg', text: '↓ ≈ ' + SP.fmt(s.km) + ' km' }));
        const l = s.lieu;
        const colis = s.bls.reduce((n, b) => n + (Number(b.colis) || 0), 0), poids = s.bls.reduce((n, b) => n + (Number(b.poids) || 0), 0);
        items.push(h('div', { class: 'stop' + (s.fait ? ' done' : '') + (S.sel === s.key ? ' sel' : ''), 'data-key': s.key, onclick: () => { S.sel = s.key; if (S.map) S.map.select(s.key); P.liste.querySelectorAll('.stop.sel').forEach(x => x.classList.remove('sel')); const me = P.liste.querySelector('[data-key="' + CSS.escape(s.key) + '"]'); if (me) me.classList.add('sel'); } },
          h('div', { class: 'stop-n', text: String(i + 1) }),
          h('div', null,
            h('h3', { text: l.client }),
            h('div', { class: 'adr', text: [l.libelle, adr(l)].filter(Boolean).join(' · ') }),
            (l.horaires || l.tel || l.contact) ? h('div', { class: 'adr', text: [l.horaires, l.contact, l.tel].filter(Boolean).join(' · ') }) : null,
            h('div', { class: 'meta' },
              s.bls.map(b => h('button', { class: 'btn sm', type: 'button', onclick: e => { e.stopPropagation(); editBL(b.id); } }, 'BL ' + b.numero)),
              (colis || poids) ? h('span', { class: 'pill neutral num', text: [colis ? colis + ' colis' : '', poids ? SP.fmt(poids) + ' kg' : ''].filter(Boolean).join(' · ') }) : null,
              s.fait ? h('span', { class: 'pill ok', text: 'Livré' }) : null),
            s.bls.filter(b => b.note).map(b => h('div', { class: 'adr', text: 'Note BL ' + b.numero + ' : ' + b.note }))),
          h('div', { class: 'acts' },
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Monter dans le circuit', disabled: i === 0, onclick: e => { e.stopPropagation(); deplacer(s.key, -1); } }, SP.icon('up')),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Descendre dans le circuit', disabled: i === T.stops.length - 1, onclick: e => { e.stopPropagation(); deplacer(s.key, 1); } }, SP.icon('down')),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': s.fait ? 'Remettre à livrer' : 'Marquer comme livré', style: s.fait ? 'background:var(--ok);color:#fff;border-color:var(--ok)' : '', onclick: e => { e.stopPropagation(); marquer(s, !s.fait); } }, SP.icon('check')))));
      });
      const cb = h('input', { type: 'checkbox', id: 'lv-boucle', checked: T.boucle, onchange: () => saveTour({ boucle: cb.checked }) });
      if (T.boucle) items.push(h('div', { class: 'leg', text: '↓ ≈ ' + SP.fmt(T.retour) + ' km' }));
      items.push(h('div', { class: 'stop' }, h('div', { class: 'stop-n depot', text: 'SP' }),
        h('label', { class: 'row', for: 'lv-boucle', style: 'min-height:30px' }, cb, h('span', { text: 'Retour au dépôt en fin de tournée' })), h('span')));
      const liens = liensMaps(T);
      if (liens.length) items.push(h('div', { class: 'stack' },
        liens.map((u, i) => h('a', { class: 'btn brand', href: u, target: '_blank', rel: 'noopener' }, SP.icon('ext'), liens.length > 1 ? 'Itinéraire routier Google Maps, tronçon ' + (i + 1) + '/' + liens.length : 'Itinéraire routier dans Google Maps')),
        h('div', { class: 'small muted', text: 'Les kilomètres et la durée affichés ici sont des estimations (distance à vol d\'oiseau × ' + SP.fmt(reglage('coef'), 1) + ', ' + reglage('vitesse') + ' km/h, ' + reglage('arret') + ' min par arrêt). Google Maps donne le trajet routier réel dans l\'ordre calculé.' })));
    } else if (!etatChargement() && (S.clients.size || S.blsJour.size)) {
      items.push(h('div', { class: 'card empty' }, 'Aucune livraison au départ de ' + SITES[S.site].nom + ' ce jour-là. Ajoutez un BL ou changez de date.'));
    }
    P.liste.replaceChildren(...items);

    const ligne = [];
    if (hasPos(T.dep) && T.stops.length) { ligne.push(T.dep); T.stops.forEach(s => ligne.push(s.lieu)); if (T.boucle) ligne.push(T.dep); }
    S.map.set({
      depot: hasPos(T.dep) ? T.dep : null, ligne, sel: S.sel,
      arrets: T.stops.map((s, i) => ({ id: s.key, lat: s.lieu.lat, lon: s.lieu.lon, label: String(i + 1), fait: s.fait }))
    });
  }
  function demarrage() {
    return h('div', { class: 'stack' },
      h('h3', { text: 'Mettre la livraison en route', style: 'font-size:1.2rem' }),
      h('div', { class: 'steps' },
        h('div', { class: 'step' }, h('b', { text: 'Importer vos clients' }), h('p', { text: 'Un fichier Excel ou CSV avec nom, adresse, code postal et ville. Un client peut avoir plusieurs points de livraison.' }),
          h('button', { class: 'btn sm', type: 'button', onclick: importClients }, SP.icon('upload'), 'Importer')),
        h('div', { class: 'step' }, h('b', { text: 'Ajouter les bons de livraison' }), h('p', { text: 'Au fur et à mesure, à la main ou par import. Le lieu de livraison reste modifiable pour chaque BL.' }),
          h('button', { class: 'btn sm', type: 'button', onclick: () => editBL(null) }, SP.icon('plus'), 'Nouveau BL')),
        h('div', { class: 'step' }, h('b', { text: 'Optimiser le circuit' }), h('p', { text: 'SP WORK calcule l\'ordre de passage le plus court depuis le dépôt et le trace sur la carte.' }))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: chargerEssai }, 'Charger un jeu d\'essai fictif'),
        h('span', { class: 'small muted', text: 'Douze clients « Exemple » et neuf BL pour voir le résultat tout de suite. Supprimable en un geste dans l\'onglet Clients.' })));
  }

  /* --- Bons de livraison --- */
  function buildBL() {
    const P = S.pane;
    P.seg = h('div', { class: 'seg' }, [['jour', 'Jour affiché'], ['attente', 'Tous à livrer']].map(v =>
      h('button', { type: 'button', 'data-v': v[0], onclick: () => { S.vueBL = v[0]; drawBL(); } }, v[1])));
    P.liste = h('div', { class: 'stack' });
    S.el.body.appendChild(h('div', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('h2', { text: 'Bons de livraison' }), P.seg,
        h('button', { class: 'btn', type: 'button', onclick: importBL }, SP.icon('upload'), 'Importer'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editBL(null) }, SP.icon('plus'), 'Nouveau BL')),
      P.liste));
  }
  function ligneBL(id, bl) {
    const l = lieuBL(bl);
    return h('button', { class: 'item', type: 'button', onclick: () => editBL(id) },
      h('div', { class: 'grow' }, h('div', { class: 't', text: 'BL ' + bl.numero + ' · ' + l.client }),
        h('div', { class: 's', text: [adr(l) || 'Lieu à préciser', bl.colis ? bl.colis + ' colis' : '', bl.poids ? SP.fmt(bl.poids) + ' kg' : ''].filter(Boolean).join(' · ') })),
      !hasPos(l) ? h('span', { class: 'pill warn', text: 'À localiser' }) : null,
      h('span', { class: 'pill ' + (bl.statut === 'livre' ? 'ok' : 'neutral'), text: bl.statut === 'livre' ? 'Livré' : 'À livrer' }));
  }
  function drawBL() {
    const P = S.pane;
    P.seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.vueBL)));
    const out = []; const ch = etatChargement(); if (ch) out.push(ch);
    const tri = (a, b) => String(a[1].numero).localeCompare(String(b[1].numero), 'fr', { numeric: true });
    if (S.vueBL === 'jour') {
      const rows = [...S.blsJour].filter(e => (e[1].site || 'genas') === S.site).sort(tri);
      out.push(h('div', { class: 'daysep', text: SP.frDate(S.date) + ' · départ ' + SITES[S.site].nom }));
      out.push(rows.length ? h('div', { class: 'list' }, rows.map(e => ligneBL(e[0], e[1]))) : h('div', { class: 'card empty', text: 'Aucun BL pour ce jour et ce site.' }));
    } else {
      const parJour = new Map();
      [...S.attente].forEach(e => { const d = e[1].date || ''; if (!parJour.has(d)) parJour.set(d, []); parJour.get(d).push(e); });
      const jours = [...parJour.keys()].sort();
      if (!jours.length) out.push(h('div', { class: 'card empty', text: 'Tout est livré : aucun BL en attente.' }));
      jours.forEach(d => {
        out.push(h('div', { class: 'row' }, h('div', { class: 'daysep', text: SP.frDate(d) }), d < SP.today() ? h('span', { class: 'pill crit', text: 'En retard' }) : null,
          h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { S.tab = 'tournee'; setDate(d); showTab(); } }, 'Voir la tournée')));
        out.push(h('div', { class: 'list' }, parJour.get(d).sort(tri).map(e => ligneBL(e[0], e[1]))));
      });
    }
    P.liste.replaceChildren(...out);
  }

  /* --- Clients --- */
  function buildClients() {
    const P = S.pane;
    P.compte = h('h2');
    P.liste = h('div', { class: 'stack' });
    const q = h('input', { class: 'input', id: 'lv-cherche', type: 'search', placeholder: 'Chercher un client, un code, une ville', value: S.filtre, oninput: () => { S.filtre = q.value; drawClients(); } });
    S.el.body.appendChild(h('div', { class: 'pane' },
      h('div', { class: 'pane-head' }, P.compte,
        h('button', { class: 'btn', type: 'button', onclick: importClients }, SP.icon('upload'), 'Importer'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editClient(null) }, SP.icon('plus'), 'Nouveau client')),
      q, P.liste));
  }
  function drawClients() {
    const P = S.pane, f = SP.norm(S.filtre);
    const all = [...S.clients].sort((a, b) => String(a[1].nom).localeCompare(String(b[1].nom), 'fr'));
    const nbPts = all.reduce((n, e) => n + (e[1].points || []).length, 0);
    P.compte.textContent = all.length + ' client' + (all.length > 1 ? 's' : '') + ' · ' + nbPts + ' point' + (nbPts > 1 ? 's' : '') + ' de livraison';
    const rows = all.filter(e => !f || SP.norm([e[1].nom, e[1].code].concat((e[1].points || []).map(p => p.ville + ' ' + p.cp)).join(' ')).indexOf(f) >= 0);
    const out = []; const ch = etatChargement(); if (ch) out.push(ch);
    if (!all.length && !ch) out.push(demarrage());
    const aLoc = all.filter(e => (e[1].points || []).some(p => !hasPos(p))).length;
    if (aLoc) out.push(h('div', { class: 'notice', text: aLoc + ' client(s) ont un point de livraison non localisé : ouvrez la fiche pour corriger le code postal, la ville ou placer le point sur la carte.' }));
    if (rows.length) out.push(h('div', { class: 'list' }, rows.slice(0, 150).map(e => {
      const c = e[1], pts = c.points || [];
      return h('button', { class: 'item', type: 'button', onclick: () => editClient(e[0]) },
        h('div', { class: 'grow' }, h('div', { class: 't', text: c.nom + (c.code ? ' (' + c.code + ')' : '') }),
          h('div', { class: 's', text: pts.length ? pts.map(p => [p.cp, p.ville].filter(Boolean).join(' ')).join(' · ') : 'Aucun point de livraison' })),
        pts.some(p => !hasPos(p)) ? h('span', { class: 'pill warn', text: 'À localiser' }) : null,
        h('span', { class: 'pill neutral num', text: pts.length + ' point' + (pts.length > 1 ? 's' : '') }));
    })));
    else if (all.length) out.push(h('div', { class: 'card empty', text: 'Aucun client ne correspond à cette recherche.' }));
    if (rows.length > 150) out.push(h('div', { class: 'small muted', text: 'Affichage des 150 premiers résultats sur ' + rows.length + ' : précisez la recherche.' }));
    if (all.some(e => e[1].demo)) out.push(h('button', { class: 'btn danger', type: 'button', onclick: supprimerEssai }, SP.icon('trash'), 'Supprimer le jeu d\'essai fictif'));
    P.liste.replaceChildren(...out);
  }

  /* ---------- position sur la carte ---------- */
  function choisirPosition(depuis, titre) {
    return new Promise(res => {
      let pos = hasPos(depuis) ? { lat: depuis.lat, lon: depuis.lon } : null, done = false, map = null;
      const m = SP.modal({ titre: titre || 'Placer le point', large: true, onClose: () => { if (map) map.destroy(); if (!done) res(null); } });
      const box = h('div', { class: 'pickmap' });
      const coord = h('input', { class: 'input', id: 'pick-coord', placeholder: '45.7284, 5.0174', value: pos ? pos.lat.toFixed(5) + ', ' + pos.lon.toFixed(5) : '' });
      const ok = h('button', { class: 'btn primary', type: 'button', disabled: !pos, onclick: () => { done = true; res(pos); m.close(); } }, 'Valider cette position');
      function setPos(p, recentrer) { pos = p; coord.value = p.lat.toFixed(5) + ', ' + p.lon.toFixed(5); ok.disabled = false; map.set({ repere: p }); if (recentrer) map.center(p.lat, p.lon, 12); }
      coord.addEventListener('change', () => { const x = coord.value.match(/(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)/); if (x) { const la = parseFloat(x[1].replace(',', '.')), lo = parseFloat(x[2].replace(',', '.')); if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) setPos({ lat: la, lon: lo }, true); } });
      m.body.append(
        h('div', { class: 'small muted', text: 'Touchez la carte à l\'endroit de la livraison, ou collez des coordonnées copiées depuis Google Maps (clic droit sur le lieu).' }),
        box, h('label', { class: 'field' }, h('span', { text: 'Coordonnées (latitude, longitude)' }), coord));
      m.setActions(h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'), ok);
      map = new geo.Map(box, { onTap: e => { if (e.type === 'carte') setPos({ lat: +e.lat.toFixed(5), lon: +e.lon.toFixed(5) }); } });
      const c = pos || depot(S.site);
      if (pos) map.set({ repere: pos });
      if (hasPos(c)) map.center(c.lat, c.lon, pos ? 12 : 10);
    });
  }
  /* bloc de saisie d'une adresse avec localisation ; p est modifié en place */
  function blocAdresse(p, prefix) {
    const etat = h('span', { class: 'pill neutral' });
    function maj() {
      if (p.geo !== 'manuel') { const g = geo.locate(p.cp, p.ville); if (g) { p.lat = g.lat; p.lon = g.lon; p.geo = 'commune'; p.commune = g.commune; } else { delete p.lat; delete p.lon; p.geo = 'aucun'; } }
      etat.className = 'pill ' + (p.geo === 'manuel' ? 'ok' : hasPos(p) ? 'neutral' : 'warn');
      etat.textContent = p.geo === 'manuel' ? 'Position précise' : hasPos(p) ? 'Centre de ' + (p.commune || p.ville) : (p.cp || p.ville ? 'Commune introuvable' : 'Non localisé');
    }
    const f = (k, label, extra) => { const i = h('input', Object.assign({ class: 'input', id: prefix + '-' + k, value: p[k] || '', oninput: () => { p[k] = i.value.trim(); if (k === 'cp' || k === 'ville') maj(); } }, extra || {})); return h('label', { class: 'field' }, h('span', { text: label }), i); };
    maj();
    return h('div', { class: 'stack' },
      f('adresse', 'Adresse'),
      h('div', { class: 'fgrid' }, f('cp', 'Code postal', { inputmode: 'numeric' }), f('ville', 'Ville')),
      h('div', { class: 'row' }, etat,
        h('button', { class: 'btn sm', type: 'button', onclick: async () => { const r = await choisirPosition(p, 'Placer : ' + (p.ville || 'point de livraison')); if (r) { p.lat = r.lat; p.lon = r.lon; p.geo = 'manuel'; maj(); } } }, SP.icon('pin'), 'Placer sur la carte'),
        p.geo === 'manuel' ? h('button', { class: 'btn sm ghost', type: 'button', onclick: e => { p.geo = 'commune'; maj(); e.currentTarget.remove(); } }, 'Revenir au centre de la commune') : null));
  }

  /* ---------- fiche client ---------- */
  function editClient(id) {
    const neuf = !id, src = id ? S.clients.get(id) : null;
    const c = src ? JSON.parse(JSON.stringify(src)) : { code: '', nom: '', points: [{ id: SP.uid(), libelle: 'Principal' }] };
    c.points = c.points || [];
    const m = SP.modal({ titre: neuf ? 'Nouveau client' : c.nom, large: true });
    const zone = h('div', { class: 'stack' });
    const inp = (k, label) => { const i = h('input', { class: 'input', id: 'cl-' + k, value: c[k] || '', oninput: () => { c[k] = i.value.trim(); } }); return h('label', { class: 'field' }, h('span', { text: label }), i); };
    function points() {
      zone.replaceChildren(...c.points.map((p, n) => {
        const f = (k, label) => { const i = h('input', { class: 'input', id: 'pt' + n + '-' + k, value: p[k] || '', oninput: () => { p[k] = i.value.trim(); } }); return h('label', { class: 'field' }, h('span', { text: label }), i); };
        return h('div', { class: 'pointbox' },
          h('div', { class: 'row' }, h('b', { class: 'grow', text: 'Point de livraison ' + (n + 1) }),
            c.points.length > 1 ? h('button', { class: 'btn sm danger', type: 'button', onclick: () => { c.points.splice(n, 1); points(); } }, SP.icon('trash'), 'Retirer') : null),
          f('libelle', 'Nom du point (usine, quai, entrepôt…)'),
          blocAdresse(p, 'pt' + n),
          h('div', { class: 'fgrid' }, f('contact', 'Contact sur place'), f('tel', 'Téléphone')),
          f('horaires', 'Horaires de réception et consignes'));
      }), h('button', { class: 'btn', type: 'button', onclick: () => { c.points.push({ id: SP.uid(), libelle: '' }); points(); } }, SP.icon('plus'), 'Ajouter un point de livraison'));
    }
    m.body.append(h('div', { class: 'fgrid' }, inp('nom', 'Nom du client *'), inp('code', 'Code client (Cegid PMI)')), zone);
    points();
    m.setActions(
      !neuf ? h('button', { class: 'btn danger', type: 'button', style: 'margin-right:auto', onclick: async () => { if (await SP.confirm('Supprimer la fiche « ' + c.nom + ' » ? Les BL déjà saisis pour ce client garderont son nom mais perdront son adresse.', 'Supprimer', true)) { if (await store.remove('clients', id)) { SP.toast('Client supprimé.'); m.close(); } } } }, SP.icon('trash'), 'Supprimer') : null,
      h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!c.nom) { SP.toast('Indiquez le nom du client.', true); return; }
        c.maj = new Date().toISOString();
        if (await store.set('clients', id || store.newId('clients'), c)) { SP.toast('Client enregistré.'); m.close(); }
      } }, 'Enregistrer'));
  }

  /* ---------- fiche BL ---------- */
  const blId = numero => 'bl-' + String(numero).trim().replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 80);
  async function editBL(id) {
    const src = id ? (S.blsJour.get(id) || S.attente.get(id) || await store.get('bls', id)) : null;
    if (id && !src) { SP.toast('Ce BL n\'existe plus.', true); return; }
    const neuf = !src;
    const b = src ? JSON.parse(JSON.stringify(src)) : { numero: '', date: S.date, site: S.site, clientId: '', pointId: '', colis: '', poids: '', note: '', statut: 'a-livrer' };
    let autre = !!b.lieu, lieu = b.lieu ? Object.assign({}, b.lieu) : {}, garder = false, nomLibre = '';
    const m = SP.modal({ titre: neuf ? 'Nouveau bon de livraison' : 'BL ' + b.numero, large: true });
    const inp = (k, label, extra) => { const i = h('input', Object.assign({ class: 'input', id: 'bl-' + k, value: b[k] == null ? '' : b[k], oninput: () => { b[k] = i.value.trim(); } }, extra || {})); return h('label', { class: 'field' }, h('span', { text: label }), i); };
    const siteSel = h('select', { class: 'input', id: 'bl-site', onchange: () => { b.site = siteSel.value; } }, Object.keys(SITES).map(k => h('option', { value: k, text: SITES[k].nom, selected: b.site === k })));
    const statSel = h('select', { class: 'input', id: 'bl-statut', onchange: () => { b.statut = statSel.value; } }, h('option', { value: 'a-livrer', text: 'À livrer', selected: b.statut !== 'livre' }), h('option', { value: 'livre', text: 'Livré', selected: b.statut === 'livre' }));
    const zClient = h('div', { class: 'stack' }), zLieu = h('div', { class: 'stack' });

    function drawClient() {
      const c = S.clients.get(b.clientId);
      if (c) {
        zClient.replaceChildren(h('div', { class: 'field' }, h('span', { text: 'Client *' }),
          h('div', { class: 'row' }, h('b', { class: 'grow', text: c.nom + (c.code ? ' (' + c.code + ')' : '') }),
            h('button', { class: 'btn sm', type: 'button', onclick: () => { b.clientId = ''; b.pointId = ''; drawClient(); drawLieu(); } }, 'Changer'))));
        return;
      }
      const sugg = h('div', { class: 'sugg' });
      const q = h('input', { class: 'input', id: 'bl-client', type: 'search', placeholder: 'Tapez le nom ou le code du client', value: nomLibre || b.clientNom || '', oninput: maj });
      function maj() {
        nomLibre = q.value.trim(); const f = SP.norm(nomLibre);
        const hit = f ? [...S.clients].filter(e => SP.norm(e[1].nom + ' ' + (e[1].code || '')).indexOf(f) >= 0).slice(0, 8) : [];
        sugg.replaceChildren(...hit.map(e => h('button', { type: 'button', onclick: () => { b.clientId = e[0]; b.pointId = ((e[1].points || [])[0] || {}).id || ''; autre = !(e[1].points || []).length; drawClient(); drawLieu(); } }, e[1].nom + (e[1].code ? ' (' + e[1].code + ')' : ''))),
          ...(nomLibre && !hit.some(e => SP.norm(e[1].nom) === f) ? [h('button', { type: 'button', onclick: async () => {
            const nid = store.newId('clients'), nc = { nom: nomLibre, code: '', points: [], maj: new Date().toISOString() };
            if (await store.set('clients', nid, nc)) { S.clients = new Map(S.clients).set(nid, nc); b.clientId = nid; b.pointId = ''; autre = true; garder = true; drawClient(); drawLieu(); }
          } }, h('b', { text: 'Créer le client « ' + nomLibre + ' »' }))] : []));
        sugg.style.display = sugg.children.length ? '' : 'none';
      }
      zClient.replaceChildren(h('label', { class: 'field' }, h('span', { text: 'Client *' }), q), sugg); maj();
    }
    function drawLieu() {
      const c = S.clients.get(b.clientId);
      if (!c) { zLieu.replaceChildren(); return; }
      const pts = c.points || [];
      if (!pts.length) autre = true;
      const sel = h('select', { class: 'input', id: 'bl-point', onchange: () => { if (sel.value === '__autre') autre = true; else { autre = false; b.pointId = sel.value; } drawLieu(); } },
        pts.map(p => h('option', { value: p.id, text: [p.libelle, adr(p)].filter(Boolean).join(' · ') || 'Point sans adresse', selected: !autre && p.id === b.pointId })),
        h('option', { value: '__autre', text: 'Autre lieu pour ce BL…', selected: autre }));
      const kids = [h('label', { class: 'field' }, h('span', { text: 'Lieu de livraison' }), sel)];
      if (autre) {
        const cb = h('input', { type: 'checkbox', id: 'bl-garder', checked: garder, onchange: () => { garder = cb.checked; } });
        kids.push(h('div', { class: 'pointbox' }, blocAdresse(lieu, 'bl-lieu'),
          h('label', { class: 'row', for: 'bl-garder' }, cb, h('span', { text: 'Ajouter ce lieu aux points de livraison du client' }))));
      }
      zLieu.replaceChildren(...kids);
    }
    m.body.append(
      h('div', { class: 'fgrid' }, inp('numero', 'N° de BL *', neuf ? {} : { disabled: true }), inp('date', 'Date de livraison', { type: 'date' }),
        h('label', { class: 'field' }, h('span', { text: 'Départ' }), siteSel)),
      zClient, zLieu,
      h('div', { class: 'fgrid' }, inp('colis', 'Nombre de colis', { inputmode: 'numeric' }), inp('poids', 'Poids (kg)', { inputmode: 'decimal' }),
        h('label', { class: 'field' }, h('span', { text: 'Statut' }), statSel)),
      inp('note', 'Note pour le chauffeur'));
    drawClient(); drawLieu();
    m.setActions(
      !neuf ? h('button', { class: 'btn danger', type: 'button', style: 'margin-right:auto', onclick: async () => { if (await SP.confirm('Supprimer le BL ' + b.numero + ' ?', 'Supprimer', true)) { if (await store.remove('bls', id)) { SP.toast('BL supprimé.'); m.close(); } } } }, SP.icon('trash'), 'Supprimer') : null,
      h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!b.numero) { SP.toast('Indiquez le numéro du BL.', true); return; }
        const c = S.clients.get(b.clientId);
        if (!c) { SP.toast('Choisissez un client dans la liste, ou créez-le.', true); return; }
        if (!b.date) b.date = S.date;
        const bid = id || blId(b.numero);
        if (neuf && await store.get('bls', bid)) { SP.toast('Le BL ' + b.numero + ' existe déjà.', true); return; }
        b.clientNom = c.nom;
        if (autre) {
          if (!lieu.cp && !lieu.ville && !hasPos(lieu)) { SP.toast('Indiquez au moins le code postal et la ville du lieu de livraison.', true); return; }
          if (garder) {
            const p = Object.assign({ id: SP.uid(), libelle: (c.points || []).length ? 'Point ' + ((c.points || []).length + 1) : 'Principal' }, lieu);
            const nc = JSON.parse(JSON.stringify(c)); nc.points = (nc.points || []).concat([p]); nc.maj = new Date().toISOString();
            if (!await store.set('clients', b.clientId, nc)) return;
            b.pointId = p.id; delete b.lieu;
          } else b.lieu = lieu;
        } else delete b.lieu;
        b.colis = b.colis === '' ? '' : (Number(String(b.colis).replace(',', '.')) || 0);
        b.poids = b.poids === '' ? '' : (Number(String(b.poids).replace(',', '.').replace(/\s/g, '')) || 0);
        b.maj = new Date().toISOString();
        if (await store.set('bls', bid, b)) { SP.toast('BL ' + b.numero + ' enregistré.'); m.close(); }
      } }, 'Enregistrer'));
  }

  /* ---------- réglages ---------- */
  function openReglages() {
    const r = JSON.parse(JSON.stringify(S.reglages || {})); r.depots = r.depots || {};
    const m = SP.modal({ titre: 'Réglages de la livraison', large: true });
    const num = (k, label) => { const i = h('input', { class: 'input', id: 'rg-' + k, inputmode: 'decimal', value: String(r[k] || DEF[k]).replace('.', ','), oninput: () => { r[k] = parseFloat(i.value.replace(',', '.')) || DEF[k]; } }); return h('label', { class: 'field' }, h('span', { text: label }), i); };
    m.body.append(...Object.keys(SITES).map(k => {
      const d = r.depots[k] = Object.assign({}, SITES[k], r.depots[k] || {});
      return h('div', { class: 'pointbox' }, h('b', { text: 'Dépôt de ' + SITES[k].nom }), blocAdresse(d, 'dep-' + k));
    }),
      h('div', { class: 'fgrid' }, num('vitesse', 'Vitesse moyenne (km/h)'), num('arret', 'Temps par arrêt (min)'), num('coef', 'Coefficient route / vol d\'oiseau')),
      h('div', { class: 'small muted', text: 'Ces trois valeurs servent aux estimations de distance et de durée. Ajustez-les après quelques tournées réelles.' }));
    m.setActions(h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { if (await store.set('reglages', 'livraison', r)) { SP.toast('Réglages enregistrés.'); m.close(); } } }, 'Enregistrer'));
  }

  /* ---------- imports ---------- */
  function importClients() {
    SP.importer({
      titre: 'Importer des clients',
      aide: 'Une ligne par point de livraison. Un client présent sur plusieurs lignes (même code ou même nom) reçoit plusieurs points. Les clients déjà dans SP WORK sont complétés, jamais dupliqués.',
      champs: [
        { id: 'nom', label: 'Nom du client', requis: true, alias: ['raison sociale', 'nom client', 'client', 'societe', 'intitule', '=nom'] },
        { id: 'code', label: 'Code client', alias: ['code tiers', 'numero client', 'n client', 'ref client', 'compte', '=code'] },
        { id: 'cp', label: 'Code postal', requis: true, alias: ['=cp', 'postal', 'cp livraison'] },
        { id: 'ville', label: 'Ville', requis: true, alias: ['commune', 'localite', 'ville livraison'] },
        { id: 'adresse', label: 'Adresse', alias: ['adresse 1', 'adresse1', 'adresse livraison', 'rue', 'adresse'] },
        { id: 'adresse2', label: 'Complément d\'adresse', alias: ['adresse 2', 'adresse2', 'complement'] },
        { id: 'libelle', label: 'Nom du point de livraison', alias: ['point de livraison', 'libelle', 'lieu', 'site', 'destinataire'] },
        { id: 'contact', label: 'Contact', alias: ['interlocuteur', 'contact'] },
        { id: 'tel', label: 'Téléphone', alias: ['telephone', 'tel', 'portable', 'mobile'] },
        { id: 'horaires', label: 'Horaires et consignes', alias: ['horaires', 'consignes', 'reception'] }
      ],
      resume: rows => { const k = new Set(rows.filter(r => r.nom).map(r => SP.norm(r.code) || SP.norm(r.nom))); return rows.length + ' lignes, soit ' + k.size + ' clients distincts.'; },
      onValide: async (rows, prog) => {
        try { await geo.load(); } catch (e) { /* sans localisation */ }
        const parCode = new Map(), parNom = new Map();
        S.clients.forEach((c, id) => { if (c.code) parCode.set(SP.norm(c.code), id); parNom.set(SP.norm(c.nom), id); });
        const touche = new Map(); let nv = 0, pts = 0, sans = 0;
        for (const r of rows) {
          if (!r.nom) continue;
          let id = (r.code && parCode.get(SP.norm(r.code))) || parNom.get(SP.norm(r.nom));
          let c = id && (touche.get(id) || JSON.parse(JSON.stringify(S.clients.get(id))));
          if (!c) { id = store.newId('clients'); c = { nom: r.nom, code: r.code || '', points: [] }; nv++; if (r.code) parCode.set(SP.norm(r.code), id); parNom.set(SP.norm(r.nom), id); }
          c.points = c.points || [];
          const adresse = [r.adresse, r.adresse2].filter(Boolean).join(', ');
          const cp = /^\d{4}$/.test(r.cp) ? '0' + r.cp : r.cp;
          if (cp || r.ville) {
            let p = c.points.find(x => SP.norm(x.adresse) === SP.norm(adresse) && String(x.cp) === String(cp));
            if (!p) { p = { id: SP.uid(), libelle: r.libelle || (c.points.length ? 'Point ' + (c.points.length + 1) : 'Principal') }; c.points.push(p); pts++; }
            Object.assign(p, { adresse, cp, ville: r.ville }); if (r.libelle) p.libelle = r.libelle;
            ['contact', 'tel', 'horaires'].forEach(k => { if (r[k]) p[k] = r[k]; });
            if (p.geo !== 'manuel') { const g = geo.locate(cp, r.ville); if (g) { p.lat = g.lat; p.lon = g.lon; p.geo = 'commune'; p.commune = g.commune; } else { p.geo = 'aucun'; sans++; } }
          }
          c.maj = new Date().toISOString(); touche.set(id, c);
        }
        const jobs = [...touche].map(e => () => store.set('clients', e[0], e[1], true));
        const ok = await store.batch(jobs, prog);
        return ok + ' fiche(s) client enregistrée(s) sur ' + jobs.length + ', dont ' + nv + ' nouvelle(s) ; ' + pts + ' point(s) de livraison ajouté(s)' + (sans ? ' ; ' + sans + ' point(s) non localisé(s) à corriger dans l\'onglet Clients.' : '.') + (ok < jobs.length ? ' Certaines fiches n\'ont pas pu être enregistrées : relancez l\'import.' : '');
      }
    });
  }
  function importBL() {
    SP.importer({
      titre: 'Importer des bons de livraison',
      aide: 'Une ligne par BL. Sans colonne date, les BL sont mis au ' + SP.frDate(S.date) + ' ; ils partent du dépôt de ' + SITES[S.site].nom + '. Un BL déjà présent (même numéro) est mis à jour. Si le fichier donne une adresse différente de la fiche client, elle devient le lieu de livraison de ce BL.',
      champs: [
        { id: 'numero', label: 'N° de BL', requis: true, alias: ['numero bl', 'n bl', 'bon de livraison', 'n piece', 'numero piece', '=bl', '=numero', '=piece'] },
        { id: 'date', label: 'Date de livraison', alias: ['date livraison', 'livraison le', 'date de livraison', 'date'] },
        { id: 'code', label: 'Code client', alias: ['code tiers', 'numero client', 'n client', 'compte', '=code'] },
        { id: 'nom', label: 'Nom du client', alias: ['raison sociale', 'nom client', 'client', '=nom'] },
        { id: 'adresse', label: 'Adresse de livraison', alias: ['adresse livraison', 'adresse 1', 'adresse', 'rue'] },
        { id: 'cp', label: 'Code postal', alias: ['=cp', 'postal'] },
        { id: 'ville', label: 'Ville', alias: ['commune', 'localite', 'ville'] },
        { id: 'colis', label: 'Nombre de colis', alias: ['nb colis', 'colis', 'quantite', 'qte'] },
        { id: 'poids', label: 'Poids (kg)', alias: ['poids brut', 'poids'] },
        { id: 'note', label: 'Note', alias: ['commentaire', 'observation', 'note'] }
      ],
      resume: rows => new Set(rows.filter(r => r.numero).map(r => r.numero)).size + ' BL distincts sur ' + rows.length + ' lignes.',
      onValide: async (rows, prog) => {
        try { await geo.load(); } catch (e) { /* sans localisation */ }
        const parCode = new Map(), parNom = new Map();
        const clients = new Map(S.clients), neufs = new Map();
        clients.forEach((c, id) => { if (c.code) parCode.set(SP.norm(c.code), id); parNom.set(SP.norm(c.nom), id); });
        const bls = new Map(); let inconnus = 0;
        const numv = v => v === '' ? '' : (Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0);
        for (const r of rows) {
          if (!r.numero || bls.has(blId(r.numero))) continue;
          let cid = (r.code && parCode.get(SP.norm(r.code))) || (r.nom && parNom.get(SP.norm(r.nom))) || '';
          const cp = /^\d{4}$/.test(r.cp) ? '0' + r.cp : r.cp;
          const g = (cp || r.ville) ? geo.locate(cp, r.ville) : null;
          const lieu = (cp || r.ville) ? Object.assign({ adresse: r.adresse, cp, ville: r.ville, geo: g ? 'commune' : 'aucun' }, g ? { lat: g.lat, lon: g.lon, commune: g.commune } : {}) : null;
          const b = { numero: r.numero, date: SP.parseDate(r.date) || S.date, site: S.site, colis: numv(r.colis), poids: numv(r.poids), note: r.note || '', statut: 'a-livrer', maj: new Date().toISOString() };
          if (!cid && (r.nom || r.code)) {
            cid = store.newId('clients');
            const nc = { nom: r.nom || ('Client ' + r.code), code: r.code || '', points: lieu ? [Object.assign({ id: SP.uid(), libelle: 'Principal' }, lieu)] : [], maj: b.maj };
            clients.set(cid, nc); neufs.set(cid, nc); if (r.code) parCode.set(SP.norm(r.code), cid); parNom.set(SP.norm(nc.nom), cid);
          }
          const c = clients.get(cid);
          if (c) {
            b.clientId = cid; b.clientNom = c.nom;
            const pts = c.points || [];
            const p = lieu ? pts.find(x => String(x.cp) === String(cp) && (!r.adresse || SP.norm(x.adresse) === SP.norm(r.adresse))) : pts[0];
            if (p) b.pointId = p.id; else if (lieu) b.lieu = lieu;
          } else { inconnus++; b.clientId = ''; b.clientNom = 'Client à préciser'; if (lieu) b.lieu = lieu; }
          bls.set(blId(r.numero), b);
        }
        const jobs = [...neufs].map(e => () => store.set('clients', e[0], e[1], true)).concat([...bls].map(e => () => store.set('bls', e[0], e[1], true)));
        const ok = await store.batch(jobs, prog);
        return bls.size + ' BL importé(s)' + (neufs.size ? ', ' + neufs.size + ' nouveau(x) client(s) créé(s)' : '') + (inconnus ? ', ' + inconnus + ' BL sans client reconnu à compléter' : '') + '.' + (ok < jobs.length ? ' Certaines lignes n\'ont pas pu être enregistrées : relancez l\'import.' : '');
      }
    });
  }

  /* ---------- jeu d'essai (fictif, marqué demo) ---------- */
  const ESSAI = [
    ['EX01', 'Exemple Mécanique du Val', '12 rue des Exemples', '69400', 'Villefranche-sur-Saône'], ['EX02', 'Exemple Chaudronnerie Berjallienne', '3 avenue Fictive', '38300', 'Bourgoin-Jallieu'],
    ['EX03', 'Exemple Turbines du Rhône', 'ZI Sud', '38200', 'Vienne'], ['EX04', 'Exemple Outillage Stéphanois', '8 rue de l\'Essai', '42000', 'Saint-Étienne'],
    ['EX05', 'Exemple Hydraulique Alpine', '21 chemin Test', '38000', 'Grenoble'], ['EX06', 'Exemple Machines Savoie', 'Parc d\'activités', '73000', 'Chambéry'],
    ['EX07', 'Exemple Agro Mâconnais', '5 quai Fictif', '71000', 'Mâcon'], ['EX08', 'Exemple Valence Composants', '14 rue Modèle', '26000', 'Valence'],
    ['EX09', 'Exemple Plasturgie de l\'Ain', 'ZA Nord', '01100', 'Oyonnax'], ['EX10', 'Exemple Robotique Est Lyonnais', '2 rue Démo', '69330', 'Meyzieu'],
    ['EX11', 'Exemple Fonderie du Gier', '9 rue Échantillon', '42800', 'Rive-de-Gier'], ['EX12', 'Exemple Câblerie d\'Ambérieu', 'ZI Est', '01500', 'Ambérieu-en-Bugey']
  ];
  async function chargerEssai() {
    try { await geo.load(); } catch (e) { SP.toast('Fond de carte indisponible.', true); return; }
    const jobs = [];
    ESSAI.forEach((e, i) => {
      const g = geo.locate(e[3], e[4]) || {};
      const c = { code: e[0], nom: e[1], demo: true, maj: new Date().toISOString(), points: [{ id: 'p1', libelle: 'Principal', adresse: e[2], cp: e[3], ville: e[4], lat: g.lat, lon: g.lon, geo: g.lat ? 'commune' : 'aucun', commune: g.commune, horaires: i % 3 === 0 ? 'Réception 8 h à 12 h' : '' }] };
      jobs.push(() => store.set('clients', 'essai-' + e[0], c, true));
      if (i < 9) jobs.push(() => store.set('bls', blId('EX-' + String(i + 1).padStart(4, '0')), { numero: 'EX-' + String(i + 1).padStart(4, '0'), date: S.date, site: S.site, clientId: 'essai-' + e[0], clientNom: e[1], pointId: 'p1', colis: 1 + (i * 3) % 5, poids: 180 + i * 95, note: '', statut: 'a-livrer', demo: true, maj: new Date().toISOString() }, true));
    });
    const ok = await store.batch(jobs);
    if (ok < jobs.length) SP.toast('Jeu d\'essai incomplet : accès en écriture nécessaire.', true); else SP.toast('Jeu d\'essai chargé pour le ' + SP.frDate(S.date, true) + '.');
  }
  async function supprimerEssai() {
    if (!await SP.confirm('Supprimer les clients « Exemple » et leurs BL fictifs ? Vos vraies données ne sont pas touchées.', 'Supprimer le jeu d\'essai', true)) return;
    const [cl, bl] = await Promise.all([store.query('clients', ['demo', '==', true]), store.query('bls', ['demo', '==', true])]);
    const jobs = [...bl.keys()].map(id => () => store.remove('bls', id)).concat([...cl.keys()].map(id => () => store.remove('clients', id)));
    await store.batch(jobs); SP.toast('Jeu d\'essai supprimé.');
  }

  SP.registerApp({ id: 'livraison', nom: 'Livraison', icone: 'truck', etat: 'actif', desc: 'Clients, bons de livraison et circuit optimisé sur carte.', mount });
})();
