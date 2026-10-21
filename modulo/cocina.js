/* =====================================================================
   modulo/cocina.js — cocina con herrajes reales y mobiliario mejorado.

   Qué hace este módulo:
   - Rehace la cocina (encimera corrida, alacenas, nevera, isla) con lógica
     constructiva: base de 0,60 de fondo y 0,90 de alto con zócalo de 0,10,
     encimera de 0,04, frentes con 1 mm de holgura, tiradores de barra de
     0,16 m en metal, bisagras de basculante (yunding) de 90° en las puertas
     altas y guías de cajón visibles al salir.
   - Los cajones, las puertas y la nevera se abren y se cierran con animación
     por dt (arranque y frenado suave, nunca lineal).
   - Mejora el mobiliario general (lo que al visor le faltaba).

   Contrato (el mismo que el resto de módulos):
     var AD = window.AD || (window.AD = {});
     AD.avisaListo(fn)   ·  AD.onFrame(fn)  ·  AD.piezas.registra({...})
   API pública:  AD.cocina = {aplicar(), repara(), piezas:[]}

   Reglas que se respetan:
   - No se toca visor.js, index.html ni demo/casa.js.
   - Datos primero: las medidas salen de INT.muebles (largo, fondo, giro…) y
     de la ficha de la cocina; el módulo solo las dibuja mejor.
   - El visor usa Lambert/Phong, no PBR: los herrajes son MeshPhongMaterial
     y los materiales se cachean (no se crean cientos).
   ===================================================================== */
var AD = window.AD || (window.AD = {});

(function(){
'use strict';

/* ===================================================================
   0. Utilidades y materiales
   =================================================================== */
function api(){ return AD.api || null; }

/* Materiales cacheados: el visor dibuja miles de mallas y no puede
   permitirse un material nuevo por cada herraje. */
var MC = {}, METAL = null, METAL_OSC = null, LED = null;
function lam(c){ if(!MC[c]) MC[c] = new THREE.MeshLambertMaterial({color:c}); return MC[c]; }
function metal(){
  if(!METAL) METAL = new THREE.MeshPhongMaterial({color:'#c9c6bd', shininess:70, specular:'#8f9399'});
  return METAL;
}
function metalOsc(){
  if(!METAL_OSC) METAL_OSC = new THREE.MeshPhongMaterial({color:'#6f7378', shininess:35, specular:'#585c61'});
  return METAL_OSC;
}
function led(){
  if(!LED) LED = new THREE.MeshLambertMaterial({color:'#fff4dc', emissive:'#ffe6a8', emissiveIntensity:0.55});
  return LED;
}

/* Geometría mínima (el visor no expone pz/cil, así que aquí van) */
function pz(g, w, h, d, m, x, y, z){
  var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x||0, y||0, z||0); g.add(o); return o;
}
function cil(g, r0, r1, h, m, x, y, z, n){
  var o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, n||14), m);
  o.position.set(x||0, y||0, z||0); g.add(o); return o;
}

/* ===================================================================
   1. Medidas de la cocina (metros) — de la ficha del cliente
   =================================================================== */
var MED = {
  fondo:0.60,        // fondo del mueble bajo
  alto:0.90,         // alto total con encimera
  zocalo:0.10,       // zócalo retranqueado 0,06
  encimera:0.04,     // grosor de la encimera
  holgura:0.001,     // holgura entre frentes
  tirador:0.16,      // largo del tirador de barra
  lacFondo:0.35,     // fondo de la alacena
  lacAlto:0.70,      // alto de la alacena
  lacBase:1.40,      // altura del arranque de la alacena
  fregadero:0.80,    // ancho del fregadero
  placa:0.60,        // ancho de la placa
  neveraW:0.70, neveraH:2.00, neveraF:0.65,
  islaVuelo:0.30,    // vuelo mínimo de la encimera de la isla
  barra:1.05         // altura de la barra
};

/* ===================================================================
   2. Encontrar los muebles que ya dibujó el visor
   =================================================================== */
function esVersion(o){
  var GV = (api()||{}).GRUPOS_V || {}, k;
  for(k in GV) if(GV[k] && GV[k].indexOf(o) >= 0) return true;
  return false;
}
function versionDe(o){
  var GV = (api()||{}).GRUPOS_V || {}, k;
  while(o){
    for(k in GV) if(GV[k] && GV[k].indexOf(o) >= 0) return k;
    o = o.parent;
  }
  return 'actual';
}
/* El grupo de mueble es el padre del último grupo por debajo del grupo
   de versión (que es donde cuelga todo lo que el visor construyó). */
