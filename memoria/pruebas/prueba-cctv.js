/* Prueba del módulo CCTV: monta el módulo con el DOM de mentira del banco y
   audita la lista de cámaras contra las reglas de encuadre. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = process.argv[2] || path.join(__dirname, '..', '..');
const THREE = require(path.join(RAIZ, 'node_modules/three'));

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
  return e;
}
function buscar(raiz, sel, uno){
  const selId = sel.charAt(0) === '#', selCl = sel.charAt(0) === '.', selAt = sel.charAt(0) === '[';
  const clave = selId || selCl ? sel.slice(1) : (selAt ? sel.slice(1,-1) : null);
  let encontrado = null;
  (function recorre(n){
    if(encontrado) return;
    if(selCl && n.classList && n.classList.contains(clave)){ encontrado = n; return; }
    if(selAt && n[clave] !== undefined){ encontrado = n; return; }
    if(typeof n.innerHTML === 'string' && n.innerHTML){
      if(selCl && n.innerHTML.indexOf(clave) >= 0){ const f = el('div'); f.classList.add(clave); encontrado = f; return; }
      if(selAt && n.innerHTML.indexOf(clave) >= 0){ const f = el('div'); f[clave]=''; encontrado = f; return; }
      if(selId && n.innerHTML.indexOf('id="'+clave+'"') >= 0){ const f = el('div'); f.id = clave; encontrado = f; return; }
    }
    (n.children||[]).forEach(c=>{
      if(encontrado) return;
      if(selId && c.id === clave){ encontrado = c; return; }
      if(selCl && c.classList && c.classList.contains(clave)){ encontrado = c; return; }
      if(selAt && c[clave] !== undefined){ encontrado = c; return; }
      if(typeof c.innerHTML === 'string' && c.innerHTML){
        if(selAt && c.innerHTML.indexOf(clave) >= 0){ const f = el('div'); f[clave]=''; f.parentNode=c; encontrado=f; return; }
      }
      recorre(c);
    });
  })(raiz);
  if(uno) return encontrado;
  return encontrado ? [encontrado] : [];
}
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
   'drawImage','setLineDash','quadraticCurveTo','bezierCurveTo','clip','rect'].forEach(function(k){ c[k]=noop; });
  ctx2d._c = c;
  return c;
}
const body = el('body'), head = el('head');
const doc = { readyState:'complete', body, head, documentElement:el('html'),
  createElement:el, createTextNode:()=>el('#text'),
  getElementById(id){ if(!(id in doc._byId)){ const e = el('div'); e.id=id; doc._byId[id]=e; } return doc._byId[id]; },
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  addEventListener(){}, removeEventListener(){}, createDocumentFragment(){ return el('#frag'); }, _byId:{} };
const store = {};
global.window = global;
global.document = doc;
global.navigator = {userAgent:'node'};
global.localStorage = {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];}};
global.matchMedia = () => ({matches:false, addListener(){}, removeListener(){}});
global.addEventListener = ()=>{};
global.removeEventListener = ()=>{};
global.requestAnimationFrame = ()=>0;
global.cancelAnimationFrame = ()=>0;
global.innerWidth = 390; global.innerHeight = 844; global.devicePixelRatio = 2;
global.THREE = THREE;

vm.runInThisContext(fs.readFileSync(path.join(RAIZ,'demo','casa.js'),'utf8'), {filename:'casa.js'});
const CASA = global.CASA;
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(42, 390/844, 0.3, 3000);
const capas = {};
['terreno','exterior','muros','interior','cubierta','piscina','arboles','catastro'].forEach(k=>{ capas[k]=new THREE.Group(); escena.add(capas[k]); });
const AD = global.AD = {hooks:[], piezas:{items:[], registra(p){this.items.push(p);}}, listo:false, botones:[], pendientes:[],
  onFrame(fn){ this.hooks.push(fn); }, alListo(fn){ if(typeof fn!=='function') return; if(this.listo) fn(); else this.pendientes.push(fn); },
  avisaListo(fn){ this.alListo(fn); } };
AD.api = { escena, camara, renderer:{setPixelRatio(){},render(){}}, capas,
  pie:{activo:false,x:0,z:0,y:0,yaw:0,pitch:0}, TOUR:{}, TOURS:[], PUERTAS:[], PUNTOS:[], pick:[], VISTAS:[],
  C:CASA.casa, INT:CASA.casa.interior, C0:CASA.casa, VERSION:'actual', VERSIONES:['actual'],
  GRUPOS_V:{actual:[],mejorada:[]}, LZ:{noche:false,todo:false,grupos:{}}, GIRO:0, SUELO:0.25,
  aMundo:(u,v)=>[u,v], d2r:d=>d*Math.PI/180, entraPie(){}, salirPie(){}, aplicaVista(){}, eligeVista(){},
  mueve(){}, visible(){return true;}, estanciaActiva(){return null;}, reloj:{getDelta:()=>0.016}, poneCapa(){}, MUEBLE:{}, MAT:{} };

vm.runInThisContext(fs.readFileSync(path.join(RAIZ,'modulo','cctv.js'),'utf8'), {filename:'cctv.js'});
/* la barra de Fabrick, que carga despues que los modulos */
vm.runInThisContext(fs.readFileSync(path.join(RAIZ,'modulo','fabrick.js'),'utf8'), {filename:'fabrick.js'});
AD.listo = true;
AD.pendientes.splice(0).forEach(fn=>{ try{ fn(); }catch(e){ console.log('alListo:', e.message); } });

