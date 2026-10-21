/* Prueba de la cocina (modulo/cocina.js) — sin navegador, con three de verdad. */
const C = require(__dirname + '/carga.js');
const {THREE, AD, escena, comprueba, fin, cargaModulo, avisaListo, cuadro, mallas, luces} = C;

console.log('== COCINA ==');
cargaModulo('cocina');
avisaListo();

const items = AD.piezas.items.filter(p => p.__cocina);
console.log('piezas de cocina:', items.length);
const tipos = {};
items.forEach(p => tipos[p.tipo] = (tipos[p.tipo]||0)+1);
console.log('tipos:', JSON.stringify(tipos));

/* ── 1 · 44 piezas, ids únicos ─────────────────────────────────────────── */
comprueba('son 44 piezas', items.length === 44, items.length);
const ids = items.map(p=>p.id);
comprueba('ids únicos', new Set(ids).size === ids.length, new Set(ids).size + ' de ' + ids.length);
comprueba('26 cajones', tipos.cajon === 26, tipos.cajon);
comprueba('16 puertas', tipos.puerta === 16, tipos.puerta);
comprueba('2 neveras', tipos.nevera === 2, tipos.nevera);
comprueba('todas con abre/cierra/estado', items.every(p=>p.abre&&p.cierra&&p.estado));

/* ── 2 · repara() dos veces: no duplica ─────────────────────────────────── */
const mallasAntes = mallas();
AD.cocina.repara();
const tras = AD.piezas.items.filter(p=>p.__cocina);
comprueba('tras repara() siguen siendo 44', tras.length === 44, tras.length);
comprueba('sin ids duplicados', new Set(tras.map(p=>p.id)).size === tras.length);
comprueba('sin mallas duplicadas', mallas() === mallasAntes, mallas() + ' vs ' + mallasAntes);
comprueba('AD.piezas.items no tiene restos del módulo', AD.piezas.items.length === 44, AD.piezas.items.length);

/* ── 3 · El cajón sale 0,46 m ───────────────────────────────────────────── */
function abreYEspera(id){
  const p = AD.piezas.items.filter(x=>x.__cocina && x.id === id)[0];
  if(!p) return null;
  const obj = p.an.obj;
  const antes = obj.position.clone();
  p.abre();
  for(let i=0;i<200;i++) cuadro(0.05);
  const despues = obj.position.clone();
  return {p, obj, antes, despues, delta: despues.clone().sub(antes)};
}
const cj = abreYEspera('COC-01-caj-3-actual');
comprueba('existe el cajón COC-01-caj-3-actual', !!cj);
if(cj){
  const dz = cj.delta.z;
  console.log('   cajón 3: Δz =', dz.toFixed(4), ' rot =', cj.obj.rotation.z.toFixed(4));
  comprueba('el cajón sale 0,46 m', Math.abs(dz - 0.46) < 1e-6, dz);
  comprueba('el cajón sale recto (sin giro)', Math.abs(cj.obj.rotation.z) < 1e-9);
}
/* el cajón vuelve */
if(cj){
  cj.p.cierra();
  for(let i=0;i<200;i++) cuadro(0.05);
  comprueba('el cajón vuelve a 0', Math.abs(cj.obj.position.z - cj.antes.z) < 1e-6, cj.obj.position.z);
}

/* todos los cajones: cuánto sale cada uno */
const viajes = AD.piezas.items.filter(p=>p.__cocina && p.tipo==='cajon').map(p=>{
  const z0 = p.an.obj.position.z;
  p.abre();
  for(let i=0;i<200;i++) cuadro(0.05);
  const dz = p.an.obj.position.z - z0;
  p.cierra();
  for(let i=0;i<200;i++) cuadro(0.05);
  return {id:p.id, dz:dz};
});
console.log('   viajes de cajón:', viajes.map(v=>v.id+'='+v.dz.toFixed(3)).join(' '));
comprueba('hay un cajón que sale 0,46 m', viajes.some(v=>Math.abs(v.dz-0.46)<1e-6));
comprueba('ningún cajón sale más de 0,46', viajes.every(v=>v.dz<=0.46+1e-9));

