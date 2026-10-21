/* Carga compartida para mis pruebas: monta la casa real + la escena como la
   monta el visor, con las capas, GRUPOS_V, pick, piezas y onFrame. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = process.env.RAIZ || '/sdcard/Documents/Build house/repo';
const DEMO = path.join(RAIZ, 'demo');
const MOD = path.join(RAIZ, 'modulo');
const THREE = require(path.join(RAIZ, 'node_modules/three'));

/* ── DOM de mentira ─────────────────────────────────────────────────────── */
function el(tag){
  const e = {
    tagName:(tag||'div').toUpperCase(), style:{cssText:'', setProperty(){}},
    classList:{ _s:new Set(),
      add(...c){ c.forEach(x=>this._s.add(x)); }, remove(...c){ c.forEach(x=>this._s.delete(x)); },
      contains(c){ return this._s.has(c); }, toggle(c){ this._s.has(c)?this._s.delete(c):this._s.add(c); } },
    children:[], dataset:{}, hidden:false, textContent:'', innerHTML:'', value:'',
    width:0, height:0, checked:false, parentNode:null,
    setAttribute(k,v){ this[k]=v; }, getAttribute(k){ return this[k]; },
    removeAttribute(k){ delete this[k]; },
    appendChild(c){ c.parentNode=this; this.children.push(c); return c; },
    removeChild(c){ const i=this.children.indexOf(c); if(i>=0) this.children.splice(i,1); return c; },
    insertBefore(c){ return this.appendChild(c); },
    addEventListener(t,f){ (this._ev=this._ev||{})[t]=f; },
    removeEventListener(){}, dispatchEvent(){ return true; },
    querySelector(sel){ return buscar(this, sel, true); },
    querySelectorAll(sel){ return buscar(this, sel, false); },
    getBoundingClientRect(){ return {left:0,top:0,width:390,height:844,right:390,bottom:844}; },
    focus(){}, blur(){}, click(){ if(this._ev && this._ev.click) this._ev.click({}); },
    setPointerCapture(){}, releasePointerCapture(){}
  };
  e.classList.add = e.classList.add.bind(e.classList);
  return e;
}
function buscar(raiz, sel, uno){
  const selId = sel.charAt(0) === '#';
  const selCl = sel.charAt(0) === '.';
  const selAt = sel.charAt(0) === '[';
  const clave = selId || selCl ? sel.slice(1) : (selAt ? sel.slice(1,-1) : null);
  let encontrado = null;
  (function recorre(n){
    if(encontrado) return;
    if(selCl && n.classList && n.classList.contains(clave)){ encontrado = n; return; }
    if(selAt && n[clave] !== undefined){ encontrado = n; return; }
    if(typeof n.innerHTML === 'string' && n.innerHTML){
      if(selCl && n.innerHTML.indexOf(clave) >= 0){ const f = el('div'); f.classList.add(clave); encontrado = f; return; }
      if(selAt && n.innerHTML.indexOf(clave) >= 0){ const f = el('div'); f[clave] = ''; encontrado = f; return; }
    }
    (n.children||[]).forEach(c=>{
      if(encontrado) return;
      if(selId && c.id === clave) { encontrado = c; return; }
      if(selCl && c.classList && c.classList.contains(clave)) { encontrado = c; return; }
      if(selAt){
        if(c[clave] !== undefined){ encontrado = c; return; }
        if(typeof c.innerHTML === 'string' && c.innerHTML.indexOf(clave) >= 0){
          const f = el('div'); f[clave] = ''; f.parentNode = c; encontrado = f; return;
        }
      }
      recorre(c);
    });
  })(raiz);
  if(uno) return encontrado;
  return encontrado ? [encontrado] : [];
}
const body = el('body');
const head = el('head');
const doc = {
  readyState:'complete', body, head, documentElement:el('html'),
  createElement:el, createTextNode:()=>el('#text'),
  getElementById(id){ if(!(id in doc._byId)){ const e = el('div'); e.id = id; doc._byId[id] = e; } return doc._byId[id]; },
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  addEventListener(){}, removeEventListener(){}, createDocumentFragment(){ return el('#frag'); },
  _byId:{}
};
const store = {};
global.window = global;
global.document = doc;
global.navigator = {userAgent:'node', platform:'linux'};
global.localStorage = { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
global.matchMedia = () => ({matches:false, addListener(){}, removeListener(){}});
global.addEventListener = ()=>{};
global.removeEventListener = ()=>{};
global.requestAnimationFrame = ()=>0;
global.cancelAnimationFrame = ()=>{};
global.screen = {orientation:{lock:()=>Promise.resolve()}};
global.innerWidth = 390; global.innerHeight = 844; global.devicePixelRatio = 2;
global.THREE = THREE;

/* ── Datos reales de la casa ────────────────────────────────────────────── */
vm.runInThisContext(fs.readFileSync(path.join(DEMO,'casa.js'),'utf8'), {filename:'casa.js'});
const CASA = global.CASA;
const FM = global.CASA_MEJORA || global.FINCA_MEJORA || null;

/* ── Escena ─────────────────────────────────────────────────────────────── */
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(42, 390/844, 0.3, 3000);
const renderer = { toneMappingExposure:1, shadowMap:{enabled:true},
  capabilities:{getMaxAnisotropy:()=>8}, setPixelRatio(){}, render(){} };
const capas = {};
['terreno','exterior','muros','interior','cubierta','piscina','arboles','catastro']
  .forEach(k=>{ capas[k] = new THREE.Group(); escena.add(capas[k]); });

/* Las luces del visor: hemisférica, sol (sombra) y relleno. */
const hemi = new THREE.HemisphereLight(0xbfd7e6, 0x6a6156, 0.62); escena.add(hemi);
const sol = new THREE.DirectionalLight(0xfff3d6, 1.5); sol.castShadow = true; escena.add(sol);
const relleno = new THREE.DirectionalLight(0xdfe8f2, 0.12); escena.add(relleno);

/* Las dos versiones de la casa, cada una en su grupo (como hace el visor). */
const GRUPOS_V = {actual:[], mejorada:[]};
function grupoVersion(v){
  const g = new THREE.Group();
  g.name = 'VERSION_' + v;
  escena.add(g);
  GRUPOS_V[v].push(g);
  return g;
}
const gActual = grupoVersion('actual');
const gMejorada = grupoVersion('mejorada');

const AD = global.AD = { hooks:[], piezas:{items:[], registra(p){ this.items.push(p); }},
  listo:false, botones:[], pendientes:[],
  onFrame(fn){ this.hooks.push(fn); },
  alListo(fn){ if(typeof fn !== 'function') return; if(this.listo) fn(); else this.pendientes.push(fn); },
  avisaListo(fn){ this.alListo(fn); } };
AD.api = {
  escena, camara, renderer, capas,
  pie:{activo:false,x:0,z:0,y:0,yaw:0,pitch:0},
  TOUR:{}, TOURS:[], PUERTAS:[], PUNTOS:[], pick:[],
  VISTAS:[], C:CASA, INT:CASA.casa.interior, VERSION:'actual', VERSIONES:['actual','mejorada'],
  C0:CASA.casa,
  GRUPOS_V, LZ:{noche:false,todo:false,grupos:{}},
  GIRO:0, SUELO:0.25, aMundo:(u,v)=>[u,v], d2r:d=>d*Math.PI/180,
  entraPie(){}, salirPie(){}, aplicaVista(){}, eligeVista(){},
  mueve(){}, visible(){ return true; }, estanciaActiva(){ return null; },
  reloj:{getDelta:()=>0.016}, poneCapa(){}, MUEBLE:{}, MAT:{}
};

/* ── Fábrica de muebles: como el visor, un grupo por mueble con su ficha ── */
function haceMueble(gVersion, m){
  const g = new THREE.Group();
  g.userData.idMueble = m.id;
  const info = {id:m.id, tipo:m.tipo, etiqueta:m.id, grupo:'Mueble'};
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.6),
    new THREE.MeshLambertMaterial({color:'#dddddd'}));
  mesh.userData.info = info;
  g.add(mesh);
  g.position.set(0, 0, 0);
  gVersion.add(g);
  AD.api.pick.push(mesh);
  return g;
}
/* Muebles de las dos versiones, con el mismo id en las dos (como en la casa). */
function montaMuebles(INT, gVersion){
  (INT.muebles || []).forEach(m => { if(m.id) haceMueble(gVersion, m); });
}
montaMuebles(CASA.casa.interior, gActual);
if(FM && FM.casa && FM.casa.interior) montaMuebles(FM.casa.interior, gMejorada);

