/* SP WORK : lecture des bons de livraison Cegid PMI (PDF texte lu exactement, scan ou photo lu par reconnaissance de caractères). */
(function () {
  'use strict';
  const SP = window.SP;
  const url = p => new URL(p, document.baseURI).href;
  let pdfjs = null, ocrWorker = null;

  async function getPdf() {
    if (!pdfjs) { pdfjs = await import(url('js/vendor/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = url('js/vendor/pdf.worker.min.js'); }
    return pdfjs;
  }
  async function getOcr() {
    if (!ocrWorker) {
      if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = url('js/vendor/ocr/tesseract.min.js'); s.onload = res; s.onerror = () => rej(new Error('ocr')); document.head.appendChild(s); });
      ocrWorker = await window.Tesseract.createWorker('fra', 1, { workerPath: url('js/vendor/ocr/worker.min.js'), corePath: url('js/vendor/ocr/'), langPath: url('js/vendor/ocr/'), gzip: true });
    }
    return ocrWorker;
  }
  async function ocr(canvas) {
    const w = await getOcr();
    const r = await w.recognize(canvas, {}, { blocks: true });
    const items = [], W = canvas.width;
    for (const b of r.data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const x of l.words) {
      let s = x.text.replace(/^[|\[\](){}‘’“”"'`_;:.,\\\/!¦~=-]+/, '').replace(/[|\[\](){}‘’“”"`_;\\!¦~=]+$/, '');
      if (!s || !/[A-Za-z0-9À-ÿ]/.test(s) || (x.confidence < 55 && s.length <= 3)) continue;
      items.push({ s, x: x.bbox.x0 / W, y: l.bbox.y1 / W, w: (x.bbox.x1 - x.bbox.x0) / W });
    }
    return items;
  }
  function toCanvas(img, maxW) {
    const k = Math.min(1, maxW / img.width), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
  }

  /* items : [{s, x, y, w}] en fractions de la largeur de page */
  function analyse(items, scan) {
    items = items.filter(i => i.s && i.s.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of items) { const L = lines[lines.length - 1]; if (L && Math.abs(it.y - L.y) < 0.009) L.items.push(it); else lines.push({ y: it.y, items: [it] }); }
    const txt = (L, x0, x1) => {
      const a = L.items.filter(i => i.x >= (x0 || 0) && i.x < (x1 || 9)).sort((p, q) => p.x - q.x); let out = '', end = null;
      for (const i of a) { const gap = end == null ? 0 : i.x - end; out += end == null ? '' : gap > 0.035 ? '  ' : gap > 0.004 || scan ? ' ' : ''; out += i.s.trim(); end = i.x + (i.w || 0); }
      return out.trim();
    };
    const DROITE = 0.38;
    const tout = lines.map(L => txt(L)).join('\n');
    const r = { numero: '', date: '', client: '', livNom: '', adresse: '', cp: '', ville: '', tel: '', commande: '', lignes: [], colis: 0, palettes: 0 };
    let m = tout.match(/\bBL\s?([\dO]{4,})\b/);
    if (m) { const sansO = m[1].replace(/O/g, ''); r.numero = /O/.test(m[1]) && sansO.length === 6 ? sansO : m[1].replace(/O/g, '0'); }
    m = tout.match(/Livraison\s*du\W{0,4}(\d{1,2}\/\d{1,2}\/\d{4})/) || tout.match(/(\d{1,2}\/\d{1,2}\/\d{4})/); if (m) r.date = SP.parseDate(m[1]);
    m = tout.match(/Votre Commande\W{0,3}([A-Za-z0-9][\w\/-]*)/); if (m) r.commande = m[1];
    m = tout.match(/Nombre de colis\s+\D{0,2}(\d+)[,.]\d\d/); if (m) r.colis = Number(m[1]);
    m = tout.match(/Nombre de palettes\s+\D{0,2}(\d+)[,.]\d\d/); if (m) r.palettes = Number(m[1]);
    let yL = null, yF = null, yT = null, yFin = null;
    for (const L of lines) {
      const d = txt(L, DROITE), g = txt(L);
      if (yL == null && /\bLIVRAIS/.test(d) && !/n°|BL\s?[\dO]|BON/.test(g)) yL = L.y;
      else if (yL != null && yF == null && /FACTURATION/.test(d)) yF = L.y;
      else if (yF != null && yT == null && (/Votre Commande/.test(g) || (/Ligne/.test(g) && /Article|qt/i.test(g)))) yT = L.y;
      else if (yT != null && yFin == null && /Nombre de palettes|Nombre de colis/.test(g)) yFin = L.y;
    }
    function bloc(y0, y1) {
      const out = { nom: '', adresse: '', cp: '', ville: '', tel: '' };
      if (y0 == null) return out;
      let ls = lines.filter(L => L.y > y0 + 0.004 && (y1 == null || L.y < y1 - 0.004)).map(L => txt(L, DROITE)).filter(Boolean);
      ls = ls.map(s => { const t = s.match(/\bT[ée]l\.?\s*:?\s*((?:\d[\d .]{7,}\d)?)/); if (t) { if (t[1]) out.tel = t[1].trim(); return s.slice(0, t.index).trim(); } return s; })
        .filter(s => s && !/TVA|intracommunautaire/i.test(s));
      let k = -1;
      ls.forEach((s, i) => { if (/^[1Il|]?\d{5}\s+\S/.test(s)) k = i; });
      if (k >= 0) { const c = ls[k].match(/^[1Il|]?(\d{5})\s+(.+)$/); out.cp = c[1]; out.ville = c[2].split(/\s{2,}/)[0].trim(); }
      const avant = k >= 0 ? ls.slice(0, k) : ls;
      if (/^\d/.test(avant[0] || '')) {             // la ligne du nom a été manquée : tout est de l'adresse
        const entete = lines.find(L => Math.abs(L.y - y0) < 0.001);
        out.nom = entete ? txt(entete, DROITE).replace(/^.*?\b(?:LIVRAISON|FACTURATION)\b/, '').replace(/\s{2,}.*$/, '').trim() : '';
        if (out.nom.length < 3) out.nom = '';
        out.adresse = avant.join(', ').replace(/\s{2,}/g, ', ');
        return out;
      }
      out.nom = (avant[0] || '').split(/\s{2,}/)[0];
      out.adresse = avant.slice(1).join(', ').replace(/\s{2,}/g, ', ');
      return out;
    }
    const liv = bloc(yL, yF), fac = bloc(yF, yT);
    if (!liv.nom && liv.adresse) liv.nom = fac.nom;
    r.livNom = liv.nom; r.adresse = liv.adresse; r.cp = liv.cp; r.ville = liv.ville; r.tel = liv.tel; r.client = fac.nom || liv.nom;
    if (yT != null) {
      let cur = null;
      for (const L of lines) {
        if (L.y <= yT + 0.004 || (yFin != null && L.y >= yFin - 0.004)) continue;
        const g = txt(L, 0, 0.72), nums = L.items.filter(i => i.x >= 0.72 && /^\d{1,6}[,.]\d{2}$/.test(i.s.trim()));
        if (/Votre Commande|^Ligne\b/.test(g)) continue;
        const a = g.match(/^\D{0,2}(\d{2,3})\s+(\S.*)$/);
        const propre = !scan || (g.length >= 5 && (g.match(/[A-Z0-9 \/().,'-]/g) || []).length / g.length > 0.8 && /[A-Z]{3}/.test(g));
        if (a) { cur = { des: '', qte: 0, art: a[2].trim() }; r.lignes.push(cur); }
        else if (g && cur && g.length > 2 && propre) cur.des += (cur.des ? ' ' : '') + g;
        else if (g && !cur && scan && propre) { cur = { des: '', qte: 0, art: g }; r.lignes.push(cur); }
        if (cur && nums.length) { const q = nums.sort((p, q2) => q2.x - p.x)[0]; cur.qte = Number(q.s.trim().replace(',', '.')) || cur.qte; }
      }
      r.lignes = r.lignes.map(l => ({ des: (l.des || l.art).replace(/\s+/g, ' ').trim().slice(0, 200), qte: l.qte })).filter(l => l.des);
    }
    return r;
  }

  /* fichiers : PDF (une page = un BL) ou images. Renvoie [{fichier, page, source:'pdf'|'scan', ...champs}] */
  async function lire(files, onProgress) {
    const out = []; let n = 0;
    for (const f of files) {
      n++;
      try {
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
          const lib = await getPdf();
          const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
          for (let p = 1; p <= doc.numPages; p++) {
            if (onProgress) onProgress(f.name + (doc.numPages > 1 ? ' (page ' + p + ')' : ''), n, files.length);
            const page = await doc.getPage(p), vp = page.getViewport({ scale: 1 });
            const tc = await page.getTextContent();
            let items = tc.items.filter(i => i.str && i.str.trim()).map(i => { const t = lib.Util.transform(vp.transform, i.transform); return { s: i.str, x: t[4] / vp.width, y: t[5] / vp.width, w: i.width / vp.width }; });
            let source = 'pdf';
            if (items.length < 15) {
              source = 'scan';
              const v2 = page.getViewport({ scale: 2400 / vp.width }), c = document.createElement('canvas');
              c.width = Math.round(v2.width); c.height = Math.round(v2.height);
              await page.render({ canvasContext: c.getContext('2d'), canvas: c, viewport: v2 }).promise;
              items = await ocr(c);
            }
            const r = analyse(items, source === 'scan');
            const nf = f.name.match(/BL[\s_-]*(?:[A-Za-z]+[\s_-]*)?(\d{6})\b/i); if (source === 'scan' && nf && doc.numPages === 1 && !/^\d{6}$/.test(r.numero)) r.numero = nf[1];
            if (r.numero || r.livNom) out.push(Object.assign(r, { fichier: f.name, page: p, source }));
          }
        } else {
          if (onProgress) onProgress(f.name, n, files.length);
          const img = await createImageBitmap(f);
          const r = analyse(await ocr(toCanvas(img, 2400)), true);
          out.push(Object.assign(r, { fichier: f.name, page: 1, source: 'scan' }));
        }
      } catch (e) { out.push({ fichier: f.name, page: 1, source: 'erreur', erreur: String(e && e.message || e), numero: '', date: '', client: '', livNom: '', adresse: '', cp: '', ville: '', tel: '', commande: '', lignes: [], colis: 0, palettes: 0 }); }
    }
    return out;
  }
  SP.blpdf = { lire, analyse };
})();