function grupoMueble(mesh){
  var g = mesh, p = mesh.parent;
  while(p && !esVersion(p)){ g = p; p = p.parent; }
  return g;
}
/* Quita un grupo viejo y devuelve con qué rehacerlo */
function quitaGrupo(g){
  if(!g || !g.parent) return null;
  var info = null, i, p;
  g.traverse(function(o){ if(o.isMesh && o.userData.info && !info) info = o.userData.info; });
  var a = api();
  if(a && a.pick){                                   // fuera de la lista de selección
    for(i = a.pick.length - 1; i >= 0; i--){
      p = a.pick[i];
      while(p){ if(p === g){ a.pick.splice(i, 1); break; } p = p.parent; }
    }
  }
  if(g.userData && g.userData.__cocina)              // geometría propia: se libera
    g.traverse(function(o){ if(o.isMesh && o.geometry && o.geometry.dispose) o.geometry.dispose(); });
  var base = {info:info, padre:g.parent, pos:g.position.clone(), rot:g.rotation.clone(), esc:g.scale.clone()};
  g.parent.remove(g);
  return base;
}
function grupoNuevo(base, id){
  var g = new THREE.Group();
  g.position.copy(base.pos); g.rotation.copy(base.rot); g.scale.copy(base.esc);
  base.padre.add(g);
  g.userData.__cocina = true; g.userData.idMueble = id;
  return g;
}
/* La ficha (info) del mueble se cuelga de todas las mallas nuevas, para que
   al tocarlas siga saliendo el panel del visor. */
function heredaInfo(g, info){
  var a = api();
  g.traverse(function(o){
    if(!o.isMesh) return;
    if(info) o.userData.info = info;
    if(a && a.pick && a.pick.indexOf(o) < 0) a.pick.push(o);
  });
}

/* ===================================================================
   3. Animación por dt (arranque y frenado suave)
   =================================================================== */
var ANIMS = [], PIEZAS = [];
function suave(t){ return t*t*(3 - 2*t); }         // smoothstep: 0 -> 1 sin tirón

function anim(obj, eje, cerrado, abierto, dur){
  var an = {obj:obj, eje:eje, t:0, vel:0, dur:dur||0.85,
            c0:{p:cerrado.p, r:cerrado.r||0}, c1:{p:abierto.p, r:abierto.r||0}};
  ANIMS.push(an);
  return an;
}
function aplica(an){
  var s = suave(an.t);
  an.obj.position.set(an.c0.p.x + (an.c1.p.x - an.c0.p.x)*s,
                       an.c0.p.y + (an.c1.p.y - an.c0.p.y)*s,
                       an.c0.p.z + (an.c1.p.z - an.c0.p.z)*s);
  an.obj.rotation[an.eje] = an.c0.r + (an.c1.r - an.c0.r)*s;
}
function registra(an, meta){
  var p = {
    id:meta.id, etiqueta:meta.etiqueta, tipo:meta.tipo, grupo:meta.grupo || 'Cocina',
    abre:function(){ an.vel = 1; },
    cierra:function(){ an.vel = -1; },
    estado:function(){ return suave(an.t); },
    __cocina:true, an:an
  };
  if(AD.piezas && AD.piezas.registra) AD.piezas.registra(p);
  PIEZAS.push(p);
  return p;
}
function limpiaPiezas(){
  var it = AD.piezas && AD.piezas.items;
  if(!it) return;
  for(var i = it.length - 1; i >= 0; i--) if(it[i] && it[i].__cocina) it.splice(i, 1);
  PIEZAS.length = 0;
}

/* ===================================================================
   4. Piezas de cocina: herrajes
   =================================================================== */

/* Tirador de barra de 0,16 m en metal, con dos soportes */
function tirador(g, x, y, z, vertical){
  var L = MED.tirador, r = 0.0075, sep = L/2 - 0.024, mt = metal();
  var b = cil(g, r, r, L, mt, x, y, z + 0.030, 10);
  if(vertical) b.rotation.z = Math.PI/2;
  [-1, 1].forEach(function(s){
    var p = cil(g, 0.005, 0.005, 0.030, mt, x + (vertical?0:s*sep), y + (vertical?s*sep:0), z + 0.015, 8);
    if(vertical) p.rotation.z = Math.PI/2; else p.rotation.x = Math.PI/2;
  });
  return b;
}

/* Frente de mueble: deja 1 mm de holgura a cada lado */
function frente(g, x0, x1, y0, y1, z, mt){
  var w = (x1 - x0) - MED.holgura*2, h = (y1 - y0) - MED.holgura*2;
  return pz(g, w, h, 0.019, mt, (x0 + x1)/2, (y0 + y1)/2, z + 0.0095);
}

