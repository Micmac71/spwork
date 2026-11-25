/* SP WORK : écran d'accueil et catalogue des apps (actives et à venir). */
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

  function mount(main) {
    const actives = SP.apps.filter(a => a.id !== 'accueil' && a.mount);
    const info = h('span', { class: 'pill neutral num', text: 'En service' });
    const tiles = h('div', { class: 'tiles' },
      actives.map(a => h('button', { class: 'tile on', type: 'button', onclick: () => SP.go(a.id) },
        h('span', { class: 'ticon' }, SP.icon(a.icone)), h('b', { text: a.nom }), h('span', { class: 'tdesc', text: a.desc }), a.id === 'livraison' ? info : h('span', { class: 'pill ok', text: 'En service' }))));
    const soon = h('div', { class: 'tiles' },
      A_VENIR.filter(a => !actives.some(x => x.id === a.id)).map(a => h('button', { class: 'tile soon', type: 'button', onclick: () => fiche(a) },
        h('span', { class: 'ticon' }, SP.icon(a.icone)), h('b', { text: a.nom }), h('span', { class: 'tdesc', text: a.desc }), h('span', { class: 'pill neutral', text: 'À construire' }))));
    main.appendChild(h('div', { class: 'home' },
      h('div', null, h('h1', { text: 'SP WORK' }), h('div', { class: 'muted', text: 'Les outils du quotidien de SP Emballage · ' + SP.frDate(SP.today()) })),
      h('h2', { text: 'Apps en service' }), tiles,
      h('h2', { text: 'Prochaines apps' }), soon));
    const off = SP.store.watch({ coll: 'bls', where: ['date', '==', SP.today()] }, m => {
      if (!m) return;
      const tot = m.size, reste = [...m.values()].filter(b => b.statut !== 'livre').length;
      info.className = 'pill num ' + (tot && !reste ? 'ok' : reste ? 'warn' : 'neutral');
      info.textContent = !tot ? 'Aucun BL aujourd\'hui' : reste ? reste + ' BL à livrer aujourd\'hui' : tot + ' BL livrés aujourd\'hui';
    });
    return off;
  }

  SP.registerApp({ id: 'accueil', nom: 'Accueil', mount });
  SP.start();
})();
