/* SP WORK : BL signé en PDF et envoi par e-mail au client. */
(function () {
  'use strict';
  const SP = window.SP;
  const url = p => new URL(p, document.baseURI).href;
  const SOCIETE = { nom: 'SP EMBALLAGE SAS', l1: '10, rue Lionel Terray - B.P. 36', l2: '69740 GENAS', tel: 'Tél. 04 78 90 28 37', pied: 'SP EMBALLAGE SAS - 10, rue Lionel Terray, B.P. 36, 69740 Genas - Siret 972 500 730 00031 - TVA FR28972500730' };
  let logo = null, lib = null;

  async function charger() {
    if (!lib) {
      if (!window.jspdf) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = url('js/vendor/jspdf.umd.min.js'); s.onload = res; s.onerror = () => rej(new Error('pdf')); document.head.appendChild(s); });
      lib = window.jspdf.jsPDF;
    }
    if (logo === null) {
      try { const b = await (await fetch(url('logo.png'))).blob(); logo = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = () => r(''); f.readAsDataURL(b); }); } catch (e) { logo = ''; }
    }
  }
  /* la police intégrée ne connaît que les caractères latins courants */
  const t = s => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '');
  const quand = iso => { try { const d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const nomFichier = bl => 'BL-' + String(bl.numero).replace(/[^A-Za-z0-9_-]+/g, '-') + '-signe.pdf';

  /* bl : document BL ; lieu : {client, libelle, adresse, cp, ville} ; preuve : document de preuve ou null */
  async function pdf(bl, lieu, preuve) {
    await charger();
    const doc = new lib({ unit: 'mm', format: 'a4', compress: true }), M = 15, W = 210, l = bl.livraison || {};
    const txt = (s, x, y, o) => doc.text(t(s), x, y, o);
    if (logo) { try { doc.addImage(logo, 'PNG', M, 12, 45, 21, undefined, 'FAST'); } catch (e) { /* sans logo */ } }
    doc.setTextColor(30, 38, 50);
    doc.setFont('helvetica', 'bold').setFontSize(17); txt('BON DE LIVRAISON', W - M, 19, { align: 'right' });
    doc.setFontSize(12); txt('n° BL' + bl.numero, W - M, 26, { align: 'right' });
    doc.setFont('helvetica', 'normal').setFontSize(10); txt('Livraison du ' + (SP.frDate(bl.date) || ''), W - M, 32, { align: 'right' });
    let y = 42;
    const cadre = (x, titre, lignes) => {
      doc.setDrawColor(190, 197, 205).setLineWidth(0.3).rect(x, y, 87, 36);
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(110, 120, 130); txt(titre.toUpperCase(), x + 3, y + 5);
      doc.setTextColor(30, 38, 50).setFontSize(10); let yy = y + 11;
      lignes.filter(Boolean).forEach((s, i) => { doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.splitTextToSize(t(s), 81).slice(0, 2).forEach(p => { if (yy < y + 35) { doc.text(p, x + 3, yy); yy += 4.800; } }); });
    };
    cadre(M, 'Fournisseur', [SOCIETE.nom, SOCIETE.l1, SOCIETE.l2, SOCIETE.tel]);
    cadre(M + 93, 'Livraison', [lieu.client, lieu.libelle && SP.norm(lieu.libelle) !== SP.norm(lieu.client) && !/^(principal|point \d+)$/i.test(lieu.libelle) ? lieu.libelle : '', lieu.adresse, [lieu.cp, lieu.ville].filter(Boolean).join(' ')]);
    y += 44;
    doc.setFont('helvetica', 'normal').setFontSize(10);
    if (bl.commande) { doc.setFont('helvetica', 'bold'); txt('Votre commande : ' + bl.commande, M, y); y += 7; }
    /* tableau des articles */
    doc.setFillColor(240, 242, 245).rect(M, y, W - 2 * M, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9); txt('Désignation', M + 3, y + 4.800); txt('Quantité livrée', W - M - 3, y + 4.800, { align: 'right' });
    y += 7; doc.setFont('helvetica', 'normal').setFontSize(10);
    const lignes = (bl.lignes && bl.lignes.length) ? bl.lignes : [{ des: 'Marchandise selon bon de livraison n° BL' + bl.numero, qte: 0 }];
    lignes.forEach(li => {
      const parts = doc.splitTextToSize(t(li.des), W - 2 * M - 40);
      if (y + parts.length * 4.800 + 4 > 200) { doc.addPage(); y = 20; }
      parts.forEach((p, i) => doc.text(p, M + 3, y + 5 + i * 4.800));
      if (li.qte) txt(SP.fmt(li.qte, Number.isInteger(li.qte) ? 0 : 2), W - M - 3, y + 5, { align: 'right' });
      y += parts.length * 4.800 + 4; doc.setDrawColor(225, 229, 233).line(M, y, W - M, y);
    });
    const extra = [bl.colis ? bl.colis + ' colis' : '', bl.palettes ? bl.palettes + ' palette(s)' : '', bl.poids ? SP.fmt(bl.poids) + ' kg' : ''].filter(Boolean).join(' - ');
    if (extra) { y += 6; txt(extra, M + 3, y); }
    /* réception */
    y = Math.max(y + 12, 150); if (y > 215) { doc.addPage(); y = 20; }
    doc.setDrawColor(190, 197, 205).setLineWidth(0.3).rect(M, y, W - 2 * M, 62);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(110, 120, 130); txt('RÉCEPTION DE LA MARCHANDISE', M + 3, y + 5);
    doc.setTextColor(30, 38, 50).setFontSize(10); let yy = y + 12;
    const ligne = (a, b) => { doc.setFont('helvetica', 'bold'); txt(a, M + 3, yy); doc.setFont('helvetica', 'normal'); doc.splitTextToSize(t(b), 70).slice(0, 3).forEach((p, i) => doc.text(p, M + 30, yy + i * 4.800)); yy += Math.max(1, Math.min(3, doc.splitTextToSize(t(b), 70).length)) * 4.800 + 2; };
    ligne('Date :', quand(l.at));
    ligne('Reçu par :', l.signataire || (preuve && preuve.signataire) || 'Non renseigné');
    ligne('Livré par :', l.parNom || (preuve && preuve.parNom) || 'SP Emballage');
    ligne('Réserves :', l.reserves || (preuve && preuve.reserves) || 'Aucune réserve');
    const sig = preuve && /^data:image\/png;base64,/.test(preuve.signature || '') ? preuve.signature : '';
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(110, 120, 130); txt('SIGNATURE DU CLIENT', M + 110, y + 12);
    doc.setTextColor(30, 38, 50);
    if (sig) { try { doc.addImage(sig, 'PNG', M + 108, y + 15, 68, 36, undefined, 'FAST'); } catch (e) { /* signature illisible */ } }
    else { doc.setFont('helvetica', 'italic').setFontSize(9); txt('Livraison pointée sans signature sur écran', M + 110, y + 22); }
    doc.setFont('helvetica', 'normal').setFontSize(7.500).setTextColor(110, 120, 130);
    txt('Signature recueillie sur écran au moment de la livraison. Document établi par SP WORK le ' + quand(new Date().toISOString()) + '.', M, 283);
    txt(SOCIETE.pied, M, 287);
    return doc;
  }
  async function telecharger(bl, lieu, preuve) { const d = await pdf(bl, lieu, preuve); d.save(nomFichier(bl)); }

  function adresses(s) { return String(s || '').split(/[;,\s]+/).map(x => x.trim()).filter(Boolean); }
  function valides(s) { const a = adresses(s); return a.length > 0 && a.length <= 5 && a.every(x => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(x)); }

  /* envoie un e-mail avec un PDF par BL ; renvoie {ok, message} */
  async function envoyer(bls, lieu, preuve, emails) {
    const dest = adresses(emails);
    if (!valides(emails)) return { ok: false, message: 'Adresse e-mail invalide.' };
    try {
      const pieces = [];
      for (const bl of bls) { const d = await pdf(bl, lieu, preuve); pieces.push({ nom: nomFichier(bl), contenu: d.output('datauristring').split(',').pop() }); }
      const l = bls[0].livraison || {}, nums = bls.map(b => 'BL' + b.numero).join(', '), cdes = [...new Set(bls.map(b => b.commande).filter(Boolean))];
      const sujet = 'SP Emballage - Bon de livraison signé ' + nums + (cdes.length ? ' (votre commande ' + cdes.join(', ') + ')' : '');
      const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const html = '<p>Bonjour,</p><p>Veuillez trouver ci-joint ' + (bls.length > 1 ? 'les bons de livraison signés ' : 'le bon de livraison signé ') + '<b>' + e(nums) + '</b>' + (cdes.length ? ', correspondant à votre commande <b>' + e(cdes.join(', ')) + '</b>' : '') + '.</p>'
        + '<p>Livraison effectuée le ' + e(quand(l.at)) + (lieu.adresse || lieu.ville ? ' à l\'adresse : ' + e([lieu.adresse, [lieu.cp, lieu.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')) : '') + '.<br>Réceptionnée par : ' + e(l.signataire || 'non renseigné') + '.<br>Réserves : ' + e(l.reserves || 'aucune') + '.</p>'
        + '<p>Cordialement,<br>SP Emballage<br>04 78 90 28 37</p>';
      if (!SP.sb) return { ok: true, essai: true, message: 'Mode essai : e-mail simulé.' };
      const res = await SP.sb.functions.invoke('envoyer-bl', { body: { destinataires: dest, sujet, html, pieces } });
      if (res.error) { let m = ''; try { m = (await res.error.context.json()).erreur || ''; } catch (x) { m = ''; } return { ok: false, message: m || 'Service d\'envoi indisponible.' }; }
      return res.data && res.data.ok ? { ok: true, message: 'E-mail envoyé.' } : { ok: false, message: (res.data && res.data.erreur) || 'Envoi refusé.' };
    } catch (x) { return { ok: false, message: 'Envoi impossible : ' + (x && x.message || 'erreur') }; }
  }
  SP.blsigne = { pdf, telecharger, envoyer, valides, adresses, nomFichier };
})();