/* Carcasa de un módulo: costados, fondo, base y tabla (se ve el interior
   cuando se abre un cajón o una puerta) */
function carcasa(g, x0, x1, y0, y1, z0, z1, mt, mi){
  var w = x1 - x0, h = y1 - y0, d = z1 - z0, t = 0.018;
  pz(g, t, h, d, mi, x0 + t/2, y0 + h/2, (z0 + z1)/2);                 // costado izquierdo
  pz(g, t, h, d, mi, x1 - t/2, y0 + h/2, (z0 + z1)/2);                 // costado derecho
  pz(g, w - 2*t, h, t, mi, (x0 + x1)/2, y0 + h/2, z0 + t/2);           // fondo
  pz(g, w - 2*t, t, d - t, mi, (x0 + x1)/2, y0 + t/2, (z0 + z1)/2);     // base
  pz(g, w - 2*t, t, d - t, mi, (x0 + x1)/2, y1 - t/2, (z0 + z1)/2);     // tabla
  return {w:w, h:h, d:d};
}

/* Zócalo: 0,10 de alto, retranqueado 0,06 respecto del frente */
function zocalo(g, x0, x1, z0, z1, mt){
  pz(g, x1 - x0, MED.zocalo, (z1 - 0.06) - z0, mt, (x0 + x1)/2, MED.zocalo/2, (z0 + z1 - 0.06)/2);
}

/* ── Cajón: frente, caja, guías (fija y móvil) y tirador ──
   Devuelve el grupo animable (se desplaza en +z, hacia el frente). */
function cajon(g, x0, x1, y0, y1, zFrente, mt, mtInt, fondo){
  var d = new THREE.Group();
  g.add(d);
  var w = (x1 - x0) - MED.holgura*2;
  var h = (y1 - y0) - MED.holgura*2;
  pz(d, w, h, 0.019, mt, (x0 + x1)/2, (y0 + y1)/2, zFrente + 0.0095); // frente
  /* la caja del cajón, dentro del mueble */
  var bw = w - 0.03, bh = Math.min(0.17, h - 0.04), bd = fondo || 0.46;
  var zc = zFrente - 0.012 - bd/2;
  pz(d, bw, 0.014, bd, mtInt, (x0 + x1)/2, y0 + 0.030, zc);            // fondo de la caja
  [-1, 1].forEach(function(s){                                         // costados
    pz(d, 0.012, bh, bd, mtInt, (x0 + x1)/2 + s*(bw/2 - 0.006), y0 + 0.030 + bh/2, zc);
  });
  pz(d, bw, bh, 0.012, mtInt, (x0 + x1)/2, y0 + 0.030 + bh, zc);        // respaldo
  /* guías: la fija se queda en el mueble, la móvil sale con el cajón */
  var yG = y0 + 0.055;
  [-1, 1].forEach(function(s){
    var xg = (x0 + x1)/2 + s*((x1 - x0)/2 - 0.022);
    pz(g, 0.010, 0.030, bd + 0.02, metalOsc(), xg, yG, zFrente - bd/2 - 0.01);   // guía fija
    pz(d, 0.008, 0.018, bd, metal(), xg, yG, zFrente - 0.012 - bd/2);            // guía móvil
  });
  tirador(d, (x0 + x1)/2, y1 - 0.055, zFrente + 0.019, false);
  return d;
}

/* ── Puerta de mueble bajo: hoja, tirador y bisagra visible ── */
function puerta(g, x0, x1, y0, y1, zFrente, mt, lado, etiqueta, idBase){
  var piv = new THREE.Group();
  var xh = (lado < 0) ? x0 : x1;
  piv.position.set(xh, 0, zFrente);
  g.add(piv);
  var w = (x1 - x0) - MED.holgura*2, h = (y1 - y0) - MED.holgura*2;
  var dx = (lado < 0) ? w/2 : -w/2;
  pz(piv, w, h, 0.019, mt, dx, (y0 + y1)/2, 0.0095);
  /* tirador vertical en el canto libre (coordenadas del pivote) */
  var xt = (lado < 0) ? (w - 0.055) : -(w - 0.055);
  tirador(piv, xt, (y0 + y1)/2 + 0.10, 0.019, true);
  /* bisagra de piano (codo): dos chapas en el canto */
  [y0 + 0.12, y1 - 0.12].forEach(function(y){
    pz(piv, 0.022, 0.05, 0.010, metalOsc(), (lado < 0 ? 0.008 : -0.008), y, 0.006);
  });
  var an = anim(piv, 'y',
    {p:piv.position.clone(), r:0},
    {p:piv.position.clone(), r:(lado < 0 ? -1 : 1) * 1.75}, 0.8);
  if(etiqueta) registra(an, {id:idBase, etiqueta:etiqueta, tipo:'puerta', grupo:'Cocina'});
  return {grupo:piv, an:an};
}