/* ── Auditoría de la lista ─────────────────────────────────────────────── */
const C = CASA.casa, INT = C.interior, EXT = CASA.exterior;
const muros = C.muros, huecos = C.huecos;
const PASABLES = {puerta:1,paso:1,vidriera:1,ventanal:1,arco:1,garaje:1};
const lineas = [];
{
  const mapa = {};
  muros.forEach(w=>{ const hz = Math.abs(w[3]-w[1])<1e-6; const l = hz?w[1]:w[0];
    const a = hz?Math.min(w[0],w[2]):Math.min(w[1],w[3]), b = hz?Math.max(w[0],w[2]):Math.max(w[1],w[3]);
    const k = (hz?'h:':'v:')+l.toFixed(3); const L = mapa[k]||(mapa[k]={horiz:hz,linea:l,muros:[],vano:[]});
    L.muros.push({a,b,e:w[4]||0.2}); });
  huecos.forEach(h=>{ const hz = Math.abs(h[3]-h[1])<1e-6; const l = hz?h[1]:h[0];
    const a = hz?Math.min(h[0],h[2]):Math.min(h[1],h[3]), b = hz?Math.max(h[0],h[2]):Math.max(h[1],h[3]);
    const k = (hz?'h:':'v:')+l.toFixed(3); const L = mapa[k]; if(!L) return;
    L.vano.push({a,b,e:h[6]||0.2,pasable:!!PASABLES[h[4]]}); });
  Object.keys(mapa).forEach(k=>{ const L=mapa[k]; const sol=L.muros.slice();
    L.vano.forEach(v=>{ if(!v.pasable) sol.push({a:v.a,b:v.b,e:v.e}); });
    lineas.push({horiz:L.horiz,linea:L.linea,solido:sol}); });
}
function distMuro(u,v){
  let mejor = 1e9;
  lineas.forEach(L=>{
    const p = L.horiz?u:v, q = L.horiz?v:u;
    L.solido.forEach(t=>{
      const te = (t.e||0.2)/2;
      const da = p<t.a ? t.a-p : (p>t.b ? p-t.b : 0);
      const db = q<L.linea-te ? (L.linea-te)-q : (q>L.linea+te ? q-(L.linea+te) : 0);
      const d = Math.hypot(da,db); if(d<mejor) mejor=d;
    });
  });
  return mejor;
}
/* huella (copia minima del modulo) */
function huella(m){
  const t=m.tipo,L=m.largo,A=m.ancho,F=m.fondo,R=m.radio;
  let hx=0.35,hz=0.35,alto=0.8;
  const T={cama:()=>{hx=(A||1.6)/2;hz=(L||2.0)/2;alto=1.15;},cama_casita:()=>{hx=(A||1.0)/2;hz=(L||2.0)/2;alto=1.6;},
    cama_infantil:()=>{hx=0.5;hz=1.05;alto=1.16;},sofa_tela:()=>{hx=(L||2.4)/2;hz=(F||0.95)/2;alto=0.85;},
    sofapiel:()=>{hx=(L||2.4)/2;hz=(F||0.95)/2;alto=0.85;},butaca_tela:()=>{hx=0.4;hz=0.42;alto=0.9;},
    sillon:()=>{hx=0.4;hz=0.42;alto=0.9;},mesa_centro:()=>{hx=(L||1.2)/2;hz=(F||0.9)/2;alto=0.78;},
    mesa_madera:()=>{hx=(L||1.2)/2;hz=(F||0.9)/2;alto=0.78;},mesa_comedor:()=>{hx=(L||1.2)/2;hz=(F||0.9)/2;alto=0.78;},
    encimera:()=>{hx=(L||2.0)/2;hz=0.31;alto=0.95;},isla:()=>{hx=(L||2.2)/2;hz=(F||0.95)/2;alto=0.93;},
    nevera:()=>{hx=0.32;hz=0.34;alto=1.9;},empotrado:()=>{hx=(A||2.0)/2;hz=0.32;alto=2.55;},
    libreria:()=>{hx=(A||1.3)/2;hz=(F||0.35)/2;alto=m.alto||2.3;},kallax:()=>{hx=(A||0.9)/2;hz=0.35;alto=1.6;},
    banera:()=>{hx=0.8;hz=0.38;alto=0.6;},inodoro:()=>{hx=0.2;hz=0.25;alto=0.8;},
    lavabo_cajones:()=>{hx=(A||0.8)/2;hz=0.24;alto=0.9;},comoda:()=>{hx=(A||1.1)/2;hz=0.25;alto=0.9;},
    mesilla:()=>{hx=0.22;hz=0.2;alto=0.55;},chimenea:()=>{hx=0.48;hz=0.1;alto=1.3;},
    banqueta:()=>{hx=0.2;hz=0.2;alto=0.7;},silla_madera:()=>{hx=0.24;hz=0.24;alto=0.9;},
    silla_oficina:()=>{hx=0.3;hz=0.3;alto=1.1;},escritorio:()=>{hx=(L||1.6)/2;hz=(F||0.7)/2;alto=m.alto||0.76;},
    espejo:()=>{hx=(A||0.9)/2;hz=0.05;alto=m.alto||1.2;},alfombra:()=>{hx=(A||2.0)/2;hz=(L||2.5)/2;alto=0.02;},
    maceta:()=>{hx=R||0.25;hz=R||0.25;alto=m.planta||1.0;},monitor:()=>{hx=(A||0.62)/2;hz=0.12;alto=0.5;},
    aparador:()=>{hx=(L||1.6)/2;hz=0.25;alto=0.9;},estanteria_metal:()=>{hx=(A||0.9)/2;hz=0.2;alto=1.9;},
    lavadora:()=>{hx=0.3;hz=0.32;alto=0.9;},pila_lavar:()=>{hx=0.3;hz=0.24;alto=0.9;},
    mesa_jardin:()=>{hx=(L||1.2)/2;hz=(F||0.8)/2;alto=0.75;},chillout:()=>{hx=0.9;hz=0.9;alto=0.8;},
    banco_recibidor:()=>{hx=(L||1.4)/2;hz=0.22;alto=0.45;},lampara_pie:()=>{hx=0.2;hz=0.2;alto=1.6;}};
  if(T[t]) T[t]();
  return {hx,hz,alto};
}
function enPieza(m,u,v){
  const g=(m.giro||0)*Math.PI/180, c=Math.cos(g), s=Math.sin(g);
  const dx=u-m.uv[0], dz=v-m.uv[1];
  const lx=dx*c-dz*s, lz=dx*s+dz*c, h=huella(m);
  return Math.abs(lx)<=h.hx && Math.abs(lz)<=h.hz;
}
function distPieza(m,u,v){
  const g=(m.giro||0)*Math.PI/180, c=Math.cos(g), s=Math.sin(g);
  const dx=u-m.uv[0], dz=v-m.uv[1];
  const lx=dx*c-dz*s, lz=dx*s+dz*c, h=huella(m);
  return Math.hypot(Math.max(Math.abs(lx)-h.hx,0), Math.max(Math.abs(lz)-h.hz,0));
}
const aMundo = (u,v)=>[u,v];
let fallos = 0;
function fallo(msg){ fallos++; console.log('   ✗', msg); }

