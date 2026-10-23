/* Ars Domus FABRICK · modulo/cctv.js
   -------------------------------------------------------------------------------
   Videovigilancia en DOS NIVELES, con cámaras por toda la casa y el terreno.

   · CINE: la cámara está a la altura de una persona (1,62 m sobre el suelo
     terminado), con lente CORTA (35–55° en horizontal): un plano general por
     estancia, un detalle de la pieza principal y algún contrapicado. La cámara
     se mueve despacio (travelling) y las tomas llevan rótulo de plano.
   · REALIDAD: la cámara está ALTA (2,40–2,70 m, como un domo), con lente ANCHA
     (70–90° en horizontal), FIJA, y con la estética de seguridad: marca de
     tiempo, identificador de cámara, cuadrícula. Sin rótulos de cine.

   De dónde salen las cámaras: de los DATOS, nunca de posiciones escritas a mano.
   · Interior: `INT.estancias` → una cámara en la esquina más alta mirando al
     centro, o DOS en esquinas opuestas cuando la estancia es grande.
   · Exterior: `C0.exterior` → caminos, farolas, piscina, construcciones, zonas
     y árboles. Cada cámara de fuera nace de un dato: la puerta principal (de
     los huecos), el portón y el camino de entrada, la pérgola y la caseta (de
     las construcciones), la piscina, el aparcamiento y el huerto (de las zonas),
     una farola del camino y un árbol.

   Encuadre con criterio de construcción (esto es lo que separa una cámara de
   una foto):
   · ≥ 0,25 m a la cara del muro y ≥ 0,60 m a la pieza que enseña;
   · nunca dentro de un mueble ni dentro de un muro;
   · la línea de visión no está cortada por nada más alto.

   El encuadre se pone con `AD.api.aplicaVista`, la misma puerta que usa el
   resto del visor. El FOV se define en HORIZONTAL (el humano) y se convierte a
   vertical con el aspecto: 2·atan(tan(h/2)/aspecto).

   Las miniaturas del panel de cámaras se dibujan con canvas (un croquis de
   planta por cámara): veinte renderizados WebGL en un móvil lo tumban.

   Mientras el CCTV está abierto, el modo cine se apaga (y al revés).
*/
var AD = window.AD || (window.AD = {});
(function(){
'use strict';

/* ── Estado ─────────────────────────────────────────────────────────────── */
var E = {abierto:false, i:0, nivel:'cine', auto:false, tAuto:0, reloj:0, tMov:0,
         cams:[], raiz:null, guardado:null, hd:null, minim:false, version:null,
         boton:false, listo:false, mueve:true};

/* ── Reglas de encuadre (las medidas exactas) ───────────────────────────── */
var OJO = 1.62;                   /* altura de la cámara de cine sobre el suelo */
var DOMO_MIN = 2.40, DOMO_MAX = 2.70;   /* altura de la cámara de vigilancia   */
var RETIRO_MURO = 0.25;           /* a la cara del muro                      */
var RETIRO_PIEZA = 0.60;          /* a la pieza que se enseña               */
var DIST_MIN = 2.0;               /* el visor no deja acercar a menos de 2 m */
var AUTO_CADA = 8;                /* segundos entre cámaras en rotación      */
var VEL_TRAV = 0.16;              /* m/s del travelling                      */
/* La lente: el campo horizontal pasado a focal de 35 mm (sensor de 36 mm).
   Es la cifra que entiende un director de fotografia: 18 mm abre el espacio,
   50 mm es el ojo humano, 85 mm comprime y aisla. */
function focal(hfov){ return Math.round(18 / Math.tan(rad(limita(hfov, 2, 178)) / 2)); }
function lente(hfov){
  var f = focal(hfov);
  if(f <= 24) return {mm:f, nombre:'gran angular'};
  if(f <= 40) return {mm:f, nombre:'angular'};
  if(f <= 60) return {mm:f, nombre:'normal'};
  if(f <= 100) return {mm:f, nombre:'tele corto'};
  return {mm:f, nombre:'tele'};
}
var HFOV_MIN = 35, HFOV_MAX = 90; /* límites del FOV en horizontal          */
var VFOV_CINE = [22, 94];         /* límites del FOV vertical en cine        */
var VFOV_REAL = [50, 94];         /* límites del FOV vertical en realidad    */

/* ── Utilidades ─────────────────────────────────────────────────────────── */
function api(){ return AD.api || null; }
function grados(r){ return r*180/Math.PI; }
function rad(g){ return g*Math.PI/180; }
function limita(v, a, b){ return v < a ? a : (v > b ? b : v); }

/* ── 1. Los datos de la casa ────────────────────────────────────────────── */
function datos(){
  var a = api(); if(!a) return null;
  var base = a.C || a.C0 || null;
  if(!base) return null;
  if(!base.muros && base.casa && base.casa.muros) base = base.casa;
  var inte = a.INT || base.interior || {estancias:[], muebles:[], luces:[]};
  /* El exterior: el contrato dice `C0.exterior`; hoy el bloque vive en
     `window.CASA.exterior` (el visor lo llama X). Se buscan las dos rutas. */
  var ext = (base && base.exterior) || (a.C0 && a.C0.exterior) ||
            (window.CASA && window.CASA.exterior) || {};
  var arboles = (base && base.arboles) || (window.CASA && window.CASA.arboles) || [];
  var suelo = (a.SUELO != null) ? a.SUELO : 0.25;
  var giro = (a.GIRO != null) ? a.GIRO : rad(90 - (base.rumbo == null ? 90 : base.rumbo));
  return {casa:base, inte:inte, ext:ext, arboles:arboles, suelo:suelo, giro:giro};
}
/* Del marco del plano (u, v) al mundo (x, z) y al revés. */
function aMundo(u, v){
  var a = api();
  if(a && typeof a.aMundo === 'function'){ var p = a.aMundo(u, v); return p; }
  var d = datos(); if(!d) return [u, v];
  var o = d.casa.origen || [0,0], c = Math.cos(d.giro), s = Math.sin(d.giro);
  return [o[0] + u*c + v*s, o[1] - u*s + v*c];
}
function planDe(x, z){
  var d = datos(); if(!d) return [x, z];
  var o = d.casa.origen || [0,0], c = Math.cos(d.giro), s = Math.sin(d.giro);
  var dx = x - o[0], dz = z - o[1];
  return [dx*c - dz*s, dx*s + dz*c];
}
/* Un punto del plano con su altura en el mundo. */
function mundo(u, v, y){ var m = aMundo(u, v); return [m[0], y, m[1]]; }
/* El suelo terminado de una estancia, en altura de mundo. */
function sueloDe(est){ var d = datos(); return d.suelo + (est.cota || 0); }
/* La altura del techo de una estancia en la abscisa v (en su marco local). */
function techoDe(e, v){
  var t = e.techo || {}, k = e.caja;
  if(t.cumbrera !== undefined && t.vc != null && t.alto != null)
    return t.alto + (t.cumbrera - t.alto)*(v < t.vc ? (v - k[1])/(t.vc - k[1]) : (k[3] - v)/(k[3] - t.vc));
  if(t.alto != null) return t.alto;
  if(t.alto0 != null) return t.alto0 + (t.alto1 - t.alto0)*(v - k[1])/Math.max(0.01, k[3] - k[1]);
  return 2.7;
}
function centroEstancia(e){
  var k = e.caja;
  return [(k[0] + k[2])/2, (k[1] + k[3])/2];
}
function superficie(e){
  var k = e.caja;
  return Math.max(0, k[2] - k[0])*Math.max(0, k[3] - k[1]);
}

/* ── 2. Los muros, por líneas ───────────────────────────────────────────── */
/* Los muros vienen troceados: entre dos trozos hay un hueco (puerta, paso o
   ventana). De cada línea se sacan dos listas: `solido` (el muro más las
   ventanas, para el retiro) y `muro` (solo el muro, para caminar). */
var PASABLES = {puerta:1, paso:1, vidriera:1, ventanal:1, arco:1, garaje:1};
var cacheLineas = null;
function lineas(){
  var d = datos(); if(!d) return [];
  if(cacheLineas && cacheLineas.version === d.casa) return cacheLineas.lista;
  var mapa = {};
  (d.casa.muros || []).forEach(function(w){
    var horiz = Math.abs(w[3] - w[1]) < 1e-6;
    var linea = horiz ? w[1] : w[0];
    var a = horiz ? Math.min(w[0], w[2]) : Math.min(w[1], w[3]);
    var b = horiz ? Math.max(w[0], w[2]) : Math.max(w[1], w[3]);
    var k = (horiz ? 'h:' : 'v:') + linea.toFixed(3);
    var L = mapa[k] || (mapa[k] = {horiz:horiz, linea:linea, muros:[], vanos:[]});
    L.muros.push({a:a, b:b, e:w[4] || 0.2});
  });
  (d.casa.huecos || []).forEach(function(h){
    var horiz = Math.abs(h[3] - h[1]) < 1e-6;
    var linea = horiz ? h[1] : h[0];
    var k = (horiz ? 'h:' : 'v:') + linea.toFixed(3);
    var L = mapa[k]; if(!L) return;
    var a = horiz ? Math.min(h[0], h[2]) : Math.min(h[1], h[3]);
    var b = horiz ? Math.max(h[0], h[2]) : Math.max(h[1], h[3]);
    L.vanos.push({a:a, b:b, e:h[6] || 0.2, pasable:!!PASABLES[h[4]]});
  });
  var lista = [];
  Object.keys(mapa).forEach(function(k){
    var L = mapa[k];
    var mat = L.muros.map(function(m){ return {a:m.a, b:m.b, e:m.e}; });
    var solido = mat.slice();
    L.vanos.forEach(function(v){ if(!v.pasable) solido.push({a:v.a, b:v.b, e:v.e}); });
    lista.push({horiz:L.horiz, linea:L.linea, solido:solido});
  });
  cacheLineas = {version:d.casa, lista:lista};
  return lista;
}
/* Distancia a la cara de un muro (0 si el punto está dentro). Se mide contra
   el TRAMO, no contra la recta: si la cámara queda al final de un muro, la
   distancia a la recta da 1e9 y la cámara se mete dentro del tabique. */
function distMuro(u, v){
  var ls = lineas(), mejor = 1e9;
  for(var i = 0; i < ls.length; i++){
    var L = ls[i], tr = L.solido;
    var p = L.horiz ? u : v, q = L.horiz ? v : u;
    for(var j = 0; j < tr.length; j++){
      var t = tr[j], te = (t.e || 0.2)/2;
      var da = p < t.a ? t.a - p : (p > t.b ? p - t.b : 0);
      var db = q < L.linea - te ? (L.linea - te) - q : (q > L.linea + te ? q - (L.linea + te) : 0);
      var d = Math.hypot(da, db);
      if(d < mejor) mejor = d;
    }
  }
  return mejor;
}

/* ── 3. Las huellas de los muebles ───────────────────────────────────────── */
/* La pieza tiene su origen en el centro de su planta y mira a +z local. */
function huella(m){
  var t = m.tipo, L = m.largo, A = m.ancho, F = m.fondo, R = m.radio;
  var hx = 0.35, hz = 0.35, alto = 0.8;
  switch(t){
    case 'cama': hx=(A||1.6)/2; hz=(L||2.0)/2; alto=1.15; break;
    case 'cama_casita': hx=(A||1.0)/2; hz=(L||2.0)/2; alto=1.6; break;
    case 'cama_infantil': hx=0.5; hz=1.05; alto=1.16; break;
    case 'sofa_tela': case 'sofa_l': case 'sofapiel': hx=(L||2.4)/2; hz=(F||0.95)/2; alto=0.85; break;
    case 'butaca_tela': case 'sillon': hx=0.4; hz=0.42; alto=0.9; break;
    case 'mesa_centro': case 'mesa_madera': case 'mesa_comedor': case 'mesa_redonda_madera':
      hx=(L||1.2)/2; hz=(F||0.9)/2; alto=0.78; break;
    case 'escritorio': hx=(L||1.6)/2; hz=(F||0.7)/2; alto=m.alto||0.76; break;
    case 'encimera': hx=(L||2.0)/2; hz=0.31; alto=0.95; break;
    case 'isla': hx=(L||2.2)/2; hz=(F||0.95)/2; alto=0.93; break;
    case 'nevera': hx=0.32; hz=0.34; alto=1.9; break;
    case 'empotrado': hx=(A||2.0)/2; hz=0.32; alto=2.55; break;
    case 'armario_alto': hx=(A||1.2)/2; hz=0.3; alto=2.4; break;
    case 'libreria': hx=(A||1.3)/2; hz=(F||0.35)/2; alto=m.alto||2.3; break;
    case 'enestera_metal': case 'estanteria_metal': hx=(A||0.9)/2; hz=0.2; alto=1.9; break;
    case 'kallax': hx=(A||0.9)/2; hz=0.35; alto=1.6; break;
    case 'banera': hx=0.8; hz=0.38; alto=0.6; break;
    case 'inodoro': hx=0.2; hz=0.25; alto=0.8; break;
    case 'lavabo_cajones': hx=(A||0.8)/2; hz=0.24; alto=0.9; break;
    case 'lavabo': hx=0.3; hz=0.24; alto=0.95; break;
    case 'toallero': hx=0.25; hz=0.06; alto=1.6; break;
    case 'comoda': hx=(A||1.1)/2; hz=0.25; alto=0.9; break;
    case 'mesilla': hx=0.22; hz=0.2; alto=0.55; break;
    case 'chimenea': hx=0.48; hz=0.1; alto=1.3; break;
    case 'banqueta': hx=0.2; hz=0.2; alto=0.7; break;
    case 'silla_madera': case 'silla': hx=0.24; hz=0.24; alto=0.9; break;
    case 'silla_oficina': hx=0.3; hz=0.3; alto=1.1; break;
    case 'espejo': hx=(A||0.9)/2; hz=0.05; alto=m.alto||1.2; break;
    case 'alfombra': hx=(A||2.0)/2; hz=(L||2.5)/2; alto=0.02; break;
    case 'maceta': hx=R||0.25; hz=R||0.25; alto=m.planta||1.0; break;
    case 'monitor': hx=(A||0.62)/2; hz=0.12; alto=0.5; break;
    case 'aparador': hx=(L||1.6)/2; hz=0.25; alto=0.9; break;
    case 'panel_listones': hx=(A||2.0)/2; hz=0.03; alto=m.alto||2.4; break;
    case 'lavadora': hx=0.3; hz=0.32; alto=0.9; break;
    case 'pila_lavar': hx=0.3; hz=0.24; alto=0.9; break;
    case 'mesa_jardin': hx=(L||1.2)/2; hz=(F||0.8)/2; alto=0.75; break;
    case 'chillout': hx=0.9; hz=0.9; alto=0.8; break;
    case 'banco_recibidor': hx=(L||1.4)/2; hz=0.22; alto=0.45; break;
    case 'lampara_pie': hx=0.2; hz=0.2; alto=1.6; break;
    case 'carrito': hx=0.42; hz=0.28; alto=0.9; break;
    default: hx=0.35; hz=0.35; alto=0.8;
  }
  return {hx:hx, hz:hz, alto:alto};
}
function marco(m){
  var g = rad(m.giro || 0);
  return {uv:m.uv, c:Math.cos(g), s:Math.sin(g), h:huella(m)};
}
function aLocal(mk, u, v){
  var dx = u - mk.uv[0], dz = v - mk.uv[1];
  return [dx*mk.c - dz*mk.s, dx*mk.s + dz*mk.c];
}
function distPieza(m, u, v){
  var mk = marco(m), l = aLocal(mk, u, v);
  var ex = Math.max(Math.abs(l[0]) - mk.h.hx, 0), ez = Math.max(Math.abs(l[1]) - mk.h.hz, 0);
  return Math.hypot(ex, ez);
}
function enPieza(m, u, v, margen){
  var mk = marco(m), l = aLocal(mk, u, v), mg = margen || 0;
  return Math.abs(l[0]) <= mk.h.hx + mg && Math.abs(l[1]) <= mk.h.hz + mg;
}
/* ¿La cámara (a esa altura) queda dentro de alguna pieza? Un mueble que no
   llega a su altura no la contiene, pero tampoco se le puede pasar rozando. */
function dentroDeMueble(u, v, altura, margen){
  var d = datos(); if(!d) return false;
  var mg = (margen === undefined ? 0.05 : margen);
  var ms = d.inte.muebles || [];
  for(var i = 0; i < ms.length; i++){
    var m = ms[i];
    if(!m.uv) continue;
    if(huella(m).alto <= altura - 0.25) continue;
    if(enPieza(m, u, v, mg)) return true;
  }
  return false;
}
/* ¿La línea de visión está cortada? Se interrumpe si por el camino hay algo
   más alto que la línea en ese punto. `excepto` es la pieza que se está
   filmando: claro, no puede taparse a sí misma. */
function lineaLibre(u0, v0, u1, v1, y0, y1, excepto){
  var d = datos(); if(!d) return true;
  var L = Math.hypot(u1 - u0, v1 - v0);
  var n = Math.max(6, Math.ceil(L/0.22));
  var ms = d.inte.muebles || [];
  for(var i = 1; i < n; i++){
    var t = i/n, u = u0 + (u1 - u0)*t, v = v0 + (v1 - v0)*t, y = y0 + (y1 - y0)*t;
    for(var j = 0; j < ms.length; j++){
      var m = ms[j];
      if(m === excepto) continue;
      if(!m.uv) continue;
      if(huella(m).alto <= y) continue;
      if(enPieza(m, u, v, 0)) return false;
    }
  }
  return true;
}
/* ¿El sitio está despejado? Muro a ≥ 0,25 m y ningún mueble encima. */
function sitioLibre(u, v, altura){
  if(distMuro(u, v) < RETIRO_MURO) return false;
  if(dentroDeMueble(u, v, altura, 0.05)) return false;
  return true;
}

/* ── 4. La pieza que manda en cada estancia ─────────────────────────────── */
var PESO = {
  chimenea:12, encimera:11, isla:13, columna:9, columnas:9, cocina:11,
  cama:9, sofapiel:8, sofa_tela:8, sofa_l:8, escritorio:8, libreria:8,
  panel_listones:7, mesa_comedor:7, mesa_madera:6, empotrado:7, armario_alto:6,
  banera:7, lavabo_cajones:6, nevera:6, inodoro:5, comoda:5, mesilla:4,
  mesa_centro:4, aparador:4, kallax:4, estanteria_metal:4, lavadora:3,
  pila_lavar:3, mesa_jardin:4, maceta:2, banco_recibidor:3, banqueta:2,
  silla_madera:1, silla_oficina:1, alfombra:1, espejo:2, monitor:2,
  toallero:2, silla:1, chillout:3
};
var ALTO_DETALLE = {
  chimenea:1.0, encimera:0.95, isla:0.95, cama:0.6, libreria:1.6, escritorio:0.78,
  banera:0.52, lavabo_cajones:0.86, lavabo:0.9, sofa_tela:0.72, sofapiel:0.72,
  mesa_madera:0.78, mesa_comedor:0.78, mesa_centro:0.45, mesilla:0.5, inodoro:0.42,
  empotrado:1.9, nevera:1.5, columnas:1.3, columna:1.3, comoda:0.6, aparador:0.8,
  monitor:0.4, panel_listones:1.6, kallax:1.2, estanteria_metal:1.2
};
function puntos(m){ return (m.largo || 0.6)*(m.ancho || m.fondo || 0.6); }
/* La estancia a la que pertenece un punto del plano. */
function estanciaEn(u, v){
  var d = datos(); if(!d) return null;
  var es = d.inte.estancias || [];
  for(var i = 0; i < es.length; i++){
    var k = es[i].caja;
    if(u >= k[0] && u <= k[2] && v >= k[1] && v <= k[3]) return es[i];
  }
  return null;
}
/* Las piezas de una estancia, de la más importante a la menos. */
function mando(est){
  var d = datos(); if(!d) return [];
  var res = [];
  (d.inte.muebles || []).forEach(function(m){
    if(!m.uv) return;
    var e = estanciaEn(m.uv[0], m.uv[1]);
    if(!e || e.id !== est.id) return;
    var s = (PESO[m.tipo] || 2) + Math.min(3.5, puntos(m)*0.18) + Math.min(2.5, huella(m).alto*0.7);
    res.push({m:m, s:s});
  });
  res.sort(function(a, b){ return b.s - a.s; });
  return res.map(function(x){ return x.m; });
}
function altoDetalle(m){ return ALTO_DETALLE[m.tipo] || 1.0; }

/* ── 5. El FOV y la colocación ───────────────────────────────────────────── */
function aspecto(){
  var a = api();
  if(!a || !a.camara) return 1;
  return a.camara.aspect || 1;
}
/* El FOV se define en HORIZONTAL (el humano) y se pasa a vertical con el
   aspecto. El nivel cine usa un límite vertical flojo (22°): en horizontal una
   lente corta da 20–32° verticales y es lo que hace que la toma sea de cine.
   El nivel realidad mantiene 50–94° para no abrir el ojo del pez. */
function fovVertical(hfov, nivel){
  var h = limita(hfov || 70, HFOV_MIN, HFOV_MAX);
  var v = 2*Math.atan(Math.tan(h*Math.PI/360)/aspecto())*180/Math.PI;
  var lim = (nivel === 'realidad') ? VFOV_REAL : VFOV_CINE;
  return limita(v, lim[0], lim[1]);
}
/* El horizontal que se ve de verdad con el vertical aplicado. */
function horizontalEfectivo(vfov){
  return 2*Math.atan(Math.tan(vfov*Math.PI/360)*aspecto())*180/Math.PI;
}
/* El punto de mira, alargado si hace falta: el visor no deja bajar de 2 m de
   distancia, así que el rayo se estira (la dirección no cambia). */
function miraLejana(pos, mira){
  var d = Math.hypot(pos[0] - mira[0], pos[1] - mira[1], pos[2] - mira[2]);
  if(d >= DIST_MIN) return mira;
  var k = (DIST_MIN - d)/(d || 1);
  return [mira[0] + (mira[0] - pos[0])*k, mira[1] + (mira[1] - pos[1])*k, mira[2] + (mira[2] - pos[2])*k];
}
function coloca(pos, mira, hfov){
  var a = api(); if(!a || !a.aplicaVista) return;
  a.aplicaVista({desde:pos, hacia:miraLejana(pos, mira), fov:fovVertical(hfov, E.nivel)});
}

/* ── 6. Dónde poner la cámara (criterio de construcción) ────────────────── */
/* Las esquinas de una estancia, con el retrait del muro ya descontado. */
function esquinas(est, margen){
  var k = est.caja, m = (margen === undefined ? 0.55 : margen);
  return [[k[0] + m, k[1] + m], [k[2] - m, k[1] + m], [k[0] + m, k[3] - m], [k[2] - m, k[3] - m]];
}
/* La esquina más alta: la de mayor techo. Entre las de igual techo, la más
   alejada de la pieza principal (para que la pieza quede en cuadro). */
function ordenarEsquinas(est, pieza){
  var es = esquinas(est, 0.45);
  var lista = es.map(function(c){
    return {u:c[0], v:c[1], t:techoDe(est, c[1]),
            d:pieza ? Math.hypot(c[0] - pieza.uv[0], c[1] - pieza.uv[1]) : 0};
  });
  lista.sort(function(a, b){
    if(Math.abs(b.t - a.t) > 0.01) return b.t - a.t;
    return b.d - a.d;
  });
  return lista;
}
/* El punto libre desde el que se ve mejor la pieza: se prueban las esquinas y
   los puntos medios de los muros, y gana el másAlejado de la pieza. */
function sitioGeneral(est, pieza, altura){
  var k = est.caja, cands = esquinas(est, 0.55);
  cands.push([(k[0] + k[2])/2, k[1] + 0.55], [(k[0] + k[2])/2, k[3] - 0.55]);
  cands.push([k[0] + 0.55, (k[1] + k[3])/2], [k[2] - 0.55, (k[1] + k[3])/2]);
  var mejor = null;
  cands.forEach(function(c){
    if(!sitioLibre(c[0], c[1], altura)) return;
    if(pieza && distPieza(pieza, c[0], c[1]) < RETIRO_PIEZA) return;
    if(pieza && !lineaLibre(c[0], c[1], pieza.uv[0], pieza.uv[1], altura, altoDetalle(pieza), pieza)) return;
    var dd = pieza ? Math.hypot(c[0] - pieza.uv[0], c[1] - pieza.uv[1]) : 3;
    /* Un sitio pegado al muro no vale: la cámara se ve aplastada contra el
       tabique. Se penaliza. */
    var m = dd - (distMuro(c[0], c[1]) < 0.6 ? 2 : 0);
    if(!mejor || m > mejor.m) mejor = {u:c[0], v:c[1], m:m};
  });
  return mejor;
}
/* Un sitio libre cerca del pedido: si la esquina exacta la ocupa un mueble, se
   busca a su alrededor (0,2 m, 0,4 m…) sin meterse en otro muro. */
function sitioCerca(u, v, altura){
  if(sitioLibre(u, v, altura)) return [u, v];
  for(var r = 0.2; r <= 0.8; r += 0.2){
    for(var i = 0; i < 8; i++){
      var a = i*Math.PI/4;
      var uu = u + Math.cos(a)*r, vv = v + Math.sin(a)*r;
      if(sitioLibre(uu, vv, altura)) return [uu, vv];
    }
  }
  return null;
}
/* Un travelling lateral: se prueba a deslizar la cámara perpendicular al rayo
   de mira (y un poco más de lado), y solo vale si todo el recorrido está
   libre de muros y de muebles. */
function viaSegura(u, v, altura, miraU, miraV, pieza){
  var dx = miraU - u, dz = miraV - v, l = Math.hypot(dx, dz) || 1;
  var px = -dz/l, pz = dx/l;
  var desv = [0, 0.5, -0.5, 1.0, -1.0];
  for(var s = 0; s < 2; s++){
    var sg = s ? -1 : 1;
    for(var a = 0; a < desv.length; a++){
      var aa = desv[a]*sg;
      var cx = px*Math.cos(aa) - pz*Math.sin(aa), cz = px*Math.sin(aa) + pz*Math.cos(aa);
      var largo = 0, ok = true;
      for(var paso = 0.15; paso <= 0.9; paso += 0.15){
        var uu = u + cx*paso, vv = v + cz*paso;
        if(!sitioLibre(uu, vv, altura)){ ok = false; break; }
        if(!lineaLibre(uu, vv, miraU, miraV, altura, altura, pieza)){ ok = false; break; }
        largo = paso;
      }
      if(ok && largo >= 0.6) return [u + cx*largo, v + cz*largo];
    }
  }
  return null;
}

/* ── 7. Las tomas ────────────────────────────────────────────────────────── */
/* CINÉ · plano general: la cámara a la altura de una persona, en la esquina
   desde la que se ve la pieza, con lente corta. */
function tomaGeneral(est, pieza){
  var s = sitioGeneral(est, pieza, OJO);
  if(!s) return null;
  var suelo = sueloDe(est);
  var mira = pieza ? [pieza.uv[0], pieza.uv[1]] : centroEstancia(est);
  var ymira = suelo + (pieza ? altoDetalle(pieza) : 1.25);
  var pos = mundo(s.u, s.v, suelo + OJO);
  var obj = mundo(mira[0], mira[1], ymira);
  var via = viaSegura(s.u, s.v, OJO, mira[0], mira[1], pieza);
  return {id:'GEN-' + est.id, nombre:est.nombre, rotulo:'Plano general · ' + est.nombre,
          plan:'general', sitio:'Interior', estancia:est.id, planta:est.codigo || est.id,
          pos:pos, mira:obj, hfov:50, pu:s.u, pv:s.v, mu:mira[0], mv:mira[1],
          via:via ? mundo(via[0], via[1], suelo + OJO) : null};
}
/* CINÉ · detalle de la pieza principal: la cámara a 0,85–1,00 m de la cara de
   la pieza, a la altura interesante de la pieza, con la lente más corta. */
function tomaDetalle(est, pieza){
  if(!pieza) return null;
  var mk = marco(pieza);
  var d = [mk.s, mk.c];                    /* el frente de la pieza */
  var suelo = sueloDe(est);
  var y = altoDetalle(pieza);
  for(var g = 0; g < 16; g++){
    var a = (g % 2 ? 1 : -1)*Math.floor(g/2)*rad(14);
    var dx = d[0]*Math.cos(a) - d[1]*Math.sin(a), dz = d[0]*Math.sin(a) + d[1]*Math.cos(a);
    for(var k = 0; k < 4; k++){
      var dist = mk.h.hz + 1.0 - k*0.05;
      var u = pieza.uv[0] + dx*dist, v = pieza.uv[1] + dz*dist;
      if(!sitioLibre(u, v, y)) continue;
      if(distPieza(pieza, u, v) < 0.80) continue;
      if(!lineaLibre(u, v, pieza.uv[0], pieza.uv[1], y, y, pieza)) continue;
      return {id:'DET-' + (pieza.id || est.id), nombre:'Detalle de ' + (pieza.tipo || ''),
              rotulo:'Detalle · ' + (pieza.tipo || est.nombre), plan:'detalle',
              sitio:'Interior', estancia:est.id, planta:est.codigo || est.id,
              pos:mundo(u, v, suelo + y), mira:mundo(pieza.uv[0], pieza.uv[1], suelo + y),
              hfov:38, pu:u, pv:v, mu:pieza.uv[0], mv:pieza.uv[1], via:null};
    }
  }
  return null;
}
/* CINÉ · contrapicado: la cámara baja (0,62 m) mirando hacia arriba. */
function tomaContrapicado(est, pieza){
  if(!pieza) return null;
  var mk = marco(pieza);
  var d = [mk.c, -mk.s];                   /* la derecha de la pieza */
  var suelo = sueloDe(est);
  var yAlto = Math.min(huella(pieza).alto + 0.15, techoDe(est, pieza.uv[1]) - 0.3);
  for(var g = 0; g < 16; g++){
    var a = (g % 2 ? 1 : -1)*Math.floor(g/2)*rad(14);
    var dx = d[0]*Math.cos(a) - d[1]*Math.sin(a), dz = d[0]*Math.sin(a) + d[1]*Math.cos(a);
    for(var k = 0; k < 4; k++){
      var dist = 1.6 + k*0.2;
      var u = pieza.uv[0] + dx*dist, v = pieza.uv[1] + dz*dist;
      if(!sitioLibre(u, v, 0.62)) continue;
      if(distPieza(pieza, u, v) < RETIRO_PIEZA) continue;
      if(!lineaLibre(u, v, pieza.uv[0], pieza.uv[1], 0.62, yAlto, pieza)) continue;
      return {id:'CTR-' + (pieza.id || est.id), nombre:'Contrapicado de ' + (pieza.tipo || ''),
              rotulo:'Contrapicado · ' + (pieza.tipo || est.nombre), plan:'contrapicado',
              sitio:'Interior', estancia:est.id, planta:est.codigo || est.id,
              pos:mundo(u, v, suelo + 0.62), mira:mundo(pieza.uv[0], pieza.uv[1], suelo + yAlto),
              hfov:45, pu:u, pv:v, mu:pieza.uv[0], mv:pieza.uv[1], via:null};
    }
  }
  return null;
}
/* REALIDAD · domo: la cámara en la esquina más alta, mirando al centro (o a la
   pieza principal). Fija, con lente ancha. */
function tomaDomo(est, pieza, primera){
  var suelo = sueloDe(est);
  /* El orden: primero las esquinas más altas; a igual altura, la más alejada
     de la pieza (así la pieza queda en cuadro y no detrás de la cámara). */
  var orden = ordenarEsquinas(est, pieza);
  var cands = orden.slice();
  if(primera){
    /* la segunda cámara va a la esquina OPUESTA: la más lejana de la primera */
    var lejos = null;
    orden.forEach(function(c){
      var dd = Math.hypot(c.u - primera.u, c.v - primera.v);
      if(!lejos || dd > lejos.dd) lejos = {u:c.u, v:c.v, t:c.t, dd:dd};
    });
    cands = [lejos];
    orden.forEach(function(c){
      if(c.u === lejos.u && c.v === lejos.v) return;
      if(c.u === primera.u && c.v === primera.v) return;   /* ni la de la primera */
      cands.push(c);
    });
  }
  var elegido = null;
  for(var i = 0; i < cands.length && !elegido; i++){
    var c = cands[i];
    var t = techoDe(est, c.v);
    /* el domo va pegado al techo, pero sin atravesarlo */
    var h = limita(Math.min(DOMO_MAX, t - 0.15), 2.20, DOMO_MAX);
    var s = sitioCerca(c.u, c.v, h);
    if(!s) continue;
    if(pieza && distPieza(pieza, s[0], s[1]) < RETIRO_PIEZA) continue;
    if(pieza && !lineaLibre(s[0], s[1], pieza.uv[0], pieza.uv[1], h, 1.1, pieza)) continue;
    elegido = {u:s[0], v:s[1], h:h};
  }
  if(!elegido) return null;
  var mira = pieza ? [pieza.uv[0], pieza.uv[1]] : centroEstancia(est);
  return {id:'DOM-' + est.id + (primera ? 'B' : 'A'), nombre:est.nombre + (primera ? ' (2)' : ''),
          rotulo:est.nombre, plan:'domo', sitio:'Interior', estancia:est.id,
          planta:est.codigo || est.id,
          pos:mundo(elegido.u, elegido.v, suelo + elegido.h),
          mira:mundo(mira[0], mira[1], suelo + 1.1),
          hfov:primera ? 88 : 78, pu:elegido.u, pv:elegido.v, mu:mira[0], mv:mira[1], via:null};
}

/* ── 8. Las cámaras de fuera (sale de `C0.exterior`) ────────────────────── */
/* La puerta principal, de los huecos: es lo que hay que vigilar. */
function puertaPrincipal(){
  var d = datos(); if(!d) return null;
  var hs = d.casa.huecos || [], sur = null, primera = null;
  hs.forEach(function(h){
    if(h[4] !== 'puerta') return;
    var u = (h[0] + h[2])/2, v = (h[1] + h[3])/2;
    if(!primera) primera = {u:u, v:v, a:h[2] - h[0]};
    if(h[5] === 'S' && !sur) sur = {u:u, v:v, a:h[2] - h[0]};
  });
  return sur || primera;
}
/* Un punto a lo largo de un eje de camino (en el mundo), con el desplazamiento
   lateral que marque el ancho del camino. */
function puntoDeCamino(camino, t, lado){
  var eje = camino.eje || [];
  if(eje.length < 2) return null;
  var seg = Math.floor(t*(eje.length - 1)), f = t*(eje.length - 1) - seg;
  seg = Math.min(seg, eje.length - 2);
  var a = eje[seg], b = eje[seg + 1];
  var x = a[0] + (b[0] - a[0])*f, z = a[1] + (b[1] - a[1])*f;
  var dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  var off = (camino.ancho || 1)/2 + 0.7;
  return [x - dz/l*off*lado, z + dx/l*off*lado];
}
function caminoPorId(id){
  var d = datos(); if(!d) return null;
  var cs = (d.ext && d.ext.caminos) || [];
  for(var i = 0; i < cs.length; i++) if(cs[i].id === id) return cs[i];
  return null;
}
function construccionPorId(id){
  var d = datos(); if(!d) return null;
  var cs = (d.ext && d.ext.construcciones) || [];
  for(var i = 0; i < cs.length; i++) if(cs[i].id === id) return cs[i];
  return null;
}
function zonaPorId(id){
  var d = datos(); if(!d) return null;
  var zs = (d.ext && d.ext.zonas) || [];
  for(var i = 0; i < zs.length; i++) if(zs[i].id === id) return zs[i];
  return null;
}
function centroDePoligono(poly){
  var u = 0, v = 0;
  poly.forEach(function(p){ u += p[0]; v += p[1]; });
  return [u/poly.length, v/poly.length];
}
/* ¿El punto está dentro del polígono? (rayo horizontal) */
function enPoligono(poly, x, z){
  var dentro = false;
  for(var i = 0, j = poly.length - 1; i < poly.length; j = i++){
    var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if(((zi > z) !== (zj > z)) && (x < (xj - xi)*(z - zi)/(zj - zi) + xi)) dentro = !dentro;
  }
  return dentro;
}
/* El rectángulo del vaso de la piscina, en coordenadas del mundo. */
function rectPiscina(pisc){
  if(!pisc) return null;
  var pr = rad(pisc.rumbo || 90);
  var EL = [Math.sin(pr), -Math.cos(pr)], EA = [-Math.cos(pr), -Math.sin(pr)];
  var a = (pisc.ancho || 4.5)/2, l = (pisc.largo || 10)/2, c = pisc.centro;
  var x0 = Math.min(c[0] - a*EA[0] - l*EL[0], c[0] + a*EA[0] + l*EL[0]);
  var x1 = Math.max(c[0] - a*EA[0] - l*EL[0], c[0] + a*EA[0] + l*EL[0]);
  var z0 = Math.min(c[1] - a*EA[1] - l*EL[1], c[1] + a*EA[1] + l*EL[1]);
  var z1 = Math.max(c[1] - a*EA[1] - l*EL[1], c[1] + a*EA[1] + l*EL[1]);
  return {x0:x0, x1:x1, z0:z0, z1:z1};
}
/* Un travelling de fuera: la cámara se desliza de lado, sin entrar en la casa
   ni en el vaso de la piscina. */
function viaExterior(pos, mira){
  var d = datos(); if(!d) return null;
  var cont = d.casa.contorno || [];
  var rect = rectPiscina(d.ext && d.ext.piscina);
  var dx = mira[0] - pos[0], dz = mira[2] - pos[2], l = Math.hypot(dx, dz) || 1;
  var px = -dz/l, pz = dx/l;
  for(var s = 0; s < 2; s++){
    var sg = s ? -1 : 1, largo = 0;
    for(var paso = 0.2; paso <= 0.8; paso += 0.2){
      var x = pos[0] + px*sg*paso, z = pos[2] + pz*sg*paso;
      var p = planDe(x, z);
      if(cont.length && enPoligono(cont, p[0], p[1])) break;
      if(rect && x > rect.x0 - 0.3 && x < rect.x1 + 0.3 &&
                z > rect.z0 - 0.3 && z < rect.z1 + 0.3) break;
      largo = paso;
    }
    if(largo >= 0.6) return [pos[0] + px*sg*largo, pos[1], pos[2] + pz*sg*largo];
  }
  return null;
}
/* Las cámaras de fuera. Las de cine van a la altura de una persona; las de
   realidad, a la altura del domo. Todas salen de un dato del terreno. */
function camarasExteriores(nivel){
  var d = datos(); if(!d) return [];
  var ext = d.ext || {}, lista = [];
  var suelo = d.suelo;
  var cine = (nivel !== 'realidad');
  var hfovExt = cine ? 48 : 80;
  var yCine = suelo + OJO, yReal = suelo + DOMO_MAX;
  var y = cine ? yCine : yReal;

  /* 1 · La fachada: la puerta principal, vista desde el jardín. */
  var pu = puertaPrincipal();
  var porche = null;
  (d.inte.estancias || []).forEach(function(e){ if(e.fuera) porche = e; });
  if(pu){
    var borde = porche ? porche.caja[3] : pu.v + 2.5;
    var v = borde + 4.5;
    lista.push({id:'EXT-FACHADA', nombre:'Fachada principal', rotulo:'Fachada',
                plan:'fachada', sitio:'Exterior', planta:'EXT',
                pos:mundo(pu.u, v, y), mira:mundo(pu.u, pu.v, suelo + 1.6),
                hfov:cine ? 45 : 78, pu:pu.u, pv:v, mu:pu.u, mv:pu.v, via:null});
  }
  /* 2 · El porche: bajo su techo, mirando la terraza. */
  if(porche){
    var k = porche.caja, u = k[0] + 1.4, v = (k[1] + k[3])/2;
    var t = techoDe(porche, v);
    var h = limita(Math.min(DOMO_MAX, t - 0.15), 2.2, DOMO_MAX);
    var hs = mando(porche);
    var mira = hs.length ? [hs[0].uv[0], hs[0].uv[1]] : centroEstancia(porche);
    lista.push({id:'EXT-PORCHE', nombre:'Porche', rotulo:'Porche',
                plan:'porche', sitio:'Exterior', planta:'EXT',
                pos:mundo(u, v, suelo + (porche.cota || 0) + (cine ? OJO : h)),
                mira:mundo(mira[0], mira[1], suelo + 1.2),
                hfov:cine ? 50 : 78, pu:u, pv:v, mu:mira[0], mv:mira[1], via:null});
  }
  /* 3 · La entrada: el portón, desde el camino. */
  var camEntrada = caminoPorId('entrada') || (ext.caminos || [])[0];
  var porton = ext.porton;
  if(camEntrada && porton){
    var p = puntoDeCamino(camEntrada, 0.22, 1);
    var puerta = [(porton.a[0] + porton.b[0])/2, (porton.a[1] + porton.b[1])/2];
    if(p){
      /* el lado que mira hacia la casa: el ojo ve el portón y el camino */
      var dx = puerta[0] - p[0], dz = puerta[1] - p[1], l = Math.hypot(dx, dz) || 1;
      lista.push({id:'EXT-ENTRADA', nombre:'Portón y entrada', rotulo:'Entrada',
                  plan:'entrada', sitio:'Exterior', planta:'EXT',
                  pos:[p[0], y, p[1]], mira:[puerta[0], suelo + 1.8, puerta[1]],
                  hfov:hfovExt, pu:planDe(p[0], p[1])[0], pv:planDe(p[0], p[1])[1],
                  mu:planDe(puerta[0], puerta[1])[0], mv:planDe(puerta[0], puerta[1])[1], via:null});
    }
  }
  /* 4 · El camino: la farola más cercana a la casa, mirando hacia ella. */
  var farolas = (ext.farolas || []).filter(function(f){ return f.grupo === 'Camino'; });
  if(farolas.length && camEntrada){
    var eje = camEntrada.eje || [];
    var ultimo = eje[eje.length - 1];
    var mejor = null;
    farolas.forEach(function(f){
      var dd = ultimo ? Math.hypot(f.mundo[0] - ultimo[0], f.mundo[1] - ultimo[1]) : 1e9;
      if(!mejor || dd < mejor.d) mejor = {f:f, d:dd};
    });
    if(mejor && ultimo){
      lista.push({id:'EXT-CAMINO', nombre:'Farola del camino', rotulo:'Camino de entrada',
                  plan:'camino', sitio:'Exterior', planta:'EXT',
                  pos:[mejor.f.mundo[0], suelo + DOMO_MAX - 0.05, mejor.f.mundo[1]],
                  mira:[ultimo[0], suelo + 1.4, ultimo[1]],
                  hfov:hfovExt, pu:planDe(mejor.f.mundo[0], mejor.f.mundo[1])[0],
                  pv:planDe(mejor.f.mundo[0], mejor.f.mundo[1])[1],
                  mu:planDe(ultimo[0], ultimo[1])[0], mv:planDe(ultimo[0], ultimo[1])[1], via:null});
    }
  }
  /* 5 · La cochera: el aparcamiento, desde su esquina más lejana. */
  var expl = zonaPorId('explanada');
  if(expl && expl.poly && expl.poly.length > 2){
    var cen = centroDePoligono(expl.poly), lejos = null;
    expl.poly.forEach(function(p){
      var dd = Math.hypot(p[0] - cen[0], p[1] - cen[1]);
      if(!lejos || dd > lejos.d) lejos = {p:p, d:dd};
    });
    var ux = cen[0] + (lejos.p[0] - cen[0])*0.12, uz = cen[1] + (lejos.p[1] - cen[1])*0.12;
    lista.push({id:'EXT-COCHERA', nombre:'Aparcamiento', rotulo:'Aparcamiento',
                plan:'cochera', sitio:'Exterior', planta:'EXT',
                pos:[ux, y, uz], mira:[cen[0], suelo + 1.2, cen[1]],
                hfov:hfovExt, pu:planDe(ux, uz)[0], pv:planDe(ux, uz)[1],
                mu:planDe(cen[0], cen[1])[0], mv:planDe(cen[0], cen[1])[1], via:null});
  }
  /* 6 · La pérgola: desde el borde, mirando a la piscina. */
  var perg = construccionPorId('pergola');
  var pisc = ext.piscina;
  if(perg && pisc){
    var cc = perg.centro, pc = pisc.centro;
    var dx = pc[0] - cc[0], dz = pc[1] - cc[1], l = Math.hypot(dx, dz) || 1;
    var rr = (perg.largo || 4)/2 + 0.9;          /* justo fuera de la pérgola */
    var px = cc[0] + dx/l*rr, pz = cc[1] + dz/l*rr;
    lista.push({id:'EXT-PERGOLA', nombre:'Pérgola', rotulo:'Pérgola',
                plan:'pergola', sitio:'Exterior', planta:'EXT',
                pos:[px, cine ? suelo + OJO : suelo + DOMO_MAX, pz],
                mira:[pc[0], (pisc.plataforma && pisc.plataforma.alto || 0) + suelo + 0.6, pc[1]],
                hfov:cine ? 45 : 80, pu:planDe(px, pz)[0], pv:planDe(px, pz)[1],
                mu:planDe(pc[0], pc[1])[0], mv:planDe(pc[0], pc[1])[1], via:null});
  }
  /* 7 · La piscina: desde la esquina de la plataforma, mirando al vaso. */
  if(pisc){
    var pr = rad(pisc.rumbo || 90);
    var EJE_L = [Math.sin(pr), -Math.cos(pr)], EJE_A = [-Math.cos(pr), -Math.sin(pr)];
    var a = (pisc.ancho || 4.5)/2 + 1.1, l2 = -(pisc.largo || 10)/2 - 1.0;
    var ex = pisc.centro[0] + a*EJE_A[0] + l2*EJE_L[0], ez = pisc.centro[1] + a*EJE_A[1] + l2*EJE_L[1];
    var ph2 = (pisc.plataforma && pisc.plataforma.alto || 0) + suelo;
    lista.push({id:'EXT-PISCINA', nombre:'Piscina', rotulo:'Piscina',
                plan:'piscina', sitio:'Exterior', planta:'EXT',
                pos:[ex, cine ? ph2 + OJO : ph2 + DOMO_MIN, ez],
                mira:[pisc.centro[0], ph2 + 0.3, pisc.centro[1]],
                hfov:cine ? 55 : 85, pu:planDe(ex, ez)[0], pv:planDe(ex, ez)[1],
                mu:planDe(pisc.centro[0], pisc.centro[1])[0], mv:planDe(pisc.centro[0], pisc.centro[1])[1], via:null});
  }
  /* 8 · El huerto: desde su esquina, mirando a los bancales. */
  var huer = zonaPorId('huerto');
  if(huer && huer.poly && huer.poly.length > 2){
    var hc = centroDePoligono(huer.poly), hlejos = null;
    huer.poly.forEach(function(p){
      var dd = Math.hypot(p[0] - hc[0], p[1] - hc[1]);
      if(!hlejos || dd > hlejos.d) hlejos = {p:p, d:dd};
    });
    var hx = hc[0] + (hlejos.p[0] - hc[0])*0.12, hz = hc[1] + (hlejos.p[1] - hc[1])*0.12;
    lista.push({id:'EXT-HUERTO', nombre:'Huerto', rotulo:'Huerto',
                plan:'huerto', sitio:'Exterior', planta:'EXT',
                pos:[hx, y, hz], mira:[hc[0], suelo + 1.0, hc[1]],
                hfov:cine ? 50 : 80, pu:planDe(hx, hz)[0], pv:planDe(hx, hz)[1],
                mu:planDe(hc[0], hc[1])[0], mv:planDe(hc[0], hc[1])[1], via:null});
  }
  /* 9 · La caseta de la depuradora, desde el tejado, mirando los escalones. */
  var cas = construccionPorId('caseta');
  var pasos = ext.pasos || [];
  if(cas){
    var miraPas = pasos.length ? pasos[0][0] : cas.centro;
    lista.push({id:'EXT-CASETA', nombre:'Caseta de la depuradora', rotulo:'Caseta',
                plan:'caseta', sitio:'Exterior', planta:'EXT',
                pos:[cas.centro[0], suelo + DOMO_MAX, cas.centro[1]],
                mira:[miraPas[0], suelo + 0.4, miraPas[1]],
                hfov:hfovExt, pu:planDe(cas.centro[0], cas.centro[1])[0],
                pv:planDe(cas.centro[0], cas.centro[1])[1],
                mu:planDe(miraPas[0], miraPas[1])[0], mv:planDe(miraPas[0], miraPas[1])[1], via:null});
  }
  /* 10 · Un árbol grande cerca de la casa: la cámara del linde. */
  var arboles = d.arboles || [], arbol = null;
  var cCasa = centroDePoligono(d.casa.contorno || [[0,0]]);
  var cM = aMundo(cCasa[0], cCasa[1]);
  arboles.forEach(function(t){
    if(!t || t.length < 4) return;
    var r = t[3] || 1;
    if(r < 2.5) return;
    var dd = Math.hypot(t[1] - cM[0], t[2] - cM[1]);
    if(!arbol || dd < arbol.d) arbol = {t:t, d:dd};
  });
  if(arbol){
    var aim = [d.casa.contorno.length ? Math.max.apply(null, d.casa.contorno.map(function(p){ return p[0]; })) : 0, 0];
    var aimM = aMundo(aim[0], 0);
    lista.push({id:'EXT-ARBOL', nombre:'Árbol del linde', rotulo:'Linde de árboles',
                plan:'arbol', sitio:'Exterior', planta:'EXT',
                pos:[arbol.t[1], suelo + DOMO_MAX, arbol.t[2]],
                mira:[aimM[0], suelo + 2.0, aimM[1]],
                hfov:hfovExt, pu:planDe(arbol.t[1], arbol.t[2])[0],
                pv:planDe(arbol.t[1], arbol.t[2])[1],
                mu:planDe(aimM[0], aimM[1])[0], mv:planDe(aimM[0], aimM[1])[1], via:null});
  }
  /* En cine, las tomas de fuera también se mueven (deslizamiento lateral). */
  if(cine) lista.forEach(function(c){ if(!c.via) c.via = viaExterior(c.pos, c.mira); });
  return lista;
}
function listaCine(){
  var d = datos(); if(!d) return [];
  var lista = [];
  var es = (d.inte.estancias || []).filter(function(e){ return !e.fuera; });
  var contras = [];
  es.forEach(function(e){
    var piezas = mando(e), pieza = piezas[0] || null;
    var g = tomaGeneral(e, pieza);
    if(g) lista.push(g);
    /* El detalle es de la pieza principal; si con ella no hay sitio (una silla
       en medio, un mueble pegado), se prueba con la siguiente. */
    var det = null;
    for(var i = 0; i < piezas.length && i < 3 && !det; i++) det = tomaDetalle(e, piezas[i]);
    if(det) lista.push(det);
    if(pieza && huella(pieza).alto >= 1.10 && superficie(e) >= 12){
      var c = tomaContrapicado(e, pieza);
      if(c) contras.push(c);
    }
  });
  /* solo tres contrapicados: los de las estancias más grandes */
  contras.sort(function(a, b){ return superficieDe(b.estancia) - superficieDe(a.estancia); });
  var orden = lista.slice();
  contras.slice(0, 3).forEach(function(c){
    var k = -1;
    for(var i = 0; i < orden.length; i++){ if(orden[i].estancia === c.estancia){ k = i; break; } }
    if(k < 0) return;
    orden.splice(Math.min(k + 1, orden.length), 0, c);
  });
  lista = orden;
  return lista.concat(camarasExteriores('cine'));
}
function superficieDe(id){
  var d = datos(); if(!d) return 0;
  var es = d.inte.estancias || [];
  for(var i = 0; i < es.length; i++) if(es[i].id === id) return superficie(es[i]);
  return 0;
}
function listaRealidad(){
  var d = datos(); if(!d) return [];
  var lista = [];
  (d.inte.estancias || []).forEach(function(e){
    if(e.fuera) return;                    /* el porche va como cámara de fuera */
    var piezas = mando(e), pieza = piezas[0] || null;
    var grande = superficie(e) >= 18;      /* dos cámaras en esquinas opuestas */
    var a = tomaDomo(e, pieza, null);
    if(a){
      lista.push(a);
      if(grande){
        var b = tomaDomo(e, pieza, {u:a.pu, v:a.pv});
        if(b) lista.push(b);
      }
    }
  });
  return lista.concat(camarasExteriores('realidad'));
}
/* Construye la lista del nivel pedido. */
function construye(nivel){
  var d = datos(); if(!d) return [];
  var lista = (nivel === 'realidad') ? listaRealidad() : listaCine();
  lista.forEach(function(c, i){
    c.id = 'CAM-' + (i + 1 < 10 ? '0' : '') + (i + 1);
    c.nivel = nivel;
  });
  return lista;
}

/* ── 10. El HUD ─────────────────────────────────────────────────────────── */
function css(){
  if(document.getElementById('cctv-css')) return;
  var s = document.createElement('style');
  s.id = 'cctv-css';
  s.textContent =
   '#cctv{position:fixed;inset:0;z-index:72;pointer-events:none;--cb:0%;'+
   'font-family:"IBM Plex Sans Condensed",system-ui,sans-serif;color:#d9e6ea}'+
   '#cctv.cine{--cb:5.5%}'+
   '#cctv .cj{position:absolute;inset:0;display:none;opacity:.5;'+
   'background-image:linear-gradient(rgba(217,230,234,.16) 1px,transparent 1px),'+
   'linear-gradient(90deg,rgba(217,230,234,.16) 1px,transparent 1px);'+
   'background-size:33.3333% 33.3333%}'+
   '#cctv.realidad .cj{display:block}'+
   '#cctv .cb{position:absolute;left:0;right:0;height:var(--cb);background:#04070a;display:none}'+
   '#cctv.cine .cb{display:block}'+
   '#cctv .cb.ab{top:0}#cctv .cb.ar{bottom:0}'+
   '#cctv .cs{position:absolute;left:12px;right:12px;top:calc(var(--cb) + 10px);'+
   'display:flex;justify-content:space-between;align-items:flex-start;gap:10px}'+
   '#cctv .cid{text-shadow:0 1px 3px #000;min-width:0}'+
   '#cctv .cid b{display:block;font-size:13px;letter-spacing:.2em;color:#c9ef63}'+
   '#cctv .cid span{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.85}'+
   '#cctv .crec{display:flex;align-items:center;gap:6px;font-size:12px;letter-spacing:.16em;'+
   'color:#ff6b5a;font-weight:700;text-shadow:0 1px 3px #000;white-space:nowrap}'+
   '#cctv .crec i{width:9px;height:9px;border-radius:50%;background:#ff6b5a;display:block;'+
   'animation:cctvparpadeo 1.6s infinite}'+
   '#cctv.realidad .crec i{display:block}'+
   '#cctv.cine .crec{display:none}'+
   '@keyframes cctvparpadeo{0%,45%{opacity:1}55%,100%{opacity:.15}}'+
   '#cctv .cr{position:absolute;left:12px;bottom:calc(var(--cb) + 66px);font-size:12px;'+
   'letter-spacing:.14em;text-transform:uppercase;text-shadow:0 1px 3px #000;max-width:70%}'+
   '#cctv .cr b{color:#f0c46a}'+
   '#cctv.realidad .cr{display:none}'+
   '#cctv .cc{position:absolute;left:12px;right:12px;bottom:calc(var(--cb) + 10px);'+
   'display:flex;gap:6px;justify-content:space-between;pointer-events:auto}'+
   '#cctv button{min-height:44px;min-width:44px;padding:0 10px;background:rgba(8,13,11,.86);'+
   'color:#d9e6ea;border:1px solid rgba(217,230,234,.3);border-radius:5px;cursor:pointer;'+
   'font:600 11px/1 "IBM Plex Sans Condensed",sans-serif;letter-spacing:.1em;text-transform:uppercase;'+
   'touch-action:manipulation;-webkit-user-select:none;user-select:none;display:inline-flex;'+
   'align-items:center;justify-content:center}'+
   '#cctv button[aria-pressed="true"],#cctv button.on{background:#f0c46a;color:#12160f;border-color:#f0c46a}'+
   '#cctv button:focus-visible{outline:2px solid #c9ef63;outline-offset:2px}'+
   '#cctv .cp{position:absolute;left:0;right:0;bottom:0;max-height:54vh;overflow-y:auto;'+
   'pointer-events:auto;background:rgba(5,9,11,.95);border-top:1px solid rgba(217,230,234,.22);'+
   'padding:10px 10px calc(12px + env(safe-area-inset-bottom));display:none}'+
   '#cctv .cp.on{display:block}'+
   '#cctv .cm{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}'+
   '@media (min-width:720px){#cctv .cm{grid-template-columns:repeat(3,1fr)}}'+
   '#cctv .malla{background:#0b1216;border:1px solid rgba(217,230,234,.2);border-radius:6px;'+
   'overflow:hidden;padding:0;text-align:left;display:block;min-height:44px}'+
   '#cctv .malla[aria-current="true"]{border-color:#f0c46a;box-shadow:inset 0 0 0 1px #f0c46a}'+
   '#cctv .malla canvas{display:block;width:100%;height:auto}'+
   '#cctv .malla span{display:block;padding:5px 7px;font-size:10px;letter-spacing:.06em;'+
   'text-transform:uppercase;color:#cfe0e6;line-height:1.25}'+
   'body.ad-cctv #fabrick,body.ad-cctv #brujula,body.ad-cctv #escala,body.ad-cctv #pie-hud,'+
   'body.ad-cctv #tour-hud,body.ad-cctv #hud,body.ad-cctv #panel,body.ad-cctv #abrir-panel,'+
   'body.ad-cctv #etiquetas,body.ad-cctv #ids{display:none!important}';
  if(document.head && document.head.appendChild) document.head.appendChild(s);
}
function crea(){
  if(E.raiz) return E.raiz;
  css();
  var d = document.createElement('div');
  d.id = 'cctv';
  d.hidden = true;
  d.innerHTML =
   '<div class="cj"></div>'+
   '<div class="cb ab"></div><div class="cb ar"></div>'+
   '<div class="cs"><div class="cid"><b class="cid-n"></b><span class="cid-t"></span></div>'+
     '<div class="crec"><i></i><span class="hora">--:--:--</span></div></div>'+
   '<div class="cr"></div>'+
   '<div class="cc">'+
     '<button type="button" data-a="ant" aria-label="Cámara anterior">◀</button>'+
     '<button type="button" data-a="sig" aria-label="Cámara siguiente">▶</button>'+
     '<button type="button" data-a="auto" aria-pressed="false">Auto</button>'+
     '<button type="button" data-a="nivel">Cine</button>'+
     '<button type="button" data-a="mueve" aria-pressed="true">Mover</button>'+
     '<button type="button" data-a="mallas" aria-pressed="false">Cámaras</button>'+
     '<button type="button" data-a="salir" aria-label="Salir del CCTV">✕</button>'+
   '</div>'+
   '<div class="cp"><div class="cm"></div></div>';
  document.body.appendChild(d);
  E.raiz = d;
  E.hd = {id:d.querySelector('.cid-n'), txt:d.querySelector('.cid-t'), hora:d.querySelector('.hora'),
          rot:d.querySelector('.cr'), panel:d.querySelector('.cp'), mallas:d.querySelector('.cm'),
          auto:d.querySelector('[data-a="auto"]'), nivel:d.querySelector('[data-a="nivel"]'),
          mueve:d.querySelector('[data-a="mueve"]'),
          mbtn:d.querySelector('[data-a="mallas"]')};
  d.querySelector('[data-a="ant"]').addEventListener('click', function(){ ir(E.i - 1); });
  d.querySelector('[data-a="sig"]').addEventListener('click', function(){ ir(E.i + 1); });
  d.querySelector('[data-a="salir"]').addEventListener('click', function(){ cierra(); });
  E.hd.auto.addEventListener('click', function(){ auto(!E.auto); });
  E.hd.nivel.addEventListener('click', function(){ setNivel(E.nivel === 'cine' ? 'realidad' : 'cine'); });
  E.hd.mueve.addEventListener('click', function(){ mueve(!E.mueve); });
  E.hd.mbtn.addEventListener('click', function(){ panelMin(!E.minim); });
  return d;
}
/* El panel de miniaturas. */
function panelMin(on){
  E.minim = (on === undefined) ? !E.minim : !!on;
  if(!E.raiz || !E.hd) return;
  E.hd.panel.classList.toggle('on', E.minim);
  E.hd.mbtn.setAttribute('aria-pressed', E.minim ? 'true' : 'false');
  if(E.minim) pintaMallas();
}
/* Las miniaturas: un croquis de planta por cámara, dibujado con canvas. */
function pintaMallas(){
  if(!E.hd || !E.hd.mallas) return;
  var cont = E.hd.mallas;
  cont.innerHTML = '';
  E.cams.forEach(function(c, i){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'malla';
    b.setAttribute('aria-current', i === E.i ? 'true' : 'false');
    var cv = document.createElement('canvas');
    cv.width = 176; cv.height = 99;
    b.appendChild(cv);
    var t = document.createElement('span');
    t.textContent = c.id + ' · ' + c.nombre;
    b.appendChild(t);
    b.addEventListener('click', function(){ panelMin(false); ir(i); });
    cont.appendChild(b);
    dibuja(cv, c);
  });
}
/* Un croquis: la planta de la casa, la pieza y el cono de la cámara. */
function dibuja(cv, c){
  var ctx = cv.getContext ? cv.getContext('2d') : null;
  if(!ctx) return;
  var w = cv.width, h = cv.height;
  var d = datos(); if(!d) return;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#081014';
  ctx.fillRect(0, 0, w, h);
  var cont = d.casa.contorno || [];
  var cam = [c.pu, c.pv], mir = [c.mu, c.mv];
  /* el cono: dos rayos a media apertura */
  var dx = mir[0] - cam[0], dz = mir[1] - cam[1], l = Math.hypot(dx, dz) || 1;
  var ang = Math.atan2(dz, dx), half = rad(c.hfov)/2;
  var r = Math.max(4, l*1.35);
  var cono = [cam,
              [cam[0] + Math.cos(ang - half)*r, cam[1] + Math.sin(ang - half)*r],
              [cam[0] + Math.cos(ang)*r*0.85, cam[1] + Math.sin(ang)*r*0.85],
              [cam[0] + Math.cos(ang + half)*r, cam[1] + Math.sin(ang + half)*r]];
  /* el encuadre: la casa y el cono */
  var xs = [], zs = [];
  cont.forEach(function(p){ xs.push(p[0]); zs.push(p[1]); });
  cono.forEach(function(p){ xs.push(p[0]); zs.push(p[1]); });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
  var esc = Math.min((w - 8)/Math.max(1, x1 - x0), (h - 8)/Math.max(1, z1 - z0));
  var ox = (w - (x1 - x0)*esc)/2 - x0*esc, oy = (h - (z1 - z0)*esc)/2 - z0*esc;
  var X = function(u){ return u*esc + ox; }, Y = function(v){ return v*esc + oy; };
  /* el cono, primero (debajo) */
  ctx.beginPath();
  ctx.moveTo(X(cam[0]), Y(cam[1]));
  cono.slice(1).forEach(function(p){ ctx.lineTo(X(p[0]), Y(p[1])); });
  ctx.closePath();
  ctx.fillStyle = 'rgba(240,196,106,.22)';
  ctx.fill();
  /* la piscina */
  var ext = d.ext || {}, pis = ext.piscina;
  if(pis && pis.centro){
    var pr = rad(pis.rumbo || 90);
    var EL = [Math.sin(pr), -Math.cos(pr)], EA = [-Math.cos(pr), -Math.sin(pr)];
    var a = (pis.ancho || 4.5)/2, l2 = (pis.largo || 10)/2;
    var ps = [pis.centro[0] - a*EA[0] - l2*EL[0], pis.centro[1] - a*EA[1] - l2*EL[1]];
    var pe = [pis.centro[0] + a*EA[0] + l2*EL[0], pis.centro[1] + a*EA[1] + l2*EL[1]];
    ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 1;
    ctx.strokeRect(X(Math.min(ps[0], pe[0])), Y(Math.min(ps[1], pe[1])),
                   Math.abs(pe[0] - ps[0])*esc, Math.abs(pe[1] - ps[1])*esc);
  }
  /* las estancias */
  ctx.strokeStyle = 'rgba(201,239,99,.45)'; ctx.lineWidth = 0.7;
  (d.inte.estancias || []).forEach(function(e){
    var k = e.caja;
    ctx.strokeRect(X(k[0]), Y(k[1]), (k[2] - k[0])*esc, (k[3] - k[1])*esc);
  });
  /* la huella de la casa */
  if(cont.length){
    ctx.beginPath();
    cont.forEach(function(p, i){ i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])); });
    ctx.closePath();
    ctx.strokeStyle = '#c9ef63'; ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  /* la cámara */
  ctx.beginPath();
  ctx.arc(X(cam[0]), Y(cam[1]), 3.2, 0, Math.PI*2);
  ctx.fillStyle = '#f0c46a'; ctx.fill();
  ctx.strokeStyle = '#f0c46a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(cam[0]), Y(cam[1]));
  ctx.lineTo(X(mir[0]), Y(mir[1]));
  ctx.stroke();
}
/* La marca de tiempo: la hora de la casa si está, y los segundos de verdad. */
function horaActual(){
  var h = document.getElementById('hora');
  var base = '00:00:00';
  if(h && h.textContent && h.textContent.indexOf(':') > 0){
    var p = h.textContent.split(':');
    base = (p[0] || '00') + ':' + (p[1] || '00');
  }
  var s = Math.floor(E.reloj) % 60;
  return base + ':' + (s < 10 ? '0' : '') + s;
}
function pintaInfo(){
  var c = E.cams[E.i];
  if(!c || !E.hd) return;
  E.hd.id.textContent = c.id;
  var l = lente(c.hfov);
  if(E.nivel === 'cine'){
    E.hd.txt.textContent = c.nombre + (c.sitio === 'Exterior' ? ' · exterior' : '');
    E.hd.rot.innerHTML = '<b>' + (c.rotulo || c.nombre) + '</b> · ' +
      Math.round(c.hfov) + '° · ' + l.mm + ' mm ' + l.nombre;
  } else {
    /* en vigilancia no hay rótulo de cine: el identificador, la lente y la hora */
    E.hd.txt.textContent = c.nombre + ' · ' + Math.round(c.hfov) + '° · ' + l.mm + ' mm';
    E.hd.rot.innerHTML = '';
  }
  var hijos = E.hd.mallas ? E.hd.mallas.children : [];
  for(var i = 0; i < hijos.length; i++){
    hijos[i].setAttribute('aria-current', i === E.i ? 'true' : 'false');
  }
}
function pintaNivel(){
  if(!E.raiz || !E.hd) return;
  E.raiz.className = E.nivel === 'cine' ? 'cine' : 'realidad';
  E.hd.nivel.textContent = E.nivel === 'cine' ? 'Realidad' : 'Cine';
  E.hd.nivel.setAttribute('aria-label', E.nivel === 'cine' ? 'Cambiar a vigilancia' : 'Cambiar a cine');
  if(E.hd.auto) E.hd.auto.setAttribute('aria-pressed', E.auto ? 'true' : 'false');
  if(E.hd.mueve) E.hd.mueve.setAttribute('aria-pressed', E.mueve ? 'true' : 'false');
}