/* ── Bisagra de basculante (yunding) de 90°: pivote + brazo, a la vista ── */
function yunding(g, x0, x1, y0, y1, zFrente, mt, etiqueta, idBase){
  var piv = new THREE.Group();
  piv.position.set((x0 + x1)/2, y1, zFrente + 0.006);
  g.add(piv);
  var w = (x1 - x0) - MED.holgura*2, h = (y1 - y0) - MED.holgura*2;
  pz(piv, w, h, 0.019, mt, 0, -h/2, -0.0095);                 // hoja, colgando del pivote
  tirador(piv, 0, -h + 0.055, -0.019, false);                  // tirador abajo
  cil(piv, 0.013, 0.013, Math.min(0.09, w*0.25), metal(), 0, 0, 0, 12).rotation.z = Math.PI/2;  // pivote
  pz(piv, 0.012, 0.10, 0.012, metalOsc(), -w/2 + 0.02, -0.05, -0.035).rotation.x = 0.5;  // brazo
  pz(g, 0.05, 0.05, 0.012, metalOsc(), (x0 + x1)/2 - w/2 + 0.02, y1 - 0.01, zFrente - 0.03);  // soporte fijo
  var an = anim(piv, 'x',
    {p:piv.position.clone(), r:0},
    {p:piv.position.clone(), r:-Math.PI/2}, 0.9);
  if(etiqueta) registra(an, {id:idBase, etiqueta:etiqueta, tipo:'puerta', grupo:'Cocina'});
  return {grupo:piv, an:an};
}

/* ===================================================================
   5. La encimera corrida (COC-01): zócalo, bases, frentes, alacenas,
      fregadero, placa y campana
   =================================================================== */
