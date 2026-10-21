/* =====================================================================
   modulo/camaras.js — cámaras cinematográficas y recorrido automático interior.

   Se carga como <script> después de visor.js y se registra en AD.camaras.
   No toca visor.js, index.html ni demo/casa.js: todo lo que necesita sale
   de AD.api (C0, INT, VISTAS, PUERTAS, aplicaVista, capas, renderer…) y de
   los datos de la casa (C.muros, C.huecos, INT.estancias, INT.muebles).

   Idea: las tomas no están escritas a mano. Se derivan de los datos: cada
   estancia da un plano general, un lateral y un detalle, calculados desde
   la pieza que manda en esa estancia (la más importante por tipo y tamaño),
   más un contrapicado si hay algo alto, un cenital si hay sitio y un
   travelling en la estancia más grande. Todas las posiciones se validan
   contra los muros (C.muros, con sus huecos) y contra las huellas de los
   muebles (INT.muebles) antes de usarse: la cámara nunca queda dentro de un
   muro ni dentro de un mueble.

   Reglas que no se negocian (del visor 390-1):
   - altura humana 1,62 m salvo tomas altas deliberadas;
   - ≥ 0,25 m a la cara del muro y ≥ 0,60 m a la pieza que se enseña;
   - FOV definido en horizontal y convertido a vertical con
     2·atan(tan(h/2)/aspect), con los límites 50–94°;
   - el recorrido no interpola entre ambientes: pasa por los vanos.
   ===================================================================== */
var AD = window.AD || (window.AD = {});