/* ── 11. Cambiar de cámara ───────────────────────────────────────────────── */
function ir(i){
  if(!E.cams.length) return;
  var n = E.cams.length;
  E.i = ((i % n) + n) % n;
  var c = E.cams[E.i];
  E.tMov = 0;
  if(c.fase == null) c.fase = E.i * 1.7;
  E.tAuto = 0;
  coloca(c.pos, c.mira, c.hfov);
  pintaInfo();          /* las miniaturas ya están dibujadas: solo se marcan */
}
function auto(v){
  if(typeof v === 'boolean'){
    E.auto = v;
    E.tAuto = 0;
    if(E.hd && E.hd.auto) E.hd.auto.setAttribute('aria-pressed', v ? 'true' : 'false');
  }
  return E.auto;
}
function mueve(v){
  if(typeof v === 'boolean') E.mueve = v;
  if(E.hd && E.hd.mueve) E.hd.mueve.setAttribute('aria-pressed', E.mueve ? 'true' : 'false');
  return E.mueve;
}
function setNivel(n){
  n = (n === 'realidad') ? 'realidad' : 'cine';
  if(n === E.nivel) return E.nivel;
  E.nivel = n;
  E.cams = construye(n);
  E.i = 0;
  E.minim = false;
  if(E.hd && E.hd.panel) E.hd.panel.classList.remove('on');
  if(E.hd && E.hd.mbtn) E.hd.mbtn.setAttribute('aria-pressed', 'false');
  pintaNivel();
  if(E.abierto && E.cams.length) ir(0);
  return E.nivel;
}

