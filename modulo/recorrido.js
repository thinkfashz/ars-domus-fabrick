/* Ars Domus FABRICK — modulo/recorrido.js
   -------------------------------------------------------------------------------
   El recorrido de la vivienda a la altura de una persona.

   Qué es: un paseo por dentro de la casa, estancia por estancia, sin atravesar
   ni un tabique. La cámara va a 1,62 m del suelo terminado (la altura de los
   ojos), con el campo de visión de una persona (72° en horizontal) y las puertas
   se abren solas cuando la cámara se acerca.

   De dónde sale todo: de los DATOS. Las estancias, los muros, los huecos y los
   muebles salen de `AD.api.C0` (la casa). El grafo de las estancias se arma
   comparando los bordes de cada caja: dos estancias están conectadas si
   comparten arista y en esa arista hay un hueco pasable (una puerta, un paso) o
   un tramo sin muro. El recorrido es un paseo en profundidad por ese grafo: si
   un callejón no tiene salida, se vuelve por donde se vino.

   El régimen de cámara: el PASEO del visor (`entraPie`). Es el único que da
   colisiones, altura de ojos, giro suave y un FOV que no le cambia nadie. Su
   altura es fija (la cámara queda en pie.y + 1,65), así que se compensa con
   3 cm (OJOS + DESAJUSTE) para dejarla en 1,62 m sobre el suelo terminado. La
   órbita no sirve: `colocar()` recorta la distancia a 2 m y el ángulo a 104,3°,
   así que no puede bajar la mirada a una mesa sin levantar la cámara del suelo.

   La API pública es `AD.recorrido`.
*/
var AD = window.AD || (window.AD = {});
(function(){
'use strict';
if (AD.recorrido) return;                       /* ya montado: no se duplica */

/* ═══ 1. Medidas ════════════════════════════════════════════════════════════ */
var OJOS = 1.62;          /* altura de la cámara sobre el suelo terminado */
var DESAJUSTE = -0.03;    /* el paseo del visor pone la cámara en pie.y + 1,65 */
var FOV_H = 72;           /* visión humana, en horizontal */
var FOV_V_MIN = 50, FOV_V_MAX = 94;
var VEL = 1.4;            /* m/s: paso de persona (el ANDA del visor) */
var PARADA = 1.7;         /* s quieto en cada estancia */
var ABRE_PUERTA = 2.9;    /* m: la puerta se abre sola a menos de esto */
var DELANTE = 1.3;        /* m por delante: el rumbo se adelanta al giro */
var HUECO_MUEBLE = 0.34;  /* m: holgura de la cámara a los muebles */
var RETIRO_MURO = 0.32;   /* m: la cámara no se acerca a menos de esto al muro */
var VELOCIDADES = [0.6, 1, 1.6, 2];
var SUAVE = 2.4;          /* 1/s: rapidez con que la mirada alcanza el rumbo */

/* ═══ 2. Datos ═══════════════════════════════════════════════════════════════ */
function api(){ return AD.api || null; }
function casa(){ var a = api(); if(!a) return null; return a.C0 || a.C || null; }
function interior(){
  var a = api(); if(!a) return null;
  var c = a.C0 || a.C;
  if(c && c.interior) return c.interior;
  return a.INT || null;
}
function cotaSuelo(){ var a = api(); return a && typeof a.SUELO === 'number' ? a.SUELO : 0.25; }
function aMundo(u, v){
  var a = api();
  if(a && a.aMundo){ var p = a.aMundo(u, v); return [p[0], p[1]]; }
  return [u, v];
}
/* La cota del suelo terminado de una estancia: SUELO + e.cota. */
function sueloDe(est){ return cotaSuelo() + (est.cota || 0); }

/* ═══ 3. Geometría en el marco local (u,v) ═══════════════════════════════════
   Las cajas de las estancias, los muros, los huecos y los muebles están todos
   en el mismo marco: u hacia un lado, v hacia el otro, en metros. El giro de
   la casa (GIRO) se aplica solo al pasar al mundo, con `aMundo`. */

/* Medidas de cada mueble: x = su largo por el eje local, z = su fondo, h = alto.
   'largo', 'ancho', 'fondo' y 'radio' se toman de los datos del mueble; `def`
   son los valores por defecto cuando el dato no viene. `peso` decide cuál es
   la pieza principal de la estancia; `mira` es la altura a la que se apunta. */
var MEDIDAS = {
  chimenea:        {x:0.95,      z:0.12,    h:1.60, mira:1.00, peso:0.7},
  alfombra:        {x:'ancho',   z:'largo',  h:0.02, mira:0.10, peso:0.2, def:{ancho:2.4, largo:3.0}, suelta:true},
  sofa_tela:       {x:'largo',   z:'fondo',  h:0.85, mira:0.50, peso:1.3, def:{largo:2.4, fondo:0.95}},
  butaca_tela:     {x:0.74,      z:0.78,    h:0.90, mira:0.50, peso:0.7},
  mesa_centro:     {x:'largo',   z:'fondo',  h:0.45, mira:0.42, peso:0.8, def:{largo:1.1, fondo:0.6}},
  libreria:        {x:'ancho',   z:'fondo',  h:2.30, mira:1.20, peso:0.7, def:{ancho:1.2, fondo:0.35}},
  lampara_pie:     {x:0.30,      z:0.30,    h:1.60, mira:1.40, peso:0.2, suelta:true},
  mesa_madera:     {x:'largo',   z:'fondo',  h:0.78, mira:0.75, peso:1.0, def:{largo:2.2, fondo:0.95}},
  silla_madera:    {x:0.45,      z:0.45,    h:0.90, mira:0.50, peso:0.2},
  aparador:        {x:'largo',   z:0.42,    h:0.85, mira:0.60, peso:0.7, def:{largo:1.6}},
  maceta:          {x:'radio',   z:'radio',  h:0.60, mira:0.30, peso:0.2, def:{radio:0.25}},
  encimera:        {x:'largo',   z:0.58,    h:0.92, mira:0.90, peso:0.9, def:{largo:3.9}},
  nevera:          {x:0.60,      z:0.65,    h:1.90, mira:1.00, peso:0.5},
  isla:            {x:'largo',   z:'fondo',  h:0.93, mira:0.90, peso:1.3, def:{largo:2.2, fondo:0.95}},
  banqueta:        {x:0.38,      z:0.38,    h:0.70, mira:0.65, peso:0.2},
  banco_recibidor: {x:'largo',   z:0.40,    h:1.80, mira:0.70, peso:0.6, def:{largo:1.6}},
  espejo:          {x:'ancho',   z:0.04,    h:0.00, mira:1.50, peso:0.2, def:{ancho:0.8}, suelta:true},
  cama:            {x:'ancho',   z:'largo',  h:1.15, mira:0.60, peso:1.3, def:{ancho:1.6, largo:2.0}},
  mesilla:         {x:0.42,      z:0.36,    h:0.60, mira:0.50, peso:0.2},
  empotrado:       {x:'ancho',   z:0.60,    h:2.55, mira:1.20, peso:0.9, def:{ancho:2.2}},
  banera:          {x:1.60,      z:0.72,    h:0.57, mira:0.55, peso:1.1},
  inodoro:         {x:0.40,      z:0.55,    h:0.85, mira:0.40, peso:0.4},
  lavabo_cajones:  {x:'ancho',   z:0.45,    h:0.90, mira:0.85, peso:0.5, def:{ancho:0.8}},
  toallero:        {x:0.50,      z:0.06,    h:1.60, mira:1.20, peso:0.2, suelta:true},
  comoda:          {x:'ancho',   z:0.48,    h:1.00, mira:0.60, peso:0.7, def:{ancho:0.8}},
  escritorio:      {x:'largo',   z:'fondo',  h:0.76, mira:0.76, peso:1.1, def:{largo:1.6, fondo:0.7}},
  silla_oficina:   {x:0.50,      z:0.60,    h:0.90, mira:0.50, peso:0.2},
  kallax:          {x:'kallax',  z:0.39,    h:0.77, mira:1.00, peso:0.8},
  sillon:          {x:0.72,      z:0.75,    h:1.00, mira:0.50, peso:0.8},
  lavadora:        {x:0.60,      z:0.60,    h:2.10, mira:0.70, peso:1.0},
  pila_lavar:      {x:0.55,      z:0.45,    h:0.90, mira:0.85, peso:0.5},
  estanteria_metal:{x:'ancho',   z:0.40,    h:1.90, mira:1.00, peso:0.5, def:{ancho:0.9}},
  mesa_jardin:     {x:1.50,      z:0.70,    h:0.78, mira:0.76, peso:1.0},
  chillout:        {x:3.80,      z:1.95,    h:0.80, mira:0.60, peso:1.2},
  monitor:         {x:'ancho',   z:0.20,    h:0.00, mira:1.00, peso:0.2, def:{ancho:0.62}, suelta:true},
  mueble_bajo:     {x:'largo',   z:0.58,    h:0.90, mira:0.90, peso:0.7, def:{largo:2.4}}
};
/* Cómo se llama cada pieza (para el rótulo). */
var NOMBRES = {
  chimenea:'Chimenea de pared', alfombra:'Alfombra', sofa_tela:'Sofá de tela', butaca_tela:'Butaca',
  mesa_centro:'Mesa de centro', libreria:'Librería', lampara_pie:'Lámpara de pie',
  mesa_madera:'Mesa de madera', silla_madera:'Silla de madera', aparador:'Aparador', maceta:'Maceta',
  encimera:'Encimera', nevera:'Nevera', isla:'Isla de cocina', banqueta:'Banqueta',
  banco_recibidor:'Banco del recibidor', espejo:'Espejo', cama:'Cama', mesilla:'Mesilla',
  empotrado:'Armario empotrado', banera:'Bañera', inodoro:'Inodoro', lavabo_cajones:'Mueble de lavabo',
  toallero:'Toallero', comoda:'Cómoda', escritorio:'Escritorio', silla_oficina:'Silla de oficina',
  kallax:'Estantería de cubos', sillon:'Butaca', lavadora:'Lavadora y secadora', pila_lavar:'Pila',
  estanteria_metal:'Estantería metálica', mesa_jardin:'Mesa de listones', chillout:'Sofá de exterior',
  monitor:'Monitor', mueble_bajo:'Mueble bajo'
};

function medidas(m){
  var d = MEDIDAS[m.tipo] || null;
  if(!d) return {L:m.largo || m.ancho || 0.6, D:m.fondo || 0.5, H:m.alto || 0.8, mira:0.7, peso:0.4, suelta:false};
  var def = d.def || {};
  function val(k){ return m[k] !== undefined ? m[k] : def[k]; }
  function lado(k){
    if(k === 'largo') return val('largo') || 0.8;
    if(k === 'ancho') return val('ancho') || 0.8;
    if(k === 'fondo') return val('fondo') || 0.5;
    if(k === 'radio') return (val('radio') || 0.2) * 2;
    return k;
  }
  return {L:lado(d.x), D:lado(d.z), H:d.h, mira:d.mira, peso:d.peso, suelta:!!d.suelta};
}
/* La caja del mueble en el marco local, ya girada. El giro del visor es
   rotation.y = giro: el largo local (x) acaba en (cos g, -sen g). */
function cajaDe(m){
  var d = medidas(m), th = (m.giro || 0) * Math.PI / 180;
  var c = Math.cos(th), s = Math.sin(th);
  var ex = Math.abs(d.L * c) + Math.abs(d.D * s);
  var ez = Math.abs(d.L * s) + Math.abs(d.D * c);
  return {u0:m.uv[0] - ex/2, v0:m.uv[1] - ez/2, u1:m.uv[0] + ex/2, v1:m.uv[1] + ez/2,
          h:d.H, suelta:d.suelta, m:m, d:d};
}
/* Un punto está dentro de un rectángulo (con margen). */
function dentro(p, r, margen){
  var mg = margen || 0;
  return p[0] >= r.u0 - mg && p[0] <= r.u1 + mg && p[1] >= r.v0 - mg && p[1] <= r.v1 + mg;
}
/* Un segmento corta un rectángulo (método de losas). */
function segmentoCorta(p0, p1, r){
  var t0 = 0, t1 = 1, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  var ejes = [[-dx, p0[0] - r.u0], [dx, r.u1 - p0[0]], [-dy, p0[1] - r.v0], [dy, r.v1 - p0[1]]];
  for(var i = 0; i < 4; i++){
    var p = ejes[i][0], q = ejes[i][1];
    if(p === 0){ if(q < 0) return false; continue; }
    var t = q / p;
    if(p < 0){ if(t > t1) return false; if(t > t0) t0 = t; }
    else { if(t < t0) return false; if(t < t1) t1 = t; }
  }
  return true;
}
function area(k){ return Math.max(0, k[2] - k[0]) * Math.max(0, k[3] - k[1]); }
/* Un punto está dentro de un muro (su banda de grosor). */
function enMuro(p, m){
  var u0 = Math.min(m[0], m[2]), u1 = Math.max(m[0], m[2]);
  var v0 = Math.min(m[1], m[3]), v1 = Math.max(m[1], m[3]);
  var g = (m[4] || 0.12) / 2 + 0.02;
  if(u1 - u0 < 0.01) return p[0] >= u0 - g && p[0] <= u1 + g && p[1] >= v0 && p[1] <= v1;
  if(v1 - v0 < 0.01) return p[1] >= v0 - g && p[1] <= v1 + g && p[0] >= u0 && p[0] <= u1;
  return p[0] >= u0 - g && p[0] <= u1 + g && p[1] >= v0 - g && p[1] <= v1 + g;
}
/* ¿El tramo entre dos puntos pasa por algún muro? (Se muestrea: los muros son
   pocos y el tramo, corto.) */
function pasaMuro(a, b, muros){
  var d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  var n = Math.max(2, Math.ceil(d / 0.05));
  for(var i = 0; i <= n; i++){
    var t = i / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for(var k = 0; k < muros.length; k++) if(enMuro(p, muros[k])) return true;
  }
  return false;
}

/* ═══ 4. El grafo de las estancias ═══════════════════════════════════════════
   Dos estancias están conectadas si comparten arista y en esa arista hay un
   hueco pasable (puerta o paso) o un tramo sin muro (un paso abierto). */
function arista(a, b){
  var tol = 0.02, v0, v1, u0, u1;
  if(Math.abs(a[2] - b[0]) <= tol){
    v0 = Math.max(a[1], b[1]); v1 = Math.min(a[3], b[3]);
    if(v1 - v0 > 0.05) return {eje:'u', val:a[2], a:v0, b:v1};
  }
  if(Math.abs(b[2] - a[0]) <= tol){
    v0 = Math.max(a[1], b[1]); v1 = Math.min(a[3], b[3]);
    if(v1 - v0 > 0.05) return {eje:'u', val:b[2], a:v0, b:v1};
  }
  if(Math.abs(a[3] - b[1]) <= tol){
    u0 = Math.max(a[0], b[0]); u1 = Math.min(a[2], b[2]);
    if(u1 - u0 > 0.05) return {eje:'v', val:a[3], a:u0, b:u1};
  }
  if(Math.abs(b[3] - a[1]) <= tol){
    u0 = Math.max(a[0], b[0]); u1 = Math.min(a[2], b[2]);
    if(u1 - u0 > 0.05) return {eje:'v', val:b[3], a:u0, b:u1};
  }
  return null;
}
/* El tramo de un muro o de un hueco que cae sobre una arista (o null). */
function tramoEnArista(w, ar){
  var tol = 0.02;
  var u0 = Math.min(w[0], w[2]), u1 = Math.max(w[0], w[2]);
  var v0 = Math.min(w[1], w[3]), v1 = Math.max(w[1], w[3]);
  if(ar.eje === 'u'){
    if(Math.abs(u0 - ar.val) > tol || Math.abs(u1 - ar.val) > tol) return null;
    return [v0, v1];
  }
  if(Math.abs(v0 - ar.val) > tol || Math.abs(v1 - ar.val) > tol) return null;
  return [u0, u1];
}
/* Los tramos pasables de una arista: huecos de puerta o paso y, además, los
   tramos de arista que no cubre ningún muro. Ojo: un hueco que no es puerta
   (una ventana, una vidriera) también tapa la arista: es cristal o pared, no
   un paso. */
function pasosDe(ar, huecos, muros){
  var res = [], tapados = [];
  huecos.forEach(function(h){
    if(h[4] !== 'puerta' && h[4] !== 'paso') return;
    var t = tramoEnArista(h, ar);
    if(!t) return;
    var a = Math.max(t[0], ar.a), b = Math.min(t[1], ar.b);
    if(b - a > 0.2) res.push({a:a, b:b, tipo:h[4], hueco:h});
  });
  muros.forEach(function(w){
    var t = tramoEnArista(w, ar);
    if(!t) return;
    var a = Math.max(t[0], ar.a), b = Math.min(t[1], ar.b);
    if(b - a > 0.01) tapados.push([a, b]);
  });
  huecos.forEach(function(h){                              /* lo que no es puerta, tapa */
    if(h[4] === 'puerta' || h[4] === 'paso') return;
    var t = tramoEnArista(h, ar);
    if(!t) return;
    var a = Math.max(t[0], ar.a), b = Math.min(t[1], ar.b);
    if(b - a > 0.01) tapados.push([a, b]);
  });
  tapados.sort(function(x, y){ return x[0] - y[0]; });
  var libre = ar.a;
  tapados.forEach(function(t){
    if(t[0] - libre > 0.35) res.push({a:libre, b:t[0], tipo:'abierto', hueco:null});
    if(t[1] > libre) libre = t[1];
  });
  if(ar.b - libre > 0.35) res.push({a:libre, b:ar.b, tipo:'abierto', hueco:null});
  return res;
}
function puntoDePaso(ar, p){
  var m = (p.a + p.b) / 2;
  return ar.eje === 'u' ? [ar.val, m] : [m, ar.val];
}
/* Las estancias, agrupadas: una estancia con `junta` es un trozo de otra y se
   recorre dentro de su madre (con la caja unida, como hace el visor). */
function armaEstancias(lista){
  var junta = {}, out = [], porId = {};
  (lista || []).forEach(function(e){ if(e.junta) junta[e.id] = e.junta; });
  (lista || []).forEach(function(e){
    if(junta[e.id]) return;
    var cajas = [e.caja];
    (lista || []).forEach(function(o){ if(junta[o.id] === e.id) cajas.push(o.caja); });
    var r = {id:e.id, nombre:e.nombre, codigo:e.codigo, cota:e.cota, fuera:!!e.fuera,
             caja:union(cajas), cajas:cajas, piezas:[], pasos:{}};
    out.push(r); porId[e.id] = r;
  });
  return out;
}
function union(cajas){
  var u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  cajas.forEach(function(k){
    u0 = Math.min(u0, k[0]); v0 = Math.min(v0, k[1]);
    u1 = Math.max(u1, k[2]); v1 = Math.max(v1, k[3]);
  });
  return [u0, v0, u1, v1];
}
/* A cada estancia, sus muebles (los que caen dentro de su caja). */
function repartePiezas(rooms, muebles){
  (muebles || []).forEach(function(m){
    if(!m.uv) return;
    var mejor = null;
    rooms.forEach(function(r){
      if(!dentro(m.uv, {u0:r.caja[0], v0:r.caja[1], u1:r.caja[2], v1:r.caja[3]}, 0.12)) return;
      if(!mejor || area(r.caja) < area(mejor.caja)) mejor = r;
    });
    if(!mejor) return;
    var c = cajaDe(m);
    c.m = m;
    mejor.piezas.push(c);
  });
}

/* ═══ 5. La entrada de la casa ══════════════════════════════════════════════
   La puerta principal: la más ancha que separa una estancia de dentro de otra
   de fuera (el porche) o del exterior. */
function buscaEntrada(rooms, c){
  var huecos = (c.huecos || []).filter(function(h){ return h[4] === 'puerta'; });
  var mejor = null;
  huecos.forEach(function(h){
    var m = [(h[0] + h[2]) / 2, (h[1] + h[3]) / 2];
    var ancho = Math.abs(h[2] - h[0]) + Math.abs(h[3] - h[1]);
    var dentro = null, fuera = null;
    rooms.forEach(function(r){
      if(!enBorde(r, m)) return;
      if(r.fuera) fuera = r; else dentro = r;
    });
    if(!dentro) return;
    var rango = fuera ? 2 : 1;                       /* 2: porche · 1: al exterior */
    if(!mejor || rango > mejor.rango || (rango === mejor.rango && ancho > mejor.ancho))
      mejor = {hueco:h, medio:m, ancho:ancho, rango:rango, dentro:dentro, fuera:fuera};
  });
  return mejor;
}
/* El punto medio de un hueco cae en el borde de la estancia. */
function enBorde(r, m){
  var k = r.caja, t = 0.08;
  if(Math.abs(m[0] - k[0]) <= t && m[1] >= k[1] - t && m[1] <= k[3] + t) return true;
  if(Math.abs(m[0] - k[2]) <= t && m[1] >= k[1] - t && m[1] <= k[3] + t) return true;
  if(Math.abs(m[1] - k[1]) <= t && m[0] >= k[0] - t && m[0] <= k[2] + t) return true;
  if(Math.abs(m[1] - k[3]) <= t && m[0] >= k[0] - t && m[0] <= k[2] + t) return true;
  return false;
}
/* La normal de la puerta, hacia el lado de fuera (donde arranca la cámara). */
function normalEntrada(ent){
  var m = ent.medio;
  if(ent.fuera){
    /* El lado de fuera es el porche: se entra en él. */
    var f = ent.fuera.caja;
    if(Math.abs(m[0] - f[0]) < 0.1) return [1, 0];
    if(Math.abs(m[0] - f[2]) < 0.1) return [-1, 0];
    if(Math.abs(m[1] - f[1]) < 0.1) return [0, 1];
    return [0, -1];
  }
  /* Si no hay porche, el lado de fuera es el exterior de la casa: se sale de
     la estancia. */
  var d = ent.dentro.caja;
  if(Math.abs(m[0] - d[0]) < 0.1) return [-1, 0];
  if(Math.abs(m[0] - d[2]) < 0.1) return [1, 0];
  if(Math.abs(m[1] - d[1]) < 0.1) return [0, 1];
  return [0, -1];
}
/* La distancia de un punto a un rectángulo (0 si está dentro). */
function distanciaRect(p, r){
  var du = Math.max(r.u0 - p[0], 0, p[0] - r.u1);
  var dv = Math.max(r.v0 - p[1], 0, p[1] - r.v1);
  return Math.hypot(du, dv);
}

/* ═══ 6. La pieza principal y el punto de parada ═════════════════════════════ */
function principalDe(est){
  var mejor = null;
  est.piezas.forEach(function(p){
    if(p.suelta) return;
    var valor = (p.u1 - p.u0) * (p.v1 - p.v0) * p.d.peso;
    if(!mejor || valor > mejor.valor) mejor = {caja:p, valor:valor, d:p.d};
  });
  return mejor;
}
/* Un punto libre de la estancia: ni dentro de un mueble ni pegado a un muro. */
function puntoLibre(p, est){
  var k = est.caja;
  if(p[0] < k[0] + RETIRO_MURO || p[0] > k[2] - RETIRO_MURO) return false;
  if(p[1] < k[1] + RETIRO_MURO || p[1] > k[3] - RETIRO_MURO) return false;
  for(var i = 0; i < est.piezas.length; i++){
    var c = est.piezas[i];
    if(c.suelta) continue;
    if(dentro(p, c, HUECO_MUEBLE)) return false;
  }
  return true;
}
/* La línea de la vista está limpia: no pasa por ningún mueble. `ignorar` es la
   pieza a la que se mira: la línea termina dentro de ella, y eso no es un
   obstaculo. */
function vistaLibre(p0, p1, est, ignorar){
  for(var i = 0; i < est.piezas.length; i++){
    var c = est.piezas[i];
    if(c.suelta || c === ignorar) continue;
    if(segmentoCorta(p0, p1, c)) return false;
  }
  return true;
}
/* El punto desde el que se ve mejor la pieza principal, sin que la vista se
   cruce con otro mueble y sin alejar el camino de las puertas. */
function puntoDeParada(est, prin, puertas){
  var k = est.caja;
  var u0 = k[0] + RETIRO_MURO, u1 = k[2] - RETIRO_MURO;
  var v0 = k[1] + RETIRO_MURO, v1 = k[3] - RETIRO_MURO;
  var objetivo = prin ? [prin.caja.m.uv[0], prin.caja.m.uv[1]] : [(k[0] + k[2]) / 2, (k[1] + k[3]) / 2];
  var ancho = prin ? Math.max(prin.caja.u1 - prin.caja.u0, prin.caja.v1 - prin.caja.v0) : 0;
  /* La cara buena de la pieza: su frente (el eje z local). */
  var frente = [0, 0];
  if(prin){
    var th = (prin.caja.m.giro || 0) * Math.PI / 180;
    frente = [Math.sin(th), Math.cos(th)];
  }
  var mejor = null, libre = null;
  /* Dos pasadas: la primera exige que se vea la pieza y las puertas; si no hay
     sitio, la segunda solo exige que se vea la pieza. */
  for(var pasada = 0; pasada < 2 && !mejor; pasada++){
    for(var u = u0; u <= u1 + 0.001; u += 0.26){
      for(var v = v0; v <= v1 + 0.001; v += 0.26){
        var p = [u, v];
        if(!puntoLibre(p, est)) continue;
        if(!libre) libre = p;
        if(prin && !vistaLibre(p, objetivo, est, prin.caja)) continue;
        var cerca = 0, vale = true;
        for(var i = 0; i < puertas.length; i++){
          if(pasada === 0 && !vistaLibre(p, [puertas[i].u, puertas[i].v], est)){ vale = false; break; }
          cerca += Math.hypot(p[0] - puertas[i].u, p[1] - puertas[i].v);
        }
        if(!vale) continue;
        var d = Math.hypot(p[0] - objetivo[0], p[1] - objetivo[1]);
        var valor;
        if(prin){
          if(d < 0.9 || d > 5.0) continue;
          if(distanciaRect(p, prin.caja) < 0.6) continue;   /* la vista del mueble, sin pegarse */
          valor = ancho / d - 0.015 * cerca;         /* se ve grande y no se alarga el camino */
          /* Si se puede, de frente a la pieza. */
          if((p[0] - objetivo[0]) * frente[0] + (p[1] - objetivo[1]) * frente[1] > 0) valor += 0.35;
        } else {
          valor = 0.12 * d - 0.015 * cerca;         /* sin pieza: se ve el fondo de la estancia */
        }
        if(!mejor || valor > mejor.valor) mejor = {p:p, valor:valor, d:d};
      }
    }
  }
  if(!mejor) return {p:libre || objetivo, valor:0, d:0, fallback:true};
  return mejor;
}
/* El punto a un lado de la puerta, dentro de la estancia: la cámara entra de
   perfil y no roza la jamba. */
function puntoAlrededor(est, paso, signo){
  if(!est) return null;
  var offsets = [0.5, 0.42, 0.34, 0.26, 0.2];
  for(var i = 0; i < offsets.length; i++){
    var p = [paso.u + paso.n[0] * offsets[i] * signo, paso.v + paso.n[1] * offsets[i] * signo];
    if(!dentro(p, {u0:est.caja[0], v0:est.caja[1], u1:est.caja[2], v1:est.caja[3]}, -0.02)) continue;
    if(!puntoLibre(p, est)) continue;
    return p;
  }
  return null;
}
/* Un punto por dentro de la estancia para esquivar un mueble. */
function puntoInterno(est, a, b){
  var k = est.caja, mejor = null;
  var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  for(var u = k[0] + 0.45; u <= k[2] - 0.45; u += 0.22){
    for(var v = k[1] + 0.45; v <= k[3] - 0.45; v += 0.22){
      var p = [u, v];
      if(!puntoLibre(p, est)) continue;
      if(!vistaLibre(a, p, est) || !vistaLibre(p, b, est)) continue;
      var d = Math.hypot(p[0] - mx, p[1] - my);
      if(!mejor || d < mejor.d) mejor = {p:p, d:d};
    }
  }
  return mejor ? mejor.p : null;
}

/* ═══ 7. El plan del recorrido ═══════════════════════════════════════════════
   Un paseo en profundidad por el grafo: se entra por la puerta principal, se
   visita cada estancia y, si un callejón no tiene salida, se vuelve por donde
   se vino. */
function planifica(rooms, entrada){
  var porId = {};
  rooms.forEach(function(r){ porId[r.id] = r; });
  var c = casa(), huecos = c.huecos || [], muros = c.muros || [];
  rooms.forEach(function(r){
    rooms.forEach(function(o){
      if(r === o) return;
      var ar = arista(r.caja, o.caja);
      if(!ar) return;
      var pasos = pasosDe(ar, huecos, muros);
      if(!pasos.length) return;
      var mejor = pasos[0];
      pasos.forEach(function(p){ if(p.b - p.a > mejor.b - mejor.a) mejor = p; });
      var pt = puntoDePaso(ar, mejor);
      /* La normal del paso: de una estancia a la otra. */
      var n;
      if(ar.eje === 'u') n = (o.caja[0] >= r.caja[0]) ? [1, 0] : [-1, 0];
      else n = (o.caja[1] >= r.caja[1]) ? [0, 1] : [0, -1];
      r.pasos[o.id] = {u:pt[0], v:pt[1], ancho:mejor.b - mejor.a, tipo:mejor.tipo, hueco:mejor.hueco, n:n};
      o.pasos[r.id] = {u:pt[0], v:pt[1], ancho:mejor.b - mejor.a, tipo:mejor.tipo, hueco:mejor.hueco, n:[-n[0], -n[1]]};
    });
  });
  /* El paseo empieza donde se entra: en el porche si lo hay, si no, dentro. */
  var inicio = entrada.fuera ? entrada.fuera.id : entrada.dentro.id;
  var paseo = [{sala:inicio, paso:null}];
  var vistas = {}; vistas[inicio] = true;
  var pila = [inicio];
  while(pila.length){
    var act = pila[pila.length - 1], r = porId[act];
    var libres = Object.keys(r.pasos).filter(function(k){ return !vistas[k]; });
    if(libres.length){
      var cx = (r.caja[0] + r.caja[2]) / 2, cy = (r.caja[1] + r.caja[3]) / 2;
      libres.sort(function(a, b){
        var pa = r.pasos[a], pb = r.pasos[b];
        return Math.hypot(pa.u - cx, pa.v - cy) - Math.hypot(pb.u - cx, pb.v - cy);
      });
      var sig = libres[0];
      vistas[sig] = true;
      paseo.push({sala:sig, paso:r.pasos[sig]});
      pila.push(sig);
    } else if(pila.length > 1){
      var ant = pila[pila.length - 2];
      paseo.push({sala:ant, paso:r.pasos[ant]});    /* se vuelve por donde se vino */
      pila.pop();
    } else break;
  }
  return {paseo:paseo, porId:porId};
}

/* ═══ 8. El estado ══════════════════════════════════════════════════════════ */
var EST = {
  abierto:false, play:true, vel:1, fase:'parada', t:0, s:0, fin:false,
  i:0, n:0, paradas:[], legs:[], orbita:null, yaw:0, pitch:0,
  leg:null, hud:null, montado:false, boton:false, aspect:-1, fovV:0,
  entrada:null, llegada:null, mirando:false, quieto:0
};

/* ═══ 9. Los datos de cada parada (para el rótulo) ═════════════════════════ */
function datosDe(est, prin){
  var pieza = '';
  if(prin){
    var m = prin.caja.m, nombre = NOMBRES[m.tipo] || m.tipo, med = '';
    if(m.tipo === 'cama' || m.tipo === 'sofa_tela' || m.tipo === 'mesa_madera' ||
       m.tipo === 'encimera' || m.tipo === 'isla' || m.tipo === 'escritorio' || m.tipo === 'banera'){
      med = ' de ' + num(prin.d.L) + ' × ' + num(prin.d.D) + ' m';
    }
    pieza = nombre + med;
  } else {
    pieza = 'sin mobiliario';
  }
  return {sup:area(est.caja), pieza:pieza, prin:prin};
}
function num(v){ return (Math.round(v * 100) / 100).toString().replace('.', ','); }
function num2(v){ return (Math.round(v * 10) / 10).toString().replace('.', ','); }

/* ═══ 10. La cámara ═════════════════════════════════════════════════════════
   El FOV del visor es VERTICAL. La visión humana se define en horizontal
   (72°) y se convierte: 2·atan(tan(h/2)/aspect), con límites 50–94 en
   vertical. En vertical de móvil el horizontal real se queda en ~52,7°, y eso
   se dice en el rótulo para que nadie piense que es un teleobjetivo. */
function fovVertical(aspect){
  var h = FOV_H * Math.PI / 180;
  var v = 2 * Math.atan(Math.tan(h / 2) / aspect) * 180 / Math.PI;
  return Math.max(FOV_V_MIN, Math.min(FOV_V_MAX, v));
}
function fovReal(aspect){
  var v = EST.fovV * Math.PI / 180;
  return 2 * Math.atan(Math.tan(v / 2) * aspect) * 180 / Math.PI;
}
function ponFov(){
  var a = api(); if(!a || !a.camara) return;
  var aspect = a.camara.aspect || 0.46;
  if(Math.abs(aspect - EST.aspect) < 0.002 && EST.fovV) return;
  EST.aspect = aspect;
  EST.fovV = fovVertical(aspect);
  a.camara.fov = EST.fovV;
  a.camara.updateProjectionMatrix();
}
/* El rumbo (yaw) que mira de un punto a otro, ya en el mundo. */
function rumbo(p0, p1){
  var a0 = aMundo(p0[0], p0[1]), a1 = aMundo(p1[0], p1[1]);
  var dx = a1[0] - a0[0], dz = a1[1] - a0[1];
  if(!dx && !dz) return EST.yaw;
  return Math.atan2(-dx, -dz);
}
function difAng(a, b){ return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; }
/* La inclinación con la que se mira un punto (altura del punto sobre el suelo). */
function inclinacion(para){
  var dy = para.mira[2] - OJOS;
  var dx = Math.hypot(para.mira[0] - para.p[0], para.mira[1] - para.p[1]);
  if(dx < 0.01) return 0;
  return Math.atan2(dy, dx);
}

/* ═══ 11. Las puertas se abren solas ════════════════════════════════════════ */
function abreCercanas(){
  var a = api(); if(!a || !a.PUERTAS || !a.pie) return;
  var pie = a.pie, T = window.THREE;
  a.PUERTAS.forEach(function(p){
    var w = p.w;
    if(!w && p.g && T){
      try{
        if(p.g.updateWorldMatrix) p.g.updateWorldMatrix(true, false);
        w = p.g.localToWorld(new T.Vector3(p.local[0], p.local[1], p.local[2]));
        p.w = w;
      }catch(e){ w = null; }
    }
    if(!w) return;
    if(Math.hypot(w.x - pie.x, w.z - pie.z) < ABRE_PUERTA) p.obj = 1;
  });
}

/* ═══ 12. El HUD ════════════════════════════════════════════════════════════ */
var ICONO = {
  pausa: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.4" height="12" rx="1" fill="currentColor"/><rect x="11.6" y="4" width="3.4" height="12" rx="1" fill="currentColor"/></svg>',
  seguir: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4.2 15.5 10 6 15.8z" fill="currentColor"/></svg>',
  siguiente: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.2 12 10 4 15.8z" fill="currentColor"/><rect x="13.6" y="4.2" width="2.6" height="11.6" rx="1" fill="currentColor"/></svg>',
  salir: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
};
function css(){
  if(document.getElementById('rec-css')) return;
  var s = document.createElement('style');
  s.id = 'rec-css';
  s.textContent =
   'body.recorriendo #pie-hud{display:none!important}'+
   '#rec{position:fixed;inset:0;z-index:68;pointer-events:none;'+
   'font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:#e7efe6}'+
   '#rec .rot{position:absolute;left:10px;right:64px;top:calc(env(safe-area-inset-top,0px) + 10px);'+
   'background:rgba(8,12,10,.80);border-left:3px solid #c8f542;border-radius:3px;padding:9px 12px 10px}'+
   '#rec .rot b{display:block;font-size:18px;line-height:1.15;font-weight:700}'+
   '#rec .rot span{display:block;font-size:12.5px;line-height:1.35;color:#c2cdb8;margin-top:2px}'+
   '#rec .rot .fov{color:#93a086;font-size:11.5px;margin-top:1px}'+
   '#rec .avance{position:absolute;left:0;right:0;top:0;height:3px;background:rgba(255,255,255,.12)}'+
   '#rec .avance i{display:block;height:100%;width:0;background:#c8f542;transition:width .25s linear}'+
   '#rec .ctrl{position:absolute;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);'+
   'display:flex;gap:8px;pointer-events:auto}'+
   '#rec .ctrl button{min-width:44px;min-height:44px;padding:0 10px;display:flex;align-items:center;'+
   'justify-content:center;gap:4px;background:rgba(8,12,10,.86);color:#e7efe6;border:1px solid rgba(231,239,230,.28);'+
   'border-radius:4px;font:600 12px/1 "IBM Plex Sans Condensed",sans-serif;letter-spacing:.06em;'+
   'cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none}'+
   '#rec .ctrl button[aria-pressed="true"]{background:#c8f542;color:#12160f;border-color:#c8f542}'+
   '#rec .ctrl button svg{width:20px;height:20px;display:block}'+
   '#rec .ctrl button[disabled]{opacity:.4}'+
   '#rec .pie{position:absolute;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 66px);'+
   'background:rgba(8,12,10,.80);border-radius:3px;padding:5px 9px;font-size:11.5px;color:#c2cdb8}'+
   '@media (min-width:861px){#rec .rot{left:16px;right:auto;top:16px;width:330px}}';
  if(document.head && document.head.appendChild) document.head.appendChild(s);
}
function creaHud(){
  if(EST.hud) return EST.hud;
  css();
  var d = document.createElement('div');
  d.id = 'rec';
  d.hidden = true;
  d.innerHTML =
   '<div class="avance"><i></i></div>'+
   '<div class="rot"><b class="nombre"></b><span class="dato"></span><span class="fov"></span></div>'+
   '<div class="pie"></div>'+
   '<div class="ctrl">'+
     '<button type="button" data-acc="play" aria-label="Pausar el recorrido" aria-pressed="true"></button>'+
     '<button type="button" data-acc="vel" aria-label="Velocidad del recorrido">1×</button>'+
     '<button type="button" data-acc="sig" aria-label="Saltar a la estancia siguiente"></button>'+
     '<button type="button" data-acc="salir" aria-label="Salir del recorrido"></button>'+
   '</div>';
  if(document.body && document.body.appendChild) document.body.appendChild(d);
  EST.hud = d;
  EST.elNombre = d.querySelector('.rot .nombre');
  EST.elDato = d.querySelector('.rot .dato');
  EST.elFov = d.querySelector('.rot .fov');
  EST.elPie = d.querySelector('.pie');
  EST.elAvance = d.querySelector('.avance i');
  EST.btnPlay = d.querySelector('[data-acc="play"]');
  EST.btnVel = d.querySelector('[data-acc="vel"]');
  EST.btnSig = d.querySelector('[data-acc="sig"]');
  EST.btnSalir = d.querySelector('[data-acc="salir"]');
  EST.btnPlay.innerHTML = ICONO.pausa;
  EST.btnSig.innerHTML = ICONO.siguiente;
  EST.btnSalir.innerHTML = ICONO.salir;
  EST.btnPlay.addEventListener('click', function(){ EST.play ? pausa() : play(); });
  EST.btnVel.addEventListener('click', function(){ velocidad(velocidadSiguiente()); });
  EST.btnSig.addEventListener('click', function(){ irA(EST.i + 1); });
  EST.btnSalir.addEventListener('click', function(){ cierra(); });
  return d;
}
function pintaHud(){
  if(!EST.hud) return;
  var p = EST.paradas[EST.i];
  if(!p) return;
  if(EST.elNombre) EST.elNombre.textContent = p.est.nombre;
  if(EST.elDato) EST.elDato.textContent = num(p.datos.sup) + ' m² · ' + p.datos.pieza;
  if(EST.elFov){
    var h = fovReal(EST.aspect || 0.46);
    EST.elFov.textContent = 'Ojos a ' + num(OJOS) + ' m · 72° h → ' + num(h) + '° real en vertical';
  }
  if(EST.elPie){
    EST.elPie.textContent = 'Parada ' + (EST.i + 1) + ' de ' + EST.n + (p.est.fuera ? ' · exterior cubierto' : '');
  }
  if(EST.elAvance) EST.elAvance.style.width = (EST.n > 1 ? (EST.i / (EST.n - 1) * 100) : 0).toFixed(1) + '%';
  if(EST.btnPlay){
    EST.btnPlay.innerHTML = EST.play ? ICONO.pausa : ICONO.seguir;
    EST.btnPlay.setAttribute('aria-pressed', EST.play ? 'true' : 'false');
    EST.btnPlay.setAttribute('aria-label', EST.play ? 'Pausar el recorrido' : 'Seguir el recorrido');
  }
  if(EST.btnVel) EST.btnVel.textContent = num2(EST.vel) + '×';
  if(EST.btnSig) EST.btnSig.disabled = (EST.i >= EST.n - 1);
}

/* ═══ 13. Abrir y cerrar ═════════════════════════════════════════════════════ */
function abre(){
  var a = api();
  if(!a || !(a.C0 || a.C)) return false;
  if(EST.abierto) return true;
  if(!construye()) return false;
  EST.abierto = true;
  EST.orbita = a.orbita ? a.orbita() : null;
  var ini = EST.paradas[0];
  var p = aMundo(ini.p[0], ini.p[1]);
  EST.yaw = rumbo(ini.p, [ini.mira[0], ini.mira[1]]);
  EST.pitch = inclinacion(ini);
  if(a.entraPie) a.entraPie(p[0], p[1], EST.yaw);
  if(a.bloqueaOrbita) a.bloqueaOrbita(true);
  ponFov();
  creaHud();
  if(EST.hud) EST.hud.hidden = false;
  if(document.body && document.body.classList) document.body.classList.add('recorriendo');
  EST.fase = 'parada'; EST.t = 0; EST.s = 0; EST.i = 0; EST.fin = false; EST.play = true;
  EST.leg = EST.legs[0] || null;
  if(EST.leg && EST.leg.largo < 0.05){ EST.leg = null; }
  else if(EST.leg){ EST.fase = 'marcha'; }
  pintaHud();
  if(AD.refrescaBarra) AD.refrescaBarra();
  return true;
}
function cierra(){
  if(!EST.abierto) return;
  var a = api();
  EST.abierto = false;
  if(EST.hud) EST.hud.hidden = true;
  if(document.body && document.body.classList) document.body.classList.remove('recorriendo');
  if(a){
    if(a.salirPie) a.salirPie();
    if(EST.orbita && a.restauraOrbita) a.restauraOrbita(EST.orbita);
    if(a.bloqueaOrbita) a.bloqueaOrbita(false);
  }
  EST.orbita = null;
  EST.leg = null;
  EST.mirando = false;
  EST.quieto = 0;
  if(AD.refrescaBarra) AD.refrescaBarra();
}
function play(){
  if(EST.fin && EST.i >= EST.n - 1){ irA(0); EST.play = true; pintaHud(); return; }
  EST.play = true; EST.fin = false; pintaHud();
}
function pausa(){ EST.play = false; pintaHud(); }
function velocidadSiguiente(){
  var i = VELOCIDADES.indexOf(EST.vel);
  if(i < 0) i = 1;
  return VELOCIDADES[(i + 1) % VELOCIDADES.length];
}
function velocidad(v){
  if(typeof v === 'number' && v > 0) EST.vel = v;
  pintaHud();
  return EST.vel;
}

/* ═══ 14. El plan: paradas y tramos ═════════════════════════════════════════ */
function construye(){
  var c = casa(), I = interior();
  if(!c || !I || !I.estancias || !I.estancias.length) return false;
  var rooms = armaEstancias(I.estancias);
  if(!rooms.length) return false;
  repartePiezas(rooms, I.muebles || []);
  var entrada = buscaEntrada(rooms, c);
  if(!entrada) return false;
  var plan = planifica(rooms, entrada);
  /* Las paradas: la primera vez que se llega a cada estancia, en ese orden. */
  var primera = {}, orden = [];
  plan.paseo.forEach(function(paso, i){
    if(primera[paso.sala] !== undefined) return;
    primera[paso.sala] = i;
    orden.push({sala:paso.sala, i:i});
  });
  var paradas = orden.map(function(o){
    var est = plan.porId[o.sala];
    var prin = principalDe(est);
    var puertas = [];
    Object.keys(est.pasos).forEach(function(k){ var q = est.pasos[k]; puertas.push({u:q.u, v:q.v}); });
    var punto = puntoDeParada(est, prin, puertas);
    var mira;
    if(prin){
      var m = prin.caja.m;
      mira = [m.uv[0], m.uv[1], prin.d.mira];
    } else {
      var k2 = est.caja;
      mira = [(k2[0] + k2[2]) / 2, (k2[1] + k2[3]) / 2, 1.50];
    }
    return {est:est, prin:prin, p:punto.p, mira:mira, datos:datosDe(est, prin), enPaseo:o.i};
  });
  if(!paradas.length) return false;
  /* El arranque: la cámara aparece en la entrada, en el lado de fuera de la
   puerta principal, mirando a la casa. */
  var n = normalEntrada(entrada);
  var llegada = [entrada.medio[0] + n[0] * 1.45, entrada.medio[1] + n[1] * 1.45];
  var estFuera = entrada.fuera;
  if(estFuera){
    /* El punto de llegada se busca en la normal de la puerta (para no rozar
       la jamba) y en un sitio libre. */
    var mejor = null;
    var lejos = [1.45, 1.2, 1.8, 2.2, 2.6, 1.0];
    for(var i = 0; i < lejos.length && !mejor; i++){
      var cand = [entrada.medio[0] + n[0] * lejos[i], entrada.medio[1] + n[1] * lejos[i]];
      if(!dentro(cand, {u0:estFuera.caja[0], v0:estFuera.caja[1], u1:estFuera.caja[2], v1:estFuera.caja[3]}, 0)) continue;
      if(!puntoLibre(cand, estFuera)) continue;
      mejor = cand;
    }
    if(mejor) llegada = mejor;
    /* Si el porche es la primera parada, la cámara arranca justo en la puerta. */
    if(paradas[0].est.id === estFuera.id) paradas[0].p = llegada;
  }
  /* Los tramos: el camino que lleva a cada parada. Las puertas se cruzan de
     perfil: se entra perpendicular al muro, se sale perpendicular, y entre
     puerta y puerta se va por dentro de la estancia. */
  var muros = c.muros || [];
  var legs = [];
  for(var k = 0; k < paradas.length; k++){
    var pol = [];
    if(k === 0){
      pol.push(llegada);
      if(!estFuera || paradas[0].est.id !== estFuera.id){
        /* La puerta principal separa la casa del exterior: se cruza por ella. */
        var eN = {u:entrada.medio[0], v:entrada.medio[1], n:n};
        var antes = puntoAlrededor(estFuera, eN, -1);
        var despues = puntoAlrededor(entrada.dentro, eN, 1);
        if(antes) pol.push(antes);
        pol.push([entrada.medio[0], entrada.medio[1]]);
        if(despues) pol.push(despues);
      }
      pol.push(paradas[0].p);
    } else {
      pol.push(paradas[k-1].p);
      var m0 = paradas[k-1].enPaseo, m1 = paradas[k].enPaseo;
      for(var j = m0; j < m1; j++){
        var paso = plan.paseo[j+1].paso;
        var antesR = plan.porId[plan.paseo[j].sala], dentroR = plan.porId[plan.paseo[j+1].sala];
        if(paso){
          var pz = {u:paso.u, v:paso.v, n:paso.n};
          var a1 = puntoAlrededor(antesR, pz, -1);
          var d1 = puntoAlrededor(dentroR, pz, 1);
          if(a1) pol.push(a1);
          pol.push([paso.u, paso.v]);
          if(d1) pol.push(d1);
        }
        /* Del cruce a la salida, por dentro de la estancia. */
        var sale = (j + 1 < m1 && plan.paseo[j+2].paso) ? [plan.paseo[j+2].paso.u, plan.paseo[j+2].paso.v] : paradas[k].p;
        var desde = pol[pol.length - 1];
        if(!vistaLibre(desde, sale, dentroR)){
          var rodeo = puntoInterno(dentroR, desde, sale);
          if(rodeo) pol.push(rodeo);
        }
      }
      pol.push(paradas[k].p);
    }
    legs.push({a:k, pol:pol, largo:largoDe(pol)});
  }
  EST.paradas = paradas;
  EST.legs = legs;
  ofreceComoCamino();
  EST.n = paradas.length;
  EST.entrada = entrada;
  EST.llegada = llegada;
  return true;
}
function largoDe(pol){
  var l = 0;
  for(var i = 1; i < pol.length; i++) l += Math.hypot(pol[i][0] - pol[i-1][0], pol[i][1] - pol[i-1][1]);
  return l;
}
/* El camino interior, en el formato que el tour del visor entiende: una
   polilínea en el marco del plano (u, v) con la distancia acumulada. El tour
   del visor ya sabe caminar, poner la altura del suelo y mirar por delante. */
function ofreceComoCamino(){
  var a = api();
  if(!a || !a.agregaTour || EST.caminoOfrecido) return;
  EST.caminoOfrecido = true;
  var pts = [], s = 0, anterior = null;
  for(var i = 0; i < EST.legs.length; i++){
    var pol = EST.legs[i].pol || [];
    for(var j = 0; j < pol.length; j++){
      var p = pol[j];
      if(anterior) s += Math.hypot(p[0]-anterior[0], p[1]-anterior[1]);
      pts.push({x:p[0], z:p[1], s:s});
      anterior = p;
    }
  }
  if(pts.length < 2) return;
  a.agregaTour({id:'recorrido-casa', nombre:'Recorrido por la casa', pts:pts, largo:s});
}
/* Un punto de la polilínea, a distancia s. */
function puntoEn(pol, s){
  var l = 0;
  for(var i = 1; i < pol.length; i++){
    var d = Math.hypot(pol[i][0] - pol[i-1][0], pol[i][1] - pol[i-1][1]);
    if(s <= l + d || i === pol.length - 1){
      var t = d > 0 ? (s - l) / d : 0;
      t = Math.max(0, Math.min(1, t));
      return [pol[i-1][0] + (pol[i][0] - pol[i-1][0]) * t, pol[i-1][1] + (pol[i][1] - pol[i-1][1]) * t];
    }
    l += d;
  }
  return pol[pol.length - 1];
}

/* ═══ 15. El cuadro ════════════════════════════════════════════════════════ */
function mueve(dt){
  if(!EST.abierto) return;
  var a = api();
  if(!a || !a.pie) return;
  var pie = a.pie;
  if(!pie.activo){                                  /* el usuario salió del paseo */
    cierra();
    return;
  }
  ponFov();
  var ahora = EST.paradas[EST.i];
  if(!ahora) return;
  var pos = ahora.p, objetivoYaw = EST.yaw, objetivoPitch = EST.pitch;
  if(EST.fase === 'parada'){
    if(EST.play && !EST.fin){
      EST.t += dt;
      if(EST.t >= PARADA){
        EST.t = 0;
        if(EST.i < EST.n - 1){ EST.i++; EST.leg = EST.legs[EST.i]; EST.fase = 'marcha'; EST.s = 0; pintaHud(); }
        else { EST.fin = true; EST.play = false; pintaHud(); }
      }
    }
    objetivoYaw = rumbo(ahora.p, [ahora.mira[0], ahora.mira[1]]);
    objetivoPitch = inclinacion(ahora);
  } else {
    var leg = EST.leg;
    if(leg){
      if(EST.play && !EST.fin){
        EST.s += VEL * EST.vel * dt;
        if(EST.s >= leg.largo){ EST.s = leg.largo; EST.fase = 'parada'; EST.t = 0; }
      }
      pos = puntoEn(leg.pol, EST.s);
      var ahead = puntoEn(leg.pol, Math.min(leg.largo, EST.s + DELANTE));
      if(leg.largo - EST.s < 0.06) ahead = [ahora.mira[0], ahora.mira[1]];
      objetivoYaw = rumbo(pos, ahead);
      objetivoPitch = -0.05;
    }
  }
  /* Si el usuario arrastra, la cámara mira a donde quiere; al soltar, tras un
     segundo, la vista vuelve sola al rumbo del recorrido (como el tour). */
  if(pie.mira || pie.bloqueo){
    EST.quieto = 0;
    EST.mirando = true;
  } else if(EST.mirando){
    EST.quieto += dt;
    if(EST.quieto > 1.0){
      EST.mirando = false;
      EST.yaw = pie.yaw;                     /* se sigue desde donde dejó el dedo */
      EST.pitch = pie.pitch;
    }
  }
  /* El giro suave: la mirada alcanza el rumbo poco a poco, sin latigazo. */
  if(!EST.mirando){
    var k = Math.min(1, dt * SUAVE);
    EST.yaw += difAng(EST.yaw, objetivoYaw) * k;
    EST.pitch += (objetivoPitch - EST.pitch) * k;
    if(EST.pitch > 1.2) EST.pitch = 1.2;
    if(EST.pitch < -1.2) EST.pitch = -1.2;
    pie.yaw = EST.yaw;
    pie.pitch = EST.pitch;
  }
  /* La cámara: el paseo del visor pone la cámara en pie.y + 1,65; con 3 cm de
     ajuste queda a 1,62 m del suelo terminado. */
  var mundo = aMundo(pos[0], pos[1]);
  pie.x = mundo[0];
  pie.z = mundo[1];
  pie.y = sueloDe(ahora.est) + DESAJUSTE;
  pie.anda = null;                                 /* el paseo no se maneja a mano */
  pie.teclas = {};
  abreCercanas();
}
/* Saltar a una parada. */
function irA(i){
  if(!EST.abierto && !abre()) return;
  if(i < 0) i = 0;
  if(i > EST.n - 1) i = EST.n - 1;
  EST.i = i;
  EST.fin = false;
  EST.fase = 'parada';
  EST.t = 0;
  EST.s = 0;
  EST.leg = EST.legs[i] || null;
  var p = EST.paradas[i];
  EST.yaw = rumbo(p.p, [p.mira[0], p.mira[1]]);
  EST.pitch = inclinacion(p);
  pintaHud();
}

/* ═══ 16. La API pública ════════════════════════════════════════════════════ */
AD.recorrido = {
  abrir: function(){ var ok = abre(); if(ok && AD.refrescaBarra) AD.refrescaBarra(); return ok; },
  cerrar: function(){ cierra(); },
  alterna: function(){ if(EST.abierto) cierra(); else abre(); return EST.abierto; },
  abierto: function(){ return EST.abierto; },
  estado: function(){
    return {
      abierto:EST.abierto, play:EST.play, velocidad:EST.vel, fase:EST.fase, fin:EST.fin,
      i:EST.i, n:EST.n,
      estancia:EST.paradas[EST.i] ? EST.paradas[EST.i].est.nombre : null,
      fovVertical:EST.fovV, fovHorizontal:EST.fovV ? fovReal(EST.aspect) : null,
      alturaOjos:OJOS,
      ruta:EST.paradas.map(function(p){
        return {id:p.est.id, nombre:p.est.nombre, sup:p.datos.sup, pieza:p.datos.pieza,
                punto:[p.p[0], p.p[1]]};
      })
    };
  },
  irA: irA,
  play: play,
  pausa: pausa,
  velocidad: velocidad
};

/* ═══ 17. El botón de la barra y el arranque ════════════════════════════════
   El botón se registra cuando exista `AD.boton`: el módulo de la barra
   (modulo/fabrick.js) se carga después que este, así que el registro se
   reintenta hasta que la barra esté lista. */
function registraBoton(){
  if(EST.boton) return true;
  if(!AD.boton) return false;
  if(AD.iconos) AD.iconos.caminata = AD.iconos.caminata ||
   '<circle cx="9.6" cy="3.4" r="1.5" fill="currentColor"/>'+
   '<path d="M9.6 6 7.5 8.6l2 1.5.9 4.4M9.6 6l2.7 1.2 1.5 2.7M7.5 8.6 5.2 11l-.9 3.4" fill="none" '+
   'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  AD.boton({id:'recorrido', etiqueta:'Recorrido', icono:'caminata',
    alPulsar:function(){
      /* El recorrido y el CCTV son excluyentes: si el CCTV está abierto, se cierra. */
      if(AD.cctv && AD.cctv.cerrar){ try{ AD.cctv.cerrar(); }catch(e){} }
      EST.abierto ? cierra() : abre();
    },
    activo:function(){ return EST.abierto; }});
  if(AD.pintaBarra) AD.pintaBarra();
  EST.boton = true;
  return true;
}
function monta(){
  if(EST.montado) return true;
  var a = api();
  if(!a || !(a.C0 || a.C)) return false;
  if(!construye()) return false;
  if(AD.onFrame) AD.onFrame(mueve);
  EST.montado = true;
  return true;
}
var intentos = 0;
function espera(){
  monta();
  var listo = registraBoton();
  if(EST.montado && listo) return;
  intentos++;
  if(intentos > 300) return;
  setTimeout(espera, 150);
}
if(AD.alListo) AD.alListo(function(){ espera(); });
if(typeof document !== 'undefined' && document.readyState === 'complete') espera();
else if(typeof addEventListener === 'function') addEventListener('load', espera);
setTimeout(espera, 150);

})();