function construyeEncimera(g, m, ver){
  var L = m.largo || 3.9;
  var x0 = -L/2, x1 = L/2;
  var mtFrente = lam(m.frente || '#e7e4de'), mtInt = lam('#d9d5cc');
  var mtTop = lam(m.tapa || '#2f3134'), mtZoc = lam('#3a3d40');
  var zFondo = -MED.fondo/2, zFrente = MED.fondo/2;   // -0,30 .. +0,30
  var yZoc = MED.zocalo, yTop = MED.alto - MED.encimera; // 0,86

  /* Reparto de módulos (ancho total 3,90):
     A 0,60 cajones · B 0,65 puerta · C 1,30 fregadero · D 0,60 cajones · E 0,75 puerta */
  var mods = [
    {a:x0,          b:x0 + 0.60,  tipo:'cajones'},
    {a:x0 + 0.60,   b:x0 + 1.25,  tipo:'puerta'},
    {a:x0 + 1.25,   b:x0 + 2.55,  tipo:'fregadero'},
    {a:x0 + 2.55,   b:x0 + 3.15,  tipo:'cajones'},
    {a:x0 + 3.15,   b:x1,         tipo:'puerta'}
  ];

  mods.forEach(function(mod, i){
    carcasa(g, mod.a, mod.b, yZoc, yTop, zFondo, zFrente, mtFrente, mtInt);
    zocalo(g, mod.a, mod.b, zFondo, zFrente, mtZoc);
    if(mod.tipo === 'cajones'){
      /* tres cajones: el alto se reparte con el grande arriba */
      var h1 = (yTop - yZoc) * 0.30, h2 = (yTop - yZoc) * 0.32, h3 = (yTop - yZoc) - h1 - h2;
      var y1 = yZoc, y2 = y1 + h1, y3 = y2 + h2;
      var d1 = cajon(g, mod.a, mod.b, y1, y2 - 0.004, zFrente, mtFrente, mtInt, 0.42);
      var d2 = cajon(g, mod.a, mod.b, y2, y3 - 0.004, zFrente, mtFrente, mtInt, 0.46);
      var d3 = cajon(g, mod.a, mod.b, y3, yTop, zFrente, mtFrente, mtInt, 0.50);
      [[d1, 'Cajón inferior'], [d2, 'Cajón medio'], [d3, 'Cajón de la encimera']].forEach(function(c, k){
        var an = anim(c[0], 'z',
          {p:c[0].position.clone(), r:0},
          {p:c[0].position.clone().add(new THREE.Vector3(0, 0, 0.42 + k*0.02)), r:0}, 0.9);
        registra(an, {id:'COC-01-caj-' + (i*3 + k + 1) + '-' + ver, etiqueta:c[1], tipo:'cajon', grupo:'Cocina'});
      });
    } else if(mod.tipo === 'puerta'){
      puerta(g, mod.a, mod.b, yZoc, yTop, zFrente, mtFrente, -1, 'Puerta de la encimera',
             'COC-01-puerta-' + (i + 1) + '-' + ver);
    } else {
      /* fregadero: dos puertas */
      var mc = (mod.a + mod.b)/2;
      puerta(g, mod.a, mc, yZoc, yTop, zFrente, mtFrente, -1, 'Puerta del fregadero',
             'COC-01-freg-1-' + ver);
      puerta(g, mc, mod.b, yZoc, yTop, zFrente, mtFrente, 1, 'Puerta del fregadero',
             'COC-01-freg-2-' + ver);
    }
  });

  /* Encimera: 0,04 de canto, con vuelo de 0,02 */
  pz(g, L + 0.02, MED.encimera, MED.fondo + 0.04, mtTop, 0, MED.alto - MED.encimera/2, 0);

  /* Fregadero de 0,80: cubeta, escurridor y grifo */
  var xf = (m.fregadero !== undefined) ? m.fregadero : 0.2;
  pz(g, MED.fregadero, 0.02, 0.42, lam('#c9ccd0'), xf, MED.alto - 0.035, -0.02);
  pz(g, MED.fregadero - 0.06, 0.16, 0.36, lam('#9aa0a6'), xf, MED.alto - 0.12, -0.02);
  pz(g, MED.fregadero - 0.02, 0.012, 0.40, lam('#b6bcc2'), xf, MED.alto - 0.20, -0.02);
  cil(g, 0.016, 0.016, 0.26, metal(), xf, MED.alto + 0.13, -0.24, 12);
  var sp = cil(g, 0.013, 0.013, 0.20, metal(), xf, MED.alto + 0.24, -0.15, 10);
  sp.rotation.x = Math.PI/2.4;

  /* Placa de 0,60 con cuatro fuegos y campana */
  var xp = (m.placa !== undefined) ? m.placa : (x1 - 0.40);
  pz(g, MED.placa, 0.010, 0.50, lam('#232527'), xp, MED.alto + 0.004, -0.02);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){
    cil(g, 0.075, 0.075, 0.006, metalOsc(), xp + q[0]*0.14, MED.alto + 0.011, -0.02 + q[1]*0.11, 16);
  });
  pz(g, MED.placa + 0.10, 0.55, 0.46, lam('#313336'), xp, 1.85, -0.10);            // campana
  pz(g, 0.26, 0.55, 0.24, lam('#313336'), xp, 2.40, -0.14);                     // chimenea
  pz(g, MED.placa + 0.06, 0.02, 0.42, metalOsc(), xp, 1.565, -0.10);            // filtro

  /* Alacenas: 0,35 de fondo, 0,70 de alto, base a 1,40 — sin tapar la ventana
     (la ventana ocupa la franja central; las alacenas van a los lados) */
  var lac = [
    {a:x0, b:x0 + 1.20},                 // izquierda: dos puertas de 0,60
    {a:x0 + 2.55, b:x0 + 3.15}           // derecha: una puerta de 0,60
  ];
  lac.forEach(function(L2, j){
    var zlFondo = zFondo, zlFrente = zFondo + MED.lacFondo;
    carcasa(g, L2.a, L2.b, MED.lacBase, MED.lacBase + MED.lacAlto, zlFondo, zlFrente, mtFrente, mtInt);
    pz(g, L2.b - L2.a, 0.018, MED.lacFondo, mtFrente, (L2.a + L2.b)/2, MED.lacBase + MED.lacAlto, (zlFondo + zlFrente)/2);
    pz(g, L2.b - L2.a - 0.04, 0.014, MED.lacFondo - 0.04, mtInt, (L2.a + L2.b)/2, MED.lacBase + MED.lacAlto - 0.09, (zlFondo + zlFrente)/2);
    if(j === 0){
      var mc2 = (L2.a + L2.b)/2;
      yunding(g, L2.a, mc2, MED.lacBase, MED.lacBase + MED.lacAlto, zlFrente, mtFrente, 'Puerta de alacena', 'COC-01-alac-1-' + ver);
      yunding(g, mc2, L2.b, MED.lacBase, MED.lacBase + MED.lacAlto, zlFrente, mtFrente, 'Puerta de alacena', 'COC-01-alac-2-' + ver);
    } else {
      yunding(g, L2.a, L2.b, MED.lacBase, MED.lacBase + MED.lacAlto, zlFrente, mtFrente, 'Puerta de alacena', 'COC-01-alac-3-' + ver);
    }
    /* tira de LED escondida en el canto de abajo */
    pz(g, L2.b - L2.a - 0.06, 0.012, 0.03, led(), (L2.a + L2.b)/2, MED.lacBase - 0.008, zlFrente - 0.03);
    pz(g, L2.b - L2.a - 0.04, 0.020, 0.014, metalOsc(), (L2.a + L2.b)/2, MED.lacBase - 0.004, zlFrente - 0.02);
  });
}