/* ── 12. Abrir y cerrar ──────────────────────────────────────────────────── */
function libreDePaseo(){
  var a = api();
  if(!a) return true;
  if(a.pie && a.pie.activo && a.salirPie){ try{ a.salirPie(); }catch(e){} }
  return !(a.pie && a.pie.activo);
}
function abre(){
  var a = api();
  if(!a) return false;
  if(!E.cams.length) E.cams = construye(E.nivel);
  if(!E.cams.length) return false;
  /* El modo cine y el CCTV son excluyentes: los dos escriben la cámara. */
  if(AD.camaras && AD.camaras.cierra){ try{ AD.camaras.cierra(); }catch(e){} }
  if(AD.plano && AD.plano.cerrar && AD.plano.esPlan3D && AD.plano.esPlan3D()){
    try{ AD.plano.cerrar(); }catch(e){}
  }
  if(!libreDePaseo()) return false;
  crea();
  E.guardado = a.orbita ? a.orbita() : null;
  if(a.bloqueaOrbita) a.bloqueaOrbita(true);
  E.raiz.hidden = false;
  E.abierto = true;
  document.body.classList.add('ad-cctv');
  E.tAuto = 0;
  E.reloj = 0;
  pintaNivel();
  if(E.cams.length) ir(E.i);
  if(E.minim) pintaMallas();
  if(AD.refrescaBarra) AD.refrescaBarra();
  return true;
}
function cierra(restaura){
  if(!E.abierto) return;
  E.abierto = false;
  if(E.raiz) E.raiz.hidden = true;
  if(document.body && document.body.classList) document.body.classList.remove('ad-cctv');
  auto(false);
  E.minim = false;
  var a = api();
  if(a){
    if(a.bloqueaOrbita) a.bloqueaOrbita(false);
    if(restaura !== false && E.guardado && a.restauraOrbita){
      try{ a.restauraOrbita(E.guardado); }catch(e){}
    }
  }
  E.guardado = null;
  if(AD.refrescaBarra) AD.refrescaBarra();
}

