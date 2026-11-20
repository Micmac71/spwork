/* SP WORK : socle commun (interface, stockage partagé, navigation). Chaque app s'enregistre avec SP.registerApp. */
(function () {
  'use strict';
  const SP = window.SP = { apps: [] };

  /* ---------- DOM ---------- */
  SP.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  };
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(x => add(el, x));
    else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  const h = SP.h;

  const ICONS = {
    truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
    users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.900 2.100 6.500 5.500M16 4.500a3.500 3.500 0 010 6.500M18 14.800c1.900.700 3.200 2.500 3.600 5.200',
    box: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
    chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
    wrench: 'M14.500 6.500a4 4 0 005 5L10 21l-3-3 9.500-9.500a4 4 0 01-2-2zM14.500 6.500l3-3',
    shield: 'M12 3l8 3v6c0 4.500-3.200 7.800-8 9-4.800-1.200-8-4.500-8-9V6zM9 12l2 2 4-4',
    gear: 'M12 15.500a3.500 3.500 0 100-7 3.500 3.500 0 000 7zM19 12l2-1-1.500-3.500-2.200.600-1.500-1.500.600-2.200L13 3l-1 2-1-2-3.400 1.400.600 2.200-1.500 1.500-2.200-.600L3 11l2 1-2 1 1.500 3.500 2.200-.600 1.500 1.500-.600 2.200L11 21l1-2 1 2 3.400-1.400-.600-2.200 1.500-1.500 2.200.600L21 13z',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.500l4.500 4.500L19 7.500',
    up: 'M6 14l6-6 6 6', down: 'M6 10l6 6 6-6', left: 'M14 6l-6 6 6 6', right: 'M10 6l6 6-6 6',
    pin: 'M12 21s-6.500-6-6.500-11a6.500 6.500 0 0113 0c0 5-6.500 11-6.500 11zM12 12.500a2.500 2.500 0 100-5 2.500 2.500 0 000 5z',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    search: 'M10.500 17a6.500 6.500 0 100-13 6.500 6.500 0 000 13zM15.500 15.500L21 21',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4',
    route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 000-6h-4a3 3 0 010-6h6',
    doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
    factory: 'M3 21V10l6 4v-4l6 4V4h6v17zM7 17h2M12 17h2M17 17h2',
    euro: 'M17 6.500A6 6 0 007 12a6 6 0 0010 5.500M4 10.500h9M4 13.500h9',
    close: 'M6 6l12 12M18 6L6 18',
    target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 15a3 3 0 100-6 3 3 0 000 6zM12 1v4M12 19v4M1 12h4M19 12h4',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    clipboard: 'M8 5h8v3H8zM8 6H5v15h14V6h-3M9 12h6M9 16h6'
  };
  SP.icon = function (name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.800'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ico');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name] || ICONS.box); s.appendChild(p);
    return s;
  };

  /* ---------- petits outils ---------- */
  SP.norm = function (s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  };
  SP.today = function () { return SP.isoDate(new Date()); };
  SP.isoDate = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  SP.addDays = function (iso, n) { const p = iso.split('-').map(Number); return SP.isoDate(new Date(p[0], p[1] - 1, p[2] + n)); };
  SP.frDate = function (iso, court) {
    const p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || !p[0]) return iso || '';
    const d = new Date(p[0], p[1] - 1, p[2]);
    return d.toLocaleDateString('fr-FR', court ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };
  SP.fmt = function (n, dec) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: dec || 0, minimumFractionDigits: dec || 0 }); };
  SP.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };

  /* ---------- messages ---------- */
  SP.toast = function (msg, err) {
    const t = h('div', { class: 'toast' + (err ? ' err' : ''), text: msg });
    document.getElementById('sp-toasts').appendChild(t);
    setTimeout(() => t.remove(), err ? 6000 : 3200);
  };

  /* ---------- fenêtres (empilables) ---------- */
  SP.modal = function (opts) {
    const body = h('div', { class: 'sheet-b' });
    const foot = h('div', { class: 'sheet-f' });
    const title = h('h2', { text: opts.titre || '' });
    const closeBtn = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Fermer', onclick: () => api.close() }, SP.icon('close'));
    const sheet = h('div', { class: 'sheet' + (opts.large ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'sheet-h' }, title, closeBtn), body, foot);
    const layer = h('div', { class: 'layer' }, sheet);
    layer.addEventListener('pointerdown', e => { if (e.target === layer && !opts.verrou) api.close(); });
    const onKey = e => { if (e.key === 'Escape' && layer === document.getElementById('sp-layers').lastChild) api.close(); };
    document.addEventListener('keydown', onKey);
    const api = {
      body, foot, sheet,
      setTitle: t => { title.textContent = t; },
      setActions: function () { foot.replaceChildren(); for (const a of arguments) if (a) foot.appendChild(a); foot.style.display = foot.children.length ? '' : 'none'; },
      close: () => { if (!layer.isConnected) return; document.removeEventListener('keydown', onKey); layer.remove(); if (opts.onClose) opts.onClose(); }
    };
    api.setActions();
    document.getElementById('sp-layers').appendChild(layer);
    return api;
  };
  SP.confirm = function (question, okLabel, danger) {
    return new Promise(res => {
      let done = false;
      const m = SP.modal({ titre: 'Confirmer', onClose: () => { if (!done) res(false); } });
      m.body.appendChild(h('p', { text: question, style: 'margin:0' }));
      m.setActions(
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'),
        h('button', { class: 'btn ' + (danger ? 'brand' : 'primary'), type: 'button', onclick: () => { done = true; res(true); m.close(); } }, okLabel || 'Confirmer'));
    });
  };

  /* ---------- stockage partagé ---------- */
  const store = SP.store = { mode: 'attente', db: null };
  const mem = {};            // repli en mémoire si le stockage partagé est indisponible
  const memSubs = new Set();
  const queues = new Map();  // une écriture à la fois par document
  let readOnlyWarned = false;

  store.ready = (async function () {
    let db = null;
    try { if (window.claude && typeof window.claude.use === 'function') db = await window.claude.use('db'); } catch (e) { db = null; }
    store.db = db; store.mode = db ? 'partage' : 'local';
    renderStatus();
  })();

  function memColl(c) { return mem[c] || (mem[c] = new Map()); }
  function match(data, where) {
    if (!where) return true;
    const v = data[where[0]];
    return where[1] === '==' ? v === where[2] : true;
  }
  function memEmit(coll) {
    memSubs.forEach(s => { if (s.q.coll === coll) memDeliver(s); });
  }
  function memDeliver(s) {
    const out = new Map();
    memColl(s.q.coll).forEach((d, id) => { if (match(d, s.q.where)) out.set(id, d); });
    s.cb(out, { ok: true });
  }

  /* q = {coll, where:[champ,'==',valeur]} ; cb(Map id→données, {ok, enCache} | {erreur}) */
  store.watch = function (q, cb) {
    let off = null, dead = false;
    store.ready.then(() => {
      if (dead) return;
      if (!store.db) { const s = { q, cb }; memSubs.add(s); off = () => memSubs.delete(s); memDeliver(s); return; }
      let ref = store.db.collection(q.coll);
      if (q.where) ref = ref.where(q.where[0], q.where[1], q.where[2]);
      off = ref.onSnapshot(snap => {
        const out = new Map();
        snap.docs.forEach(d => { const v = d.data(); if (v) out.set(d.id, v); });
        cb(out, { ok: true, enCache: snap.metadata && snap.metadata.fromCache });
      }, err => cb(null, { erreur: err }));
    });
    return () => { dead = true; if (off) off(); };
  };

  function enqueue(path, job) {
    const prev = queues.get(path) || Promise.resolve();
    const next = prev.catch(() => { }).then(job);
    queues.set(path, next);
    next.finally(() => { if (queues.get(path) === next) queues.delete(path); }).catch(() => { });
    return next;
  }
  async function attempt(fn) {
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (e) {
        const code = e && e.code;
        if ((code === 'unavailable' || code === 'resource_exhausted') && i < 3) { await new Promise(r => setTimeout(r, 700 * (i + 1) + Math.random() * 500)); continue; }
        throw e;
      }
    }
  }
  function explain(e) {
    const code = e && e.code;
    if (code === 'invalid_argument') {
      if (!readOnlyWarned) { readOnlyWarned = true; SP.toast('Modification refusée : votre accès à SP WORK est en lecture seule. Demandez un accès Contributeur.', true); }
    } else if (code === 'quota_exceeded') SP.toast('Espace de stockage plein : supprimez d\'anciens bons de livraison.', true);
    else SP.toast('Enregistrement impossible pour l\'instant. Réessayez dans un moment.', true);
  }
  function clean(data) { return JSON.parse(JSON.stringify(data)); }

  store.newId = function (coll) {
    if (store.db) { try { return store.db.collection(coll).doc().id; } catch (e) { /* repli */ } }
    return SP.uid();
  };
  store.set = async function (coll, id, data, silencieux) {
    await store.ready;
    const body = clean(data);
    if (!store.db) { memColl(coll).set(id, body); memEmit(coll); return true; }
    try { await enqueue(coll + '/' + id, () => attempt(() => store.db.collection(coll).doc(id).set(body))); return true; }
    catch (e) { if (!silencieux) explain(e); return false; }
  };
  store.remove = async function (coll, id) {
    await store.ready;
    if (!store.db) { memColl(coll).delete(id); memEmit(coll); return true; }
    try { await enqueue(coll + '/' + id, () => attempt(() => store.db.collection(coll).doc(id).delete())); return true; }
    catch (e) { explain(e); return false; }
  };
  store.get = async function (coll, id) {
    await store.ready;
    if (!store.db) return memColl(coll).get(id) || null;
    try { const s = await store.db.collection(coll).doc(id).get(); return s.exists ? s.data() : null; } catch (e) { return null; }
  };
  store.query = async function (coll, where) {
    await store.ready;
    const out = new Map();
    if (!store.db) { memColl(coll).forEach((d, id) => { if (match(d, where)) out.set(id, d); }); return out; }
    try {
      let ref = store.db.collection(coll);
      if (where) ref = ref.where(where[0], where[1], where[2]);
      const snap = await ref.get();
      snap.docs.forEach(d => { const v = d.data(); if (v) out.set(d.id, v); });
    } catch (e) { /* liste vide */ }
    return out;
  };
  /* écritures en série avec progression : jobs = [() => Promise] */
  store.batch = async function (jobs, onProgress) {
    let done = 0, ok = 0, i = 0;
    async function worker() {
      while (i < jobs.length) {
        const j = jobs[i++];
        if (await j()) ok++;
        done++; if (onProgress) onProgress(done, jobs.length);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    return ok;
  };

  function renderStatus() {
    const el = document.getElementById('sp-status');
    if (!el) return;
    el.replaceChildren();
    if (store.mode === 'partage') { el.className = ''; el.append(h('span', { class: 'dot' }), h('span', { class: 'lbl', text: 'Données partagées' })); }
    else if (store.mode === 'local') { el.className = 'local'; el.append(h('span', { class: 'dot' }), h('span', { class: 'lbl', text: 'Essai sans enregistrement' })); }
  }

  /* ---------- import de fichiers Excel / CSV ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script')); document.head.appendChild(s); });
  }
  function parseCSV(text) {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const count = c => first.split(c).length - 1;
    const delim = count('\t') >= count(';') && count('\t') >= count(',') && count('\t') > 0 ? '\t' : (count(';') >= count(',') ? ';' : ',');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"' && cur === '') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function cellText(v) {
    if (v == null) return '';
    if (v instanceof Date) return SP.isoDate(new Date(v.getTime() + 2 * 3600 * 1000));
    return String(v).trim();
  }
  async function readTable(file) {
    const buf = await file.arrayBuffer();
    if (/\.(xlsx|xlsm|xls|ods)$/i.test(file.name)) {
      if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    }
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
    return parseCSV(text.replace(/^﻿/, ''));
  }
  SP.parseDate = function (s) {
    s = String(s || '').trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    return '';
  };

  /* opts : {titre, aide, champs:[{id,label,requis,alias:[]}], resume(lignes) → texte, onValide(lignes, modal) } */
  SP.importer = function (opts) {
    const m = SP.modal({ titre: opts.titre, large: true });
    let table = null, mapping = {};
    const zone = h('div', { class: 'stack' });
    const fileIn = h('input', { type: 'file', id: 'imp-file', class: 'input', accept: '.xlsx,.xls,.xlsm,.ods,.csv,.txt,.tsv' });
    const paste = h('textarea', { class: 'input', id: 'imp-paste', placeholder: 'Ou collez ici des lignes copiées depuis Excel (avec la ligne de titres)' });
    m.body.append(
      h('div', { class: 'notice info', text: opts.aide }),
      h('label', { class: 'field' }, h('span', { text: 'Fichier Excel ou CSV' }), fileIn),
      h('label', { class: 'field' }, h('span', { text: 'Copier-coller' }), paste),
      zone);
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0]; if (!f) return;
      try { setTable(await readTable(f)); } catch (e) { SP.toast('Fichier illisible. Essayez un export .xlsx ou .csv.', true); }
    });
    let pt = null;
    paste.addEventListener('input', () => { clearTimeout(pt); pt = setTimeout(() => { if (paste.value.trim()) setTable(parseCSV(paste.value)); }, 350); });

    function setTable(rows) {
      rows = rows.map(r => r.map(cellText)).filter(r => r.some(c => c !== ''));
      if (rows.length < 2) { table = null; zone.replaceChildren(h('div', { class: 'notice', text: 'Il faut une ligne de titres puis au moins une ligne de données.' })); m.setActions(); return; }
      table = rows; mapping = {};
      const heads = rows[0].map(SP.norm);
      const pris = new Set();
      const exact = a => a.charAt(0) === '=';
      for (const c of opts.champs) {
        let idx = -1;
        for (const a of [c.label].concat(c.alias || [])) { const na = SP.norm(a); idx = heads.findIndex((x, i) => !pris.has(i) && x === na); if (idx >= 0) break; }
        if (idx >= 0) pris.add(idx);
        mapping[c.id] = idx;
      }
      for (const c of opts.champs) {
        if (mapping[c.id] >= 0) continue;
        let idx = -1;
        for (const a of (c.alias || [])) { if (exact(a)) continue; const na = SP.norm(a); idx = heads.findIndex((x, i) => !pris.has(i) && x && x.indexOf(na) >= 0); if (idx >= 0) break; }
        if (idx >= 0) pris.add(idx);
        mapping[c.id] = idx;
      }
      draw();
    }
    function lignes() {
      return table.slice(1).map(r => { const o = {}; for (const c of opts.champs) o[c.id] = mapping[c.id] >= 0 ? (r[mapping[c.id]] || '') : ''; return o; });
    }
    function draw() {
      const grid = h('div', { class: 'fgrid' });
      for (const c of opts.champs) {
        const sel = h('select', { class: 'input', id: 'imp-map-' + c.id, onchange: () => { mapping[c.id] = Number(sel.value); draw(); } },
          h('option', { value: '-1', text: c.requis ? 'À choisir' : 'Absent du fichier' }),
          table[0].map((t, i) => h('option', { value: String(i), text: t || ('Colonne ' + (i + 1)), selected: mapping[c.id] === i })));
        grid.appendChild(h('label', { class: 'field' }, h('span', { text: c.label + (c.requis ? ' *' : '') }), sel));
      }
      const manque = opts.champs.filter(c => c.requis && !(mapping[c.id] >= 0));
      const rows = lignes();
      const prev = h('div', { class: 'prev' }, h('table', null,
        h('tr', null, opts.champs.filter(c => mapping[c.id] >= 0).map(c => h('th', { text: c.label }))),
        rows.slice(0, 4).map(r => h('tr', null, opts.champs.filter(c => mapping[c.id] >= 0).map(c => h('td', { text: r[c.id] }))))));
      zone.replaceChildren(
        h('h3', { text: 'Correspondance des colonnes' }), grid,
        h('div', { class: 'small muted', text: 'Aperçu des premières lignes' }), prev,
        manque.length ? h('div', { class: 'notice', text: 'Colonne obligatoire à indiquer : ' + manque.map(c => c.label).join(', ') })
          : h('div', { class: 'notice info', text: opts.resume ? opts.resume(rows) : rows.length + ' lignes prêtes à importer.' }));
      m.setActions(
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Annuler'),
        h('button', { class: 'btn primary', type: 'button', disabled: manque.length > 0, onclick: () => run(rows) }, 'Importer ' + rows.length + ' lignes'));
    }
    async function run(rows) {
      const fill = h('i'); const txt = h('div', { class: 'small muted', text: 'Préparation…' });
      m.body.replaceChildren(h('div', { class: 'bar' }, fill), txt); m.setActions();
      const res = await opts.onValide(rows, (d, t) => { fill.style.width = Math.round(100 * d / Math.max(1, t)) + '%'; txt.textContent = d + ' / ' + t + ' enregistrés'; });
      m.body.replaceChildren(h('div', { class: 'notice info', text: res || 'Import terminé.' }));
      m.setActions(h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, 'Fermer'));
    }
  };

  /* ---------- navigation ---------- */
  SP.registerApp = function (app) { SP.apps.push(app); };
  let unmount = null;
  SP.go = function (id) { if (location.hash !== '#' + id) location.hash = id; else route(); };
  function route() {
    const id = (location.hash || '').replace(/^#/, '');
    const app = SP.apps.find(a => a.id === id && a.mount) || SP.apps.find(a => a.id === 'accueil');
    if (unmount) { try { unmount(); } catch (e) { /* rien */ } unmount = null; }
    const main = document.getElementById('sp-main');
    main.replaceChildren();
    document.getElementById('sp-title').textContent = app.id === 'accueil' ? '' : app.nom;
    unmount = app.mount(main) || null;
  }
  SP.start = function () {
    document.getElementById('sp-home').addEventListener('click', () => SP.go('accueil'));
    window.addEventListener('hashchange', route);
    route();
  };
})();
