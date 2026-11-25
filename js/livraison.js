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
      chauffeur: '', clients: new Map(), blsJour: new Map(), attente: new Map(), echecs: new Map(), livres: null, subLivres: false, filtreBL: '', maxLivres: 60, tournees: new Map(), reglages: {},
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
    S.subs.push(store.watch({ coll: 'bls', where: ['statut', '==', 'echec'] }, m => { if (m) { st.echecs = m; refresh(); } }));
    const surProfils = () => { if (S === st) refresh(); }; SP.auth.ecoute.add(surProfils); S.subs.push(() => SP.auth.ecoute.delete(surProfils));
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
  function tourId(ch) { ch = ch === undefined ? S.chauffeur : ch; return S.date + '_' + S.site + (ch ? '_' + ch : ''); }
  const traite = b => b.statut === 'livre' || b.statut === 'echec';
  function computeTour() {
    const dep = depot(S.site), t = S.tournees.get(tourId()) || {};
    const boucle = t.boucle !== false;
    const map = new Map();
    S.blsJour.forEach((bl, id) => {
      if ((bl.site || 'genas') !== S.site || (bl.chauffeur || '') !== S.chauffeur) return;
      const l = lieuBL(bl);
      if (!map.has(l.key)) map.set(l.key, { key: l.key, lieu: l, bls: [] });
      map.get(l.key).bls.push(Object.assign({ id }, bl));
    });
    const all = [...map.values()];
    all.forEach(s => { s.fait = s.bls.every(traite); s.echec = s.bls.some(b => b.statut === 'echec'); s.reserves = s.bls.some(b => b.statut === 'livre' && b.livraison && b.livraison.reserves); s.bls.sort((a, b) => String(a.numero).localeCompare(String(b.numero))); });
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
    const t = Object.assign({ date: S.date, site: S.site, chauffeur: S.chauffeur, boucle: true }, S.tournees.get(tourId()) || {}, patch, { maj: new Date().toISOString() });
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
    stop.bls.forEach(b => { const d = Object.assign({}, b); delete d.id; d.statut = livre ? 'livre' : 'a-livrer'; if (livre) d.livraison = { at: new Date().toISOString(), par: SP.auth.profil.id, parNom: SP.auth.profil.nom, saisie: 'bureau' }; else delete d.livraison; d.maj = new Date().toISOString(); store.update('bls', b.id, d); });
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
    if (S.tab === 'chauffeur') drawChauffeur(); else if (S.tab === 'tournee') drawTournee(); else if (S.tab === 'bl') drawBL(); else drawClients();
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
        P.selCh = h('select', { class: 'input', id: 'lv-chauffeur', style: 'width:auto;max-width:260px', 'aria-label': 'Chauffeur de la tournée', onchange: () => { S.chauffeur = P.selCh.value; S.sel = null; if (S.map) S.map.fit(); refresh(); } }),
        P.btnAff = h('button', { class: 'btn', type: 'button', onclick: () => { const T = computeTour(); affecter(T.stops.concat(T.sans), true); } }, SP.icon('users'), 'Attribuer (facultatif)'),
        h('button', { class: 'btn', type: 'button', onclick: importPDF }, SP.icon('doc'), 'Lire des BL en PDF'),
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
    P.btnAff.disabled = !(T.stops.length + T.sans.length);
    const compte = new Map(); S.blsJour.forEach(b => { if ((b.site || 'genas') === S.site) compte.set(b.chauffeur || '', (compte.get(b.chauffeur || '') || 0) + 1); });
    const ids = SP.auth.actifs().map(p => p.id); compte.forEach((n, id) => { if (id && ids.indexOf(id) < 0) ids.push(id); });
    P.selCh.replaceChildren(h('option', { value: '', text: 'Tous les chauffeurs (' + (compte.get('') || 0) + ' BL)', selected: !S.chauffeur }),
      ...ids.map(id => h('option', { value: id, text: (SP.auth.nom(id) || 'Compte supprimé') + ' (' + (compte.get(id) || 0) + ' BL)', selected: S.chauffeur === id })));
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
              pillStop(s)),
            s.bls.filter(b => b.note).map(b => h('div', { class: 'adr', text: 'Note BL ' + b.numero + ' : ' + b.note }))),
          h('div', { class: 'acts' },
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Monter dans le circuit', disabled: i === 0, onclick: e => { e.stopPropagation(); deplacer(s.key, -1); } }, SP.icon('up')),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Descendre dans le circuit', disabled: i === T.stops.length - 1, onclick: e => { e.stopPropagation(); deplacer(s.key, 1); } }, SP.icon('down')),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Affecter cet arrêt à un chauffeur', onclick: e => { e.stopPropagation(); affecter([s], false); } }, SP.icon('users')),
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
      items.push(h('div', { class: 'card empty' }, 'Aucune livraison ' + (S.chauffeur ? 'attribuée à ' + SP.auth.nom(S.chauffeur) : 'ouverte à tous les chauffeurs') + ' au départ de ' + SITES[S.site].nom + ' ce jour-là. Changez de chauffeur dans la liste, ajoutez un BL ou changez de date.'));
    }
    P.liste.replaceChildren(...items);

    const ligne = [];
    if (hasPos(T.dep) && T.stops.length) { ligne.push(T.dep); T.stops.forEach(s => ligne.push(s.lieu)); if (T.boucle) ligne.push(T.dep); }
    S.map.set({
      depot: hasPos(T.dep) ? T.dep : null, ligne, sel: S.sel,
      arrets: T.stops.map((s, i) => ({ id: s.key, lat: s.lieu.lat, lon: s.lieu.lon, label: String(i + 1), fait: s.fait && !s.echec, hors: s.echec }))
    });
  }
  function demarrage() {
    return h('div', { class: 'stack' },
      h('h3', { text: 'Mettre la livraison en route', style: 'font-size:1.2rem' }),
      h('div', { class: 'steps' },
        h('div', { class: 'step' }, h('b', { text: 'Importer vos clients' }), h('p', { text: 'Un fichier Excel ou CSV avec nom, adresse, code postal et ville. Un client peut avoir plusieurs points de livraison.' }),
          h('button', { class: 'btn sm', type: 'button', onclick: importClients }, SP.icon('upload'), 'Importer')),
        h('div', { class: 'step' }, h('b', { text: 'Ajouter les bons de livraison' }), h('p', { text: 'Déposez les BL en PDF sortis de Cegid PMI : le client et l\'adresse de livraison sont créés tout seuls. Le lieu reste modifiable pour chaque BL.' }),
          h('button', { class: 'btn sm', type: 'button', onclick: importPDF }, SP.icon('doc'), 'Lire des BL en PDF')),
        h('div', { class: 'step' }, h('b', { text: 'Optimiser le circuit' }), h('p', { text: 'SP WORK calcule l\'ordre de passage le plus court depuis le dépôt et le trace sur la carte.' }))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: chargerEssai }, 'Charger un jeu d\'essai fictif'),
        h('span', { class: 'small muted', text: 'Douze clients « Exemple » et neuf BL pour voir le résultat tout de suite. Supprimable en un geste dans l\'onglet Clients.' })));
  }

  /* --- Bons de livraison --- */
  function buildBL() {
    const P = S.pane;
    P.seg = h('div', { class: 'seg' }, [['jour', 'Du jour'], ['attente', 'À livrer'], ['echecs', 'Non livrés'], ['livres', 'Livrés']].map(v =>
      h('button', { type: 'button', 'data-v': v[0], onclick: () => { S.vueBL = v[0]; drawBL(); } }, v[1])));
    P.liste = h('div', { class: 'stack' });
    P.cherche = h('input', { class: 'input', id: 'bl-cherche', type: 'search', placeholder: 'Chercher un BL livré : numéro, client, ville, commande', value: S.filtreBL, oninput: () => { S.filtreBL = P.cherche.value; S.maxLivres = 60; drawBL(); } });
    S.el.body.appendChild(h('div', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('h2', { text: 'Bons de livraison' }), P.seg,
        h('button', { class: 'btn', type: 'button', onclick: importBL }, SP.icon('upload'), 'Importer Excel'),
        h('button', { class: 'btn', type: 'button', onclick: () => editBL(null) }, SP.icon('plus'), 'Nouveau BL'),
        h('button', { class: 'btn primary', type: 'button', onclick: importPDF }, SP.icon('doc'), 'Lire des BL en PDF')),
      P.cherche, P.liste));
  }
  function ligneBL(id, bl) {
    const l = lieuBL(bl);
    return h('button', { class: 'item', type: 'button', onclick: () => editBL(id) },
      h('div', { class: 'grow' }, h('div', { class: 't', text: 'BL ' + bl.numero + ' · ' + l.client }),
        h('div', { class: 's', text: [adr(l) || 'Lieu à préciser', bl.colis ? bl.colis + ' colis' : '', bl.poids ? SP.fmt(bl.poids) + ' kg' : ''].filter(Boolean).join(' · ') }),
        bl.statut === 'livre' && bl.livraison ? h('div', { class: 's', text: ['Livré le ' + frHeure(bl.livraison.at), bl.livraison.parNom ? 'par ' + bl.livraison.parNom : '', bl.livraison.signataire ? 'réceptionné par ' + bl.livraison.signataire : '', etatEmail(bl.livraison)].filter(Boolean).join(' · ') }) : null),
      !hasPos(l) ? h('span', { class: 'pill warn', text: 'À localiser' }) : null,
      bl.chauffeur ? h('span', { class: 'pill neutral', text: SP.auth.nom(bl.chauffeur) || 'Chauffeur' }) : null,
      h('span', { class: 'pill ' + statutBL(bl)[0], text: statutBL(bl)[1] }));
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
    } else if (S.vueBL === 'livres') {
      if (!S.subLivres) { const st = S; S.subLivres = true; S.subs.push(store.watch({ coll: 'bls', where: ['statut', '==', 'livre'] }, m => { if (m) { st.livres = m; refresh(); } })); }
      if (!S.livres) out.push(h('div', { class: 'empty', text: 'Chargement des BL livrés…' }));
      else {
        const f = SP.norm(S.filtreBL);
        const rows = [...S.livres].filter(e => { if (!f) return true; const b = e[1], l = lieuBL(b); return SP.norm([b.numero, l.client, l.libelle, l.ville, l.cp, b.commande, (b.livraison || {}).signataire].join(' ')).indexOf(f) >= 0; })
          .sort((a, b) => String(b[1].date || '').localeCompare(String(a[1].date || '')) || tri(a, b));
        out.push(h('div', { class: 'small muted', text: rows.length + ' BL livré' + (rows.length > 1 ? 's' : '') + (f ? ' pour cette recherche' : ' au total') + ', du plus récent au plus ancien. Ouvrez un BL pour voir la signature.' }));
        if (!rows.length) out.push(h('div', { class: 'card empty', text: f ? 'Aucun BL livré ne correspond à cette recherche.' : 'Aucun BL livré pour l\'instant.' }));
        let jour = null, liste = null;
        rows.slice(0, S.maxLivres).forEach(e => {
          const d = e[1].date || '';
          if (d !== jour) { jour = d; out.push(h('div', { class: 'daysep', text: SP.frDate(d) || 'Sans date' })); liste = h('div', { class: 'list' }); out.push(liste); }
          liste.appendChild(ligneBL(e[0], e[1]));
        });
        if (rows.length > S.maxLivres) out.push(h('button', { class: 'btn', type: 'button', onclick: () => { S.maxLivres += 60; drawBL(); } }, 'Afficher les ' + Math.min(60, rows.length - S.maxLivres) + ' suivants'));
      }
    } else {
      const parJour = new Map();
      [...(S.vueBL === 'echecs' ? S.echecs : S.attente)].forEach(e => { const d = e[1].date || ''; if (!parJour.has(d)) parJour.set(d, []); parJour.get(d).push(e); });
      const jours = [...parJour.keys()].sort();
      if (!jours.length) out.push(h('div', { class: 'card empty', text: S.vueBL === 'echecs' ? 'Aucun problème de livraison signalé.' : 'Tout est livré : aucun BL en attente.' }));
      jours.forEach(d => {
        out.push(h('div', { class: 'row' }, h('div', { class: 'daysep', text: SP.frDate(d) }), d < SP.today() && S.vueBL !== 'echecs' ? h('span', { class: 'pill crit', text: 'En retard' }) : null,
          h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { S.tab = 'tournee'; setDate(d); showTab(); } }, 'Voir la tournée')));
        out.push(h('div', { class: 'list' }, parJour.get(d).sort(tri).map(e => ligneBL(e[0], e[1]))));
      });
    }
    P.cherche.style.display = S.vueBL === 'livres' ? '' : 'none';
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

  /* ---------- statuts, chauffeurs, preuves ---------- */
  function statutBL(bl) {
    const l = bl.livraison || {};
    if (bl.statut === 'livre') return l.reserves ? ['warn', 'Livré avec réserves'] : ['ok', 'Livré'];
    if (bl.statut === 'echec') return ['crit', 'Non livré' + (l.motif ? ' : ' + l.motif : '')];
    return ['neutral', 'À livrer'];
  }
  function pillStop(s) {
    if (s.echec) return h('span', { class: 'pill crit', text: statutBL(s.bls.find(b => b.statut === 'echec'))[1] });
    if (s.fait) return h('span', { class: 'pill ' + (s.reserves ? 'warn' : 'ok'), text: s.reserves ? 'Livré avec réserves' : 'Livré' });
    return null;
  }
  const frHeure = iso => { try { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  function affecter(stops, tout) {
    const m = SP.modal({ titre: 'Affecter à un chauffeur' });
    const nb = stops.reduce((n, s) => n + s.bls.length, 0);
    const go = async cible => {
      m.close();
      const source = S.tournees.get(tourId());
      const jobs = [];
      stops.forEach(s => s.bls.forEach(b => { const d = Object.assign({}, b); delete d.id; d.chauffeur = cible; d.maj = new Date().toISOString(); jobs.push(() => store.set('bls', b.id, d, true)); }));
      if (tout && source && source.ordre && !S.tournees.get(tourId(cible))) jobs.push(() => store.set('tournees', tourId(cible), Object.assign({}, source, { chauffeur: cible, maj: new Date().toISOString() }), true));
      const ok = await store.batch(jobs);
      if (ok < jobs.length) SP.toast('Affectation incomplète : réessayez.', true);
      else { SP.toast(nb + ' BL affecté(s) à ' + (cible ? SP.auth.nom(cible) : 'personne') + '.'); if (tout) { S.chauffeur = cible; S.sel = null; if (S.map) S.map.fit(); refresh(); } }
    };
    const liste = SP.auth.actifs().filter(p => p.id !== S.chauffeur);
    m.body.append(h('div', { class: 'small muted', text: nb + ' BL concerné(s). L\'attribution est facultative et sert seulement à s\'organiser : tous les BL du jour restent visibles et livrables par tous dans « Ma tournée », avec le nom du chauffeur prévu.' }),
      h('div', { class: 'sugg', style: 'max-height:none' },
        liste.map(p => h('button', { type: 'button', onclick: () => go(p.id) }, h('b', { text: p.nom || p.email }), ' · ' + (p.role === 'chauffeur' ? 'chauffeur' : 'bureau') + ', ' + (SITES[p.site] || SITES.genas).nom)),
        S.chauffeur ? h('button', { type: 'button', onclick: () => go('') }, 'Retirer l\'affectation') : null),
      liste.length ? null : h('div', { class: 'notice', text: 'Aucun autre compte actif. Les chauffeurs créent leur compte depuis l\'écran de connexion, puis vous les activez dans Réglages > Utilisateurs.' }));
  }
  async function voirPreuve(id) {
    const p = await store.get('preuves', id);
    if (!p) { SP.toast('Preuve de livraison introuvable.', true); return; }
    const m = SP.modal({ titre: 'Preuve de livraison' });
    m.body.append(
      h('div', null, h('b', { text: p.client || '' }), h('div', { class: 'small muted', text: p.lieu || '' })),
      h('div', { text: 'Réceptionné par ' + (p.signataire || '?') + ', le ' + frHeure(p.at) + '. Livré par ' + (p.parNom || '?') + '.' }),
      p.reserves ? h('div', { class: 'notice', text: 'Réserves : ' + p.reserves }) : null,
      /^data:image\/png;base64,/.test(p.signature || '') ? h('img', { src: p.signature, alt: 'Signature de ' + (p.signataire || ''), style: 'max-width:100%;border:1px solid var(--line);border-radius:8px;background:#fff' }) : h('div', { class: 'muted', text: 'Pas de signature enregistrée.' }));
    m.setActions(h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, 'Fermer'));
  }
  function blocLivraison(b, id) {
    const l = b.livraison; if (!l || b.statut === 'a-livrer') return null;
    return h('div', { class: 'pointbox' },
      h('div', { class: 'row' }, h('b', { class: 'grow', text: b.statut === 'echec' ? 'Livraison non effectuée' : 'Livraison effectuée' }), h('span', { class: 'pill ' + statutBL(b)[0], text: statutBL(b)[1] })),
      h('div', { class: 'small', text: [frHeure(l.at), l.parNom ? 'par ' + l.parNom : '', l.saisie === 'bureau' ? 'pointé depuis le bureau' : '', l.signataire ? 'réceptionné par ' + l.signataire : ''].filter(Boolean).join(' · ') }),
      l.reserves ? h('div', { class: 'small', text: 'Réserves : ' + l.reserves }) : null,
      l.commentaire ? h('div', { class: 'small', text: 'Commentaire : ' + l.commentaire }) : null,
      etatEmail(l) ? h('div', { class: 'small', text: etatEmail(l) }) : null,
      b.statut === 'livre' ? h('div', { class: 'row' },
        l.preuve ? h('button', { class: 'btn sm', type: 'button', onclick: () => voirPreuve(l.preuve) }, SP.icon('edit'), 'Voir la signature') : null,
        h('button', { class: 'btn sm', type: 'button', onclick: async e => { const bt = e.currentTarget; bt.disabled = true; try { await SP.blsigne.telecharger(b, lieuBL(b), l.preuve ? await store.get('preuves', l.preuve) : null); } catch (x) { SP.toast('PDF impossible à créer.', true); } bt.disabled = false; } }, SP.icon('doc'), 'BL signé en PDF'),
        id ? h('button', { class: 'btn sm', type: 'button', onclick: () => demanderEnvoi(id, b) }, SP.icon('upload'), l.email && l.email.etat === 'envoye' ? 'Renvoyer par e-mail' : 'Envoyer par e-mail') : null) : null);
  }

  /* ---------- envoi du BL signé au client ---------- */
  function etatEmail(l) {
    const e = l && l.email; if (!e) return '';
    return e.etat === 'envoye' ? 'BL signé envoyé à ' + e.a : e.etat === 'attente' ? 'envoi du BL signé en cours' : 'BL signé non envoyé à ' + e.a + (e.motif ? ' (' + e.motif + ')' : '');
  }
  /* faits : [{id, d}] BL déjà enregistrés ; met à jour leur état d'envoi et mémorise l'adresse sur le point de livraison */
  async function envoyerBLSigne(faits, lieu, preuve, email, memoriser) {
    const r = await SP.blsigne.envoyer(faits.map(x => x.d), lieu, preuve, email);
    const etat = { a: email, etat: r.ok ? 'envoye' : 'echec', at: new Date().toISOString() }; if (!r.ok) etat.motif = String(r.message || '').slice(0, 120);
    for (const x of faits) { const d = JSON.parse(JSON.stringify(x.d)); d.livraison = Object.assign({}, d.livraison, { email: etat }); await store.update('bls', x.id, d); }
    SP.toast(r.ok ? 'BL signé envoyé à ' + email + '.' : 'BL signé non envoyé : ' + r.message + ' Le bureau pourra le renvoyer.', !r.ok);
    const k = String(lieu.key || '').match(/^p:(.+):([^:]+)$/);
    if (memoriser && k && email !== (lieu.email || '')) {
      if (SP.sb) { try { await SP.sb.rpc('sp_email_point', { p_client: k[1], p_point: k[2], p_email: email }); } catch (e) { /* mémorisation facultative */ } }
      else { const c = S && S.clients.get(k[1]); const p = c && (c.points || []).find(x => x.id === k[2]); if (p) p.email = email; }
    }
    return r.ok;
  }
  function demanderEnvoi(id, b) {
    const lieu = lieuBL(b), l = b.livraison || {};
    const m = SP.modal({ titre: 'Envoyer le BL signé' });
    const mail = h('input', { class: 'input', id: 'env-email', type: 'text', inputmode: 'email', autocapitalize: 'off', value: (l.email && l.email.a) || lieu.email || '', placeholder: 'reception@client.fr' });
    m.body.append(h('div', { class: 'small muted', text: 'BL ' + b.numero + ' · ' + lieu.client + '. Le client reçoit le BL signé en pièce jointe (PDF). Plusieurs adresses possibles, séparées par une virgule.' }),
      h('label', { class: 'field' }, h('span', { text: 'E-mail du client' }), mail));
    const ok = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const email = mail.value.trim();
      if (!SP.blsigne.valides(email)) { SP.toast('Adresse e-mail invalide.', true); return; }
      ok.disabled = true; ok.textContent = 'Envoi…';
      const d = JSON.parse(JSON.stringify(b)); delete d.id;
      const fait = await envoyerBLSigne([{ id, d }], lieu, l.preuve ? await store.get('preuves', l.preuve) : null, email, true);
      if (fait) { m.close(); document.getElementById('sp-layers').replaceChildren(); } else { ok.disabled = false; ok.textContent = 'Envoyer'; }
    } }, 'Envoyer');
    m.setActions(h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'), ok);
  }

  /* ---------- Ma tournée : l'écran des chauffeurs ---------- */
  function mountChauffeur(main) {
    const moi = SP.auth.profil, bureau = SP.auth.estBureau();
    const premier = SP.auth.actifs().find(p => p.role === 'chauffeur');
    S = {
      tab: 'chauffeur', site: moi.site || 'genas', date: SP.today(), chauffeur: moi.id,
      clients: new Map(), blsJour: new Map(), attente: new Map(), echecs: new Map(), tournees: new Map(), reglages: {},
      charge: { clients: false, bls: false }, lent: false, sel: null, map: null, subs: [], subsDate: [], pane: {}
    };
    const st = S;
    const jour = h('b', { class: 'grow', style: 'text-align:center' });
    S.syncBar = () => { jour.textContent = (st.date === SP.today() ? 'Aujourd\'hui · ' : '') + SP.frDate(st.date, true); };
    const qui = null;
    S.pane.qui = qui; S.pane.liste = h('div', { class: 'stack' });
    main.appendChild(h('div', { class: 'lv' },
      h('div', { class: 'lv-bar' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Jour précédent', onclick: () => setDate(SP.addDays(st.date, -1)) }, SP.icon('left')),
        jour,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Jour suivant', onclick: () => setDate(SP.addDays(st.date, 1)) }, SP.icon('right')),
        qui),
      h('div', { class: 'lv-body' }, h('div', { class: 'pane', style: 'max-width:720px' }, S.pane.liste))));
    S.subs.push(store.watch({ coll: 'clients' }, m => { if (m) st.clients = m; st.charge.clients = true; refresh(); }));
    S.subs.push(store.watch({ coll: 'reglages' }, m => { if (m) { st.reglages = m.get('livraison') || {}; refresh(); } }));
    const surProfils = () => { if (S === st) refresh(); }; SP.auth.ecoute.add(surProfils); S.subs.push(() => SP.auth.ecoute.delete(surProfils));
    S.syncBar(); subDate();
    geo.load().then(() => { if (S === st) refresh(); }, () => { });
    refresh();
    return () => { st.subs.concat(st.subsDate).forEach(f => f()); if (S === st) S = null; };
  }
  function drawChauffeur() {
    const P = S.pane, out = [];
    const ch = etatChargement(); if (ch) out.push(ch);
    const gardeSite = S.site, gardeCh = S.chauffeur; let total = 0, faits = 0;
    const blocs = [];
    /* les livraisons attribuées à ce chauffeur, puis celles du jour sans chauffeur attribué (visibles par tous) */
    const autres = [...new Set([...S.blsJour.values()].map(b => b.chauffeur || ''))].filter(c => c && c !== gardeCh).sort((a, b) => SP.auth.nom(a).localeCompare(SP.auth.nom(b), 'fr'));
    [gardeCh, ''].concat(autres).filter((c, i, t) => t.indexOf(c) === i).forEach(ch => {
      Object.keys(SITES).forEach(site => {
        S.site = site; S.chauffeur = ch; const T = computeTour(); const tous = T.stops.concat(T.sans);
        if (!tous.length) return;
        total += tous.length; faits += tous.filter(s => s.fait).length;
        blocs.push(h('div', { class: 'daysep', text: (ch === gardeCh && ch ? 'Mes livraisons' : ch ? 'Prévu pour ' + (SP.auth.nom(ch) || 'un autre chauffeur') : 'Livraisons du jour') + ' · départ ' + SITES[site].nom + ' · ' + tous.length + ' arrêt' + (tous.length > 1 ? 's' : '') }));
        tous.forEach((s, i) => blocs.push(carteChauffeur(s, i < T.stops.length ? i + 1 : null)));
        const liens = liensMaps(T);
        liens.forEach((u, i) => blocs.push(h('a', { class: 'btn', href: u, target: '_blank', rel: 'noopener' }, SP.icon('ext'), liens.length > 1 ? 'Itinéraire complet, tronçon ' + (i + 1) + '/' + liens.length : 'Itinéraire complet dans Google Maps')));
      });
    });
    S.chauffeur = gardeCh;
    S.site = gardeSite;
    if (total) out.push(h('div', { class: 'stats', style: 'grid-template-columns:1fr 1fr' },
      h('div', null, h('b', { text: faits + ' / ' + total }), h('span', { text: 'Arrêts traités' })),
      h('div', null, h('b', { text: String(total - faits) }), h('span', { text: 'Restant à livrer' }))));
    else if (!ch) out.push(h('div', { class: 'card empty', text: 'Aucune livraison prévue ce jour-là.' }));
    P.liste.replaceChildren(...out, ...blocs);
  }
  function carteChauffeur(s, n) {
    const l = s.lieu;
    const dest = (l.geo === 'manuel' && hasPos(l)) || !l.ville ? (hasPos(l) ? l.lat + ',' + l.lon : '') : adr(l);
    const colis = s.bls.reduce((k, b) => k + (Number(b.colis) || 0), 0), poids = s.bls.reduce((k, b) => k + (Number(b.poids) || 0), 0);
    const l0 = (s.bls[0].livraison) || {};
    return h('div', { class: 'stop' + (s.fait ? ' done' : ''), style: 'grid-template-columns:auto minmax(0,1fr)' },
      h('div', { class: 'stop-n', text: n ? String(n) : '?' }),
      h('div', { class: 'stack', style: 'gap:8px' },
        h('div', null, h('h3', { text: l.client, style: 'font-size:1.1rem' }),
          h('div', { class: 'adr', text: [l.libelle, adr(l)].filter(Boolean).join(' · ') || 'Adresse à demander au bureau' }),
          l.horaires ? h('div', { class: 'adr', text: l.horaires }) : null,
          (l.contact || l.tel) ? h('div', { class: 'adr' }, [l.contact, ''].filter(Boolean).join(' · '), l.contact && l.tel ? ' · ' : '', l.tel ? h('a', { href: 'tel:' + String(l.tel).replace(/[^\d+]/g, ''), text: l.tel }) : null) : null),
        h('div', { class: 'meta', style: 'margin:0' },
          s.bls.map(b => h('span', { class: 'pill neutral', text: 'BL ' + b.numero })),
          (colis || poids) ? h('span', { class: 'pill neutral num', text: [colis ? colis + ' colis' : '', poids ? SP.fmt(poids) + ' kg' : ''].filter(Boolean).join(' · ') }) : null,
          pillStop(s)),
        s.bls.filter(b => contenuBL(b)).map(b => h('div', { class: 'pointbox', style: 'padding:8px 10px;gap:4px' }, h('b', { class: 'small', text: 'BL ' + b.numero }), contenuBL(b))),
        s.bls.filter(b => b.note).map(b => h('div', { class: 'notice info', text: 'BL ' + b.numero + ' : ' + b.note })),
        s.fait ? h('div', { class: 'small muted', text: [frHeure(l0.at), l0.signataire ? 'réceptionné par ' + l0.signataire : '', l0.reserves ? 'réserves : ' + l0.reserves : '', l0.commentaire || '', etatEmail(l0)].filter(Boolean).join(' · ') }) : null,
        h('div', { class: 'row' },
          dest ? h('a', { class: 'btn', href: 'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', destination: dest, travelmode: 'driving' }).toString(), target: '_blank', rel: 'noopener' }, SP.icon('pin'), 'GPS') : null,
          s.fait ? h('button', { class: 'btn', type: 'button', onclick: () => feuilleLivraison(s) }, SP.icon('edit'), 'Corriger')
            : [h('button', { class: 'btn primary grow', type: 'button', onclick: () => feuilleLivraison(s) }, SP.icon('check'), 'Livrer'),
              h('button', { class: 'btn danger', type: 'button', onclick: () => feuilleProbleme(s) }, 'Problème')])));
  }
  async function enregistrerLivraison(stop, statut, infos) {
    const base = { at: new Date().toISOString(), par: SP.auth.profil.id, parNom: SP.auth.profil.nom || '' };
    const faits = stop.bls.map(b => { const d = Object.assign({}, b); delete d.id; d.statut = statut; d.livraison = Object.assign({}, base, infos); d.maj = base.at; return { id: b.id, d }; });
    const jobs = faits.map(x => () => store.update('bls', x.id, x.d));
    return (await store.batch(jobs)) === jobs.length ? faits : null;
  }
  function feuilleLivraison(stop) {
    const m = SP.modal({ titre: 'Livraison : ' + stop.lieu.client, verrou: true });
    const nom = h('input', { class: 'input', id: 'lv-signataire', autocomplete: 'off', placeholder: 'Prénom et nom' });
    const avec = h('input', { type: 'checkbox', id: 'lv-avec-reserves', onchange: () => { res.style.display = avec.checked ? '' : 'none'; } });
    const res = h('textarea', { class: 'input', id: 'lv-reserves', placeholder: 'Colis abîmé, manquant, emballage ouvert…', style: 'display:none' });
    const cv = h('canvas', { style: 'width:100%;height:190px;background:#fff;border:1px solid var(--line);border-radius:8px;touch-action:none;display:block', 'aria-label': 'Zone de signature' });
    let signe = false, last = null;
    const ctx = cv.getContext('2d');
    function taille() { const r = cv.getBoundingClientRect(); if (!r.width) return; cv.width = Math.round(r.width * 2); cv.height = Math.round(r.height * 2); ctx.scale(2, 2); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height); ctx.strokeStyle = '#14263A'; ctx.lineWidth = 2.200; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; signe = false; }
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); last = pos(e); ctx.beginPath(); ctx.arc(last[0], last[1], 1.100, 0, 6.300); ctx.fillStyle = '#14263A'; ctx.fill(); signe = true; });
    cv.addEventListener('pointermove', e => { if (!last) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; });
    const fin = () => { last = null; }; cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    const mail = h('input', { class: 'input', id: 'lv-email', type: 'text', inputmode: 'email', autocomplete: 'off', autocapitalize: 'off', placeholder: 'reception@client.fr', value: stop.lieu.email || '' });
    m.body.append(
      h('div', { class: 'small muted', text: stop.bls.map(b => 'BL ' + b.numero).join(', ') + ' · ' + adr(stop.lieu) }),
      h('label', { class: 'field' }, h('span', { text: 'Personne qui réceptionne *' }), nom),
      h('label', { class: 'field' }, h('span', { text: 'E-mail du client pour recevoir le BL signé' }), mail),
      h('div', { class: 'small muted', style: 'margin-top:-8px', text: stop.lieu.email ? 'Adresse enregistrée pour ce client : corrigez-la si besoin.' : 'Demandez l\'adresse au client : elle sera mémorisée pour les prochaines livraisons. Laissez vide s\'il n\'en veut pas.' }),
      h('label', { class: 'row', for: 'lv-avec-reserves' }, avec, h('span', { text: 'Le client émet des réserves' })), res,
      h('div', { class: 'field' }, h('div', { class: 'row' }, h('span', { class: 'grow', text: 'Signature du client *' }), h('button', { class: 'btn sm', type: 'button', onclick: taille }, 'Effacer')), cv));
    const ok = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (!nom.value.trim()) { SP.toast('Indiquez le nom de la personne qui réceptionne.', true); return; }
      if (!signe) { SP.toast('Faites signer le client dans le cadre blanc.', true); return; }
      if (avec.checked && !res.value.trim()) { SP.toast('Décrivez les réserves du client.', true); return; }
      const email = mail.value.trim();
      if (email && !SP.blsigne.valides(email)) { SP.toast('L\'adresse e-mail du client n\'est pas valide. Corrigez-la ou videz le champ.', true); return; }
      ok.disabled = true;
      const pid = store.newId(), reserves = avec.checked ? res.value.trim() : '';
      const preuve = { bl: stop.bls.map(b => b.id).join(','), date: S.date, client: stop.lieu.client, lieu: adr(stop.lieu), signataire: nom.value.trim(), reserves, signature: cv.toDataURL('image/png'), at: new Date().toISOString(), par: SP.auth.profil.id, parNom: SP.auth.profil.nom || '' };
      const faits = (await store.insert('preuves', pid, preuve)) && await enregistrerLivraison(stop, 'livre', Object.assign({ signataire: preuve.signataire, reserves, preuve: pid }, email ? { email: { a: email, etat: 'attente' } } : {}));
      if (!faits) { ok.disabled = false; return; }
      SP.toast(email ? 'Livraison enregistrée. Envoi du BL signé au client…' : 'Livraison enregistrée.'); m.close();
      if (email) envoyerBLSigne(faits, stop.lieu, preuve, email, true);
    } }, 'Valider la livraison');
    m.setActions(h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'), ok);
    requestAnimationFrame(taille);
  }
  function feuilleProbleme(stop) {
    const m = SP.modal({ titre: 'Problème : ' + stop.lieu.client });
    const motif = h('select', { class: 'input', id: 'lv-motif' }, ['Client absent', 'Site fermé', 'Marchandise refusée', 'Adresse introuvable', 'Accès impossible', 'Autre'].map(t => h('option', { value: t, text: t })));
    const com = h('textarea', { class: 'input', id: 'lv-commentaire', placeholder: 'Précisions pour le bureau' });
    m.body.append(h('div', { class: 'small muted', text: stop.bls.map(b => 'BL ' + b.numero).join(', ') }),
      h('label', { class: 'field' }, h('span', { text: 'Motif' }), motif), h('label', { class: 'field' }, h('span', { text: 'Commentaire' }), com),
      h('div', { class: 'small muted', text: 'Le bureau voit le problème immédiatement dans SP WORK. En cas d\'urgence, appelez-le aussi.' }));
    const ok = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (motif.value === 'Autre' && !com.value.trim()) { SP.toast('Précisez le problème en commentaire.', true); return; }
      ok.disabled = true;
      if (await enregistrerLivraison(stop, 'echec', { motif: motif.value, commentaire: com.value.trim() })) { SP.toast('Problème signalé au bureau.'); m.close(); } else ok.disabled = false;
    } }, 'Signaler au bureau');
    m.setActions(h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'), ok);
  }

  /* ---------- sauvegarde et export (bureau) ---------- */
  function telechargerFichier(nom, contenu, type) {
    const u = URL.createObjectURL(new Blob([contenu], { type })), a = h('a', { href: u, download: nom });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  function blocSauvegarde() {
    const info = h('div', { class: 'small muted' });
    const maj = () => { const d = prefs.get('sauvegarde', ''); info.textContent = d ? 'Dernière sauvegarde complète téléchargée sur cet appareil : ' + frHeure(d) + '.' : 'Aucune sauvegarde complète téléchargée depuis cet appareil.'; };
    maj();
    const complet = h('button', { class: 'btn', type: 'button', onclick: async () => {
      complet.disabled = true; const avant = complet.lastChild.textContent; complet.lastChild.textContent = 'Préparation…';
      try {
        const out = { application: 'SP WORK', version: 1, date: new Date().toISOString(), tables: {} }; let n = 0;
        for (const c of ['clients', 'bls', 'tournees', 'reglages', 'preuves', 'fabrications']) { const m = await store.query(c); out.tables[c] = [...m].map(e => ({ id: e[0], data: e[1] })); n += m.size; }
        out.tables.profils = [...SP.auth.profils.values()];
        telechargerFichier('spwork-sauvegarde-' + SP.today() + '.json', JSON.stringify(out), 'application/json');
        prefs.set('sauvegarde', out.date); maj();
        SP.toast('Sauvegarde téléchargée : ' + out.tables.clients.length + ' clients, ' + out.tables.bls.length + ' BL, ' + out.tables.preuves.length + ' signatures.');
      } catch (e) { SP.toast('Sauvegarde impossible pour l\'instant. Réessayez.', true); }
      complet.disabled = false; complet.lastChild.textContent = avant;
    } }, SP.icon('doc'), 'Sauvegarde complète');
    const liste = h('button', { class: 'btn', type: 'button', onclick: async () => {
      liste.disabled = true;
      try {
        const m = await store.query('bls');
        const q = v => { const t = String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' '); return /^0\d+$/.test(t) ? '"=""' + t + '"""' : '"' + t + '"'; };
        const lib = { 'a-livrer': 'À livrer', livre: 'Livré', echec: 'Non livré' };
        const rows = [['N° BL', 'Date de livraison', 'Départ', 'Client', 'Lieu de livraison', 'Adresse', 'Code postal', 'Ville', 'Commande client', 'Statut', 'Livré le', 'Livré par', 'Réceptionné par', 'Réserves', 'Motif de non-livraison', 'BL signé envoyé à', 'Contenu']];
        [...m.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.numero).localeCompare(String(b.numero))).forEach(b => {
          const l = lieuBL(b), v = b.livraison || {};
          rows.push([b.numero, b.date ? b.date.split('-').reverse().join('/') : '', (SITES[b.site] || {}).nom || '', l.client, l.libelle || '', l.adresse || '', l.cp || '', l.ville || '', b.commande || '', lib[b.statut] || b.statut || '',
            v.at && b.statut !== 'a-livrer' ? new Date(v.at).toLocaleString('fr-FR') : '', v.parNom || '', v.signataire || '', v.reserves || '', b.statut === 'echec' ? [v.motif, v.commentaire].filter(Boolean).join(' - ') : '', v.email && v.email.etat === 'envoye' ? v.email.a : '',
            (b.lignes || []).map(x => (x.qte ? x.qte + ' x ' : '') + x.des).join(' | ')]);
        });
        telechargerFichier('spwork-bons-de-livraison-' + SP.today() + '.csv', '\uFEFF' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
        SP.toast('Liste de ' + (rows.length - 1) + ' BL téléchargée.');
      } catch (e) { SP.toast('Export impossible pour l\'instant. Réessayez.', true); }
      liste.disabled = false;
    } }, SP.icon('chart'), 'Liste des BL pour Excel');
    return h('div', { class: 'stack' }, h('b', { text: 'Sauvegarde des données' }),
      h('div', { class: 'small muted', text: 'La sauvegarde complète contient les clients, les BL, les tournées, les signatures, le planning de l\'atelier et les comptes, dans un seul fichier. Téléchargez-la chaque semaine et rangez-la dans un dossier de l\'entreprise : elle permet de reconstruire la base en cas de perte. La liste pour Excel sert à consulter ou analyser les livraisons.' }),
      h('div', { class: 'row' }, complet, liste), info);
  }

  /* ---------- utilisateurs (bureau) ---------- */
  function blocUtilisateurs() {
    const zone = h('div', { class: 'stack' });
    const draw = () => {
      if (!zone.isConnected && zone.children.length) { SP.auth.ecoute.delete(draw); return; }
      const moi = SP.auth.profil.id;
      const tous = [...SP.auth.profils.values()].sort((a, b) => (a.actif === b.actif ? 0 : a.actif ? 1 : -1) || String(a.nom).localeCompare(String(b.nom), 'fr'));
      zone.replaceChildren(h('b', { text: 'Utilisateurs' }),
        h('div', { class: 'small muted', text: 'Chaque personne crée son compte depuis l\'écran de connexion de SP WORK. Elle apparaît ensuite ici, « en attente » : cochez « Actif » et choisissez son rôle. Un chauffeur ne voit que sa tournée ; le bureau voit tout.' }),
        ...tous.map((p, n) => {
          const nom = h('input', { class: 'input', id: 'us-nom-' + n, value: p.nom || '', 'aria-label': 'Nom', onchange: () => SP.auth.majProfil(p.id, { nom: nom.value.trim() }) });
          const role = h('select', { class: 'input', id: 'us-role-' + n, 'aria-label': 'Rôle', disabled: p.id === moi, onchange: () => SP.auth.majProfil(p.id, { role: role.value }) }, h('option', { value: 'chauffeur', text: 'Chauffeur', selected: p.role === 'chauffeur' }), h('option', { value: 'bureau', text: 'Bureau', selected: p.role === 'bureau' }));
          const site = h('select', { class: 'input', id: 'us-site-' + n, 'aria-label': 'Site', onchange: () => SP.auth.majProfil(p.id, { site: site.value }) }, Object.keys(SITES).map(k => h('option', { value: k, text: SITES[k].nom, selected: p.site === k })));
          const actif = h('input', { type: 'checkbox', id: 'us-actif-' + n, checked: p.actif, disabled: p.id === moi, onchange: () => SP.auth.majProfil(p.id, { actif: actif.checked }) });
          return h('div', { class: 'pointbox' },
            h('div', { class: 'row' }, h('span', { class: 'grow small muted', text: p.email || '' }), p.actif ? null : h('span', { class: 'pill warn', text: 'En attente' }), h('label', { class: 'row', for: 'us-actif-' + n }, actif, h('span', { text: 'Actif' }))),
            h('div', { class: 'fgrid' }, nom, role, site));
        }));
    };
    SP.auth.ecoute.add(draw); draw();
    return zone;
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
          f('email', 'E-mail pour l\'envoi du BL signé'),
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
    const b = src ? JSON.parse(JSON.stringify(src)) : { numero: '', date: S.date, site: S.site, chauffeur: S.chauffeur || '', clientId: '', pointId: '', colis: '', poids: '', note: '', statut: 'a-livrer' };
    let autre = !!b.lieu, lieu = b.lieu ? Object.assign({}, b.lieu) : {}, garder = false, nomLibre = '';
    const m = SP.modal({ titre: neuf ? 'Nouveau bon de livraison' : 'BL ' + b.numero, large: true });
    const inp = (k, label, extra) => { const i = h('input', Object.assign({ class: 'input', id: 'bl-' + k, value: b[k] == null ? '' : b[k], oninput: () => { b[k] = i.value.trim(); } }, extra || {})); return h('label', { class: 'field' }, h('span', { text: label }), i); };
    const siteSel = h('select', { class: 'input', id: 'bl-site', onchange: () => { b.site = siteSel.value; } }, Object.keys(SITES).map(k => h('option', { value: k, text: SITES[k].nom, selected: b.site === k })));
    const statSel = h('select', { class: 'input', id: 'bl-statut', onchange: () => { b.statut = statSel.value; } }, h('option', { value: 'a-livrer', text: 'À livrer', selected: b.statut !== 'livre' && b.statut !== 'echec' }), h('option', { value: 'livre', text: 'Livré', selected: b.statut === 'livre' }), h('option', { value: 'echec', text: 'Non livré (problème)', selected: b.statut === 'echec' }));
    const chSel = h('select', { class: 'input', id: 'bl-chauffeur', onchange: () => { b.chauffeur = chSel.value; } }, h('option', { value: '', text: 'Tous les chauffeurs', selected: !b.chauffeur }), SP.auth.actifs().map(p => h('option', { value: p.id, text: p.nom || p.email, selected: b.chauffeur === p.id })));
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
        h('label', { class: 'field' }, h('span', { text: 'Départ' }), siteSel),
        h('label', { class: 'field' }, h('span', { text: 'Chauffeur' }), chSel)),
      blocLivraison(b, id), zClient, zLieu,
      contenuBL(b) ? h('div', { class: 'pointbox' }, h('b', { text: 'Contenu du BL' }), contenuBL(b)) : null,
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
        if (b.statut === 'a-livrer') delete b.livraison;
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
      h('div', { class: 'small muted', text: 'Ces trois valeurs servent aux estimations de distance et de durée. Ajustez-les après quelques tournées réelles.' }),
      blocUtilisateurs(), blocSauvegarde());
    m.setActions(h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { if (await store.set('reglages', 'livraison', r)) { SP.toast('Réglages enregistrés.'); m.close(); } } }, 'Enregistrer'));
  }

  /* ---------- lecture de BL en PDF (Cegid PMI) ---------- */
  function contenuBL(b) {
    if (!(b.lignes && b.lignes.length) && !b.commande) return null;
    return h('div', { class: 'small' },
      b.commande ? h('div', { class: 'muted', text: 'Commande client ' + b.commande }) : null,
      (b.lignes || []).map(l => h('div', { text: (l.qte ? SP.fmt(l.qte) + ' × ' : '') + l.des })));
  }
  function importPDF() {
    const m = SP.modal({ titre: 'Lire des BL en PDF', large: true });
    const fileIn = h('input', { type: 'file', id: 'pdf-files', class: 'input', accept: 'application/pdf,.pdf,image/*', multiple: true });
    const zone = h('div', { class: 'stack' });
    m.body.append(
      h('div', { class: 'notice info', text: 'Choisissez un ou plusieurs BL sortis de Cegid PMI. Un PDF enregistré depuis Cegid (« Imprimer en PDF ») est lu exactement. Un BL scanné ou photographié est lu par reconnaissance de caractères : relisez-le avant d\'enregistrer. Les BL partiront du dépôt de ' + SITES[S.site].nom + '.' }),
      h('label', { class: 'field' }, h('span', { text: 'Fichiers PDF ou photos' }), fileIn), zone);
    let liste = [];
    fileIn.addEventListener('change', async () => {
      const files = [...fileIn.files]; if (!files.length) return;
      const fill = h('i'), txt = h('div', { class: 'small muted', text: 'Préparation…' });
      zone.replaceChildren(h('div', { class: 'bar' }, fill), txt); m.setActions();
      try { await geo.load(); } catch (e) { /* sans localisation */ }
      const lus = await SP.blpdf.lire(files, (nom, i, n) => { txt.textContent = 'Lecture de ' + nom + ' (' + i + ' / ' + n + ')'; fill.style.width = Math.round(100 * (i - 0.5) / n) + '%'; });
      for (const r of lus) { r.garder = r.source !== 'erreur' && !!r.numero; r.existe = r.numero ? !!(await store.get('bls', blId(r.numero))) : false; }
      liste = liste.filter(x => !lus.some(y => y.numero && y.numero === x.numero)).concat(lus);
      fileIn.value = ''; draw();
    });
    function draw() {
      const cartes = liste.map((r, n) => {
        if (r.source === 'erreur') return h('div', { class: 'notice', text: r.fichier + ' : fichier illisible. Vérifiez qu\'il s\'agit bien d\'un PDF ou d\'une image.' });
        const f = (k, label, extra) => { const i = h('input', Object.assign({ class: 'input', id: 'pdf' + n + '-' + k, value: r[k] || '', oninput: () => { r[k] = i.value.trim(); if (k === 'cp' || k === 'ville') loc(); } }, extra || {})); return h('label', { class: 'field' }, h('span', { text: label }), i); };
        const etat = h('span', { class: 'pill neutral' });
        const loc = () => { const g = geo.locate(r.cp, r.ville); etat.className = 'pill ' + (g ? 'neutral' : 'warn'); etat.textContent = g ? 'Localisé : ' + g.commune : 'Commune introuvable'; };
        loc();
        const cb = h('input', { type: 'checkbox', id: 'pdf' + n + '-garder', checked: r.garder, onchange: () => { r.garder = cb.checked; boutons(); } });
        const contenu = h('textarea', { class: 'input', id: 'pdf' + n + '-contenu', value: (r.lignes || []).map(l => (l.qte ? SP.fmt(l.qte) + ' × ' : '') + l.des).join('\n'), oninput: () => { r.lignes = contenu.value.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const q = s.match(/^(\d+(?:[.,]\d+)?)\s*[×x]\s*(.+)$/); return q ? { qte: Number(q[1].replace(',', '.')), des: q[2] } : { qte: 0, des: s }; }); } });
        return h('div', { class: 'pointbox' },
          h('div', { class: 'row' }, h('label', { class: 'row grow', for: 'pdf' + n + '-garder' }, cb, h('b', { text: r.fichier + (r.page > 1 ? ' (page ' + r.page + ')' : '') })),
            h('span', { class: 'pill ' + (r.source === 'pdf' ? 'ok' : 'warn'), text: r.source === 'pdf' ? 'PDF lu exactement' : 'Scan : à relire' }),
            r.existe ? h('span', { class: 'pill neutral', text: 'Déjà présent : sera mis à jour' }) : null),
          h('div', { class: 'fgrid' }, f('numero', 'N° de BL *'), f('date', 'Date de livraison', { type: 'date' }), f('commande', 'Commande client')),
          h('div', { class: 'fgrid' }, f('client', 'Client (facturation) *'), f('livNom', 'Lieu de livraison')),
          f('adresse', 'Adresse de livraison'),
          h('div', { class: 'fgrid' }, f('cp', 'Code postal', { inputmode: 'numeric' }), f('ville', 'Ville'), f('tel', 'Téléphone')),
          h('div', { class: 'row' }, etat),
          h('label', { class: 'field' }, h('span', { text: 'Contenu (une ligne par article)' }), contenu));
      });
      zone.replaceChildren(...(cartes.length ? cartes : [h('div', { class: 'notice', text: 'Aucun BL reconnu dans ces fichiers.' })]));
      boutons();
    }
    function boutons() {
      const n = liste.filter(r => r.garder).length;
      m.setActions(h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'),
        h('button', { class: 'btn primary', type: 'button', disabled: !n, onclick: enregistrer }, 'Enregistrer ' + n + ' BL'));
    }
    async function enregistrer() {
      const bons = liste.filter(r => r.garder);
      const manque = bons.find(r => !r.numero || !(r.client || r.livNom));
      if (manque) { SP.toast('Complétez le numéro et le client de « ' + manque.fichier + ' », ou décochez-le.', true); return; }
      m.setActions();
      const parNom = new Map(); S.clients.forEach((c, id) => parNom.set(SP.norm(c.nom), id));
      const clients = new Map(), jobsC = [], jobsB = []; let nvClients = 0, nvPoints = 0;
      for (const r of bons) {
        const nom = r.client || r.livNom, cle = SP.norm(nom);
        let cid = parNom.get(cle), c = cid && (clients.get(cid) || JSON.parse(JSON.stringify(S.clients.get(cid))));
        if (!c) { cid = store.newId(); c = { nom, code: '', points: [] }; parNom.set(cle, cid); nvClients++; clients.set(cid, c); }
        c.points = c.points || [];
        const cp = /^\d{4}$/.test(r.cp) ? '0' + r.cp : r.cp;
        let p = c.points.find(x => String(x.cp) === String(cp) && SP.norm(x.adresse) === SP.norm(r.adresse));
        if (!p) {
          const g = geo.locate(cp, r.ville);
          p = Object.assign({ id: SP.uid(), libelle: r.livNom && SP.norm(r.livNom) !== cle ? r.livNom : (c.points.length ? 'Point ' + (c.points.length + 1) : 'Principal'), adresse: r.adresse, cp, ville: r.ville, tel: r.tel || '', geo: g ? 'commune' : 'aucun' }, g ? { lat: g.lat, lon: g.lon, commune: g.commune } : {});
          c.points.push(p); c.maj = new Date().toISOString(); clients.set(cid, c); nvPoints++;
        } else if (r.tel && !p.tel) { p.tel = r.tel; clients.set(cid, c); }
        const id = blId(r.numero), ancien = (await store.get('bls', id)) || {};
        const b = Object.assign({ statut: 'a-livrer', chauffeur: '', site: S.site, note: '' }, ancien, { numero: r.numero, date: r.date || ancien.date || S.date, clientId: cid, clientNom: c.nom, pointId: p.id, commande: r.commande || '', lignes: r.lignes || [], colis: r.colis || ancien.colis || '', palettes: r.palettes || '', origine: r.source, maj: new Date().toISOString() });
        delete b.lieu;
        jobsB.push(() => store.set('bls', id, b, true));
      }
      clients.forEach((c, id) => jobsC.push(() => store.set('clients', id, c, true)));
      const ok = (await store.batch(jobsC)) + (await store.batch(jobsB)), total = jobsC.length + jobsB.length;
      const dates = [...new Set(bons.map(r => r.date).filter(Boolean))].sort();
      zone.replaceChildren(h('div', { class: ok < total ? 'notice' : 'notice info', text: ok < total ? 'Enregistrement incomplet (' + ok + ' sur ' + total + ') : réessayez.' : bons.length + ' BL enregistré(s)' + (nvClients ? ', ' + nvClients + ' nouveau(x) client(s)' : '') + (nvPoints ? ', ' + nvPoints + ' point(s) de livraison ajouté(s)' : '') + '. Dates de livraison : ' + dates.map(d => SP.frDate(d, true)).join(', ') + '.' }));
      liste = [];
      m.setActions(dates.length ? h('button', { class: 'btn', type: 'button', onclick: () => { m.close(); S.tab = 'tournee'; S.chauffeur = ''; setDate(dates[0]); showTab(); } }, 'Voir la tournée du ' + SP.frDate(dates[0], true)) : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, 'Fermer'));
    }
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
          const b = { numero: r.numero, date: SP.parseDate(r.date) || S.date, site: S.site, chauffeur: '', colis: numv(r.colis), poids: numv(r.poids), note: r.note || '', statut: 'a-livrer', maj: new Date().toISOString() };
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
  SP.registerApp({ id: 'ma-tournee', nom: 'Ma tournée', icone: 'route', etat: 'actif', desc: 'L\'écran des chauffeurs : arrêts du jour, signature du client, réserves.', mount: mountChauffeur });
})();
