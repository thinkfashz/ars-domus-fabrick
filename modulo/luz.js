/* Ars Domus FABRICK · modulo/luz.js
   -------------------------------------------------------------------------------
   Luz de cuatro capas, que es como se ve una casa a media tarde:

   1. **Sol** — el sol de verdad (direccional, con sombra). Ya estaba.
   2. **Sol interior** — una segunda direccional SIN sombra, en la misma
      dirección, que llega a las estancias. Sin ella, las paredes que dan al
      patio quedan negras; con ella, la casa se ve iluminada por el mismo sol
      que ilumina el tejado, y no por un foco distinto.
   3. **Luz globo** — esferas de luz (bombillas de globo) dentro y fuera. Las de
      dentro cuelgan de las luminarias que ya dibuja el visor; las de fuera, en
      los farolillos del camino y el porche. Con `PointLight` de alcance corto:
      la luz de una bombilla no llega al otro lado de la casa.
   4. **Luz volumétrica** — el haz que se ve en el aire cuando la luz entra por
      una ventana. Es un cono aditivo desde cada ventana hacia el sol, con
      degradado. **Densidad 0,005**: es el parámetro que decide cuánto se ve.
      Con 0,005 se insinúa; con 0,03 parece humo.

   Nada de esto gasta sombras: los conos no proyectan y las luces globo no.
*/
var AD = window.AD || (window.AD = {});
(function(){
'use strict';

var DENSIDAD = 0.005;          // la que pediste
var MAX_HACES = 10;            // conos volumetricos vivos a la vez (rendimiento)
var MAX_GLOBOS = 8;            // bombillas de globo con PointLight

var EST = {sol:null, solInterior:null, haces:[], globos:[], hecho:false};

function api(){ return AD.api || null; }
function T(){ return window.THREE || null; }

/* ── Textura del haz: un degradado vertical, transparente arriba ─────────── */
function texturaHaz(){
  var t3 = T();
  if(!t3) return null;
  if(EST.tex) return EST.tex;
  var c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  var g = c.getContext('2d');
  var grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,246,224,0)');
  grad.addColorStop(0.35, 'rgba(255,240,208,0.55)');
  grad.addColorStop(1, 'rgba(255,232,190,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  var t = new t3.CanvasTexture(c);
  t.colorSpace = t3.SRGBColorSpace;
  EST.tex = t;
  return t;
}

/* ── El sol: la direccional con sombra ───────────────────────────────────── */
function buscaSol(){
  var a = api();
  if(!a || !a.escena) return null;
  var s = null;
  a.escena.traverse(function(o){
    if(!s && o.isDirectionalLight && o.castShadow) s = o;
  });
  return s;
}

/* ── Capa 2: el sol que también llega dentro ─────────────────────────────── */
function creaSolInterior(){
  var a = api(), t3 = T();
  if(!a || !a.escena || !t3) return;
  var sol = buscaSol();
  if(!sol) return;
  var d = new t3.DirectionalLight('#fff0d2', 0.26);
  d.position.copy(sol.position);
  d.castShadow = false;                 // el sol de verdad ya proyecta
  a.escena.add(d);
  a.escena.add(d.target);
  d.target.position.copy(sol.target.position);
  EST.sol = sol;
  EST.solInterior = d;
}

/* ── Capa 3: las luces globo ─────────────────────────────────────────────── */
/* Las de dentro: una por luminaria colgante o plafón que ya existe. Se busca
   por la ficha (userData.info.tipo === 'Iluminación'). */
function creaGlobos(){
  var a = api(), t3 = T();
  if(!a || !a.escena || !t3) return;
  var puestos = 0;
  a.escena.traverse(function(o){
    if(puestos >= MAX_GLOBOS) return;
    if(!o.isMesh) return;
    var i = o.userData && o.userData.info;
    if(!i || i.tipo !== 'Iluminación') return;
    /* el punto de luz de la luminaria: se toma su posicion y se le pone una
       esfera de vidrio con su luz. */
    var p = o.getWorldPosition(new t3.Vector3());
    var esfera = new t3.Mesh(
      new t3.SphereGeometry(0.11, 12, 10),
      new t3.MeshBasicMaterial({color:'#fff2d6', toneMapped:false})
    );
    esfera.position.copy(p);
    a.escena.add(esfera);
    var luz = new t3.PointLight('#ffe9c0', 0.0, 4.2, 1.7);
    luz.position.copy(p);
    a.escena.add(luz);
    EST.globos.push({malla:esfera, luz:luz, base:0.5, tipo:'interior'});
    puestos++;
  });
  /* Las de fuera: los farolillos del camino y del porche, en el sitio donde el
     visor ya pone la照明的 bombilla (PUNTOS con fuera = true). */
  if(a.PUNTOS) a.PUNTOS.forEach(function(pt){
    if(puestos >= MAX_GLOBOS) return;
    if(!pt.fuera || !pt.mallas || !pt.mallas.length) return;
    var m = pt.mallas[0];
    var p = m.getWorldPosition(new t3.Vector3());
    var esfera = new t3.Mesh(
      new t3.SphereGeometry(0.09, 10, 8),
      new t3.MeshBasicMaterial({color:'#ffe6b4', toneMapped:false})
    );
    esfera.position.copy(p);
    a.escena.add(esfera);
    var luz = new t3.PointLight('#ffdca6', 0.0, 5.0, 1.6);
    luz.position.copy(p);
    a.escena.add(luz);
    EST.globos.push({malla:esfera, luz:luz, base:0.65, tipo:'exterior'});
    puestos++;
  });
}

/* ── Capa 4: la luz volumétrica desde las ventanas ───────────────────────── */
function ventanas(){
  var a = api();
  if(!a || !a.escena) return [];
  var out = [];
  a.escena.traverse(function(o){
    if(!o.isMesh) return;
    var i = o.userData && o.userData.info;
    if(!i || i.tipo !== 'Hueco') return;
    if(!/ventana|vidriera/i.test(i.nombre || '')) return;
    out.push(o);
  });
  return out;
}

function creaHaces(){
  var a = api(), t3 = T();
  if(!a || !a.escena || !t3) return;
  var tex = texturaHaz();
  if(!tex) return;
  var mat = new t3.MeshBasicMaterial({
    map:tex, transparent:true, opacity:DENSIDAD*22, depthWrite:false,
    blending:t3.AdditiveBlending, side:t3.DoubleSide, toneMapped:false
  });
  EST.matHaz = mat;
  ventanas().forEach(function(v){
    var cono = new t3.Mesh(new t3.CylinderGeometry(0.55, 1.5, 3.2, 10, 1, true), mat);
    cono.renderOrder = 5;
    a.escena.add(cono);
    EST.haces.push({malla:cono, ventana:v});
  });
}

/* Coloca cada haz en su ventana y lo orienta hacia el sol. */
function orientaHaces(){
  var a = api(), t3 = T();
  if(!a || !a.escena || !t3) return;
  var sol = EST.sol || buscaSol();
  if(!sol) return;
  var dir = new t3.Vector3();
  sol.getWorldPosition(dir);
  dir.normalize();
  var pos = new t3.Vector3();
  /* Solo los haces mas cercanos a la camara: diez conos ya es bastante. */
  var cam = a.camara.getWorldPosition(new t3.Vector3());
  var cerca = EST.haces.map(function(h){
    h.ventana.getWorldPosition(pos);
    return {h:h, d:pos.distanceTo(cam), p:pos.clone()};
  }).sort(function(x,y){ return x.d - y.d; });
  cerca.forEach(function(c, i){
    var visible = i < MAX_HACES && c.d < 26;
    c.h.malla.visible = visible;
    if(!visible) return;
    c.h.malla.position.copy(c.p).addScaledVector(dir, 1.4);
    /* el cono mira al sol: su eje (y) va en contra de la luz que entra */
    c.h.malla.quaternion.setFromUnitVectors(new t3.Vector3(0,-1,0), dir);
  });
  /* El sol interior sigue al sol de verdad. */
  if(EST.solInterior){
    EST.solInterior.position.copy(sol.position);
    EST.solInterior.target.position.copy(sol.target.position);
    EST.solInterior.target.updateMatrixWorld();
  }
}

/* ── Encendido: de dia los globos brillan poquito; de noche, tambien ─────── */
function enciende(on){
  EST.globos.forEach(function(g){
    g.luz.intensity = on ? g.base : 0;
    g.malla.visible = on;
  });
  if(EST.matHaz) EST.matHaz.opacity = DENSIDAD*22;
}

/* ── API ───────────────────────────────────────────────────────────────────── */
AD.luz = {
  densidad: DENSIDAD,
  /* cambiar la densidad es cambiar el aspecto del aire: de 0,005 (se insinua)
     a 0,03 (humo). */
  ponDensidad: function(d){
    DENSIDAD = Math.max(0, Math.min(0.08, d));
    if(EST.matHaz) EST.matHaz.opacity = DENSIDAD*22;
    return DENSIDAD;
  },
  globos: function(){ return EST.globos.length; },
  haces: function(){ return EST.haces.length; },
  enciende: enciende,
  aplica: function(){
    creaSolInterior();
    creaGlobos();
    creaHaces();
    enciende(true);
  }
};

/* ── Arranque ─────────────────────────────────────────────────────────────── */
function monta(){
  var a = api();
  if(!a || !a.escena) return false;
  if(EST.hecho) return true;
  EST.hecho = true;
  AD.luz.aplica();
  if(AD.onFrame) AD.onFrame(orientaHaces);
  return true;
}
var intentos = 0;
function espera(){
  if(monta()) return;
  intentos++;
  if(intentos > 200) return;
  setTimeout(espera, 150);
}
if(AD.alListo) AD.alListo(function(){ espera(); });
if(document.readyState === 'complete') espera();
else addEventListener('load', espera);
setTimeout(espera, 150);

})();