/* ── 13. El botón de la barra ────────────────────────────────────────────── */
function registraBoton(){
  if(AD.iconos && !AD.iconos.cctv){
    AD.iconos.cctv = '<path d="M2.5 7h9l3 2.5v4.5h-12z" fill="none" stroke="currentColor" '+
      'stroke-width="1.6" stroke-linejoin="round"/><path d="M7 14v2.5h5" fill="none" '+
      'stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>';
  }
  if(!AD.boton) return false;
  AD.boton({id:'cctv', etiqueta:'CCTV', icono:'cctv',
    alPulsar:function(){ alterna(); },
    activo:function(){ return E.abierto; }});
  if(AD.pintaBarra) AD.pintaBarra();
  E.boton = true;
  return true;
}

/* ── 14. El API público ──────────────────────────────────────────────────── */
function alterna(){
  if(E.abierto) cierra();
  else abre();
  return E.abierto;
}
AD.cctv = {
  abrir: function(){ return abre(); },
  cerrar: function(){ cierra(); },
  alterna: alterna,
  alternar: alterna,
  abierto: function(){ return E.abierto; },
  irA: function(i){ if(!E.abierto) abre(); ir(i); return E.i; },
  siguiente: function(){ if(!E.abierto) abre(); ir(E.i + 1); return E.i; },
  anterior: function(){ if(!E.abierto) abre(); ir(E.i - 1); return E.i; },
  camaras: function(nivel){
    if(nivel && nivel !== E.nivel) return construye(nivel);
    return E.cams;
  },
  nivel: function(){ return E.nivel; },
  setNivel: function(n){ return setNivel(n); },
  auto: function(v){ return auto(v); },
  mueve: function(v){ return mueve(v); },
  lente: function(){ var c = E.cams[E.i]; return c ? lente(c.hfov) : null; },
  panel: function(v){ if(typeof v === 'boolean') panelMin(v); return E.minim; },
  estado: function(){
    return {abierto:E.abierto, nivel:E.nivel, i:E.i, auto:E.auto, camaras:E.cams.length};
  }
};

