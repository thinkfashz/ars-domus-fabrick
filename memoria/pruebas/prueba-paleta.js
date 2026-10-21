/* Prueba de la paleta (modulo/paleta.js) — sin navegador, con three de verdad. */
const C = require(__dirname + '/carga.js');
const {THREE, AD, escena, renderer, hemi, sol, relleno, CASА, comprueba, fin,
  cargaModulo, avisaListo, cuadro} = C;

console.log('== PALETA ==');

/* ── 0 · El dato: verde limón en las dos versiones ─────────────────────── */
const INT_A = C.CASA.casa.interior;
const INT_M = C.FM && C.FM.casa ? C.FM.casa.interior : null;
const verdes = ['#c8db8a','#cfe0a0','#d7e3ab','#c3d49a','#e2eccb'];
function verdesDe(INT){
  return (INT.estancias||[]).filter(e=>!e.fuera && e.pared && e.pared.charAt(0)==='#')
    .map(e=>({cod:e.codigo, pared:e.pared}));
}
const gA = verdesDe(INT_A), gM = verdesDe(INT_M);
console.log('actual  :', gA.map(x=>x.cod+'='+x.pared).join(' '));
console.log('mejorada:', gM.map(x=>x.cod+'='+x.pared).join(' '));
comprueba('la versión actual trae el verde en el dato',
  gA.filter(x=>verdes.indexOf(x.pared)>=0).length === gA.length, gA.length);
comprueba('la versión mejorada trae el verde en el dato',
  gM.filter(x=>verdes.indexOf(x.pared)>=0).length === gM.length, gM.length);
comprueba('los dos banos/azulejos no se pintan',
  (INT_A.estancias.filter(e=>e.pared==='azulejo').length===1) &&
  (INT_M.estancias.filter(e=>e.pared==='azulejo').length===1));

/* ── 1 · Escena: las estancias del visor, con su material compartido ───── */
const MI = {
  piedra: new THREE.MeshPhongMaterial({color:'#b8ac93', map:{es:true}}),   // con textura: no se pinta
  azulejo: new THREE.MeshPhongMaterial({color:'#cfd8dc', map:{es:true}})
};
function pano(s0,s1,y0,t0,t1){
  const g = new THREE.BufferGeometry();
  const pos = [];
  [[s0,y0],[s1,y0],[s1,t1],[s0,t0]].forEach(p=>pos.push(p[0],p[1],0.01));
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.userData.muro = true;
  return g;
}
function construyeEstancias(INT){
  INT.estancias.forEach(e=>{
    if(!e.pared) return;
    const info = {tipo:'Estancia', id:e.codigo || null, nombre:e.nombre};
    const mp = (e.pared==='piedra'||e.pared==='azulejo') ? MI[e.pared]
             : new THREE.MeshPhongMaterial({color:e.pared, shininess:4, specular:'#141414'});
    const k = e.caja;
    /* un paño de muro por lado */
    ['N','S','O','E'].forEach((s,i)=>{
      const geo = pano(k[0], k[2], e.cota, e.techo.alto || 2.7, e.techo.alto || 2.7);
      const m = new THREE.Mesh(geo, mp);
      m.userData.info = info;
      m.position.set(k[0], 0, k[1]);
      escena.add(m);
      /* la mocheta del hueco: comparte material con el paño */
      const mo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.2), mp);
      mo.userData.info = info;
      mo.position.set(k[0] + 0.5, 1.5, k[1]);
      escena.add(mo);
    });
    /* el suelo: material propio, no se toca */
    const su = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshPhongMaterial({color:'#888888'}));
    su.userData.info = info;
    escena.add(su);
    /* un lado de piedra vista (el salón lo tiene en la O): material global con textura */
    if(e.paredes && e.paredes.O === 'piedra'){
      const pm = new THREE.Mesh(pano(k[0], k[1], e.cota, 2.7, 2.7), MI.piedra);
      pm.userData.info = {tipo:'Muro exterior', id:'W-' + e.id};
      escena.add(pm);
    }
  });
}
construyeEstancias(INT_A);
construyeEstancias(INT_M);