(function(){
  'use strict';

  /* ------------------------------------------------------------------
     1. Constantes y estado
     ------------------------------------------------------------------ */
  var NOM_PLANO = {general:'General', lateral:'Lateral', contrapicado:'Contrapicado',
                   detalle:'Detalle', cenital:'Cenital', travelling:'Travelling'};

  var OJO = 1.62;            // altura de la cámara: la de una persona
  var RETIRO_MURO = 0.25;    // mínimo a la cara del muro
  var RETIRO_MUEBLE = 0.60;  // mínimo a la pieza que se enseña
  var HFOV_MIN = 50, HFOV_MAX = 94;
  var VFOV_MIN = 50, VFOV_MAX = 94;
  var VEL_PASEO = 1.15;      // m/s del recorrido interior
  var PARADA = 1.7;          // s de parada en cada sitio informativo
  var DIST_MIN = 2.2;        // distancia mínima al punto de mira (límite del visor)
  var MAX_TOMAS = 18;        // tope de tomas en la lista
  var ELEV_MAX = 13.0;       // grados de elevación hacia arriba (lo que permite la órbita)
  var SOMBRA_MAX = 2048;     // px: el mapa de sombras no pasa de 2048 (64 MB en 4096)
  var DPR_MAX = 2;           // límite del pixelRatio
  var HUD_SEG = 12;          // px: separación del HUD con el borde del encuadre

  var E = {
    modo:null,               // null | 'cine' | 'paseo'
    i:0, t:0, play:true, vel:1,
    lb:false, rot:true, fundido:false, k4:false,
    tomas:[], rutas:[], ruta:0, s:0,
    cede:false, arrYaw:0, arrPitch:0, mirando:0,
    capAntes:null, pxAntes:0, sombraAntes:0, version:'', listo:false, camAntes:null
  };
  var TOMAS = E.tomas;       // la lista viva (la que ve el coordinator)
  var HUD = null;

  /* ------------------------------------------------------------------
     2. Datos de la casa
     ------------------------------------------------------------------ */
  function api(){ return AD.api || null; }

  function datos(){
    var a = api(); if(!a) return null;
    var base = a.C0 || a.C; if(!base) return null;
    /* El coordinator puede pasar la casa entera o solo su parte de
       construcción: se normaliza para no leer muros de un undefined. */
    if(!base.muros && base.casa && base.casa.muros) base = base.casa;
    var v = a.VERSION || 'actual';
    var c = base;
    /* La versión mejorada solo trae muros, huecos e interior: el origen, el
       rumbo y el contorno son los de la casa (igual que hace el visor). */
    if(v === 'mejorada' && window.CASA_MEJORA && window.CASA_MEJORA.casa)
      c = Object.assign({}, base, window.CASA_MEJORA.casa);
    var g = (a.GIRO != null) ? a.GIRO : (90 - (c.rumbo == null ? 90 : c.rumbo))*Math.PI/180;
    return {casa:c, inte:c.interior || {estancias:[], muebles:[]},
            suelo:(a.SUELO != null ? a.SUELO : 0.25), giro:g, version:v};
  }

  /* Del marco del plano (u, v) al mundo (x, z): la misma fórmula que el visor. */
  function aMundo(u, v){
    var d = datos(); if(!d) return [0,0];
    var a = api();
    if(a && typeof a.aMundo === 'function'){ var p = a.aMundo(u, v); return p; }
    var c = d.casa, g = d.giro;
    return [c.origen[0] + u*Math.cos(g) + v*Math.sin(g),
            c.origen[1] - u*Math.sin(g) + v*Math.cos(g)];
  }
  function radians(d){ return d*Math.PI/180; }

  /* Altura del techo de una estancia (en su marco local), como el visor. */
  function techoDe(e, v){
    var t = e.techo || {}, k = e.caja;
    if(t.cumbrera !== undefined && t.vc != null && t.alto != null)
      return t.alto + (t.cumbrera - t.alto)*(v < t.vc ? (v - k[1])/(t.vc - k[1]) : (k[3] - v)/(k[3] - t.vc));
    if(t.alto != null) return t.alto;
    if(t.alto0 != null) return t.alto0 + (t.alto1 - t.alto0)*(v - k[1])/Math.max(0.01, k[3] - k[1]);
    return 2.7;
  }
  function estanciaDe(inte, id){
    for(var i=0;i<inte.estancias.length;i++) if(inte.estancias[i].id === id) return inte.estancias[i];
    return null;
  }
  function estanciaEn(inte, u, v){
    for(var i=0;i<inte.estancias.length;i++){
      var k = inte.estancias[i].caja;
      if(u >= k[0] && u <= k[2] && v >= k[1] && v <= k[3]) return inte.estancias[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------
     3. Muros: por líneas
        Los muros de la casa vienen troceados: entre dos trozos hay un
        hueco (puerta, paso o ventana). Se agrupan por línea (la v de un
        muro horizontal, la u de uno vertical) y de cada línea se sacan
        dos listas de tramos:
        - `solido`: el muro más las ventanas. Sirve para el retiro: la
          cámara no se acerca a menos de 0,25 m de la cara de un muro.
        - `pasable`: el muro solo. Sirve para caminar: por una ventana no
          se pasa, por una puerta sí.
     ------------------------------------------------------------------ */
  var PASABLES = {puerta:1, paso:1, vidriera:1, ventanal:1, arco:1, garaje:1};
  var cacheLineas = null;
  function lineas(){
    var d = datos(); if(!d) return [];
    if(cacheLineas && cacheLineas.version === d.version) return cacheLineas.lista;
    var mapa = {};
    d.casa.muros.forEach(function(w){
      var horiz = Math.abs(w[3]-w[1]) < 1e-6;
      var linea = horiz ? w[1] : w[0];
      var a = horiz ? Math.min(w[0], w[2]) : Math.min(w[1], w[3]);
      var b = horiz ? Math.max(w[0], w[2]) : Math.max(w[1], w[3]);
      var k = (horiz ? 'h:' : 'v:') + linea.toFixed(3);
      var L = mapa[k] || (mapa[k] = {horiz:horiz, linea:linea, muros:[], vanos:[]});
      L.muros.push({a:a, b:b, e:w[4]||0.2});
    });
    (d.casa.huecos || []).forEach(function(h){
      var horiz = Math.abs(h[3]-h[1]) < 1e-6;
      var linea = horiz ? h[1] : h[0];
      var k = (horiz ? 'h:' : 'v:') + linea.toFixed(3);
      var L = mapa[k]; if(!L) return;                 // un hueco en una línea sin muro
      var a = horiz ? Math.min(h[0], h[2]) : Math.min(h[1], h[3]);
      var b = horiz ? Math.max(h[0], h[2]) : Math.max(h[1], h[3]);
      L.vanos.push({a:a, b:b, e:h[6]||0.2, pasable:!!PASABLES[h[4]]});
    });
    var lista = [];
    Object.keys(mapa).forEach(function(k){
      var L = mapa[k];
      var mat = L.muros.map(function(m){ return {a:m.a, b:m.b, e:m.e}; });
      var solido = mat.slice();
      L.vanos.forEach(function(v){ if(!v.pasable) solido.push({a:v.a, b:v.b, e:v.e}); });
      lista.push({horiz:L.horiz, linea:L.linea, solido:solido, muro:mat});
    });
    cacheLineas = {version:d.version, lista:lista};
    return lista;
  }
  /* Distancia a la cara de un muro (0 si el punto está dentro del muro).
     Se mide contra el TRAMO, no contra la recta: si la cámara se queda justo
     al final de un muro, la distancia a la recta da 1e9 y la cámara se mete
     dentro del tabique. Se usa siempre la lista `solido` (muros + ventanas):
     por una puerta se pasa porque no hay nada, pero por una ventana no; y el
     retiro de 0,25 m también cuenta con las ventanas. */
  function distMuro(u, v){
    var ls = lineas(), mejor = 1e9;
    for(var i=0;i<ls.length;i++){
      var L = ls[i], tr = L.solido;
      var p = L.horiz ? u : v, q = L.horiz ? v : u;
      for(var j=0;j<tr.length;j++){
        var t = tr[j], te = (t.e || 0.2)/2;
        var da = p < t.a ? t.a - p : (p > t.b ? p - t.b : 0);
        var db = q < L.linea - te ? (L.linea - te) - q : (q > L.linea + te ? q - (L.linea + te) : 0);
        var d = Math.hypot(da, db);
        if(d < mejor) mejor = d;
      }
    }
    return mejor;
  }
  /* Resta una lista de intervalos a otra y devuelve los trozos que quedan. */
  function subtruye(base, fuera){
    var res = base.slice();
    fuera.forEach(function(f){
      var neu = [];
      res.forEach(function(t){
        if(f[1] <= t[0] + 1e-6 || f[0] >= t[1] - 1e-6){ neu.push(t); return; }
        if(f[0] > t[0] + 1e-6) neu.push([t[0], Math.min(f[0], t[1])]);
        if(f[1] < t[1] - 1e-6) neu.push([Math.max(f[1], t[0]), t[1]]);
      });
      res = neu;
    });
    return res.filter(function(t){ return t[1] - t[0] > 0.01; });
  }
  /* Los tramos por los que se puede pasar de una estancia a otra: la línea
     sin muro (las puertas y los pasos), nunca por una ventana. */
  function libres(linea, eje, int){
    var ls = lineas(), fuera = [], clave = (eje === 'v' ? 'v:' : 'h:') + linea.toFixed(3);
    ls.forEach(function(L){
      if(((eje === 'v' ? 'v:' : 'h:') + L.linea.toFixed(3)) !== clave) return;
      L.solido.forEach(function(t){ fuera.push([t.a, t.b]); });
    });
    return subtruye([int], fuera);
  }

  /* ------------------------------------------------------------------
     4. Huellas de los muebles (en el marco del plano)
        La pieza tiene su origen en el centro de su planta y mira a +z local;
        con `giro` grados, su frente en el plano es (sin g, cos g) y su
        derecha (cos g, −sin g). `hx` es la mitad del ancho (x local) y `hz`
        la mitad del fondo (z local).
     ------------------------------------------------------------------ */
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
      case 'columnas': case 'columna': hx=0.32; hz=0.32; alto=2.2; break;
      case 'empotrado': hx=(m.ancho||2.0)/2; hz=0.32; alto=2.55; break;
      case 'armario_alto': hx=(A||1.2)/2; hz=0.3; alto=2.4; break;
      case 'libreria': hx=(A||1.3)/2; hz=(F||0.35)/2; alto=m.alto||2.3; break;
      case 'estanteria_metal': hx=(A||0.9)/2; hz=0.2; alto=1.9; break;
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
      case 'silda_oficina': case 'silla_oficina': hx=0.3; hz=0.3; alto=1.1; break;
      case 'espejo': hx=(A||0.9)/2; hz=0.05; alto=m.alto||1.2; break;
      case 'alfombra': hx=(A||2.0)/2; hz=(L||2.5)/2; alto=0.02; break;
      case 'maceta': hx=R||0.25; hz=R||0.25; alto=m.planta||1.0; break;
      case 'monitor': hx=(A||0.62)/2; hz=0.12; alto=0.5; break;
      case 'aparcador': hx=(L||1.6)/2; hz=0.25; alto=0.9; break;
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
  /* Marco local de una pieza: la rotación y su huella. */
  function marco(m){
    var g = radians(m.giro || 0);
    return {uv:m.uv, g:g, c:Math.cos(g), s:Math.sin(g), h:huella(m)};
  }
  /* (u, v) -> local de la pieza. */
  function aLocal(mk, u, v){
    var dx = u - mk.uv[0], dz = v - mk.uv[1];
    return [dx*mk.c - dz*mk.s, dx*mk.s + dz*mk.c];
  }
  /* Distancia del punto al rectángulo de la pieza (0 si está dentro). */
  function distPieza(m, u, v){
    var mk = marco(m), l = aLocal(mk, u, v);
    var ex = Math.max(Math.abs(l[0]) - mk.h.hx, 0), ez = Math.max(Math.abs(l[1]) - mk.h.hz, 0);
    return Math.hypot(ex, ez);
  }
  function enPieza(m, u, v, margen){
    var mk = marco(m), l = aLocal(mk, u, v), mg = margen || 0;
    return Math.abs(l[0]) <= mk.h.hx + mg && Math.abs(l[1]) <= mk.h.hz + mg;
  }
  /* ¿La cámara (a esa altura) queda dentro de alguna pieza? `margen` es el
     radio del cuerpo de la cámara: un mueble que no llega a su altura no la
     contiene, pero tampoco se le puede pasar rozando. */
  function dentroDeMueble(u, v, altura, excepto, margen){
    var d = datos(); if(!d) return false;
    var mg = (margen === undefined ? 0.05 : margen);
    for(var i=0;i<d.inte.muebles.length;i++){
      var m = d.inte.muebles[i];
      if(m === excepto) continue;
      if(!m.uv) continue;                             // las piezas de fuera van en coordenadas del mundo
      if(huella(m).alto <= altura - 0.25) continue;      // no llega a la altura de la cámara
      if(enPieza(m, u, v, mg)) return true;
    }
    return false;
  }
  /* ¿La cámara está despejada? (muro a ≥ 0,25 m y ningún mueble encima) */
  function sitioLibre(u, v, altura, excepto){
    if(distMuro(u, v) < RETIRO_MURO) return false;
    if(dentroDeMueble(u, v, altura, excepto, 0.05)) return false;
    return true;
  }
  /* ¿Se ve la pieza desde ese punto? La línea de visión se interrumpe si
     por el camino hay algo más alto que ella. */
  function lineaLibre(u0, v0, u1, v1, y0, y1){
    var d = datos(); if(!d) return true;
    var L = Math.hypot(u1-u0, v1-v0);
    var n = Math.max(6, Math.ceil(L/0.22));
    for(var i=1;i<n;i++){
      var t = i/n, u = u0 + (u1-u0)*t, v = v0 + (v1-v0)*t, y = y0 + (y1-y0)*t;
      for(var j=0;j<d.inte.muebles.length;j++){
        var m = d.inte.muebles[j];
        if(huella(m).alto <= y) continue;
        if(enPieza(m, u, v, 0)) return false;
      }
    }
    return true;
  }

  /* ------------------------------------------------------------------
     5. La pieza que manda en cada estancia y la altura del detalle
     ------------------------------------------------------------------ */
  var PESO = {
    chimenea:12, encimera:11, isla:10, cocina:11, columna:9, columnas:9,
    cama:9, sofapiel:8, sofa_tela:8, sofa_l:8, escritorio:8, libreria:8, panel_listones:7,
    mesa_comedor:7, mesa_madera:6, empotrado:7, armario_alto:6, banera:7,
    lavabo_cajones:6, nevera:6, inodoro:5, comoda:5, mesilla:4, mesa_centro:4,
    aparador:4, kallax:4, estanteria_metal:4, lavadora:3, pila_lavar:3,
    mesa_jardin:4, maceta:2, banco_recibidor:3, banqueta:2, silla_madera:1,
    silla_oficina:1, alfombra:1, espejo:2, monitor:2, toallero:2, silla:1, chillout:3
  };
  var ALTO_DETALLE = {
    chimenea:1.0, encimera:0.95, isla:0.95, cama:0.6, libreria:1.6, escritorio:0.78,
    banera:0.52, lavabo_cajones:0.86, lavabo:0.9, sofa_tela:0.72, sofapiel:0.72,
    mesa_madera:0.78, mesa_comedor:0.78, mesa_centro:0.45, mesilla:0.5, inodoro:0.42,
    empotrado:1.9, nevera:1.5, columnas:1.3, columna:1.3, comoda:0.6, aparador:0.8,
    monitor:0.4, panel_listones:1.6, kallax:1.2, estanteria_metal:1.2
  };
  function puntos(m){ return (m.largo || 0.6) * (m.ancho || m.fondo || 0.6); }
  /* Las piezas de una estancia, ordenadas por importancia. */
  function mando(inte, est){
    var res = [];
    inte.muebles.forEach(function(m){
      if(!m.uv) return;
      var e = estanciaEn(inte, m.uv[0], m.uv[1]);
      if(!e || e.id !== est.id) return;
      var s = (PESO[m.tipo] || 2) + Math.min(3.5, puntos(m)*0.18) + Math.min(2.5, huella(m).alto*0.7);
      res.push({m:m, s:s});
    });
    res.sort(function(a,b){ return b.s - a.s; });
    return res.map(function(x){ return x.m; });
  }
  function altoDetalle(m){ return ALTO_DETALLE[m.tipo] || 1.0; }

  /* ------------------------------------------------------------------
     6. La cámara: colocación, FOV y mundo
     ------------------------------------------------------------------ */
  function aspecto(){
    var a = api(); if(!a || !a.camara) return 1;
    return a.camara.aspect || 1;
  }
  /* El FOV se define en horizontal y se pasa a vertical con el aspecto: en
     un teléfono en vertical el vertical se abre, nunca se queda en 46–49°. */
  function fovVertical(hfov){
    var h = Math.max(HFOV_MIN, Math.min(HFOV_MAX, hfov || 70));
    var v = 2*Math.atan(Math.tan(h*Math.PI/360)/aspecto())*180/Math.PI;
    return Math.max(VFOV_MIN, Math.min(VFOV_MAX, v));
  }
  /* El punto de mira, alargado si hace falta: el visor no deja bajar de 2 m
     de distancia, así que el rayo se estira (la dirección no cambia). */
  function miraLejana(pos, mira){
    var d = Math.hypot(pos[0]-mira[0], pos[1]-mira[1], pos[2]-mira[2]);
    if(d >= DIST_MIN) return mira;
    var k = (DIST_MIN - d)/(d || 1);
    return [mira[0] + (mira[0]-pos[0])*k, mira[1] + (mira[1]-pos[1])*k, mira[2] + (mira[2]-pos[2])*k];
  }
  /* Coloca la cámara: `pos` y `mira` en el mundo (x, y, z). */
  function coloca(pos, mira, hfov, sinTejado){
    var a = api(); if(!a || !a.aplicaVista) return;
    a.aplicaVista({desde:pos, hacia:miraLejana(pos, mira), fov:fovVertical(hfov), sinTejado:sinTejado});
  }
  /* De un punto del plano (u, v) y una altura local, la posición en el mundo. */
  function mundo(u, v, yLocal){
    var d = datos(); if(!d) return [0,0,0];
    var m = aMundo(u, v);
    return [m[0], d.suelo + (yLocal || 0), m[1]];
  }

  /* ------------------------------------------------------------------
     7. Las tomas
     ------------------------------------------------------------------ */
  function centroCasa(casa){
    var c = casa.contorno; if(!c || !c.length) return null;
    var u = 0, v = 0;
    c.forEach(function(p){ u += p[0]; v += p[1]; });
    return [u/c.length, v/c.length];
  }
  /* Un punto de cámara en el plano, apartado de los muros. */
  function sitioPlano(p, desde, altura){
    var u = p[0], v = p[1];
    for(var k=0;k<30;k++){
      if(sitioLibre(u, v, altura, null)) return [u, v];
      u += (desde[0]-u)*0.10 + (k%2 ? 0.4 : -0.4);
      v += (desde[1]-v)*0.10 + (k%3 ? 0.3 : -0.3);
    }
    return null;
  }

  function haceTomas(){
    var d = datos(); if(!d) return;
    var inte = d.inte, casa = d.casa;
    var ext = [];

    /* Las exteriores: la casa desde el jardín y la casa desde el aire. */
    var centro = centroCasa(casa);
    if(centro){
      var posE = sitioPlano([centro[0], centro[1] + 16], centro, 1.75);
      if(posE) ext.push({id:'EXT-casa', nombre:'La casa desde el jardín', plano:'general', dur:6.5,
                         hfov:76, rotulo:'La casa', pos:posE, y:1.75, mira:centro, ymira:2.4,
                         sinTejado:false, arboles:true, exterior:true});
      ext.push({id:'EXT-cenital', nombre:'La casa desde el aire', plano:'cenital', dur:6.0,
                hfov:80, rotulo:'Vista general', pos:[centro[0] + 6, centro[1] + 4], y:24,
                mira:centro, ymira:0, sinTejado:false, arboles:true, exterior:true, cenital:true});
    }

    /* Una tanda por estancia: cada estancia da sus tomas según la pieza que
       manda en ella. */
    var porEstancia = [];
    inte.estancias.forEach(function(est){
      var lista = mando(inte, est);
      if(!lista.length){
        /* Una estancia sin muebles (un pasillo) no tiene pieza que enseñar, pero
           sí es un espacio: se le hace un plano general mirando al centro. */
        var gen0 = tomaGeneral(est, null);
        if(gen0) porEstancia.push({est:est, tomas:[gen0]});
        return;
      }
      var foco = lista[0], segundo = lista[1] || lista[0];
      var techo = techoDe(est, (est.caja[1]+est.caja[3])/2);
      var suyas = [];
      var gen = tomaGeneral(est, foco); if(gen) suyas.push(gen);
      var lat = tomaLateral(est, segundo); if(lat) suyas.push(lat);
      var det = tomaDetalle(est, foco); if(det) suyas.push(det);
      var altoP = null;
      lista.forEach(function(m){ if(huella(m).alto >= 1.8 && (!altoP || huella(m).alto > huella(altoP).alto)) altoP = m; });
      if(altoP){
        var cp = tomaContrapicado(est, altoP);
        if(cp) suyas.push(cp);
      }
      var area = (est.caja[2]-est.caja[0])*(est.caja[3]-est.caja[1]);
      if(area >= 10 && !est.fuera){
        var cn = tomaCenital(est, foco, techo);
        if(cn) suyas.push(cn);
      }
      if(suyas.length) porEstancia.push({est:est, tomas:suyas});
    });

    /* El travelling: un arco alrededor de la pieza que manda de la estancia
       grande. Va en la lista de esa estancia, no aparte, para que el reparto
       justo de abajo lo tenga en cuenta. */
    var grande = null;
    inte.estancias.forEach(function(e){
      var a = (e.caja[2]-e.caja[0])*(e.caja[3]-e.caja[1]);
      if(!e.fuera && (!grande || a > grande.a)) grande = {e:e, a:a};
    });
    if(grande){
      for(var gi=0; gi<porEstancia.length; gi++){
        if(porEstancia[gi].est.id !== grande.e.id) continue;
        var lst = mando(inte, grande.e);
        if(!lst.length) break;
        var tr = tomaTravelling(grande.e, lst[0]);
        if(tr) porEstancia[gi].tomas.push(tr);
        break;
      }
    }

    /* El reparto es justo. Si se llena por orden de estancia, las últimas
       estancias se quedan sin plano (la lista se corta a 18). Aquí:
       1) un general por estancia (todas tienen su plano),
       2) el travelling (la toma estrella),
       3) el resto, primero uno por estancia y luego los que sobren. */
    var finales = [], cola = [];
    porEstancia.forEach(function(g){
      finales.push(g.tomas[0]);
      for(var i=1;i<g.tomas.length;i++) cola.push(g.tomas[i]);
    });
    var trav = null;
    for(var i=0;i<cola.length;i++) if(cola[i].travelling){ trav = cola.splice(i,1)[0]; break; }
    if(trav) finales.push(trav);
    var PRIO = {detalle:0, lateral:1, contrapicado:2, cenital:3};
    cola.sort(function(a,b){
      var pa = PRIO[a.plano] !== undefined ? PRIO[a.plano] : 9;
      var pb = PRIO[b.plano] !== undefined ? PRIO[b.plano] : 9;
      return pa - pb;
    });
    var usadas = {}, elegidas = [];
    for(var j=0;j<cola.length;j++){
      var t = cola[j];
      if(usadas[t.estancia]) continue;
      usadas[t.estancia] = 1; elegidas.push(t);
    }
    for(var k=0;k<cola.length;k++) if(elegidas.indexOf(cola[k]) < 0) elegidas.push(cola[k]);
    finales = finales.concat(elegidas);

    var todas = ext.concat(finales);
    if(todas.length > MAX_TOMAS) todas = todas.slice(0, MAX_TOMAS);
    TOMAS.length = 0;
    todas.forEach(function(t, i){
      t.i = i;
      t.rotulo = t.rotulo || t.nombre;
      TOMAS.push(t);
    });
  }

  /* La altura de una estancia: el suelo terminado está a `cota` sobre el
     terreno, así que la cámara a 1,62 m del suelo está a cota+1,62 del mundo. */
  function alto(est, h){ return (est.cota || 0) + h; }

  function tomaGeneral(est, pieza){
    var k = est.caja;
    var esquinas = [[k[0]+0.55, k[1]+0.55], [k[2]-0.55, k[1]+0.55], [k[0]+0.55, k[3]-0.55], [k[2]-0.55, k[3]-0.55]];
    var mejor = null;
    var yMira = alto(est, pieza ? 1.2 : 1.25);
    esquinas.forEach(function(c){
      if(!sitioLibre(c[0], c[1], OJO, null)) return;
      if(pieza && !lineaLibre(c[0], c[1], pieza.uv[0], pieza.uv[1], alto(est, OJO), yMira)) return;
      var dd = pieza ? Math.hypot(c[0]-pieza.uv[0], c[1]-pieza.uv[1]) : 3;
      var m = dd - (distMuro(c[0], c[1]) < 0.6 ? 2 : 0);
      if(!mejor || m > mejor.m) mejor = {u:c[0], v:c[1], m:m};
    });
    if(!mejor) return null;
    var mira = pieza ? [pieza.uv[0], pieza.uv[1]] : [(k[0]+k[2])/2, (k[1]+k[3])/2];
    return {id:'GEN-'+est.id, nombre:est.nombre, plano:'general', dur:5.0, hfov:72,
            rotulo:est.nombre, estancia:est.id, pos:[mejor.u, mejor.v], y:alto(est, OJO),
            mira:mira, ymira:alto(est, pieza ? 1.2 : 1.25), sinTejado:false, arboles:false};
  }

  function tomaLateral(est, pieza){
    var mk = marco(pieza);
    var d = [mk.c, -mk.s];                            // la derecha de la pieza
    for(var g=0; g<20; g++){
      var a = (g%2 ? 1 : -1)*Math.floor(g/2)*radians(12);
      var dx = d[0]*Math.cos(a) - d[1]*Math.sin(a), dz = d[0]*Math.sin(a) + d[1]*Math.cos(a);
      for(var k=0;k<4;k++){
        var dist = mk.h.hx + 1.9 - k*0.2;
        var u = pieza.uv[0] + dx*dist, v = pieza.uv[1] + dz*dist;
        if(sitioLibre(u, v, OJO, pieza) && distPieza(pieza, u, v) >= RETIRO_MUEBLE)
          return {id:'LAT-'+est.id+'-'+(pieza.id||''), nombre:est.nombre+' · perfil', plano:'lateral', dur:4.0,
                  hfov:66, rotulo:est.nombre, estancia:est.id, pos:[u, v], y:alto(est, OJO),
                  mira:[pieza.uv[0], pieza.uv[1]], ymira:alto(est, 1.15), sinTejado:false, arboles:false};
      }
    }
    return null;
  }

  function tomaDetalle(est, pieza){
    var mk = marco(pieza);
    var d = [mk.s, mk.c];                             // el frente de la pieza
    var y = altoDetalle(pieza);
    for(var g=0; g<20; g++){
      var a = (g%2 ? 1 : -1)*Math.floor(g/2)*radians(12);
      var dx = d[0]*Math.cos(a) - d[1]*Math.sin(a), dz = d[0]*Math.sin(a) + d[1]*Math.cos(a);
      for(var k=0;k<4;k++){
        /* El detalle se queda a 0,80–0,95 m de la cara de la pieza. El visor no
           deja acercar la cámara a menos de 2 m del punto de mira, así que el
           primer plano se consigue con el FOV corto, no acercando el objetivo. */
        var dist = mk.h.hz + 0.95 - k*0.05;
        var u = pieza.uv[0] + dx*dist, v = pieza.uv[1] + dz*dist;
        if(sitioLibre(u, v, y, pieza) && distPieza(pieza, u, v) >= 0.80)
          return {id:'DET-'+(pieza.id||est.id), nombre:'Detalle de '+(pieza.tipo||''), plano:'detalle',
                  dur:3.6, hfov:52, rotulo:est.nombre, estancia:est.id, pos:[u, v], y:alto(est, y),
                  mira:[pieza.uv[0], pieza.uv[1]], ymira:alto(est, y), sinTejado:false, arboles:false};
      }
    }
    return null;
  }

  function tomaContrapicado(est, pieza){
    var mk = marco(pieza);
    var d = [mk.s, mk.c];
    var yCam = 0.62;
    for(var g=0; g<20; g++){
      var a = (g%2 ? 1 : -1)*Math.floor(g/2)*radians(12);
      var dx = d[0]*Math.cos(a) - d[1]*Math.sin(a), dz = d[0]*Math.sin(a) + d[1]*Math.cos(a);
      for(var k=0;k<5;k++){
        var dist = mk.h.hz + 2.6 - k*0.3;
        var u = pieza.uv[0] + dx*dist, v = pieza.uv[1] + dz*dist;
        if(!sitioLibre(u, v, yCam, pieza)) continue;
        if(distPieza(pieza, u, v) < RETIRO_MUEBLE) continue;
        /* El punto de mira sube, pero no más de lo que permite la órbita. */
        var dy = Math.tan(radians(ELEV_MAX))*dist;
        var yMira = Math.min(huella(pieza).alto, yCam + dy);
        if(yMira - yCam < 0.28) yMira = yCam + 0.28;
        return {id:'CON-'+(pieza.id||est.id), nombre:'Contrapicado', plano:'contrapicado', dur:4.2,
                hfov:74, rotulo:est.nombre, estancia:est.id, pos:[u, v], y:alto(est, yCam),
                mira:[pieza.uv[0], pieza.uv[1]], ymira:alto(est, yMira), sinTejado:false, arboles:false};
      }
    }
    return null;
  }

  function tomaCenital(est, pieza, techo){
    var yCam = Math.min(techo - 0.35, 2.35);
    if(yCam < 1.6) return null;
    var mk = marco(pieza);
    var d = [mk.s, mk.c];
    for(var g=0; g<16; g++){
      var a = (g%2 ? 1 : -1)*Math.floor(g/2)*radians(15);
      var dx = d[0]*Math.cos(a) - d[1]*Math.sin(a), dz = d[0]*Math.sin(a) + d[1]*Math.cos(a);
      var u = pieza.uv[0] + dx*0.85, v = pieza.uv[1] + dz*0.85;
      if(!sitioLibre(u, v, yCam, pieza)) continue;
      return {id:'CEN-'+est.id, nombre:'Cenital de '+(pieza.tipo||''), plano:'cenital', dur:4.0,
              hfov:78, rotulo:est.nombre, estancia:est.id, pos:[u, v], y:alto(est, yCam),
              mira:[pieza.uv[0], pieza.uv[1]], ymira:alto(est, 0.05), sinTejado:true, arboles:false, cenital:true};
    }
    return null;
  }

  function tomaTravelling(est, pieza){
    var mk = marco(pieza);
    var centro = mk.uv;
    var rmax = 9;
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(dd){
      var libre = 0;
      for(var s=8;s>=1.5;s-=0.25){
        var uu = centro[0] + dd[0]*s, vv = centro[1] + dd[1]*s;
        if(sitioLibre(uu, vv, OJO, pieza) && enEstancia(est, uu, vv)){ libre = s; break; }
      }
      if(libre < rmax) rmax = libre;
    });
    var R = Math.max(2.3, Math.min(4.6, rmax - 0.45));
    var a0 = Math.atan2(mk.s, mk.c) - radians(38);
    var barrido = radians(46);
    var n = 9, validas = 0, anterior = null;
    for(var i=0;i<n;i++){
      var a = a0 + barrido*i/(n-1);
      var u = centro[0] + Math.sin(a)*R, v = centro[1] + Math.cos(a)*R;
      if(sitioLibre(u, v, OJO, pieza) && enEstancia(est, u, v)){
        validas++;
        /* y el arco no cruza ningún tabique entre un punto y el siguiente */
        if(anterior && !segmentoLibre(anterior[0], anterior[1], u, v)) validas = -99;
        anterior = [u, v];
      }
    }
    if(validas < n - 1) return null;
    return {id:'TRA-'+est.id, nombre:'Travelling', plano:'travelling', dur:7.0, hfov:70,
            rotulo:est.nombre, estancia:est.id, travelling:true, y:alto(est, OJO),
            arco:{centro:centro, r:R, a0:a0, barrido:barrido},
            mira:[pieza.uv[0], pieza.uv[1]], ymira:alto(est, 1.15), sinTejado:false, arboles:false};
  }
  function enEstancia(est, u, v){
    var k = est.caja;
    return u > k[0] && u < k[2] && v > k[1] && v < k[3];
  }

  /* ------------------------------------------------------------------
     8. El recorrido automático interior
     ------------------------------------------------------------------ */
  /* Los vanos que unen dos estancias: por las puertas y por los pasos sin
     muro. Se compara el borde compartido con los tramos de muro que hay
     encima: lo que no es muro es un paso. */
  function conexiones(inte){
    var res = [], ests = inte.estancias;
    for(var i=0;i<ests.length;i++) for(var j=i+1;j<ests.length;j++){
      var A = ests[i], B = ests[j];
      pares(A, B, 'v', A.caja[2], B.caja[0]);
      pares(A, B, 'v', B.caja[2], A.caja[0]);
      pares(A, B, 'h', A.caja[3], B.caja[1]);
      pares(A, B, 'h', B.caja[3], A.caja[1]);
    }
    function pares(A, B, eje, la, lb){
      if(Math.abs(la - lb) > 0.14) return;
      var int = eje === 'v'
        ? [Math.max(A.caja[1], B.caja[1]), Math.min(A.caja[3], B.caja[3])]
        : [Math.max(A.caja[0], B.caja[0]), Math.min(A.caja[2], B.caja[2])];
      if(int[1] - int[0] < 0.55) return;
      libres(la, eje, int).forEach(function(s){
        var u = eje === 'v' ? la : (s[0]+s[1])/2;
        var v = eje === 'v' ? (s[0]+s[1])/2 : la;
        res.push({a:A.id, b:B.id, u:u, v:v, eje:eje, linea:la, span:s});
      });
    }
    return res;
  }
  /* Un punto libre de la estancia desde el que se ve bien la pieza. */
  function puntoVista(inte, est, pieza, desde){
    var k = est.caja, mejor = null;
    var alturaMira = (est.cota||0) + 1.2;
    for(var u = k[0]+0.45; u <= k[2]-0.35; u += 0.3){
      for(var v = k[1]+0.45; v <= k[3]-0.35; v += 0.3){
        if(!sitioLibre(u, v, OJO, null)) continue;
        var dd = pieza ? Math.hypot(u - pieza.uv[0], v - pieza.uv[1]) : 2.5;
        if(dd < 1.1) continue;
        var m = -Math.abs(dd - 2.5);
        if(distMuro(u, v) < 0.6) m -= 1.2;
        if(cercanoAMueble(u, v, 0.4)) m -= 1.5;                 // no flotar encima de un mueble
        if(pieza && !lineaLibre(u, v, pieza.uv[0], pieza.uv[1], (est.cota||0)+OJO, alturaMira)) continue;
        if(desde && !segmentoLibre(desde[0], desde[1], u, v)) continue;
        if(!mejor || m > mejor.m) mejor = {u:u, v:v, m:m};
      }
    }
    return mejor;
  }
  /* ¿Hay un mueble pegado a este punto? (el cuerpo de la cámara) */
  function cercanoAMueble(u, v, r){
    var d = datos(); if(!d) return false;
    for(var i=0;i<d.inte.muebles.length;i++){
      var m = d.inte.muebles[i];
      if(!m.uv) continue;
      if(distPieza(m, u, v) < r) return true;
    }
    return false;
  }
  /* El tramo entre dos puntos no atraviesa muebles ni muros. */
  function segmentoLibre(u0, v0, u1, v1){
    var L = Math.hypot(u1-u0, v1-v0);
    var n = Math.max(8, Math.ceil(L/0.22));
    for(var i=1;i<n;i++){
      var t = i/n, u = u0 + (u1-u0)*t, v = v0 + (v1-v0)*t;
      if(distMuro(u, v) < 0.05) return false;
      if(dentroDeMueble(u, v, 0.5, null, 0.3)) return false;
    }
    return true;
  }
  /* La ruta: una cadena de estancias unidas por sus vanos, en el orden en que
     las da la casa, con una parada informativa en cada una. Si se llega a un
     callejón sin salida, se vuelve por donde se vino y se sigue. */
  function haceRutas(){
    var d = datos(); if(!d) return;
    var inte = d.inte;
    var con = conexiones(inte);
    var ests = inte.estancias;
    var orden = ests.map(function(e){ return e.id; });
    if(!orden.length) return;
    var vecinos = function(room){
      var r = [];
      con.forEach(function(c){
        var otro = (c.a === room) ? c.b : (c.b === room ? c.a : null);
        if(!otro) return;
        r.push({otro:otro, puerta:c, p:orden.indexOf(otro)});
      });
      return r;
    };
    var visitados = {}, pila = [{room:orden[0], puerta:null}], pasos = [];
    visitados[orden[0]] = 1;
    var seguir = true, vueltas = 0;
    while(seguir && vueltas < 80){
      vueltas++;
      var act = pila[pila.length-1];
      var cands = vecinos(act.room).filter(function(c){ return !visitados[c.otro]; });
      cands.sort(function(a,b){ return a.p - b.p; });
      if(cands.length){
        var c = cands[0];
        visitados[c.otro] = 1;
        pasos.push({room:c.otro, puerta:c.puerta, vuelta:false});
        pila.push({room:c.otro, puerta:c.puerta});
      } else {
        var prev = pila.pop();
        if(!pila.length){ seguir = false; break; }
        var padre = pila[pila.length-1];
        pasos.push({room:padre.room, puerta:prev.puerta, vuelta:true});
      }
    }
    /* Los puntos: la vista de cada estancia y el vano que la une con la
       siguiente. Al volver por donde se vino, se pasa otra vez por la vista
       de la estancia de la que se vuelve: si no, la línea entre dos vanos
       atraviesa el muro que hay entre medias. */
    var puntos = [], paradas = [], hecha = {};
    function paradaDe(room, reinsertar){
      var est = estanciaDe(inte, room); if(!est) return;
      if(hecha[room]){
        if(!reinsertar) return;
        var ant = puntos[hecha[room]];
        if(ant) puntos.push({u:ant.u, v:ant.v, y:ant.y, info:false, mira:null, rotulo:null});
        return;
      }
      var lista = mando(inte, est), foco = lista[0] || null;
      var pv = puntoVista(inte, est, foco, null);
      if(!pv) return;
      var mira = foco ? [foco.uv[0], foco.uv[1], (est.cota||0) + 1.15]
                      : [(est.caja[0]+est.caja[2])/2, (est.caja[1]+est.caja[3])/2, (est.cota||0) + 1.2];
      var idx = puntos.length;
      var p = {u:pv.u, v:pv.v, y:(est.cota||0), info:true, mira:mira, rotulo:est.nombre};
      puntos.push(p);
      paradas.push({nombre:est.nombre, p:p, s:0, mira:mira});
      hecha[room] = idx;
    }
    paradaDe(orden[0]);                                // la estancia de la que se parte
    pasos.forEach(function(paso){
      var est = estanciaDe(inte, paso.room); if(!est) return;
      if(paso.puerta) puntos.push({u:paso.puerta.u, v:paso.puerta.v, y:(est.cota||0), info:false, mira:null, rotulo:null});
      paradaDe(paso.room, paso.vuelta);
    });
    if(puntos.length < 2) return;
    /* Si algún tramo atraviesa un muro o un mueble, se mete un punto
       intermedio: el centro de la estancia, que está en medio de todo. */
    for(var i=1;i<puntos.length;i++){
      var a = puntos[i-1], b = puntos[i];
      if(segmentoLibre(a.u, a.v, b.u, b.v)) continue;
      var estB = estanciaEn(inte, b.u, b.v);
      if(!estB) continue;
      var cx = (estB.caja[0]+estB.caja[2])/2, cy = (estB.caja[1]+estB.caja[3])/2;
      if(!segmentoLibre(a.u, a.v, cx, cy) || !segmentoLibre(cx, cy, b.u, b.v)) continue;
      puntos.splice(i, 0, {u:cx, v:cy, y:b.y, info:false, mira:null, rotulo:null});
    }
    var s = 0;
    puntos.forEach(function(p, i){
      if(i) s += Math.hypot(p.u - puntos[i-1].u, p.v - puntos[i-1].v);
      p.s = s;
    });
    paradas.forEach(function(p){ p.s = p.p.s; });
    E.rutas = [{id:'interior', nombre:'Recorrido interior', puntos:puntos, paradas:paradas, largo:s}];
  }
  function posEnRuta(R, s){
    var p = R.puntos, i = 0;
    while(i < p.length - 2 && p[i+1].s < s) i++;
    var a = p[i], b = p[Math.min(i+1, p.length-1)], dd = b.s - a.s;
    var k = dd > 1e-6 ? Math.max(0, Math.min(1, (s - a.s)/dd)) : 0;
    return {u:a.u + (b.u - a.u)*k, v:a.v + (b.v - a.v)*k, y:a.y + ((b.y||0) - (a.y||0))*k};
  }
  /* El rumbo se saca mirando un poco por delante y otro poco por detrás: si no,
     en cada esquina la cámara da un latigazo de golpe. */
  function miraEnRuta(R, s){
    var a = posEnRuta(R, Math.max(0, s - 1.0)), b = posEnRuta(R, Math.min(R.largo, s + 2.2));
    var p = posEnRuta(R, s);
    var dx = b.u - a.u, dz = b.v - a.v, n = Math.hypot(dx, dz);
    if(n < 1e-4) return [p.u, p.v];
    return [p.u + dx/n*2.5, p.v + dz/n*2.5];
  }

  /* ------------------------------------------------------------------
     9. El HUD
     ------------------------------------------------------------------ */
  var CSS = [
    ':root{--adc-barra:0px}',
    '#adc-banda{position:fixed;left:0;right:0;pointer-events:none;z-index:24;display:none}',
    '#adc-banda.on{display:block}',
    '#adc-banda i{position:absolute;left:0;right:0;height:0;background:#000;display:block}',
    '#adc-fondo{position:fixed;left:0;right:0;top:0;bottom:0;background:#000;opacity:0;pointer-events:none;z-index:25;display:none}',
    '#adc-fondo.on{display:block}',
    /* El rótulo va DENTRO del encuadre: con la banda apagada caía en la barra
       negra de abajo y no se leía. */
    '#adc-titulo{position:fixed;left:0;right:0;bottom:calc(var(--adc-barra) + 58px);text-align:center;color:#fff;z-index:26;',
    '  pointer-events:none;opacity:0;transition:opacity .45s ease;font:600 15px/1.3 system-ui,sans-serif;',
    '  text-shadow:0 2px 10px rgba(0,0,0,.75)}',
    '#adc-titulo.on{opacity:1}',
    '#adc-titulo span{display:inline-block;background:rgba(0,0,0,.45);padding:7px 14px;border-radius:4px;',
    '  border-left:3px solid var(--accent,#4ab5cb)}',
    /* El botón, arriba a la derecha DENTRO del encuadre (ahí estaba la barra
       de Fabrick, que en cine se aparta). Los controles, como una hoja desde
       abajo: en un móvil, un panel de 320 px tapaba la mitad de la pantalla. */
    '#adc-btn{position:fixed;right:12px;top:calc(var(--adc-barra) + 12px);z-index:27;min-width:56px;min-height:44px;padding:9px 14px;',
    '  font:600 12.5px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;',
    '  color:var(--ink,#e9ede2);background:var(--surface,#181c16);border:1px solid var(--line,#2c3328);',
    '  border-radius:4px;box-shadow:0 6px 18px rgba(0,0,0,.35)}',
    '#adc-btn[aria-pressed="true"]{background:var(--accent,#4ab5cb);color:var(--accent-ink,#06222a);border-color:var(--accent,#4ab5cb)}',
    '#adc-btn:focus-visible{outline:2px solid var(--accent,#4ab5cb);outline-offset:2px}',
    '#adc-panel{position:fixed;left:8px;right:8px;bottom:calc(var(--adc-barra) + 8px);z-index:28;',
    '  max-height:min(46dvh,430px);overflow:auto;display:none;padding:12px;border-radius:8px;',
    '  background:var(--surface,#181c16);border:1px solid var(--line,#2c3328);',
    '  box-shadow:0 12px 34px rgba(0,0,0,.45);color:var(--ink,#e9ede2);font:13px/1.4 system-ui,sans-serif}',
    '#adc-panel.on{display:block}',
    '#adc-panel h2{margin:0 0 8px;font:600 11px/1 system-ui,sans-serif;letter-spacing:.12em;',
    '  text-transform:uppercase;color:var(--muted,#8d9683)}',
    '#adc-panel .fila{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
    '#adc-panel button.t{min-height:44px;min-width:44px;padding:8px 11px;font:600 12.5px/1.1 inherit;',
    '  color:var(--ink,#e9ede2);background:var(--surface-2,#20251e);border:1px solid var(--line,#2c3328);',
    '  border-radius:4px;cursor:pointer;flex:1 1 auto}',
    '#adc-panel button.t:active{transform:translateY(1px)}',
    '#adc-panel button.t[aria-pressed="true"]{background:var(--accent,#4ab5cb);color:var(--accent-ink,#06222a);border-color:var(--accent,#4ab5cb)}',
    '#adc-panel button.t:focus-visible{outline:2px solid var(--accent,#4ab5cb);outline-offset:2px}',
    '#adc-panel ol{list-style:none;margin:0 0 10px;padding:0}',
    '#adc-panel ol li{margin:0 0 4px}',
    '#adc-panel ol button{width:100%;min-height:44px;text-align:left;padding:9px 11px;font:inherit;',
    '  color:var(--ink-2,#c2c9b9);background:transparent;border:1px solid var(--line-soft,#242a20);',
    '  border-radius:4px;cursor:pointer;display:flex;gap:8px;align-items:center}',
    '#adc-panel ol button[aria-current="true"]{border-color:var(--accent,#4ab5cb);color:var(--ink,#e9ede2)}',
    '#adc-panel ol button em{font-style:normal;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;',
    '  color:var(--muted,#8d9683);margin-left:auto}',
    '#adc-panel label{display:block;margin:2px 0 8px;font-size:11.5px;color:var(--muted,#8d9683)}',
    '#adc-panel input[type=range]{width:100%;min-height:44px;accent-color:var(--accent,#4ab5cb)}',
    '#adc-panel .aviso{font-size:11.5px;color:var(--muted,#8d9683);margin:8px 0 0;line-height:1.45}',
    /* Mientras hay cine, el HUD del visor (brújula, escala, ficha, etiquetas)
       se aparta: con la banda de cine encima quedaba tapado y estorbaba.
       Y el botón del plano tampoco: cine y planta son excluyentes. */
    'body.adc-cine #brujula,body.adc-cine #escala,body.adc-cine #hud,body.adc-cine #etiquetas,',
    'body.adc-cine #ids,body.adc-cine #mira,body.adc-cine #tour-hud,body.adc-cine #ir-pie,',
    'body.adc-cine #salir-pie,body.adc-cine #puerta-pie,body.adc-cine #version-pie,',
    'body.adc-cine #correr-pie,body.adc-cine #noche-pie,body.adc-cine #llevar-pie,',
    'body.adc-cine #todo-pie,body.adc-cine #ajustes-pie,body.adc-cine #ajustes-caja,',
    'body.adc-cine #pie-aviso,body.adc-cine #panel,body.adc-cine #abrir-panel,body.adc-cine #fabrick,',
    'body.adc-cine #plano-btn{display:none!important}'
  ].join('\n');

  function creaHUD(){
    if(HUD) return HUD;
    var est = document.createElement('style');
    est.id = 'adc-estilo'; est.textContent = CSS;
    document.head.appendChild(est);

    var banda = document.createElement('div'); banda.id = 'adc-banda';
    banda.innerHTML = '<i data-arriba></i><i data-abajo></i>';
    document.body.appendChild(banda);

    var fondo = document.createElement('div'); fondo.id = 'adc-fondo';
    document.body.appendChild(fondo);

    var tit = document.createElement('div'); tit.id = 'adc-titulo';
    tit.innerHTML = '<span></span>';
    document.body.appendChild(tit);

    var btn = document.createElement('button');
    btn.id = 'adc-btn'; btn.type = 'button'; btn.textContent = 'Cine';
    btn.setAttribute('aria-pressed','false');
    btn.addEventListener('click', function(){ alterna(); });
    document.body.appendChild(btn);

    var panel = document.createElement('div'); panel.id = 'adc-panel';
    panel.setAttribute('role','region'); panel.setAttribute('aria-label','Cámaras cinematográficas');
    panel.innerHTML =
      '<h2>Cine</h2>' +
      '<div class="fila">' +
        '<button class="t" data-accion="atras" aria-label="Toma anterior">◀</button>' +
        '<button class="t" data-accion="play">Pausa</button>' +
        '<button class="t" data-accion="adelante" aria-label="Toma siguiente">▶</button>' +
      '</div>' +
      '<ol data-lista></ol>' +
      '<label>Velocidad <b data-vel>1,00×</b></label>' +
      '<input type="range" data-vel-range min="0.25" max="2" step="0.25" value="1">' +
      '<div class="fila">' +
        '<button class="t" data-op="lb" aria-pressed="false">Letterbox</button>' +
        '<button class="t" data-op="rot" aria-pressed="true">Rótulos</button>' +
        '<button class="t" data-op="fundido" aria-pressed="false">Fundido</button>' +
        '<button class="t" data-op="k4" aria-pressed="false">Alta</button>' +
      '</div>' +
      '<div class="fila">' +
        '<button class="t" data-accion="paseo">Recorrido interior</button>' +
        '<button class="t" data-accion="salir">Salir</button>' +
      '</div>' +
      '<p class="aviso" data-info></p>';
    document.body.appendChild(panel);

    HUD = {banda:banda, fondo:fondo, titulo:tit, btn:btn, panel:panel,
           lista:panel.querySelector('[data-lista]'), vel:panel.querySelector('[data-vel]'),
           rango:panel.querySelector('[data-vel-range]'), info:panel.querySelector('[data-info]')};
    HUD.arriba = banda.querySelector('[data-arriba]');
    HUD.abajo = banda.querySelector('[data-abajo]');

    panel.addEventListener('click', function(ev){
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if(!b) return;
      ev.stopPropagation();
      var acc = b.dataset.accion, op = b.dataset.op;
      if(acc === 'play'){ E.play ? pausa() : reproduce(); return; }
      if(acc === 'atras'){ irA(E.i - 1); return; }
      if(acc === 'adelante'){ irA(E.i + 1); return; }
      if(acc === 'salir'){ cerrar(); return; }
      if(acc === 'paseo'){
        if(E.modo === 'paseo' && E.cede){ E.cede = false; E.play = true; refrescaPanel(); return; }
        modoPaseo(E.modo !== 'paseo');
        return;
      }
      if(op === 'lb'){ letra(!E.lb); refrescaPanel(); return; }
      if(op === 'rot'){ E.rot = !E.rot; if(!E.rot) titulo(''); refrescaPanel(); return; }
      if(op === 'fundido'){ E.fundido = !E.fundido; if(!E.fundido) fundido(0); refrescaPanel(); return; }
      if(op === 'k4'){ calidad4K(!E.k4); return; }
    });
    HUD.rango.addEventListener('input', function(){
      E.vel = parseFloat(HUD.rango.value);
      HUD.vel.textContent = E.vel.toFixed(2).replace('.', ',') + '×';
    });
    HUD.rango.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    HUD.vel.textContent = '1,00×';
    return HUD;
  }

  function pintaLista(){
    if(!HUD) return;
    var html = '';
    TOMAS.forEach(function(t, i){
      html += '<li><button type="button" data-i="'+i+'"'+(i === E.i ? ' aria-current="true"' : '')+'>' +
              '<span>'+(t.rotulo || t.nombre)+'</span><em>'+(NOM_PLANO[t.plano]||t.plano)+'</em></button></li>';
    });
    HUD.lista.innerHTML = html;
    [].forEach.call(HUD.lista.querySelectorAll('button'), function(b){
      b.addEventListener('click', function(e){ e.stopPropagation(); irA(parseInt(b.dataset.i, 10)); });
    });
  }
  function marcaLista(){
    if(!HUD) return;
    [].forEach.call(HUD.lista.querySelectorAll('button'), function(b){
      if(parseInt(b.dataset.i, 10) === E.i) b.setAttribute('aria-current','true');
      else b.removeAttribute('aria-current');
    });
  }
  function refrescaPanel(){
    if(!HUD) return;
    var b = HUD.panel.querySelector('[data-accion="play"]');
    if(b) b.textContent = E.play ? 'Pausa' : 'Seguir';
    ['lb','rot','fundido','k4'].forEach(function(k){
      var q = HUD.panel.querySelector('[data-op="'+k+'"]');
      if(q) q.setAttribute('aria-pressed', String(!!E[k]));
    });
    var ps = HUD.panel.querySelector('[data-accion="paseo"]');
    if(ps) ps.textContent = E.modo === 'paseo' ? (E.cede ? 'Seguir el recorrido' : 'Volver al cine') : 'Recorrido interior';
    if(HUD.info && !E.cede) HUD.info.textContent = TOMAS.length
      ? TOMAS.length + ' tomas · las posiciones se validan contra los muros y los muebles'
      : 'Sin tomas: la casa todavía no está cargada';
  }
  function letra(v){
    E.lb = v;
    if(!HUD) return;
    HUD.banda.classList.toggle('on', !!v);
    ajustaBanda();
  }
  function ajustaBanda(){
    if(!HUD) return;
    var h = window.innerHeight || 844, w = window.innerWidth || 390;
    /* El encuadre de cine: 2,35:1 si cabe, pero la banda no se come más del
       11 % de la pantalla por arriba (en un móvil, 340 px de negro no dejan
       ver nada). */
    var barra = E.lb ? Math.min((h - w/2.35)/2, h*0.11) : 0;
    if(!(barra > 0)) barra = 0;
    HUD.arriba.style.height = barra.toFixed(0)+'px';
    HUD.abajo.style.height = barra.toFixed(0)+'px';
    /* el HUD se coloca respecto a la banda: todo lo que sea del cine queda
       dentro del encuadre y nunca debajo de la banda negra */
    var r = document.documentElement;
    if(r && r.style && r.style.setProperty) r.style.setProperty('--adc-barra', barra.toFixed(0)+'px');
  }
  /* Marca el cuerpo para que el CSS aparte el HUD del visor mientras hay cine. */
  function marcaCine(on){
    var b = document.body;
    if(b && b.classList) b.classList.toggle('adc-cine', !!on);
  }
  function titulo(txt){
    if(!HUD) return;
    var t = HUD.titulo.querySelector('span');
    if(!txt){ HUD.titulo.classList.remove('on'); return; }
    if(!t) return;
    t.textContent = txt;
    HUD.titulo.classList.add('on');
  }
  function fundido(v){
    if(!HUD) return;
    HUD.fondo.classList.toggle('on', v > 0.001);
    HUD.fondo.style.opacity = String(Math.max(0, Math.min(1, v)));
  }

  /* ------------------------------------------------------------------
     10. Estados: abrir, cerrar, cine, paseo
     ------------------------------------------------------------------ */
  function construye(){
    var d = datos(); if(!d) return false;
    E.version = d.version;
    cacheLineas = null;
    haceTomas();
    haceRutas();
    E.listo = true;
    return true;
  }
  /* Las tomas se calculan al cargar: la casa ya está y así el primer toque en
     «Cine» no tarda (en un móvil, medio segundo se nota). Las rutas se hacen
     la primera vez que se pide el recorrido, que es más lento. */
  function preparaTomas(){
    var d = datos(); if(!d) return false;
    if(E.version === d.version && TOMAS.length) return true;
    E.version = d.version;
    cacheLineas = null;
    try{ haceTomas(); }catch(e){ return false; }
    return true;
  }
  function abre(){
    if(!api()) return false;
    var d = datos(); if(!d) return false;
    /* La planta 3D y el cine son excluyentes: los dos escriben la cámara en
       cada cuadro y se pisarían. Si la planta está abierta, se cierra. */
    if(window.AD && AD.plano && AD.plano.cerrar && AD.plano.esPlan3D && AD.plano.esPlan3D()) AD.plano.cerrar();
    /* Y con el paseo a pie: el visor repone la cámara desde `pie` en cada
       cuadro, y las dos se pisarían. */
    if(!libreDePaseo()){
      if(HUD) HUD.info.textContent = 'No se ha podido salir del paseo a pie.';
      return false;
    }
    if(!E.listo || E.version !== d.version) construye();
    creaHUD();
    HUD.panel.classList.add('on');
    HUD.btn.setAttribute('aria-pressed','true');
    marcaCine(true);
    guardaCapas();
    E.modo = 'cine';
    E.i = Math.max(0, Math.min(TOMAS.length - 1, E.i));
    E.t = 0; E.play = true;
    pintaLista(); refrescaPanel();
    if(TOMAS.length) aplicaToma(E.i);
    return true;
  }
  function cierra(){
    if(!HUD) return;
    E.modo = null; E.play = false; E.cede = false;
    HUD.panel.classList.remove('on');
    HUD.btn.setAttribute('aria-pressed','false');
    letra(false); fundido(0); titulo('');
    restauraCapas();
    if(E.k4) calidad4K(false);
    marcaCine(false);
  }
  function alterna(){ if(E.modo) cierra(); else abre(); }

  function guardaCapas(){
    var a = api(); if(!a || !a.capas || E.capAntes) return;
    E.capAntes = {cubierta:a.capas.cubierta.visible, arboles:a.capas.arboles.visible};
    E.camAntes = guardaCamara();
  }
  function restauraCapas(){
    var a = api(); if(!a || !a.capas || !E.capAntes) return;
    a.capas.cubierta.visible = E.capAntes.cubierta;
    a.capas.arboles.visible = E.capAntes.arboles;
    var c1 = document.getElementById('capa-cubierta'), c2 = document.getElementById('capa-arboles');
    if(c1) c1.checked = E.capAntes.cubierta;
    if(c2) c2.checked = E.capAntes.arboles;
    E.capAntes = null;
    if(E.camAntes){ restauraCamara(E.camAntes); E.camAntes = null; }
  }
  /* La cámara de antes del cine. El visor no expone el estado de la órbita, se
     deduce de la cámara: el objetivo está a y=1 (es lo que pone aplicaVista),
     así que la distancia se saca de la altura de la cámara. */
  function guardaCamara(){
    var a = api(); if(!a || !a.camara || typeof THREE === 'undefined') return null;
    var cam = a.camara, P = cam.position, dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    var u = dir.clone().negate();                    // del objetivo a la cámara
    if(u.y < 0.08) return null;                      // la cámara está por debajo: no se sabe
    var dist = (P.y - 1)/u.y;
    if(!isFinite(dist) || dist <= 0) return null;
    var obj = P.clone().addScaledVector(u, -dist);
    return {d:dist, t:Math.atan2(u.x, u.z)*180/Math.PI,
            p:Math.acos(Math.max(-1, Math.min(1, u.y)))*180/Math.PI,
            c:[obj.x, obj.z], fov:cam.fov};
  }
  function restauraCamara(c){
    var a = api(); if(!c || !a.aplicaVista) return;
    a.aplicaVista({d:c.d, t:c.t, p:c.p, c:c.c, fov:c.fov});
  }
  /* El paseo a pie y el tour de caminos mueven la cámara en cada cuadro: con el
     cine puesto se pisarían. Se sale de ellos antes de entrar. */
  function libreDePaseo(){
    var a = api();
    if(a && a.TOUR && a.TOUR.activo) a.TOUR.activo = false;   // el tour va con el paseo
    if(a && a.pie && a.pie.activo){
      var s = a.salirPie || (window.__visor && window.__visor.salirPie);
      if(s){ s(); return true; }
      return false;                        // no se ha podido salir: no se entra
    }
    return true;
  }
  function ponArboles(v){
    var a = api(); if(!a || !a.capas) return;
    a.capas.arboles.visible = v;
    var c = document.getElementById('capa-arboles'); if(c) c.checked = v;
  }

  function aplicaToma(i){
    var t = TOMAS[i]; if(!t) return;
    var pos, mira;
    if(t.travelling){
      var c = t.arco.centro;
      pos = mundo(c[0] + Math.sin(t.arco.a0)*t.arco.r, c[1] + Math.cos(t.arco.a0)*t.arco.r, t.y);
    } else {
      pos = mundo(t.pos[0], t.pos[1], t.y);
    }
    mira = mundo(t.mira[0], t.mira[1], t.ymira);
    var a = api();
    if(a && a.aplicaVista && t.sinTejado !== undefined)
      a.aplicaVista({desde:pos, hacia:miraLejana(pos, mira), fov:fovVertical(t.hfov), sinTejado:t.sinTejado});
    coloca(pos, mira, t.hfov);
    ponArboles(!!t.arboles);
    if(E.rot && t.rotulo) titulo(t.rotulo); else titulo('');
    marcaLista();
  }

  function reproduce(){ E.play = true; refrescaPanel(); }
  function pausa(){ E.play = false; refrescaPanel(); }
  function irA(i){
    if(!TOMAS.length) return;
    E.i = (i + TOMAS.length) % TOMAS.length;
    E.t = 0;
    if(E.modo === 'paseo'){ E.modo = 'cine'; E.cede = false; }
    aplicaToma(E.i);
  }
  function modoCine(v){
    if(v){ if(!E.modo) abre(); else if(E.modo === 'paseo'){ E.modo = 'cine'; E.cede = false; if(TOMAS.length) aplicaToma(E.i); } }
    else if(E.modo === 'cine') cierra();
  }
  function calidad4K(v){
    E.k4 = !!v;
    var a = api(); if(!a || !a.renderer) return;
    var r = a.renderer, sol = null;
    if(a.escena) a.escena.traverse(function(o){ if(o.isDirectionalLight && o.castShadow && !sol) sol = o; });
    if(v){
      if(!E.pxAntes) E.pxAntes = r.getPixelRatio ? r.getPixelRatio() : 1;
      /* El dpr tiene tope (2). Y el mapa de sombras NO se agranda: 4096 son
         64 MB de VRAM y en un móvil matan la pestaña. Como mucho se recorta a
         2048 si el dispositivo traía más. */
      r.setPixelRatio(Math.min(DPR_MAX, Math.max(E.pxAntes, Math.min(window.devicePixelRatio || 1, DPR_MAX))));
      if(sol && sol.shadow.mapSize.x > SOMBRA_MAX){
        if(!E.sombraAntes) E.sombraAntes = sol.shadow.mapSize.x;
        sol.shadow.mapSize.set(SOMBRA_MAX, SOMBRA_MAX);
        if(sol.shadow.map){ sol.shadow.map.dispose(); sol.shadow.map = null; }
      }
      if(r.shadowMap) r.shadowMap.needsUpdate = true;
    } else {
      r.setPixelRatio(E.pxAntes || Math.min(window.devicePixelRatio || 1, DPR_MAX));
      if(sol && E.sombraAntes){
        sol.shadow.mapSize.set(E.sombraAntes, E.sombraAntes);
        if(sol.shadow.map){ sol.shadow.map.dispose(); sol.shadow.map = null; }
      }
      E.sombraAntes = 0; E.pxAntes = 0;
    }
    refrescaPanel();
  }

  /* El recorrido automático interior. */
  function modoPaseo(v){
    var d = datos(); if(!d) return;
    if(v){
      if(!E.rutas.length) haceRutas();
      if(!E.rutas.length) return;
      /* La planta 3D y el cine son excluyentes, y con el paseo a pie también:
         el visor repone la cámara desde `pie` en cada cuadro. */
      if(window.AD && AD.plano && AD.plano.cerrar && AD.plano.esPlan3D && AD.plano.esPlan3D()) AD.plano.cerrar();
      if(!libreDePaseo()){
        if(HUD) HUD.info.textContent = 'No se ha podido salir del paseo a pie.';
        return;
      }
      if(E.modo !== 'paseo') guardaCapas();
      E.modo = 'paseo'; E.s = 0; E.paradaI = 0; E.paradaT = 0; E.cede = false;
      E.play = true; E.arrYaw = 0; E.arrPitch = 0; E.mirando = 0;
      if(HUD){ HUD.panel.classList.add('on'); HUD.btn.setAttribute('aria-pressed','true'); }
      marcaCine(true);
      ponArboles(false);
      refrescaPanel();
      return;
    }
    if(E.modo === 'paseo'){
      E.modo = 'cine'; E.s = 0; E.paradaI = 0; E.cede = false;
      if(TOMAS.length) aplicaToma(E.i);
      refrescaPanel();
    }
  }

  /* ------------------------------------------------------------------
     11. El bucle
     ------------------------------------------------------------------ */
  function frame(dt){
    if(!E.modo || !api()) return;
    if(dt > 0.25) dt = 0.25;
    var d = datos(); if(!d) return;
    if(d.version !== E.version){ construye(); if(TOMAS.length) aplicaToma(E.i); }
    if(E.modo === 'cine') frameCine(dt);
    else if(E.modo === 'paseo') framePaseo(dt);
  }

  function frameCine(dt){
    var t = TOMAS[E.i]; if(!t) return;
    if(E.play) E.t += dt*E.vel;
    var dur = t.dur;
    if(E.fundido && HUD){
      var f = 0;
      if(E.t < 0.4) f = 1 - E.t/0.4;
      else if(E.t > dur - 0.35) f = (E.t - (dur - 0.35))/0.35;
      fundido(f);
    }
    if(t.travelling && E.play){
      var c = t.arco.centro;
      var k = Math.max(0, Math.min(1, E.t/dur));
      var s = k*t.arco.barrido;
      var u = c[0] + Math.sin(t.arco.a0 + s)*t.arco.r;
      var v = c[1] + Math.cos(t.arco.a0 + s)*t.arco.r;
      var pos = mundo(u, v, t.y), mira = mundo(t.mira[0], t.mira[1], t.ymira);
      coloca(pos, mira, t.hfov);
    }
    if(E.t >= dur){
      E.t = 0;
      E.i = (E.i + 1) % TOMAS.length;
      aplicaToma(E.i);
    }
  }

  function framePaseo(dt){
    var R = E.rutas[E.ruta]; if(!R) return;
    if(E.cede) return;
    if(E.paradaT > 0){
      E.paradaT -= dt;
      if(E.paradaT <= 0) titulo('');
      return;
    }
    if(E.play){
      var prox = R.paradas[E.paradaI];
      var libre = prox ? (prox.s - E.s) : (R.largo - E.s);
      var rampa = Math.max(0.25, Math.min(1, libre/0.8));   // arranca y frena sin tirón
      E.s += VEL_PASEO*E.vel*rampa*dt;
      if(prox && E.s >= prox.s - 0.12){
        E.s = prox.s; E.paradaT = PARADA; E.paradaI++;
        if(E.rot) titulo(prox.nombre);
      } else if(E.s >= R.largo){
        E.s = 0; E.paradaI = 0;
      }
    }
    var p = posEnRuta(R, E.s);
    var pos = mundo(p.u, p.v, (p.y||0) + OJO);
    var parada = null;
    for(var i=0;i<R.paradas.length;i++) if(Math.abs(R.paradas[i].s - E.s) < 0.4) parada = R.paradas[i];
    var mira;
    if(parada && parada.mira) mira = mundo(parada.mira[0], parada.mira[1], parada.mira[2]);
    else {
      var m = miraEnRuta(R, E.s);
      mira = mundo(m[0], m[1], (p.y||0) + 1.45);
    }
    /* Si el usuario ha mirado a otro lado, la vista vuelve sola al frente. */
    if(E.mirando > 0){
      E.mirando -= dt;
      mira = desvia(mira, pos, E.arrYaw, E.arrPitch);
    } else {
      E.arrYaw *= 0.9; E.arrPitch *= 0.9;
      if(Math.abs(E.arrYaw) < 0.002) E.arrYaw = 0;
      if(Math.abs(E.arrPitch) < 0.002) E.arrPitch = 0;
    }
    coloca(pos, mira, 74);
    abrePuertas(pos);
  }
  /* Gira el punto de mira alrededor de la cámara (yaw en el plano, pitch). */
  function desvia(mira, pos, yaw, pitch){
    var dx = mira[0]-pos[0], dy = mira[1]-pos[1], dz = mira[2]-pos[2];
    var n = Math.hypot(dx, dy, dz) || 1;
    dx/=n; dy/=n; dz/=n;
    var y0 = Math.atan2(-dx, -dz), p0 = Math.asin(Math.max(-1, Math.min(1, dy)));
    var y = y0 + yaw, pp = Math.max(-1.2, Math.min(1.2, p0 + pitch));
    var fx = -Math.sin(y)*Math.cos(pp), fy = Math.sin(pp), fz = -Math.cos(y)*Math.cos(pp);
    return [pos[0] + fx*2.6, pos[1] + fy*2.6, pos[2] + fz*2.6];
  }
  /* Las puertas del recorrido se abren solas al acercarse (como en el tour).
     La posición de cada puerta se cachea: no se mueven, solo giran. */
  function abrePuertas(pos){
    var a = api(); if(!a || !a.PUERTAS) return;
    if(!window.THREE) return;
    if(!vPuerta) vPuerta = new THREE.Vector3();
    a.PUERTAS.forEach(function(p){
      if(!p.g || !p.local) return;
      if(!p.w){
        try{ p.w = p.g.localToWorld(vPuerta.set(p.local[0], p.local[1], p.local[2])).clone(); }
        catch(e){ return; }
      }
      var d = Math.hypot(p.w.x - pos[0], p.w.z - pos[2]);
      if(d < 2.9) p.obj = 1;
    });
  }
  var vPuerta = null;

  /* ------------------------------------------------------------------
     12. Gestos: mirar y ceder el control
     ------------------------------------------------------------------ */
  var arrastre = null;
  function enganchaGestos(){
    var cont = document.getElementById('escena');
    if(!cont || cont.dataset.adc) return;
    cont.dataset.adc = '1';
    /* En fase de captura sobre el lienzo: el manejador del visor está en el
       mismo elemento y gira la órbita, así que hay que pararlo mientras
       estamos en cine (en el recorrido, el gesto es nuestro). */
    cont.addEventListener('pointerdown', function(e){
      if(!E.modo || E.cede) return;
      e.stopPropagation();
      arrastre = {x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, t:performance.now(), mov:0};
    }, true);
    cont.addEventListener('pointermove', function(e){
      if(!arrastre || !E.modo) return;
      e.stopPropagation();
      var dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
      arrastre.mov += Math.abs(dx) + Math.abs(dy);
      arrastre.x = e.clientX; arrastre.y = e.clientY;
      if(E.modo !== 'paseo') return;
      E.mirando = 1.2;
      E.arrYaw += -dx*0.005;
      E.arrPitch = Math.max(-1.2, Math.min(1.2, E.arrPitch - dy*0.005));
      if(arrastre.mov > 70) cede();
    }, true);
    var suelta = function(e){
      if(!arrastre) return;
      var corto = arrastre.mov < 10 && (performance.now() - arrastre.t) < 320;
      arrastre = null;
      if(e && e.stopPropagation) e.stopPropagation();
      if(corto && E.modo === 'paseo'){ E.play = !E.play; refrescaPanel(); }
    };
    cont.addEventListener('pointerup', suelta, true);
    cont.addEventListener('pointercancel', suelta, true);
    cont.addEventListener('wheel', function(e){ if(E.modo && !E.cede) e.stopPropagation(); }, true);
    /* Las flechas mueven la órbita del visor: en cine estorban. */
    window.addEventListener('keydown', function(e){
      if(!E.modo) return;
      if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].indexOf(e.code) >= 0) e.stopPropagation();
      if(e.code === 'Space' && e.target === document.body){ E.play = !E.play; refrescaPanel(); e.preventDefault(); }
      if(e.code === 'Escape'){ if(E.modo === 'paseo') cede(); else cierra(); }
    }, true);
    window.addEventListener('resize', function(){
      if(!E.modo) return;
      if(E.lb) ajustaBanda();
      var t = TOMAS[E.i];
      if(t && E.modo === 'cine') aplicaToma(E.i);
    });
  }
  /* El usuario toma el control: el visor vuelve a girar la órbita. */
  function cede(){
    if(E.modo === 'paseo'){
      E.cede = true; E.play = false;
      if(HUD) HUD.info.textContent = 'Control manual: arrastra para girar. «Recorrido interior» vuelve a(auto.';
      refrescaPanel();
    }
  }

  /* ------------------------------------------------------------------
     13. API pública
     ------------------------------------------------------------------ */
  AD.camaras = {
    abrir: abre,
    cerrar: cierra,
    alternar: alterna,
    reproduce: reproduce,
    pausa: pausa,
    tomas: TOMAS,
    irA: irA,
    modoCine: modoCine,
    calidad4K: calidad4K,
    /* extras: los usa el coordinator o el hub */
    paseo: modoPaseo,
    rutas: function(){ return E.rutas; },
    estado: function(){
      return {modo:E.modo, toma:E.i, nombre:(TOMAS[E.i]||{}).rotulo || null, play:E.play, vel:E.vel};
    },
    refresca: function(){
      E.listo = false;
      if(api() && E.modo){ construye(); pintaLista(); if(TOMAS.length) aplicaToma(E.i); }
    }
  };

  /* La pieza que el hub puede mostrar: el estado del modo cine. */
  if(AD.piezas && AD.piezas.registra){
    try{
      AD.piezas.registra({id:'CINE-camara', etiqueta:'Cámaras cinematográficas', tipo:'camara', grupo:'Visor',
        abre:function(){ abre(); }, cierra:function(){ cierra(); },
        estado:function(){ return E.modo ? 1 : 0; }});
    }catch(e){}
  }

  /* ------------------------------------------------------------------
     14. Arranque: puede cargarse antes que el coordinator
     ------------------------------------------------------------------ */
  function engancha(){
    if(typeof AD.onFrame === 'function'){ AD.onFrame(frame); return true; }
    return false;
  }
  function listo(){
    enganchaGestos();
    creaHUD();                    // el botón "Cine" existe desde el principio
    preparaTomas();                // las tomas se calculan ya, para que el cine arranque al instante
    if(!engancha()){
      window.addEventListener('load', function(){
        if(!engancha()){
          /* Último recurso: un rAF propio que solo mueve la cámara (no dibuja).
             Si más tarde aparece el `onFrame` del coordinator, se engancha y
             el rAF se aparta. */
          var t0 = performance.now();
          (function paso(){
            requestAnimationFrame(paso);
            if(engancha()) return;
            var ahora = performance.now();
            frame(Math.min(0.1, (ahora - t0)/1000));
            t0 = ahora;
          })();
        }
      });
    }
  }
  if(document.readyState === 'complete' || document.readyState === 'interactive') listo();
  else window.addEventListener('DOMContentLoaded', listo);
})();