/* ── 15. El bucle ────────────────────────────────────────────────────────── */
if(AD.onFrame) AD.onFrame(function(dt){
  if(!E.abierto) return;
  E.reloj += dt;
  /* La rotación automática: una cámara cada 8 s. */
  if(E.auto && E.cams.length > 1){
    E.tAuto += dt;
    if(E.tAuto >= AUTO_CADA){
      E.tAuto = 0;
      ir(E.i + 1);
      /* El corte de un programa de realidad: se anuncia la camara nueva. */
      if(AD.avisa && E.nivel === 'cine'){
        var nc = E.cams[E.i];
        AD.avisa('Reality · ' + ((nc && (nc.rotulo || nc.nombre)) || 'cambio de cámara'), 'info');
      }
    }
    if(E.hd && E.hd.auto) E.hd.auto.textContent = 'Reality ' + Math.ceil(AUTO_CADA - E.tAuto) + 's';
  }else if(E.hd && E.hd.auto){
    E.hd.auto.textContent = 'Auto';
  }
  /* El travelling: la cámara se desliza despacio y el rótulo se queda. */
  var c = E.cams[E.i];
  if(c && c.via && E.nivel === 'cine'){
    E.tMov += dt;
    var dist = Math.hypot(c.via[0] - c.pos[0], c.via[1] - c.pos[1], c.via[2] - c.pos[2]);
    var dur = Math.max(1.2, dist/VEL_TRAV);
    var k = limita(E.tMov/dur, 0, 1);
    var s = k*k*(3 - 2*k);
    var pos = [c.pos[0] + (c.via[0] - c.pos[0])*s,
               c.pos[1] + (c.via[1] - c.pos[1])*s,
               c.pos[2] + (c.via[2] - c.pos[2])*s];
    coloca(pos, c.mira, c.hfov);
  }else if(c && E.mueve){
    /* La camara no esta quieta. Un domo barre su sector (paneo de verdad, con
       su inercia) y una camara de cine respira: encuadre vivo, como en un
       plano de realidad. El barrido es armonico, no lineal: arranca y frena
       solo, que es lo que hace el motor de un domo. */
    var esDomo = (E.nivel === 'realidad');
    var fase = c.fase == null ? (c.fase = E.i * 1.7) : c.fase;
    var barrido = esDomo ? 0.30 : 0.045;        /* radianes: +-17 grados / +-2,6 */
    var ritmo = esDomo ? 0.19 : 0.13;
    var dx = c.mira[0] - c.pos[0], dz = c.mira[2] - c.pos[2];
    var base = Math.atan2(dx, dz);
    var r = Math.max(0.5, Math.hypot(dx, dz));
    var ang = base + Math.sin(E.reloj * ritmo + fase) * barrido;
    var dy = c.mira[1] - c.pos[1];
    var inclina = esDomo ? Math.sin(E.reloj * 0.11 + fase * 0.7) * 0.035 : 0;
    var mira = [c.pos[0] + Math.sin(ang) * r,
                c.pos[1] + dy + inclina * r,
                c.pos[2] + Math.cos(ang) * r];
    /* Un zoom muy lento: da vida sin marear. */
    var fov = c.hfov + Math.sin(E.reloj * 0.08 + fase) * (esDomo ? 2.2 : 1.1);
    coloca(c.pos, mira, fov);
  }
  /* La marca de tiempo. */
  if(E.hd && E.hd.hora) E.hd.hora.textContent = horaActual();
  /* Si el modo cine se abre mientras el CCTV está puesto, el cine manda. */
  var cine = document.getElementById('adc-panel');
  if(cine && cine.classList && cine.classList.contains('on')) cierra(false);
});

/* ── 16. Arranque ────────────────────────────────────────────────────────── */
function monta(){
  var d = datos();
  if(!d || !d.inte || !(d.inte.estancias || []).length) return false;
  if(E.version !== d.casa){
    E.cams = construye(E.nivel);
    E.version = d.casa;
  }
  if(!registraBoton()){
    /* La barra (modulo/fabrick.js) carga después: se reintenta un poco. */
    setTimeout(registraBoton, 60);
  }
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
else if(addEventListener) addEventListener('load', espera);
setTimeout(espera, 150);
/* La barra se pinta al final: el botón del módulo gana al de la barra. */
if(addEventListener) addEventListener('load', function(){ setTimeout(registraBoton, 0); });
setTimeout(registraBoton, 0);

})();