/* ── 4 · La puerta basculante gira exactamente 90° ───────────────────────── */
const yun = AD.piezas.items.filter(p=>p.__cocina && p.id.indexOf('COC-01-alac')===0);
comprueba('hay puertas de alacena (basculantes)', yun.length >= 3, yun.length);
const y0 = abreYEspera('COC-01-alac-1-actual');
if(y0){
  const rx = y0.obj.rotation.x;
  console.log('   basculante: rot.x =', rx.toFixed(6), '=', (rx*180/Math.PI).toFixed(4), '°');
  comprueba('la basculante gira exactamente -90°', Math.abs(rx + Math.PI/2) < 1e-9, rx);
  comprueba('la basculante gira sobre el pivote superior',
    Math.abs(y0.obj.position.y - 2.10) < 1e-6, y0.obj.position.y);
  y0.p.cierra();
  for(let i=0;i<200;i++) cuadro(0.05);
  comprueba('la basculante vuelve a 0°', Math.abs(y0.obj.rotation.x) < 1e-9, y0.obj.rotation.x);
}

/* ── 5 · La nevera abre sobre su bisagra y su luz se enciende ──────────── */
const nv = AD.piezas.items.filter(p=>p.__cocina && p.tipo==='nevera')[0];
comprueba('hay una nevera', !!nv);
if(nv){
  const obj = nv.an.obj;                 // el pivote de la hoja
  const p0 = obj.position.clone();
  console.log('   pivote nevera:', JSON.stringify(p0));
  comprueba('el pivote está en el canto (bisagra), no en el centro',
    Math.abs(Math.abs(p0.x) - 0.35) < 1e-6, Math.abs(p0.x));
  /* el centro de la hoja (hijo) NO debe estar en el pivote: está desplazado
     (0,349 = (0,70 − 2 mm de holgura) / 2) */
  const hoja = obj.children.filter(c=>c.isMesh)[0];
  comprueba('la hoja está desplazada del pivote (gira sobre la bisagra)',
    hoja && Math.abs(hoja.position.x - 0.349) < 1e-6, hoja && hoja.position.x);
  /* luz */
  const antesLuz = luces().filter(l=>l.isPointLight).map(l=>l.intensity);
  console.log('   luces de punto antes:', JSON.stringify(antesLuz));
  nv.abre();
  for(let i=0;i<200;i++) cuadro(0.05);
  const pts = luces().filter(l=>l.isPointLight);
  const encendidas = pts.filter(l=>l.intensity>0.01);
  console.log('   luces de punto después:', JSON.stringify(pts.map(l=>l.intensity)));
  comprueba('la luz de la nevera se enciende', encendidas.length === 1, encendidas.length);
  comprueba('la luz llega a 0,75', encendidas.length===1 && Math.abs(encendidas[0].intensity-0.75)<1e-6,
    encendidas[0] && encendidas[0].intensity);
  /* el giro de la hoja: sobre el pivote */
  comprueba('la hoja de la nevera gira 1,95 rad', Math.abs(obj.rotation.y + 1.95) < 1e-9, obj.rotation.y);
  /* la hoja se abre hacia fuera */
  nv.cierra();
  for(let i=0;i<200;i++) cuadro(0.05);
  comprueba('la luz se apaga al cerrar', pts.every(l=>l.intensity < 1e-6), pts.map(l=>l.intensity));
}