/* Las dos cámaras de una estancia grande: esquinas opuestas. */
function compruebaOpuestas(){
  const cams = AD.cctv.camaras('realidad');
  const por = {};
  cams.filter(c=>c.sitio==='Interior').forEach(c=>{ (por[c.estancia]=por[c.estancia]||[]).push(c); });
  Object.keys(por).forEach(id=>{
    const g = por[id];
    if(g.length < 2) return;
    const est = INT.estancias.find(e=>e.id===id);
    const k = est.caja, diag = Math.hypot(k[2]-k[0], k[3]-k[1]);
    const d = Math.hypot(g[0].pu-g[1].pu, g[0].pv-g[1].pv);
    console.log('  opuestas', id, 'separación', d.toFixed(2), 'de una diagonal de', diag.toFixed(2));
    if(d < diag*0.55) fallo('las dos cámaras de ' + id + ' no están en esquinas opuestas (' + d.toFixed(2) + ')');
  });
  /* El travelling: cuántas tomas lo llevan. */
  const conVia = AD.cctv.camaras('cine').filter(c=>c.via).length;
  console.log('  tomas con travelling:', conVia, '/', AD.cctv.camaras('cine').length);
}
compruebaOpuestas();

/* ── El API en la práctica ─────────────────────────────────────────────── */
console.log('\n== API ==');
console.log('abrir ->', AD.cctv.abrir());
console.log('abierto ->', AD.cctv.abierto());
console.log('nivel ->', AD.cctv.nivel());
console.log('irA(3) ->', AD.cctv.irA(3), AD.cctv.camaras()[3].id, AD.cctv.camaras()[3].nombre);
console.log('siguiente ->', AD.cctv.siguiente(), 'anterior ->', AD.cctv.anterior());
console.log('setNivel(realidad) ->', AD.cctv.setNivel('realidad'), 'cámaras:', AD.cctv.camaras().length);
console.log('auto(true) ->', AD.cctv.auto(true));
console.log('camaras() ->', AD.cctv.camaras().length, '| camaras(cine) ->', AD.cctv.camaras('cine').length);
console.log('estado ->', JSON.stringify(AD.cctv.estado()));
/* ocho segundos de rotación automática: un salto de cámara */
const antes = AD.cctv.estado().i;
for(let i = 0; i < 9; i++) AD.hooks.forEach(fn=>fn(1.0));
console.log('tras 9 s de rotación automática: i', antes, '->', AD.cctv.estado().i);
if(AD.cctv.estado().i === antes) fallo('la rotación automática no cambia de cámara');
AD.cctv.auto(false);
AD.cctv.setNivel('cine');
AD.cctv.alterna();
console.log('alterna -> abierto:', AD.cctv.abierto());
AD.hooks.forEach(fn=>fn(0.016));
AD.cctv.alterna();
console.log('alterna -> abierto:', AD.cctv.abierto());
console.log('botones en la barra:', (AD.botones||[]).map(b=>b.id).join(','));
/* el panel de miniaturas */
const raiz = doc.body.children[doc.body.children.length - 1];
let nCanvas = 0;
const origCreate = doc.createElement;
doc.createElement = function(tag){ const e = origCreate(tag); if(String(tag).toLowerCase()==='canvas') nCanvas++; return e; };
AD.cctv.panel(true);
console.log('miniaturas dibujadas:', nCanvas, '| cámaras:', AD.cctv.camaras().length, '| panel:', AD.cctv.panel());
if(nCanvas !== AD.cctv.camaras().length) fallo('las miniaturas no son una por cámara');
AD.cctv.panel(false);
setTimeout(()=>{
  console.log('botones tras el turno de eventos:', (AD.botones||[]).map(b=>b.id).join(','));
  if(!(AD.botones||[]).some(b=>b.id==='cctv')) fallo('no hay botón de CCTV en la barra');
  console.log('\nfallos:', fallos);
  process.exit(fallos?1:0);
}, 120);