/* ===================================================================
   6. La nevera (COC-02): 0,70 x 2,00, dos hojas y luz interior
   =================================================================== */
var LUCES = [];            // luces de interior (la de la nevera)

function construyeNevera(g, m, ver){
  var W = MED.neveraW, H = MED.neveraH, F = MED.neveraF;
  var x0 = -W/2, x1 = W/2, z0 = -F/2, z1 = F/2, yDiv = 0.70;
  var mtCuerpo = lam('#b7bbbf'), mtInt = lam('#eef1f3');
  carcasa(g, x0, x1, 0, H, z0, z1, mtCuerpo, mtInt);
  pz(g, W - 0.05, 0.02, F - 0.06, mtInt, 0, yDiv, -0.01);                 // tabla divisoria
  /* frigorífico: baldas de vidrio y cajón de verduras */
  [0.98, 1.32, 1.66].forEach(function(y){
    pz(g, W - 0.09, 0.012, F - 0.12, lam('#cdd7dc'), 0, y, -0.02);
  });
  pz(g, W - 0.11, 0.17, F - 0.14, lam('#dde4e7'), 0, 0.83, -0.03);
  /* congelador: una cesta */
  pz(g, W - 0.11, 0.28, F - 0.14, lam('#dde4e7'), 0, 0.38, -0.03);
  /* la luz: un panel emisivo y una bombilla real que se enciende al abrir */
  var matLed = new THREE.MeshLambertMaterial({color:'#ffffff', emissive:'#dcefff', emissiveIntensity:0.15});
  var panel = pz(g, 0.24, 0.03, 0.16, matLed, 0, H - 0.075, -0.04);
  var luz = new THREE.PointLight(0xdcefff, 0, 1.6, 1.7);
  luz.position.set(0, H - 0.18, -0.02);
  g.add(luz);

  /* las dos hojas: la del frigorífico a la izquierda, la del congelador a la derecha */
  function hoja(y0, y1, lado, etiqueta, idBase, tipo){
    var piv = new THREE.Group();
    piv.position.set(lado < 0 ? x0 : x1, 0, z1);
    g.add(piv);
    var w = W - MED.holgura*2, h = (y1 - y0) - MED.holgura*2;
    var dx = (lado < 0) ? w/2 : -w/2;
    pz(piv, w, h, 0.05, mtCuerpo, dx, (y0 + y1)/2, -0.025);
    var xt = (lado < 0) ? (w - 0.075) : -(w - 0.075);
    tirador(piv, xt, (y0 + y1)/2, 0.025, true);
    var an = anim(piv, 'y',
      {p:piv.position.clone(), r:0},
      {p:piv.position.clone(), r:(lado < 0 ? -1 : 1) * 1.95}, 1.0);
    registra(an, {id:idBase, etiqueta:etiqueta, tipo:tipo, grupo:'Cocina'});
    return an;
  }
  var anNevera = hoja(yDiv + 0.03, H - 0.03, -1, 'Nevera', 'COC-02-nevera-' + ver, 'nevera');
  hoja(0.04, yDiv - 0.02, 1, 'Congelador', 'COC-02-congelador-' + ver, 'puerta');
  LUCES.push({luz:luz, an:anNevera, panel:panel});
}

/* ===================================================================
   7. La isla (COC-03 y COC-M01): cuerpo de 0,60, vuelo >= 0,30 y barra a 1,05
   =================================================================== */