/* ── 6 · La isla: vuelo de encimera y barra a 1,05 (las dos versiones) ─── */
function cajaDe(grupo){
  const b = new THREE.Box3().setFromObject(grupo);
  return b;
}
function islaPorId(id){
  let g = null;
  escena.traverse(o=>{
    if(g) return;
    if(o.userData && o.userData.idMueble === id) g = o;
  });
  return g;
}
[['COC-03','actual'], ['COC-M01','mejorada']].forEach(function(par){
  const g = islaPorId(par[0]);
  comprueba('existe la isla ' + par[0], !!g);
  if(!g) return;
  const b = cajaDe(g);
  console.log('   ' + par[0] + ': caja min/max', b.min.toArray().map(n=>n.toFixed(3)).join(','),
              '/', b.max.toArray().map(n=>n.toFixed(3)).join(','));
  /* la barra: una losa cuyo canto superior está a 1,05 */
  let barra = null, trabajo = null;
  g.traverse(o=>{
    if(!o.isMesh) return;
    const y = o.position.y, h = o.geometry.parameters ? o.geometry.parameters.height : 0;
    if(Math.abs(y + h/2 - 1.05) < 1e-6 && h < 0.1) barra = o;
  });
  comprueba(par[0] + ': la barra está a 1,05', !!barra, barra && barra.position.y);
  /* el vuelo: desde el frente del cuerpo (0,60 de fondo) hasta el canto de la barra */
  const gb = g.children.filter(c=>c.isGroup && Math.abs(c.rotation.y - Math.PI) < 1e-6)[0];
  comprueba(par[0] + ': el cuerpo de la isla va girado 180°', !!gb);
  const vuelo = gb ? (b.max.z - cajaDe(gb).max.z) : -1;
  console.log('   ' + par[0] + ': vuelo de la barra =', vuelo.toFixed(3));
  comprueba(par[0] + ': el vuelo de encimera es >= 0,30', vuelo >= 0.30 - 1e-6, vuelo);
});

/* ── 7 · Todas las mallas de la cocina con userData.info ───────────────── */
let sinInfo = 0, mallasCoc = 0;
escena.traverse(o=>{
  if(!o.isMesh) return;
  if(o.userData && o.userData.info) return;
  /* solo cuentan las mallas que ha hecho la cocina */
  let p = o, mio = false;
  while(p){ if(p.userData && p.userData.__cocina){ mio = true; break; } p = p.parent; }
  if(mio){ mallasCoc++; sinInfo++; }
});
comprueba('todas las mallas de la cocina con ficha', sinInfo === 0, sinInfo + ' sin info de ' + mallasCoc);

/* ── 8 · El módulo no inventa horno ni microondas ──────────────────────── */
/* el mobiliario general (sillas y mesa) se mejora: cojín, listón y faldón */
function grupoDe(id){
  let g = null;
  escena.traverse(o=>{ if(!g && o.userData && o.userData.idMueble === id) g = o; });
  return g;
}
function mallasDe(g){ let n = 0; g.traverse(o=>{ if(o.isMesh) n++; }); return n; }
const silla = grupoDe('SAL-09');
comprueba('existe la silla SAL-09', !!silla);
if(silla){
  /* el visor hace 1 malla (asiento) + 4 patas + 2 montantes + 1 respaldo = 8 */
  comprueba('la silla tiene el cojín y el listón (3 mallas: 1 del mock + 2)', mallasDe(silla) === 3, mallasDe(silla));
  comprueba('la silla quedó marcada como mejorada', silla.userData.__cocina === true);
}
const mesa = grupoDe('SAL-08');
comprueba('existe la mesa SAL-08', !!mesa);
if(mesa){
  /* el visor: tablero + 4 patas = 5; con los dos faldones = 7 */
  comprueba('la mesa tiene los dos faldones (3 mallas: 1 del mock + 2)', mallasDe(mesa) === 3, mallasDe(mesa));
}
/* y al reparar otra vez no se duplica */
const mallasMuebles = mallasDe(silla) + mallasDe(mesa);
AD.cocina.repara();
comprueba('repara() no duplica el mobiliario general',
  mallasDe(silla) + mallasDe(mesa) === mallasMuebles, mallasDe(silla) + mallasDe(mesa));

const idsCoc = AD.piezas.items.filter(p=>p.__cocina).map(p=>p.id);
comprueba('no hay horno inventado', !idsCoc.some(i=>/horno/i.test(i)), idsCoc.join(','));
comprueba('no hay microondas inventado', !idsCoc.some(i=>/micro/i.test(i)));
let textoHorno = 0;
escena.traverse(o=>{ if(o.isMesh && o.userData && o.userData.info && /horno|microondas/i.test(o.userData.info.id||'')) textoHorno++; });
comprueba('no hay ningún mueble "horno" en la escena', textoHorno === 0, textoHorno);

fin();
