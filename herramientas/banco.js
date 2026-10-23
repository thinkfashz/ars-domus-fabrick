/* Banco de pruebas del visor Fabrick (Node, sin navegador).
   NO está en /tmp: vive en el repo porque es la red de seguridad de cada entrega.
   Uso:  node herramientas/banco.js            (usa la ruta del repo por defecto)
         node herramientas/banco.js /ruta/al/repo
   Que cargue la casa real y monte los ocho módulos y mide lo que cada uno deja.
   Sirve para cazar errores de runtime sin GPU: el navegador headless con
   WebGL por software tumba el renderizador en este teléfono. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = process.argv[2] || '/sdcard/Documents/Build house/repo';
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
    getContext(){ return ctx2d(); },
    setPointerCapture(){}, releasePointerCapture(){}
  };
  e.classList.add = e.classList.add.bind(e.classList);
  return e;
}
/* Buscador minimo: por id (#x) o por clase (.x), en profundidad. */
function buscar(raiz, sel, uno){
  const selId = sel.charAt(0) === '#';
  const selCl = sel.charAt(0) === '.';
  const selAt = sel.charAt(0) === '[';
  const clave = selId || selCl ? sel.slice(1) : (selAt ? sel.slice(1,-1) : null);
  let encontrado = null;
  (function recorre(n){
    if(encontrado) return;
    /* el propio nodo puede ser el que busca */
    if(selCl && n.classList && n.classList.contains(clave)){ encontrado = n; return; }
    if(selAt && n[clave] !== undefined){ encontrado = n; return; }
    /* el innerHTML es texto: si aparece la clase o el atributo, sirve */
    if(typeof n.innerHTML === 'string' && n.innerHTML){
      if(selCl && n.innerHTML.indexOf(clave) >= 0){ const f = el('div'); f.classList.add(clave); encontrado = f; return; }
      if(selAt && n.innerHTML.indexOf(clave) >= 0){ const f = el('div'); f[clave] = ''; encontrado = f; return; }
      /* por id escrito en el innerHTML: <button id="x"> */
      if(selId && n.innerHTML.indexOf('id=\'' + clave + '\'') >= 0){ const f = el('div'); f.id = clave; encontrado = f; return; }
      if(selId && n.innerHTML.indexOf('id=\'' + clave + '\'') < 0 &&
         n.innerHTML.indexOf('id=\'' + clave + '\'') < 0 && n.innerHTML.indexOf('id="' + clave + '"') >= 0){
        const f = el('div'); f.id = clave; encontrado = f; return;
      }
    }
    (n.children||[]).forEach(c=>{
      if(encontrado) return;
      if(selId && c.id === clave) { encontrado = c; return; }
      if(selCl && c.classList && c.classList.contains(clave)) { encontrado = c; return; }
      if(selAt){
        if(c[clave] !== undefined){ encontrado = c; return; }
        /* el innerHTML no se parsea: si el atributo aparece en el texto, sirve */
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
/* Contexto 2D de mentira: solo hace falta que no rompa. */
function ctx2d(){
  if(ctx2d._c) return ctx2d._c;
  var noop = function(){};
  var c = {fillStyle:'', strokeStyle:'', lineWidth:1, font:'', textAlign:'', textBaseline:'',
    globalAlpha:1, globalCompositeOperation:'',
    createLinearGradient:function(){ return {addColorStop:noop}; },
    createRadialGradient:function(){ return {addColorStop:noop}; },
    measureText:function(t){ return {width:(t||'').length*8}; },
    getImageData:function(){ return {data:[]}; },
    putImageData:noop, setTransform:noop, resetTransform:noop};
  ['fillRect','clearRect','strokeRect','beginPath','closePath','moveTo','lineTo','arc','arcTo',
   'fill','stroke','save','restore','translate','rotate','scale','fillText','strokeText',
   'drawImage','setLineDash','quadraticCurveTo','bezierCurveTo','clip','rect'].forEach(function(k){ c[k] = noop; });
  ctx2d._c = c;
  return c;
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

/* ── Escena de mentira, con la misma forma que usa el visor ─────────────── */
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(42, 390/844, 0.3, 3000);
const renderer = { toneMappingExposure:1, shadowMap:{enabled:true},
  capabilities:{getMaxAnisotropy:()=>8}, setPixelRatio(){}, render(){} };
const capas = {};
['terreno','exterior','muros','interior','cubierta','piscina','arboles','catastro']
  .forEach(k=>{ capas[k] = new THREE.Group(); escena.add(capas[k]); });

const AD = global.AD = { hooks:[], piezas:{items:[], registra(p){ this.items.push(p); }},
  listo:false, botones:[], pendientes:[],
  onFrame(fn){ this.hooks.push(fn); },
  alListo(fn){ if(typeof fn !== 'function') return; if(this.listo) fn(); else this.pendientes.push(fn); },
  avisaListo(fn){ this.alListo(fn); } };
AD.api = {
  escena, camara, renderer, capas,
  pie:{activo:false,x:0,z:0,y:0,yaw:0,pitch:0},
  TOUR:{}, TOURS:[], PUERTAS:[], PUNTOS:[], pick:[],
  VISTAS:[], C:CASA.casa, INT:CASA.casa.interior, C0:CASA.casa, VERSION:'actual', VERSIONES:['actual'],
  GRUPOS_V:{actual:[],mejorada:[]}, LZ:{noche:false,todo:false,grupos:{}},
  GIRO:0, SUELO:0.25, aMundo:(u,v)=>[u,v], d2r:d=>d*Math.PI/180,
  entraPie(){}, salirPie(){}, aplicaVista(){}, eligeVista(){},
  mueve(){}, visible(){ return true; }, estanciaActiva(){ return null; },
  reloj:{getDelta:()=>0.016}, poneCapa(){}, MUEBLE:{}, MAT:{}
};

/* ── Cargar los módulos y capturar fallos ────────────────────────────────── */
const modulos = ['diagnostico', 'paleta', 'cocina', 'plano', 'camaras', 'hub', 'audio', 'carga', 'luz', 'cctv', 'exterior', 'fabrick', 'recorrido'];
const fallos = [];
for(const m of modulos){
  const f = path.join(MOD, m + '.js');
  if(!fs.existsSync(f)){ fallos.push(m + ': NO EXISTE'); continue; }
  try{
    vm.runInThisContext(fs.readFileSync(f,'utf8'), {filename:m + '.js'});
    // el modulo monta al cargar: forzamos el aviso de "listo"
    AD.listo = true;
    AD.pendientes.splice(0).forEach(fn=>{ try{ fn(); }catch(e){ fallos.push(m + ' (alListo): ' + e.message); } });
  }catch(e){
    fallos.push(m + ': ' + e.message + ' | ' + (e.stack||'').split('\n')[1]);
  }
}

/* ── Un cuadro: los hooks de animación ──────────────────────────────────── */
try{
  AD.hooks.forEach(fn=>fn(0.016));
}catch(e){ fallos.push('hook: ' + e.message); }

/* ── Medidas ─────────────────────────────────────────────────────────────── */
let mallas = 0, conInfo = 0;
escena.traverse(o=>{ if(o.isMesh){ mallas++; if(o.userData && o.userData.info) conInfo++; } });
const luces = []; escena.traverse(o=>{ if(o.isLight) luces.push(o.type + ':' + o.intensity.toFixed(2)); });

console.log('== RESUMEN ==');
console.log('modulos cargados   :', modulos.length - fallos.filter(f=>f.includes('NO EXISTE')).length, '/', modulos.length);
console.log('mallas en escena   :', mallas, '(con userData.info:', conInfo + ')');
console.log('piezas registradas :', AD.piezas.items.length,
            '| tipos:', JSON.stringify(AD.piezas.items.reduce((a,p)=>{a[p.tipo]=(a[p.tipo]||0)+1;return a;},{})));
console.log('luces              :', luces.join(', ') || 'ninguna');
console.log('APIs expuestas     :', ['plano','camaras','hub','cocina','audio','carga','paleta','luz','cctv','recorrido','exterior']
            .map(k=>k + (AD[k]?'✓':'✗')).join(' '));
console.log('hooks registrados  :', AD.hooks.length);

/* ── Abrir cada modo y ver que pasa ──────────────────────────────────────────
   Un modo que se abre y no hace nada es un fallo silencioso: por eso se
   comprueba de verdad, no solo que el modulo cargue. */
console.log('\n== MODOS ==');
const modos = [
  ['Cine',      () => AD.camaras && AD.camaras.abrir()],
  ['CCTV',      () => AD.cctv && AD.cctv.abrir()],
  ['Recorrido', () => AD.recorrido && AD.recorrido.abrir()],
  ['Plano 3D',  () => AD.plano && AD.plano.alternar()],
  ['Hub',       () => AD.hub && AD.hub.abrir()],
  ['Exterior',  () => AD.exterior && AD.exterior.alterna()],
  ['Paleta',    () => AD.paleta && AD.paleta.alterna()]
];
for (const [nombre, fn] of modos) {
  try {
    const r = fn();
    console.log('  ' + (r === false ? 'NO ABRE ' : 'ok      ') + nombre + (r === false ? '  (devuelve false)' : ''));
  } catch (e) {
    console.log('  FALLA   ' + nombre + ': ' + (e && e.message ? e.message : e));
    fallos.push(nombre + ': ' + (e && e.message ? e.message : e));
  }
}
console.log('fallos             :', fallos.length);
fallos.forEach(f=>console.log('   ✗', f));
process.exit(fallos.length ? 1 : 0);