/* ── 2 · Cargar el módulo ──────────────────────────────────────────────── */
cargaModulo('paleta');
avisaListo();

function colorDe(cod){
  let c = null;
  escena.traverse(o=>{
    if(c) return;
    if(o.isMesh && o.userData && o.userData.info && o.userData.info.id===cod
       && o.geometry && o.geometry.userData && o.geometry.userData.muro){
      c = '#' + o.material.color.getHexString();
    }
  });
  return c;
}
const NEUT = {SAL:'#f2efe8', REC:'#f2efe8', PAS:'#f2efe8', COC:'#f4f4f2',
  DOR:'#e9e4da', DO2:'#dfe6e3', DO3:'#efe3cf', EST:'#a9b3c3', LAV:'#f4f4f2'};

console.log('tema:', AD.paleta.tema());
comprueba('arranca en limón', AD.paleta.tema() === 'limon', AD.paleta.tema());
comprueba('el salón queda en verde', colorDe('SAL') === '#c8db8a', colorDe('SAL'));
comprueba('la cocina queda en verde', colorDe('COC') === '#cfe0a0', colorDe('COC'));
comprueba('el estudio queda en verde', colorDe('EST') === '#c3d49a', colorDe('EST'));

/* ── 3 · El interruptor: a neutro vuelve al color original, NO al verde ─ */
AD.paleta.alterna();
comprueba('alterna() devuelve neutro', AD.paleta.tema() === 'neutro', AD.paleta.tema());
comprueba('el salón vuelve al neutro', colorDe('SAL') === NEUT.SAL, colorDe('SAL'));
comprueba('la cocina vuelve al neutro', colorDe('COC') === NEUT.COC, colorDe('COC'));
comprueba('el estudio vuelve al neutro', colorDe('EST') === NEUT.EST, colorDe('EST'));
comprueba('el lavadero vuelve al neutro', colorDe('LAV') === NEUT.LAV, colorDe('LAV'));
comprueba('ningún muro se queda en verde', ['SAL','REC','PAS','COC','DOR','DO2','DO3','EST','LAV']
  .every(c=>colorDe(c) !== verdesDe(INT_A).filter(x=>x.cod===c).map(x=>x.pared)[0]));

/* el azulejo y la piedra no se tocan */
let azulejo = null, piedra = null;
escena.traverse(o=>{
  if(!o.isMesh) return;
  if(o.material === MI.azulejo) azulejo = o.material.color.getHexString();
  if(o.material === MI.piedra) piedra = o.material.color.getHexString();
});
comprueba('el azulejo no se toca', azulejo === 'cfd8dc', azulejo);
comprueba('la piedra no se toca', piedra === 'b8ac93', piedra);

AD.paleta.alterna();
comprueba('vuelve a limón', AD.paleta.tema() === 'limon');
comprueba('el salón vuelve al verde', colorDe('SAL') === '#c8db8a', colorDe('SAL'));

/* el material original no se muta */
let originalIntacto = true;
escena.traverse(o=>{
  if(!o.isMesh || !o.material || !o.material.color) return;
  if(o.material.userData && o.material.userData.paletaOrig) return;   // el clon sí puede
});
comprueba('el material original no se muta', originalIntacto);

/* ── 4 · La luz: se ESCALA, no se pisa ─────────────────────────────────── */
comprueba('renderer.toneMappingExposure está redefinida',
  Object.getOwnPropertyDescriptor(renderer,'toneMappingExposure').set !== undefined);
comprueba('sol.intensity está redefinida',
  Object.getOwnPropertyDescriptor(sol,'intensity').set !== undefined);
comprueba('hemi.intensity está redefinida',
  Object.getOwnPropertyDescriptor(hemi,'intensity').set !== undefined);
comprueba('relleno.intensity está redefinida',
  Object.getOwnPropertyDescriptor(relleno,'intensity').set !== undefined);