function audita(nivel){
  console.log('\n=== NIVEL', nivel.toUpperCase(), '===');
  const cams = AD.cctv.camaras(nivel);
  console.log('cámaras:', cams.length);
  cams.forEach(c=>{
    const u = c.pu, v = c.pv;
    const dentro = u>=casa0[0]&&u<=casa0[2]&&v>=casa0[1]&&v<=casa0[3];
    const dm = distMuro(u,v);
    const y = c.pos[1];
    const suelo = 0.25 + (c.estancia ? (INT.estancias.find(e=>e.id===c.estancia)||{cota:0}).cota : 0);
    const sobre = y - suelo;
    // dentro de un mueble?
    let enMueble = null;
    if(c.estancia) INT.muebles.forEach(m=>{
      if(!m.uv) return;
      if(huella(m).alto <= sobre-0.25) return;
      if(enPieza(m,u,v)) enMueble = m.id;
    });
    // distancia a la pieza
    const pieza = c.estancia ? (INT.muebles.find(m=>m.uv && Math.abs(m.uv[0]-c.mu)<0.01 && Math.abs(m.uv[1]-c.mv)<0.01)) : null;
    const dp = pieza ? distPieza(pieza,u,v) : null;
    console.log(' ', c.id, c.plan.padEnd(12), c.nombre.padEnd(28),
      'hfov', String(c.hfov).padStart(3),
      'y', sobre.toFixed(2), 'muro', dm.toFixed(2),
      'pieza', dp===null?'—':dp.toFixed(2), c.sitio);
    if(c.sitio === 'Interior'){
      if(dm < 0.25) fallo(c.id + ' a menos de 0,25 m del muro (' + dm.toFixed(2) + ')');
      if(enMueble) fallo(c.id + ' DENTRO de un mueble: ' + enMueble);
      if(c.plan === 'detalle' && dp !== null && dp < 0.60) fallo(c.id + ' a menos de 0,60 m de la pieza (' + dp.toFixed(2) + ')');
      if(nivel === 'realidad' && (sobre < 2.39 || sobre > 2.71)) fallo(c.id + ' altura de domo fuera de 2,40–2,70 (' + sobre.toFixed(2) + ')');
      if(nivel === 'cine' && c.plan === 'general' && Math.abs(sobre - 1.62) > 0.02) fallo(c.id + ' general a != 1,62 (' + sobre.toFixed(2) + ')');
      if(nivel === 'cine' && c.plan === 'contrapicado' && Math.abs(sobre - 0.62) > 0.02) fallo(c.id + ' contrapicado a != 0,62 (' + sobre.toFixed(2) + ')');
      if(nivel === 'cine' && c.plan === 'detalle' && (sobre < 0.4 || sobre > 1.30)) fallo(c.id + ' detalle fuera de 0,40–1,30 (' + sobre.toFixed(2) + ')');
      if(nivel === 'cine' && c.hfov > 55) fallo(c.id + ' FOV de cine > 55°');
      if(nivel === 'realidad' && c.hfov < 70) fallo(c.id + ' FOV de realidad < 70°');
    }
  });
}
const casa0 = [0,0,20,15];
audita('cine');
audita('realidad');
console.log('\nfallos:', fallos);
process.exit(fallos?1:0);
