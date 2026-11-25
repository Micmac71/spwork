/* SP WORK : lecteur glTF 2.0 binaire (.glb) compact pour l'accueil 3D (Three.js r128).
   Gère ce qu'utilisent les modèles de modeles/ : nœuds (TRS ou matrice), maillages indexés ou non,
   matériaux PBR métal/rugosité, textures JPEG/PNG intégrées, émissif, transparence,
   double face, et l'extension KHR_materials_clearcoat (vernis carrosserie).
   Pour des modèles produits par un graphiste (Draco, animations, peau…), remplacer par le GLTFLoader officiel. */
(function () {
  'use strict';
  const THREE = window.THREE;
  if (!THREE) return;

  const COMPOSANTES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const ATTRIBUTS = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color' };

  function lireGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Ce fichier n\'est pas un .glb');
    let pos = 12, json = null, bin = null;
    while (pos < dv.byteLength) {
      const lg = dv.getUint32(pos, true), type = dv.getUint32(pos + 4, true);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, pos + 8, lg)));
      else if (type === 0x004E4942) bin = buf.slice(pos + 8, pos + 8 + lg);
      pos += 8 + lg;
    }
    if (!json) throw new Error('glb sans JSON');
    return { json, bin };
  }

  async function construire(buf) {
    const { json, bin } = lireGLB(buf);
    const vue = i => { const v = json.bufferViews[i]; return { buf: bin, off: v.byteOffset || 0, lg: v.byteLength, pas: v.byteStride || 0 }; };

    function accesseur(i) {
      const a = json.accessors[i], n = COMPOSANTES[a.type], T = TYPES[a.componentType];
      const v = vue(a.bufferView), off = v.off + (a.byteOffset || 0), taille = T.BYTES_PER_ELEMENT * n;
      let tab;
      if (!v.pas || v.pas === taille) tab = new T(v.buf.slice(off, off + a.count * taille));
      else { // données entrelacées : on les recopie à plat
        tab = new T(a.count * n); const src = new DataView(v.buf);
        const lire = { 5126: 'getFloat32', 5125: 'getUint32', 5123: 'getUint16', 5122: 'getInt16', 5121: 'getUint8', 5120: 'getInt8' }[a.componentType];
        for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) tab[k * n + c] = src[lire](off + k * v.pas + c * T.BYTES_PER_ELEMENT, true);
      }
      return new THREE.BufferAttribute(tab, n, !!a.normalized);
    }

    // textures (décodées avant de rendre la main, pour éviter les apparitions en cours d'animation)
    const images = await Promise.all((json.images || []).map(async im => {
      const v = vue(im.bufferView), blob = new Blob([new Uint8Array(v.buf, v.off, v.lg)], { type: im.mimeType });
      if (window.createImageBitmap) { try { return await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' }); } catch (e) { /* repli ci-dessous */ } }
      return await new Promise((ok, ko) => { const u = URL.createObjectURL(blob), img = new Image(); img.onload = () => { URL.revokeObjectURL(u); ok(img); }; img.onerror = ko; img.src = u; });
    }));
    const textures = [];
    function texture(info, srgb) {
      const cle = info.index + (srgb ? 's' : 'l');
      if (textures[cle]) return textures[cle];
      const td = json.textures[info.index], sp = (json.samplers || [])[td.sampler] || {};
      const t = new THREE.Texture(images[td.source]);
      t.flipY = false; t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
      t.wrapS = sp.wrapS === 33071 ? THREE.ClampToEdgeWrapping : sp.wrapS === 33648 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      t.wrapT = sp.wrapT === 33071 ? THREE.ClampToEdgeWrapping : sp.wrapT === 33648 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      t.anisotropy = 4; t.needsUpdate = true;
      return (textures[cle] = t);
    }

    const materiaux = (json.materials || []).map(m => {
      const pbr = m.pbrMetallicRoughness || {}, ext = m.extensions || {}, cc = ext.KHR_materials_clearcoat;
      const p = {
        name: m.name || '',
        color: new THREE.Color().fromArray(pbr.baseColorFactor || [1, 1, 1]),
        opacity: (pbr.baseColorFactor || [1, 1, 1, 1])[3],
        metalness: pbr.metallicFactor == null ? 1 : pbr.metallicFactor,
        roughness: pbr.roughnessFactor == null ? 1 : pbr.roughnessFactor,
        emissive: new THREE.Color().fromArray(m.emissiveFactor || [0, 0, 0]),
        side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide
      };
      if (pbr.baseColorTexture) p.map = texture(pbr.baseColorTexture, true);
      if (pbr.metallicRoughnessTexture) p.metalnessMap = p.roughnessMap = texture(pbr.metallicRoughnessTexture, false);
      if (m.normalTexture) p.normalMap = texture(m.normalTexture, false);
      if (m.emissiveTexture) p.emissiveMap = texture(m.emissiveTexture, true);
      if (m.alphaMode === 'BLEND') { p.transparent = true; p.depthWrite = false; }
      else if (m.alphaMode === 'MASK') p.alphaTest = m.alphaCutoff == null ? 0.5 : m.alphaCutoff;
      if (cc) { p.clearcoat = cc.clearcoatFactor || 0; p.clearcoatRoughness = cc.clearcoatRoughnessFactor || 0; }
      const mat = cc ? new THREE.MeshPhysicalMaterial(p) : new THREE.MeshStandardMaterial(p);
      if (m.extras) Object.assign(mat.userData, m.extras);
      return mat;
    });
    const defaut = new THREE.MeshStandardMaterial({ color: 0xcccccc });

    const geos = (json.meshes || []).map(me => me.primitives.map(pr => {
      const g = new THREE.BufferGeometry();
      for (const k in pr.attributes) if (ATTRIBUTS[k]) g.setAttribute(ATTRIBUTS[k], accesseur(pr.attributes[k]));
      if (pr.indices != null) g.setIndex(accesseur(pr.indices));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.computeBoundingSphere();
      return { g, mat: pr.material != null ? materiaux[pr.material] : defaut, mode: pr.mode == null ? 4 : pr.mode };
    }));

    function noeud(i) {
      const n = json.nodes[i];
      let o;
      if (n.mesh != null) {
        const prims = geos[n.mesh].map(p => p.mode === 0 ? new THREE.Points(p.g, p.mat) : p.mode === 1 ? new THREE.LineSegments(p.g, p.mat) : new THREE.Mesh(p.g, p.mat));
        if (prims.length === 1) o = prims[0]; else { o = new THREE.Group(); prims.forEach(p => o.add(p)); }
      } else o = new THREE.Group();
      o.name = n.name || '';
      if (n.matrix) { o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); }
      else {
        if (n.translation) o.position.fromArray(n.translation);
        if (n.rotation) o.quaternion.fromArray(n.rotation);
        if (n.scale) o.scale.fromArray(n.scale);
      }
      if (n.extras) Object.assign(o.userData, n.extras);
      (n.children || []).forEach(c => o.add(noeud(c)));
      return o;
    }
    const sc = json.scenes[json.scene || 0], racine = new THREE.Group();
    racine.name = sc.name || '';
    sc.nodes.forEach(i => racine.add(noeud(i)));
    racine.userData.materiaux = materiaux;
    return racine;
  }

  /* charge un .glb : renvoie une promesse de THREE.Group (refuse si le fichier manque ou est illisible) */
  THREE.chargerGLB = function (url, signal) {
    return fetch(url, { signal }).then(r => { if (!r.ok) throw new Error(url + ' : ' + r.status); return r.arrayBuffer(); }).then(construire);
  };
  THREE.lireGLB = construire;
})();