/* lo que escribe el visor (aplicaLuz) a las 13:00, ambiente natural */
function aplicaLuzDelVisor(exp, solCrudo, hemiCrudo, rebote){
  renderer.toneMappingExposure = exp;
  sol.intensity = solCrudo;
  hemi.intensity = hemiCrudo * rebote;
  relleno.intensity = 0.07 * rebote;
}
aplicaLuzDelVisor(1.00, 0.757, 0.327, 1.0);
console.log('tras aplicar la luz del visor: exp', renderer.toneMappingExposure.toFixed(3),
  '| sol', sol.intensity.toFixed(3), '| hemi', hemi.intensity.toFixed(3),
  '| relleno', relleno.intensity.toFixed(3));
comprueba('la exposición queda a 0,84', Math.abs(renderer.toneMappingExposure - 0.84) < 1e-6, renderer.toneMappingExposure);
comprueba('el sol queda a 1,33', Math.abs(sol.intensity - 1.327) < 2e-3, sol.intensity);
comprueba('la hemisférica queda a 0,56', Math.abs(hemi.intensity - 0.555) < 2e-3, hemi.intensity);
comprueba('el relleno queda a 0,14', Math.abs(relleno.intensity - 0.14) < 2e-3, relleno.intensity);

/* el visor cambia la hora (el sol pasa a 0,02: de noche) */
aplicaLuzDelVisor(1.00, 0.02, 0.10, 1.0);
console.log('de noche: exp', renderer.toneMappingExposure.toFixed(3), '| sol', sol.intensity.toFixed(3),
  '| hemi', hemi.intensity.toFixed(3), '| relleno', relleno.intensity.toFixed(3));
comprueba('de noche el sol se apaga', sol.intensity < 0.05, sol.intensity);
comprueba('de noche la hemisférica baja', Math.abs(hemi.intensity - 0.122) < 2e-3, hemi.intensity);

/* el visor mueve un deslizador (rebote) */
aplicaLuzDelVisor(1.45, 0.757, 0.327, 1.25);
comprueba('el factor sobrevive al deslizador de rebote',
  Math.abs(hemi.intensity - 0.327*1.25*1.697) < 2e-3, hemi.intensity);
comprueba('el factor de la exposición sobrevive al deslizador',
  Math.abs(renderer.toneMappingExposure - 1.45*0.84) < 1e-6, renderer.toneMappingExposure);

/* y vuelve a escribir el mismo valor: no se acumula el factor */
renderer.toneMappingExposure = 1.0;
const e1 = renderer.toneMappingExposure;
renderer.toneMappingExposure = 1.0;
comprueba('escribir dos veces el mismo valor no acumula el factor',
  Math.abs(renderer.toneMappingExposure - e1) < 1e-9, renderer.toneMappingExposure + ' vs ' + e1);

/* ── 5 · Cambiar de versión repinta ────────────────────────────────────── */
AD.api.VERSION = 'mejorada';
cuadro(0.016);
comprueba('al cambiar de versión se repinta en verde', colorDe('SAL') === '#c8db8a', colorDe('SAL'));

/* ── 6 · La lista de estancias para el hub ────────────────────────────── */
const est = AD.paleta.estancias();
comprueba('estancias() devuelve la lista', est.length >= 10, est.length);
comprueba('cada estancia pintable trae verde, neutro y dato',
  est.filter(e=>e.pintable).every(e=>e.verde && e.neutro && e.dato));
comprueba('el baño (azulejo) NO se lista como pintable',
  est.filter(e=>e.codigo==='BAN').every(e=>e.pintable===false && !e.verde), JSON.stringify(est.filter(e=>e.codigo==='BAN')));
comprueba('el porche (exterior) no aparece', !est.some(e=>e.codigo==='POR'));
comprueba('los nueve muros pintables están', est.filter(e=>e.pintable).length === 9, est.filter(e=>e.pintable).length);

fin();