/* ── Utilidades de prueba ───────────────────────────────────────────────── */
const fallos = [];
function comprueba(nombre, cond, detalle){
  if(cond){ console.log('  ✓', nombre); }
  else { console.log('  ✗', nombre, detalle===undefined?'':('→ ' + detalle)); fallos.push(nombre + (detalle===undefined?'':(' → ' + detalle))); }
}
function fin(){
  console.log('\nfallos:', fallos.length);
  fallos.forEach(f=>console.log('   ✗', f));
  process.exit(fallos.length ? 1 : 0);
}
function cargaModulo(nombre){
  const f = path.join(MOD, nombre + '.js');
  vm.runInThisContext(fs.readFileSync(f,'utf8'), {filename:nombre + '.js'});
}
function avisaListo(){
  AD.listo = true;
  AD.pendientes.splice(0).forEach(fn=>{ fn(); });
}
function cuadro(dt){ AD.hooks.forEach(fn=>fn(dt||0.016)); }
function mallas(){ let n=0; escena.traverse(o=>{ if(o.isMesh) n++; }); return n; }
function luces(){ const l=[]; escena.traverse(o=>{ if(o.isLight) l.push(o); }); return l; }

module.exports = {THREE, CASA, FM, AD, escena, camara, renderer, capas, GRUPOS_V,
  gActual, gMejorada, hemi, sol, relleno, doc, store,
  comprueba, fin, cargaModulo, avisaListo, cuadro, mallas, luces, el};