function construyeIsla(g, m, ver){
  var L = m.largo || 2.0, D = m.fondo || 0.95;
  var mtFrente = lam(m.frente || '#8f9e86'), mtInt = lam('#7c8b74');
  var mtTop = lam(m.tapa || '#b98b5e'), mtBarra = lam(m.tapaBarra || '#a87c50');
  var zFondo = -D/2, zCuerpo = zFondo + MED.fondo;     // el cuerpo ocupa 0,60
  var yTop = MED.alto - MED.encimera;
  var idIsla = (ver === 'mejorada') ? 'COC-M01' : 'COC-03';

  /* El cuerpo va girado 180°: así el frente (los cajones) mira a -z, al lado
     de trabajo, y el vuelo de la barra queda hacia +z, donde están las banquetas. */
  var gb = new THREE.Group();
  gb.position.set(0, 0, zFondo + MED.fondo/2);
  gb.rotation.y = Math.PI;
  g.add(gb);

  var n = Math.max(2, Math.round(L / 0.60)), w = L / n, i;
  for(i = 0; i < n; i++){
    var a = -L/2 + i*w, b = a + w;
    carcasa(gb, a, b, MED.zocalo, yTop, -MED.fondo/2, MED.fondo/2, mtFrente, mtInt);
    zocalo(gb, a, b, -MED.fondo/2, MED.fondo/2, lam('#3a3d40'));
    var y1 = MED.zocalo, y2 = yTop - 0.20, y3 = yTop;
    var d1 = cajon(gb, a, b, y1, y2, MED.fondo/2, mtFrente, mtInt, 0.42);
    var d2 = cajon(gb, a, b, y2, y3, MED.fondo/2, mtFrente, mtInt, 0.46);
    [[d1, 'Cajón de la isla'], [d2, 'Cajón de la encimera de la isla']].forEach(function(c, k){
      var an = anim(c[0], 'z',
        {p:c[0].position.clone(), r:0},
        {p:c[0].position.clone().add(new THREE.Vector3(0, 0, 0.42 + k*0.02)), r:0}, 0.9);
      registra(an, {id:idIsla + '-caj-' + (i*2 + k + 1) + '-' + ver,
                    etiqueta:c[1], tipo:'cajon', grupo:'Cocina'});
    });
  }

  /* Encimera de trabajo a 0,90 y barra a 1,05, con vuelo de 0,30 o más */
  pz(g, L + 0.04, MED.encimera, (zCuerpo - zFondo) + 0.04, mtTop, 0, MED.alto - MED.encimera/2, (zFondo + zCuerpo)/2);
  var zB0 = zCuerpo, zB1 = D/2 + 0.02;
  pz(g, L + 0.04, MED.encimera, zB1 - zB0, mtBarra, 0, MED.barra - MED.encimera/2, (zB0 + zB1)/2);
  [-1, 1].forEach(function(s){
    cil(g, 0.022, 0.022, MED.barra - MED.encimera, metal(), s*(L/2 - 0.22), (MED.barra - MED.encimera)/2, zB1 - 0.11, 12);
  });
  var reposa = cil(g, 0.016, 0.016, L - 0.44, metal(), 0, 0.24, zB1 - 0.11, 10);
  reposa.rotation.z = Math.PI/2;
}

/* ===================================================================
   8. La banqueta (COC-04..06 y COC-M02..04)
   =================================================================== */
function construyeBanqueta(g, m, ver){
  var c = lam(m.color || '#8a6a48'), asiento = lam(m.asiento || '#d9cdb4');
  cil(g, 0.19, 0.19, 0.045, c, 0, 0.655, 0, 18);
  cil(g, 0.175, 0.175, 0.032, asiento, 0, 0.693, 0, 18);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){
    cil(g, 0.016, 0.023, 0.63, c, q[0]*0.125, 0.315, q[1]*0.125, 8);
  });
  var aro = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.011, 6, 18), metal());
  aro.rotation.x = Math.PI/2; aro.position.set(0, 0.25, 0); g.add(aro);
  pz(g, 0.24, 0.018, 0.018, c, 0, 0.25, 0.12);
}

/* ===================================================================
   9. Mobiliario general: lo que faltaba (cojín, listón y faldón)
   =================================================================== */
function mejoraMueble(g, m){
  if(g.userData && g.userData.__cocina) return;                 // ya está mejorada
  /* la ficha del mueble, para que el panel del visor siga funcionando */
  var info = null;
  g.traverse(function(o){ if(o.isMesh && o.userData.info && !info) info = o.userData.info; });
  var pon = function(mesh){ if(info) mesh.userData.info = info; return mesh; };
  if(m.tipo === 'silla_madera'){
    var c = lam(m.color || '#8a6a48');
    /* el cojín va sobre el asiento del visor (0,42 de lado, canto superior a 0,47) */
    pon(pz(g, 0.40, 0.03, 0.40, lam(m.asiento || '#d9cdb4'), 0, 0.482, 0));
    /* el listón va en la cara ANTERIOR del respaldo (el visor lo pone en z -0,19, canto 0,025) */
    pon(pz(g, 0.38, 0.055, 0.016, c, 0, 0.80, -0.169));
  } else if(m.tipo === 'mesa_madera'){
    var L = m.largo || 2.2, D = m.fondo || 0.95, cm = lam(m.color || '#a97c50');
    pon(pz(g, L - 0.26, 0.06, 0.05, cm, 0, 0.685, D/2 - 0.12));
    pon(pz(g, L - 0.26, 0.06, 0.05, cm, 0, 0.685, -D/2 + 0.12));
  }
  g.userData.__cocina = true;
}

