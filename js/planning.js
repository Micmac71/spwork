/* SP WORK : app Planning (la semaine jour par jour : livraisons issues des BL, fabrications de l'atelier saisies à la main). */
(function () {
  'use strict';
  const SP = window.SP, h = SP.h, store = SP.store;

  const SITES = { 'genas': 'Genas', 'saint-priest': 'Saint-Priest' };
  const ETATS = { 'a-lancer': ['neutral', 'À lancer'], 'en-cours': ['warn', 'En cours'], 'termine': ['ok', 'Terminé'] };
  const SUIVANT = { 'a-lancer': 'en-cours', 'en-cours': 'termine', 'termine': 'a-lancer' };
  const prefs = { get(k, d) { try { return localStorage.getItem('spwork.' + k) || d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('spwork.' + k, v); } catch (e) { /* sans mémoire locale */ } } };
  const mq = window.matchMedia('(min-width: 760px)');

  let S = null;      // état de l'app montée
  let glisse = null; // carte en cours de déplacement à la souris

  /* ---------- dates ---------- */
  function versDate(iso) { const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function lundiDe(iso) { const j = versDate(iso).getDay(); return SP.addDays(iso, j === 0 ? -6 : 1 - j); }
  function ouvre(iso) { const j = versDate(iso).getDay(); return j === 6 ? SP.addDays(iso, 2) : j === 0 ? SP.addDays(iso, 1) : iso; }
  function numSemaine(iso) {
    const d = versDate(iso); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const s1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - s1) / 86400000 - 3 + ((s1.getDay() + 6) % 7)) / 7);
  }
  function jourLong(iso) { const t = versDate(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); }
  function jourTete(iso) { const t = versDate(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
  function court(iso) { return SP.frDate(iso, true).replace(/\.$/, ''); }
  function titreSemaine() {
    const a = versDate(S.lundi), b = versDate(SP.addDays(S.lundi, 4));
    const fin = b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const deb = a.toLocaleDateString('fr-FR', a.getMonth() === b.getMonth() ? { day: 'numeric' } : { day: 'numeric', month: 'long' });
    return 'Semaine ' + numSemaine(S.lundi) + ' · du ' + deb + ' au ' + fin;
  }

  /* ---------- données dérivées ---------- */
  const duSite = x => S.site === 'tous' || x.site === S.site;
  function lieuBL(bl) {
    const c = S.clients.get(bl.clientId);
    const client = c ? c.nom : (bl.clientNom || 'Client à préciser');
    if (bl.lieu && (bl.lieu.adresse || bl.lieu.ville)) return { client, ville: bl.lieu.ville || '', key: 'x:' + SP.norm([client, bl.lieu.adresse, bl.lieu.cp, bl.lieu.ville].join(' ')) };
    const pts = (c && c.points) || [];
    const p = pts.find(x => x.id === bl.pointId) || pts[0];
    return { client, ville: p ? (p.ville || '') : '', key: 'p:' + (bl.clientId || SP.norm(client)) + ':' + (p ? p.id : '') };
  }
  /* les BL de la semaine regroupés par jour puis par lieu de livraison */
  function arrets(date) {
    const g = new Map();
    S.bls.forEach((b, id) => {
      if (b.date !== date || !duSite(b)) return;
      const l = lieuBL(b), k = (b.site || '') + '|' + l.key;
      if (!g.has(k)) g.set(k, { key: k, client: l.client, ville: l.ville, site: b.site, date, bls: [] });
      g.get(k).bls.push(Object.assign({ id }, b));
    });
    const out = [...g.values()];
    out.forEach(a => a.bls.sort((x, y) => String(x.numero).localeCompare(String(y.numero))));
    return out.sort((a, b) => a.client.localeCompare(b.client, 'fr'));
  }
  function toutesFabs() {
    const m = new Map();
    [S.fabsSem, S.aLancer, S.enCours].forEach(src => src.forEach((f, id) => m.set(id, f)));
    return m;
  }
  function fabsDu(date) {
    const out = [];
    toutesFabs().forEach((f, id) => { if (f.date === date && duSite(f)) out.push(Object.assign({ id }, f)); });
    const rang = { 'en-cours': 0, 'a-lancer': 1, 'termine': 2 };
    return out.sort((a, b) => (rang[a.statut] - rang[b.statut]) || String(a.client || '').localeCompare(String(b.client || ''), 'fr'));
  }
  function aRattraper() {
    const t = SP.today(), out = [];
    toutesFabs().forEach((f, id) => { if (f.statut !== 'termine' && f.date && f.date < t && duSite(f)) out.push(Object.assign({ id }, f)); });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  /* alerte d'une fabrication : [classe, libellé] ou null */
  function alerte(f) {
    if (f.statut === 'termine') return null;
    const t = SP.today();
    if (f.besoin && f.date > f.besoin) return ['crit', 'Prévu après la livraison'];
    if (f.besoin && f.besoin < t) return ['crit', 'Livraison dépassée'];
    if (f.date < t) return ['crit', 'En retard'];
    if (f.besoin && SP.addDays(f.besoin, -1) <= t) return ['warn', f.besoin === t ? 'Départ aujourd\'hui' : 'Départ demain'];
    return null;
  }
  function libFab(f) { return [f.quantite ? f.quantite + ' ×' : '', f.designation || ''].filter(Boolean).join(' ') || 'Fabrication'; }

  /* ---------- écritures ---------- */
  async function enregistrerFab(id, f) {
    const d = Object.assign({}, f); delete d.id; d.maj = new Date().toISOString();
    const ok = await store.set('fabrications', id, d);
    if (ok && S) { S.aLancer.delete(id); S.enCours.delete(id); if (d.statut === 'a-lancer') S.aLancer.set(id, d); else if (d.statut === 'en-cours') S.enCours.set(id, d);
      S.fabsSem = new Map(S.fabsSem); if (d.date >= S.lundi && d.date <= SP.addDays(S.lundi, 6)) S.fabsSem.set(id, d); else S.fabsSem.delete(id); dessiner(); }
    return ok;
  }
  async function deplacerFab(id, date) {
    const f = toutesFabs().get(id);
    if (!f || f.date === date) return;
    if (await enregistrerFab(id, Object.assign({}, f, { date }))) SP.toast('Fabrication déplacée au ' + court(date) + '.');
  }
  async function deplacerBLs(ids, date) {
    let n = 0;
    for (const id of ids) {
      const b = S.bls.get(id);
      if (!b || b.statut !== 'a-livrer' || b.date === date) continue;
      const d = Object.assign({}, b, { date, maj: new Date().toISOString() }); delete d.id;
      if (await store.update('bls', id, d)) { n++; if (S) { S.bls = new Map(S.bls); S.bls.set(id, d); } }
    }
    if (n) { SP.toast(n + ' BL déplacé' + (n > 1 ? 's' : '') + ' au ' + court(date) + '.'); if (S) dessiner(); }
    return n;
  }

  /* ---------- écran ---------- */
  function mount(main) {
    const t = ouvre(SP.today());
    S = { site: prefs.get('pl.site', 'tous'), lundi: lundiDe(t), jour: t, large: mq.matches,
      clients: new Map(), bls: new Map(), fabsSem: new Map(), aLancer: new Map(), enCours: new Map(),
      charge: { bls: false, fabs: false }, panne: false, subs: [], subsSem: [] };
    if (S.site !== 'tous' && !SITES[S.site]) S.site = 'tous';
    const st = S;
    const titre = h('b', { class: 'pl-titre' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Site affiché' }, [['tous', 'Les deux']].concat(Object.keys(SITES).map(k => [k, SITES[k]])).map(o =>
      h('button', { type: 'button', 'data-site': o[0], onclick: () => { S.site = o[0]; prefs.set('pl.site', o[0]); dessiner(); } }, o[1])));
    const bar = h('div', { class: 'lv-bar' },
      h('div', { class: 'lv-date' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Précédent', onclick: () => avancer(-1) }, SP.icon('left')),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Suivant', onclick: () => avancer(1) }, SP.icon('right'))),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => allerA(ouvre(SP.today())) }, 'Aujourd\'hui'),
      titre, h('span', { class: 'grow' }), seg,
      h('button', { class: 'btn sm primary', type: 'button', onclick: () => editFab(null, { date: S.large ? (SP.today() >= S.lundi && SP.today() <= SP.addDays(S.lundi, 4) ? SP.today() : S.lundi) : S.jour }) }, SP.icon('plus'), 'Fabrication'));
    const body = h('div', { class: 'lv-body' });
    main.appendChild(h('div', { class: 'lv' }, bar, body));
    S.el = { body, titre, seg };

    S.subs.push(store.watch({ coll: 'clients' }, m => { if (m && S === st) { st.clients = m; dessiner(); } }));
    S.subs.push(store.watch({ coll: 'fabrications', where: ['statut', '==', 'a-lancer'] }, m => { if (S !== st) return; if (m) { st.aLancer = m; st.panne = false; } else st.panne = true; dessiner(); }));
    S.subs.push(store.watch({ coll: 'fabrications', where: ['statut', '==', 'en-cours'] }, m => { if (m && S === st) { st.enCours = m; dessiner(); } }));
    const surLargeur = () => { if (S === st) { st.large = mq.matches; dessiner(); } };
    if (mq.addEventListener) mq.addEventListener('change', surLargeur); else mq.addListener(surLargeur);
    S.subs.push(() => { if (mq.removeEventListener) mq.removeEventListener('change', surLargeur); else mq.removeListener(surLargeur); });
    abonnerSemaine();
    dessiner();
    return () => { st.subs.concat(st.subsSem).forEach(f => f()); if (S === st) S = null; };
  }
  function abonnerSemaine() {
    const st = S, fin = SP.addDays(st.lundi, 6);
    st.subsSem.forEach(f => f()); st.subsSem = []; st.bls = new Map(); st.fabsSem = new Map(); st.charge = { bls: false, fabs: false };
    st.subsSem.push(store.watch({ coll: 'bls', entre: ['date', st.lundi, fin] }, m => { if (S !== st) return; if (m) st.bls = m; st.charge.bls = true; dessiner(); }));
    st.subsSem.push(store.watch({ coll: 'fabrications', entre: ['date', st.lundi, fin] }, m => { if (S !== st) return; if (m) st.fabsSem = m; st.charge.fabs = true; dessiner(); }));
  }
  function allerA(jour) {
    const l = lundiDe(jour), change = l !== S.lundi;
    S.jour = jour; S.lundi = l;
    if (change) abonnerSemaine();
    dessiner();
  }
  function avancer(sens) {
    if (S.large) { allerA(SP.addDays(S.lundi, 7 * sens)); return; }
    let j = SP.addDays(S.jour, sens);
    const n = versDate(j).getDay();
    if (n === 6 || n === 0) j = SP.addDays(j, sens > 0 ? (n === 6 ? 2 : 1) : (n === 0 ? -2 : -1));
    allerA(j);
  }
  /* lundi à vendredi, plus le samedi et le dimanche seulement s'il y a quelque chose de prévu */
  function joursSemaine() {
    const j = [0, 1, 2, 3, 4].map(i => SP.addDays(S.lundi, i));
    [5, 6].forEach(i => { const d = SP.addDays(S.lundi, i); if (arrets(d).length || fabsDu(d).length || (!S.large && S.jour === d)) j.push(d); });
    return j;
  }

  function dessiner() {
    if (!S) return;
    const el = S.el, today = SP.today();
    el.seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.site === S.site)));
    el.titre.textContent = titreSemaine();
    const semaine = joursSemaine(), jours = S.large ? semaine : [S.jour];
    const pane = h('div', { class: 'pane' });

    if (S.panne) pane.appendChild(h('div', { class: 'notice' }, h('b', { text: 'Le planning de l\'atelier n\'est pas accessible. ' }),
      'Si c\'est la première utilisation, la table « fabrications » doit être créée dans Supabase avec le script fourni. Sinon, vérifiez votre connexion.'));

    const retard = aRattraper();
    if (retard.length) pane.appendChild(h('div', { class: 'pl-retard' },
      h('div', { class: 'row' }, h('span', { class: 'pill crit num', text: retard.length + ' à rattraper' }), h('b', { class: 'grow', text: 'Fabrications non terminées des jours passés' })),
      h('div', { class: 'list' }, retard.map(f => h('div', { class: 'item' },
        h('button', { class: 'grow pl-lien', type: 'button', onclick: () => editFab(f.id) },
          h('div', { class: 't', text: (f.client || 'Sans client') + ' · ' + libFab(f) }),
          h('div', { class: 's', text: ['Prévu ' + SP.frDate(f.date, true), SITES[f.site] || '', f.besoin ? 'livraison ' + SP.frDate(f.besoin, true) : ''].filter(Boolean).join(' · ') })),
        h('button', { class: 'btn sm', type: 'button', onclick: () => deplacerFab(f.id, ouvre(today)) }, 'Reporter à aujourd\'hui'))))));

    if (!S.large) pane.appendChild(h('div', { class: 'pl-strip', role: 'group', 'aria-label': 'Jour affiché' }, semaine.map(d => {
      const n = arrets(d).reduce((s, a) => s + a.bls.length, 0) + fabsDu(d).length;
      return h('button', { type: 'button', 'aria-pressed': String(d === S.jour), class: d === today ? 'auj' : null, onclick: () => allerA(d) },
        h('span', { text: versDate(d).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') }), h('b', { class: 'num', text: String(versDate(d).getDate()) }),
        h('i', { class: n ? 'plein' : null, 'aria-hidden': 'true' }));
    })));

    const grid = h('div', { class: 'pl-grid', style: '--n:' + jours.length });
    if (S.large) jours.forEach(d => grid.appendChild(h('div', { class: 'pl-dh' + (d === today ? ' auj' : ''), text: jourTete(d) })));
    else grid.appendChild(h('h2', { class: 'pl-jour', text: jourLong(S.jour) + (S.jour === today ? ' · aujourd\'hui' : '') }));

    const parJour = jours.map(d => ({ d, arrets: arrets(d), fabs: fabsDu(d) }));
    const nbBL = parJour.reduce((s, j) => s + j.arrets.reduce((x, a) => x + a.bls.length, 0), 0);
    const nbFab = parJour.reduce((s, j) => s + j.fabs.length, 0), nbFini = parJour.reduce((s, j) => s + j.fabs.filter(f => f.statut === 'termine').length, 0);

    grid.appendChild(h('div', { class: 'pl-band' }, SP.icon('truck'), h('span', { text: 'Livraisons' }),
      h('span', { class: 'small muted num', text: !S.charge.bls ? 'Chargement…' : nbBL ? nbBL + ' BL' : 'Aucun BL' })));
    parJour.forEach(j => {
      const cell = cellule('bl', j.d);
      if (!j.arrets.length) cell.appendChild(h('div', { class: 'pl-vide', text: S.charge.bls ? 'Rien de prévu' : '' }));
      j.arrets.forEach(a => cell.appendChild(carteArret(a)));
      grid.appendChild(cell);
    });

    grid.appendChild(h('div', { class: 'pl-band' }, SP.icon('factory'), h('span', { text: 'Atelier' }),
      h('span', { class: 'small muted num', text: !S.charge.fabs ? 'Chargement…' : nbFab ? nbFab + ' fabrication' + (nbFab > 1 ? 's' : '') + ' · ' + nbFini + ' terminée' + (nbFini > 1 ? 's' : '') : 'Aucune fabrication' })));
    parJour.forEach(j => {
      const cell = cellule('fab', j.d);
      j.fabs.forEach(f => cell.appendChild(carteFab(f)));
      cell.appendChild(h('button', { class: 'pl-add', type: 'button', 'aria-label': 'Ajouter une fabrication le ' + SP.frDate(j.d, true), onclick: () => editFab(null, { date: j.d }) }, SP.icon('plus'), 'Ajouter'));
      grid.appendChild(cell);
    });
    pane.appendChild(grid);
    if (S.large) pane.appendChild(h('div', { class: 'small muted', text: 'Glissez une carte sur un autre jour pour la déplacer. Les livraisons viennent des BL de l\'app Livraison ; seuls les BL encore à livrer peuvent changer de jour.' }));

    const haut = el.body.scrollTop;
    el.body.replaceChildren(pane);
    el.body.scrollTop = haut;
  }

  function cellule(type, date) {
    const cell = h('div', { class: 'pl-cell' + (date === SP.today() ? ' auj' : '') });
    cell.addEventListener('dragover', e => { if (glisse && glisse.t === type && glisse.date !== date) { e.preventDefault(); cell.classList.add('over'); } });
    cell.addEventListener('dragleave', e => { if (!cell.contains(e.relatedTarget)) cell.classList.remove('over'); });
    cell.addEventListener('drop', e => {
      cell.classList.remove('over');
      if (!glisse || glisse.t !== type) return;
      e.preventDefault();
      const g = glisse; glisse = null;
      if (g.t === 'fab') deplacerFab(g.id, date); else deplacerBLs(g.ids, date);
    });
    return cell;
  }
  function glissable(card, info) {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', e => { glisse = info; try { e.dataTransfer.setData('text/plain', info.t); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* navigateur ancien */ } card.classList.add('prise'); });
    card.addEventListener('dragend', () => { glisse = null; card.classList.remove('prise'); document.querySelectorAll('.pl-cell.over').forEach(c => c.classList.remove('over')); });
  }

  function etatArret(a) {
    if (a.bls.some(b => b.statut === 'echec')) return ['crit', 'Non livré'];
    const faits = a.bls.filter(b => b.statut === 'livre').length;
    if (faits === a.bls.length) return a.bls.some(b => b.livraison && b.livraison.reserves) ? ['warn', 'Livré avec réserves'] : ['ok', 'Livré'];
    if (a.date < SP.today()) return ['crit', 'Non livré à la date prévue'];
    return faits ? ['warn', faits + ' sur ' + a.bls.length + ' livrés'] : null;
  }
  function carteArret(a) {
    const e = etatArret(a), reste = a.bls.filter(b => b.statut === 'a-livrer').map(b => b.id);
    const card = h('div', { class: 'pl-card bl' + (e && e[0] === 'ok' ? ' fait' : '') },
      h('button', { class: 'pl-lien', type: 'button', onclick: () => ficheArret(a) },
        h('span', { class: 't', text: a.client }),
        h('span', { class: 's', text: [a.ville, a.bls.length > 2 ? a.bls.length + ' BL' : a.bls.map(b => 'BL ' + b.numero).join(', '), S.site === 'tous' ? SITES[a.site] : ''].filter(Boolean).join(' · ') })),
      e ? h('span', { class: 'pl-pills' }, h('span', { class: 'pill ' + e[0], text: e[1] })) : null);
    if (reste.length) glissable(card, { t: 'bl', ids: reste, date: a.date });
    return card;
  }
  function carteFab(f) {
    const a = alerte(f), et = ETATS[f.statut] || ETATS['a-lancer'];
    const card = h('div', { class: 'pl-card fab' + (f.statut === 'termine' ? ' fait' : '') },
      h('button', { class: 'pl-lien', type: 'button', onclick: () => editFab(f.id) },
        h('span', { class: 't', text: f.client || 'Sans client' }),
        h('span', { class: 's', text: libFab(f) }),
        h('span', { class: 's', text: [f.commande ? 'Cde ' + f.commande : '', f.besoin ? 'livraison ' + SP.frDate(f.besoin, true) : '', S.site === 'tous' ? SITES[f.site] : ''].filter(Boolean).join(' · ') })),
      h('span', { class: 'pl-pills' },
        h('button', { class: 'pill pl-etat ' + et[0], type: 'button', title: 'Passer à l\'état suivant', 'aria-label': 'État : ' + et[1] + '. Passer à l\'état suivant', onclick: () => { const d = Object.assign({}, f, { statut: SUIVANT[f.statut] || 'en-cours' }); enregistrerFab(f.id, d); } }, et[1]),
        a ? h('span', { class: 'pill ' + a[0], text: a[1] }) : null));
    glissable(card, { t: 'fab', id: f.id, date: f.date });
    return card;
  }

  /* ---------- fiches ---------- */
  function ficheArret(a) {
    const m = SP.modal({ titre: a.client });
    const lib = { 'a-livrer': ['neutral', 'À livrer'], livre: ['ok', 'Livré'], echec: ['crit', 'Non livré'] };
    const reste = a.bls.filter(b => b.statut === 'a-livrer');
    m.body.append(
      h('div', { class: 'muted', text: [SP.frDate(a.date), a.ville, 'départ ' + (SITES[a.site] || 'à préciser')].filter(Boolean).join(' · ') }),
      h('div', { class: 'list' }, a.bls.map(b => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 't', text: 'BL ' + b.numero + (b.commande ? ' · commande ' + b.commande : '') }),
          h('div', { class: 's', text: (b.lignes || []).map(x => (x.qte ? x.qte + ' × ' : '') + x.des).join(' | ') || [b.colis ? b.colis + ' colis' : '', b.note].filter(Boolean).join(' · ') })),
        h('span', { class: 'pill ' + (lib[b.statut] || lib['a-livrer'])[0], text: (lib[b.statut] || lib['a-livrer'])[1] })))));
    if (reste.length) {
      const dateIn = h('input', { class: 'input', type: 'date', id: 'pl-bl-date', value: a.date });
      m.body.append(h('label', { class: 'field' }, h('span', { text: reste.length > 1 ? 'Livrer ces ' + reste.length + ' BL un autre jour' : 'Livrer ce BL un autre jour' }), dateIn));
      m.setActions(
        h('button', { class: 'btn', type: 'button', onclick: () => { m.close(); SP.go('livraison'); } }, SP.icon('truck'), 'Ouvrir Livraison'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => { if (!dateIn.value || dateIn.value === a.date) { m.close(); return; } await deplacerBLs(reste.map(b => b.id), dateIn.value); m.close(); } }, 'Enregistrer'));
    } else m.setActions(h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, 'Fermer'));
  }

  function editFab(id, defaut) {
    const src = id ? toutesFabs().get(id) : null;
    if (id && !src) return;
    const f = Object.assign({ client: '', commande: '', designation: '', quantite: '', site: S.site !== 'tous' ? S.site : ((SP.auth.profil && SITES[SP.auth.profil.site]) ? SP.auth.profil.site : 'genas'), date: S.jour, besoin: '', statut: 'a-lancer', note: '' }, defaut, src);
    const m = SP.modal({ titre: id ? 'Fabrication' : 'Nouvelle fabrication' });
    const msg = h('div', { class: 'notice', style: 'display:none' });
    const noms = [...new Set([...S.clients.values()].map(c => c.nom).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const champ = (k, lab, attrs) => { const i = h('input', Object.assign({ class: 'input', id: 'pf-' + k, value: f[k] == null ? '' : f[k], oninput: () => { f[k] = i.value; } }, attrs)); return h('label', { class: 'field' }, h('span', { text: lab }), i); };
    const sel = (k, lab, opts) => { const s = h('select', { class: 'input', id: 'pf-' + k, onchange: () => { f[k] = s.value; } }, opts.map(o => h('option', { value: o[0], text: o[1], selected: f[k] === o[0] }))); return h('label', { class: 'field' }, h('span', { text: lab }), s); };
    const note = h('textarea', { class: 'input', id: 'pf-note', oninput: () => { f.note = note.value; } }); note.value = f.note || '';
    m.body.append(msg,
      champ('client', 'Client', { list: 'pf-clients', autocomplete: 'off' }),
      h('datalist', { id: 'pf-clients' }, noms.map(n => h('option', { value: n }))),
      champ('designation', 'Ce qu\'il faut fabriquer ou préparer', { placeholder: 'Exemple : caisses bois 1200 × 800 × 600' }),
      h('div', { class: 'fgrid' }, champ('quantite', 'Quantité', { inputmode: 'numeric' }), champ('commande', 'N° de commande')),
      h('div', { class: 'fgrid' }, sel('site', 'Site', Object.keys(SITES).map(k => [k, SITES[k]])), sel('statut', 'État', Object.keys(ETATS).map(k => [k, ETATS[k][1]]))),
      h('div', { class: 'fgrid' }, champ('date', 'Jour prévu à l\'atelier', { type: 'date' }), champ('besoin', 'Livraison souhaitée (facultatif)', { type: 'date' })),
      h('label', { class: 'field' }, h('span', { text: 'Note (facultatif)' }), note));
    const dire = t => { msg.textContent = t; msg.style.display = ''; m.body.scrollTop = 0; };
    const ok = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      ['client', 'designation', 'commande', 'quantite', 'note'].forEach(k => { f[k] = String(f[k] == null ? '' : f[k]).trim(); });
      if (!f.client && !f.designation) { dire('Indiquez au moins le client ou ce qu\'il faut fabriquer.'); return; }
      if (!f.date) { dire('Indiquez le jour prévu à l\'atelier.'); return; }
      ok.disabled = true;
      if (!id) { f.creeLe = new Date().toISOString(); f.creePar = SP.auth.profil ? SP.auth.profil.nom || '' : ''; }
      if (await enregistrerFab(id || store.newId(), f)) { m.close(); SP.toast(id ? 'Fabrication enregistrée.' : 'Fabrication ajoutée au ' + court(f.date) + '.'); }
      else ok.disabled = false;
    } }, 'Enregistrer');
    m.setActions(
      id ? h('button', { class: 'btn danger', type: 'button', style: 'margin-right:auto', onclick: async () => {
        if (!await SP.confirm('Supprimer cette fabrication du planning ?', 'Supprimer', true)) return;
        if (await store.remove('fabrications', id)) { if (S) { [S.fabsSem, S.aLancer, S.enCours].forEach(x => x.delete(id)); dessiner(); } m.close(); SP.toast('Fabrication supprimée.'); }
      } }, SP.icon('trash'), 'Supprimer') : null,
      h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'), ok);
  }

  SP.registerApp({ id: 'planning', nom: 'Planning', icone: 'calendar', etat: 'actif', desc: 'La semaine jour par jour : livraisons et fabrications de l\'atelier.', mount });
})();