/* ===================================================================
   10. Reconstrucción: qué hay en la escena y qué hay que rehacer
   =================================================================== */
function interiorDe(v){
  var a = api(); if(!a) return null;
  if(v === 'mejorada'){
    var FM = window.CASA_MEJORA || window.FINCA_MEJORA;
    if(FM && FM.casa && FM.casa.interior) return FM.casa.interior;
  }
  return (a.C0 && a.C0.interior) || null;
}
function repara(){
  var a = api(); if(!a || !a.escena) return 0;
  limpiaPiezas();
  ANIMS.length = 0;
  LUCES.length = 0;
  /* un solo recorrido: se agrupan los muebles por id */
  var porId = {};
  a.escena.traverse(function(o){
    if(!(o.isMesh && o.userData && o.userData.info && o.userData.info.id)) return;
    var g = grupoMueble(o);
    if(!g) return;
    var id = o.userData.info.id;
    if(!porId[id]) porId[id] = [];
    if(porId[id].indexOf(g) < 0) porId[id].push(g);
  });
  var n = 0;
  ['actual', 'mejorada'].forEach(function(v){
    var INT = interiorDe(v);
    if(!INT || !INT.muebles) return;
    INT.muebles.forEach(function(m){
      if(!m.id) return;
      /* la cocina (id COC-*) se rehace entera; el mobiliario general (sillas y
         mesa de madera) solo se mejora: se le añade lo que le falta. */
      var esCoc = (m.id.indexOf('COC') === 0);
      var esGeneral = (m.tipo === 'silla_madera' || m.tipo === 'mesa_madera');
      if(!esCoc && !esGeneral) return;
      var gs = (porId[m.id] || []).filter(function(g){ return versionDe(g) === v; });
      if(!gs.length) return;
      if(m.tipo === 'silla_madera' || m.tipo === 'mesa_madera'){
        gs.forEach(function(g){ mejoraMueble(g, m); });
        return;
      }
      gs.forEach(function(g){
        var base = quitaGrupo(g);
        if(!base) return;
        var ng = grupoNuevo(base, m.id);
        if(m.tipo === 'encimera') construyeEncimera(ng, m, v);
        else if(m.tipo === 'nevera') construyeNevera(ng, m, v);
        else if(m.tipo === 'isla') construyeIsla(ng, m, v);
        else if(m.tipo === 'banqueta') construyeBanqueta(ng, m, v);
        heredaInfo(ng, base.info);
        n++;
      });
    });
  });
  return n;
}

/* ===================================================================
   11. Animación por cuadro
   =================================================================== */
function frame(dt){
  if(!dt || dt > 0.25) dt = 0.016;
  var i, an;
  for(i = 0; i < ANIMS.length; i++){
    an = ANIMS[i];
    if(!an.vel) continue;
    an.t += an.vel * dt / an.dur;
    if(an.t >= 1){ an.t = 1; an.vel = 0; }
    if(an.t <= 0){ an.t = 0; an.vel = 0; }
    aplica(an);
  }
  for(i = 0; i < LUCES.length; i++){
    var L = LUCES[i], s = suave(L.an ? L.an.t : 0);
    if(L.luz) L.luz.intensity = s * 0.75;
    if(L.panel && L.panel.material) L.panel.material.emissiveIntensity = 0.15 + s * 0.9;
  }
}

/* ===================================================================
   12. Arranque y API pública
   =================================================================== */
var ENGANCHADO = false, APLICADO = false;
function engancha(){
  if(ENGANCHADO) return true;
  if(typeof AD.onFrame === 'function'){ AD.onFrame(frame); ENGANCHADO = true; return true; }
  return false;
}
function arranca(){
  engancha();
  if(APLICADO) return;
  if(repara()) APLICADO = true;
}
if(typeof AD.avisaListo === 'function') AD.avisaListo(arranca);
else (function espera(){
  if(!arranca()) setTimeout(espera, 250);
})();

AD.cocina = {
  piezas: PIEZAS,
  aplicar:function(){ APLICADO = false; return repara(); },
  repara:function(){ APLICADO = false; return repara(); },
  /* cuánto abierto está cada pieza (0 cerrado, 1 abierto) */
  estado:function(id){
    for(var i = 0; i < PIEZAS.length; i++) if(PIEZAS[i].id === id) return PIEZAS[i].estado();
    return 0;
  }
};
})();
