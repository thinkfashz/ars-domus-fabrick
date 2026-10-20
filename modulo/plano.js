/* Agente A · plano 2D (SVG) + plano 3D elevado con corte de planta y capa de códigos.
   ---------------------------------------------------------------------------------------------
   El plano se construye SIEMPRE con el contrato de casa.js, nunca con una planta dibujada a mano:

     C.muros      = [u0, v0, u1, v1, espesor, ySuelo, yDintel, tipoMaterial, idMuro]
     C.huecos     = [u0, v0, u1, v1, tipo, lado, espesor, ySuelo, yDintel, tipoMaterial, op]
     INT.estancias= {id, nombre, codigo, caja:[u0,v0,u1,v1], cota, suelo, pared, techo, fuera}
     INT.muebles  = {id, tipo, uv:[u,v], giro, largo, ancho, alto, color}

   Si en los datos se mueve un muro, este plano se mueve con él.

   En el 3D la geometría está en coordenadas de mundo (x, z), no en (u, v): el marco del plano se
   convierte con la misma cuenta que usa el visor (aMundo / uvDe), y el grupo de la casa va girado
   con GIRO alrededor de C0.origen. Aquí se hace un grupo propio con esa misma transformación, y
   dentro de él se trabaja en (u, v) como en el plano.

   Script plano: sin módulos ES, sin import. Espera a que el coordinator defina AD.api. */
var AD = window.AD || (window.AD = {});
(function(){
'use strict';

/* =====================================================================================
   0 · Estilo, constantes y estado
   ===================================================================================== */
var COL = {
  fondo:'#081014', lamina:'#0c161b', muro:'#c9ef63', ventana:'#7fd3ff', puerta:'#f0c46a',
  paso:'#8fa3ab', texto:'#d9e6ea', tenue:'#7f9299', linea:'#1c2b31', mueble:'#46606a',
  hueco:'#122027'
};
var CORTE = 1.15;              // m sobre el piso terminado: altura del corte de planta
var GROSOR_PANEL = 0.026;      // m: canto de la tapa de poché
var PX_M = 40;                 // px por metro del dibujo 2D (el SVG se escala solo)
var MARGEN = 1.8;              // m de margen alrededor de la planta

var EST = {
  montado:false, abierto:false, plan3D:false, codigos:false,
  panel:null, svg:null, btn:null, overlay:null, hud3d:null, lista:null,
  gPlan:null, tex:null, lienzo:null, ctx:null,
  guardado:null,               // estado de la escena antes de entrar en modo planta
  PL:{x:0, z:0, dist:30, theta:0, phi:0.62, fov:42},
  act:{id:null, x:0, y:0, mx:0, my:0, pinza:0, mov:0, n:0}
};

var NORMAL = {N:[0,-1], S:[0,1], E:[1,0], O:[-1,0]};
/* Alféizar y dintel por tipo de hueco: la misma tabla que usa el visor (TIPO_HUECO). */
var TIPOS = {
  ventana:{y0:0.95, y1:2.15}, ventana_negra:{y0:0.75, y1:2.15}, mallorquina:{y0:1.00, y1:2.08},
  puerta:{y0:0.00, y1:2.15}, ventanal:{y0:0.12, y1:2.22}, garaje:{y0:0.00, y1:2.20},
  vidriera:{y0:0.00, y1:2.15}, ventana_int:{y0:1.00, y1:2.10}, ventanuco:{y0:1.45, y1:2.05},
  arco:{y0:0.00, y1:2.20}, paso:{y0:0.00, y1:2.30}, acristalado:{y0:0.00, y1:9.00}
};
/* Tamaño en planta de los muebles (x local = largo, z local = fondo; el frente mira a +z). */
var HUELLA = {
  alfombra:['ancho','largo'], sofa_tela:['largo','fondo'], butaca_tela:[0.74,0.78],
  mesa_centro:['largo','fondo'], libreria:['ancho','fondo'], lampara_pie:[0.30,0.30],
  mesa_madera:['largo','fondo'], silla_madera:[0.45,0.45], aparador:['largo',0.42],
  maceta:['diam',0.50], encimera:['largo',0.58], nevera:[0.60,0.65], isla:['largo','fondo'],
  banqueta:[0.38,0.38], banco_recibidor:['largo',0.40], espejo:['ancho',0.06],
  cama:['ancho','largo'], mesilla:[0.42,0.36], empotrado:['ancho',0.60], banera:[1.60,0.72],
  inodoro:[0.36,0.60], lavabo_cajones:['ancho',0.45], toallero:[0.50,0.08], comoda:['ancho',0.48],
  escritorio:['largo','fondo'], silla_oficina:[0.60,0.60], monitor:['ancho',0.20],
  kallax:['kallax',0.39], sillon:[0.72,0.75], lavadora:[0.60,0.60], pila_lavar:[0.55,0.45],
  estanteria_metal:['ancho',0.36], mesa_jardin:[1.50,0.80], chillout:[1.60,1.60], chimenea:[0.95,0.14]
};

/* =====================================================================================
   1 · Acceso al contrato y conversión de coordenadas
   ===================================================================================== */
function api(){ return AD.api || {}; }
function muros(){ return (api().C && api().C.muros) || []; }
function huecos(){ return (api().C && api().C.huecos) || []; }
function estancias(){ return (api().INT && api().INT.estancias) || []; }
function muebles(){ return (api().INT && api().INT.muebles) || []; }
function contorno(){ return (api().C && api().C.contorno) || []; }

function d2r(d){ return d*Math.PI/180; }
function r2d(r){ return r*180/Math.PI; }

/* Marco del plano -> mundo. Es la misma cuenta que aMundo() en visor.js:
   el grupo de la casa va en C.origen con un giro de GIRO sobre Y.
   Si el coordinator expone AD.api.aMundo, se usa el suyo (sigue a la versión activa). */
function aMundo(u, v){
  var a = api();
  if(a.aMundo) return a.aMundo(u, v);
  var C = a.C || {origen:[0,0]}, o = C.origen || [0,0], g = a.GIRO || 0;
  return [o[0] + u*Math.cos(g) + v*Math.sin(g), o[1] - u*Math.sin(g) + v*Math.cos(g)];
}
/* Mundo -> marco del plano (la inversa exacta de aMundo). */
function uvDe(x, z){
  var a = api();
  var C = a.C || {origen:[0,0]}, o = C.origen || [0,0], g = a.GIRO || 0;
  var dx = x - o[0], dz = z - o[1];
  return [dx*Math.cos(g) - dz*Math.sin(g), dx*Math.sin(g) + dz*Math.cos(g)];
}
function cajaDe(e){ return e.caja; }
function estanciaEn(u, v){
  var l = estancias();
  for(var i=0; i<l.length; i++){
    var k = l[i].caja;
    if(u >= k[0] && u <= k[2] && v >= k[1] && v <= k[3]) return l[i];
  }
  return null;
}
function superficie(e){
  var k = e.caja;
  return Math.max(0, (k[2]-k[0]-0.14) * (k[3]-k[1]-0.14));
}
function num(x, d){ return (d === undefined ? 1 : d) ? x.toFixed(d).replace('.', ',') : String(x); }

/* =====================================================================================
   2 · Geometría de los huecos (para dibujar la hoja de la puerta igual que en el 3D)
   ===================================================================================== */
function datosHueco(h){
  var u0=h[0], v0=h[1], u1=h[2], v1=h[3], tipo=h[4], lado=h[5], e=h[6], op=h[10] || {};
  var L = Math.hypot(u1-u0, v1-v0);
  var a = Math.atan2(v1-v0, u1-u0), dx = Math.cos(a), dy = Math.sin(a);
  var nz = [-Math.sin(a), Math.cos(a)];                      // normal a la izquierda del muro
  var n = NORMAL[lado] || [0,-1];
  var sg = (n[0]*nz[0] + n[1]*nz[1]) >= 0 ? 1 : -1;          // hacia qué lado queda el exterior
  var nA = NORMAL[op.abre] || [-n[0], -n[1]];
  var sgA = (nA[0]*nz[0] + nA[1]*nz[1]) >= 0 ? 1 : -1;        // hacia qué lado gira la hoja
  var t = TIPOS[tipo] || {y0:0, y1:2.10};
  var y0 = op.y0 !== undefined ? op.y0 : t.y0;
  var y1 = op.y1 !== undefined ? op.y1 : Math.min(t.y1, Math.min(h[7], h[8]) - 0.2);
  var fin = op.bisagra === 'fin';
  var gr = d2r(op.giro === undefined ? 90 : op.giro);
  var ang = (fin ? 1 : -1) * sgA * gr;                       // giro de la hoja, como en el visor
  var dir = fin ? -1 : 1;                                    // la hoja cerrada va del otro extremo
  var lx = dir*Math.cos(ang), lz = -dir*Math.sin(ang);        // dirección de la hoja en el marco del muro
  var off = sgA * (e/2 + 0.03);                              // la hoja se dibuja en la cara por la que abre
  var hu = (fin ? u1 : u0) + nz[0]*off, hv = (fin ? v1 : v0) + nz[1]*off;
  var ex = hu + lx*dx + lz*nz[0], ey = hv + lx*dy + lz*nz[1];
  var cx = (u0+u1)/2 + nz[0]*off, cy = (v0+v1)/2 + nz[1]*off;  // centro del vano, en la cara de la hoja
  return {u0:u0, v0:v0, u1:u1, v1:v1, L:L, a:a, dx:dx, dy:dy, nz:nz, sg:sg, sgA:sgA,
          e:e, tipo:tipo, y0:y0, y1:y1, bisU:hu, bisV:hv, hojaU:ex, hojaV:ey,
          bisX:(fin ? L : 0), off:off, lx:lx, lz:lz, ang:ang, dir:dir,
          cerradoU:hu + dir*dx*L, cerradoV:hv + dir*dy*L, centroU:cx, centroV:cy,
          esPuerta:(tipo === 'puerta' || tipo === 'vidriera' || tipo === 'ventanal' || tipo === 'arco' || tipo === 'garaje'),
          esPaso:(tipo === 'paso')};
}

/* ¿Este punto del muro toca un hueco? (para no alargar el muro dentro del vano) */
function bordeHueco(u, v){
  var hs = huecos();
  for(var i=0; i<hs.length; i++){
    var h = hs[i];
    if(Math.hypot(h[0]-u, h[1]-v) < 0.03 || Math.hypot(h[2]-u, h[3]-v) < 0.03) return true;
  }
  return false;
}

/* Tamaño en planta de un mueble: [x, z] en su marco local. */
function huellaMueble(m){
  var h = HUELLA[m.tipo] || [0.60, 0.60];
  function lado(v, porDef){
    if(typeof v === 'number') return v;
    if(v === 'diam') return (m.radio || 0.25)*2;
    if(v === 'kallax') return (m.cols || 3)*0.3675 + 0.035;
    var x = m[v];
    return (x === undefined || x === null) ? porDef : x;
  }
  var x = lado(h[0], 0.60), z = lado(h[1], 0.60);
  return [x, z];
}
/* Las cuatro esquinas de un mueble en (u, v), ya giradas. */
function esquinasMueble(m){
  var h = huellaMueble(m), w = h[0]/2, d = h[1]/2, g = d2r(m.giro || 0);
  var cg = Math.cos(g), sg = Math.sin(g);
  var u = m.uv[0], v = m.uv[1];
  /* rotación de three.js: (x,z) -> (x*cos + z*sin, -x*sin + z*cos) */
  return [[-w,-d],[w,-d],[w,d],[-w,d]].map(function(p){
    return [u + p[0]*cg + p[1]*sg, v - p[0]*sg + p[1]*cg];
  });
}

/* =====================================================================================
   3 · Plano 2D en SVG
   ===================================================================================== */
function esc(s){
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cajaPlano(){
  var u0=Infinity, u1=-Infinity, v0=Infinity, v1=-Infinity, i, k;
  var ms = muros();
  for(i=0; i<ms.length; i++){
    u0=Math.min(u0,ms[i][0],ms[i][2]); u1=Math.max(u1,ms[i][0],ms[i][2]);
    v0=Math.min(v0,ms[i][1],ms[i][3]); v1=Math.max(v1,ms[i][1],ms[i][3]);
  }
  var es = estancias();
  for(i=0; i<es.length; i++){
    k = es[i].caja;
    u0=Math.min(u0,k[0]); u1=Math.max(u1,k[2]); v0=Math.min(v0,k[1]); v1=Math.max(v1,k[3]);
  }
  if(!isFinite(u0)){ u0=0; u1=10; v0=0; v1=10; }
  return {u0:u0, u1:u1, v0:v0, v1:v1};
}

function dibujaSVG(){
  var ms = muros(), hs = huecos(), es = estancias(), mbs = muebles();
  var b = cajaPlano(), s = PX_M, M = MARGEN;
  var W = (b.u1-b.u0 + 2*M)*s, H = (b.v1-b.v0 + 2*M)*s;
  function X(u){ return (u - b.u0 + M)*s; }
  function Y(v){ return (v - b.v0 + M)*s; }
  var o = [];
  o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W.toFixed(1)+' '+H.toFixed(1)+
         '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plano de la planta">');
  o.push('<rect x="0" y="0" width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'" fill="'+COL.fondo+'"/>');

  /* --- suelo de cada ambiente --- */
  es.forEach(function(e){
    var k = e.caja;
    o.push('<rect x="'+X(k[0]).toFixed(1)+'" y="'+Y(k[1]).toFixed(1)+'" width="'+((k[2]-k[0])*s).toFixed(1)+
           '" height="'+((k[3]-k[1])*s).toFixed(1)+'" fill="'+(e.fuera ? '#0e1a20' : COL.hueco)+'"/>');
  });

  /* --- muebles en contorno --- */
  mbs.forEach(function(m){
    if(!m.uv) return;
    var h = huellaMueble(m);
    if(h[0] > 1.6 && h[1] > 1.6){                                   // macetas, banquetas: un círculo
      o.push('<circle cx="'+X(m.uv[0]).toFixed(1)+'" cy="'+Y(m.uv[1]).toFixed(1)+'" r="'+(h[0]/2*s).toFixed(1)+
             '" fill="none" stroke="'+COL.mueble+'" stroke-width="1.2"/>');
      return;
    }
    var p = esquinasMueble(m);
    o.push('<polygon points="'+p.map(function(q){ return X(q[0]).toFixed(1)+','+Y(q[1]).toFixed(1); }).join(' ')+
           '" fill="none" stroke="'+COL.mueble+'" stroke-width="1.2"/>');
  });

  /* --- muros: trazo grueso (elpoché), con el espesor real de cada tramo --- */
  ms.forEach(function(w){
    var e = w[4] || 0.12;
    var x0 = X(w[0]), y0 = Y(w[1]), x1 = X(w[2]), y1 = Y(w[3]);
    o.push('<line x1="'+x0.toFixed(1)+'" y1="'+y0.toFixed(1)+'" x2="'+x1.toFixed(1)+'" y2="'+y1.toFixed(1)+
           '" stroke="'+COL.muro+'" stroke-width="'+Math.max(1.5, e*s).toFixed(1)+'" stroke-linecap="butt"/>');
  });

  /* --- huecos: ventanas en azul, puertas con hoja y arco --- */
  var nP = 0, nM = 0, nF = 0;
  hs.forEach(function(h){
    var d = datosHueco(h);
    var x0 = X(d.u0), y0 = Y(d.v0), x1 = X(d.u1), y1 = Y(d.v1);
    if(d.esPuerta || d.esPaso){
      nP++;
      var color = d.esPaso ? COL.paso : COL.puerta;
      o.push('<line x1="'+x0.toFixed(1)+'" y1="'+y0.toFixed(1)+'" x2="'+x1.toFixed(1)+'" y2="'+y1.toFixed(1)+
             '" stroke="'+color+'" stroke-width="'+Math.max(1.5, 0.07*s).toFixed(1)+'" stroke-dasharray="4 3" opacity=".75"/>');
      if(d.esPuerta){
        /* hoja: de la bisagra a su posición, y el arco del barrido */
        var bx = X(d.bisU), by = Y(d.bisV), ex = X(d.hojaU), ey = Y(d.hojaV);
        o.push('<line x1="'+bx.toFixed(1)+'" y1="'+by.toFixed(1)+'" x2="'+ex.toFixed(1)+'" y2="'+ey.toFixed(1)+
               '" stroke="'+color+'" stroke-width="2.4" stroke-linecap="round"/>');
        var cx2 = X(d.cerradoU), cy2 = Y(d.cerradoV);
        var cr = (cx2-bx)*(ey-by) - (cy2-by)*(ex-bx);
        o.push('<path d="M '+cx2.toFixed(1)+' '+cy2.toFixed(1)+' A '+(d.L*s).toFixed(1)+' '+(d.L*s).toFixed(1)+
               ' 0 0 '+(cr > 0 ? 1 : 0)+' '+ex.toFixed(1)+' '+ey.toFixed(1)+
               '" fill="none" stroke="'+color+'" stroke-width="1" opacity=".45" stroke-dasharray="3 3"/>');
      }
    } else {
      o.push('<line x1="'+x0.toFixed(1)+'" y1="'+y0.toFixed(1)+'" x2="'+x1.toFixed(1)+'" y2="'+y1.toFixed(1)+
             '" stroke="'+COL.ventana+'" stroke-width="'+Math.max(2, 0.09*s).toFixed(1)+'" stroke-linecap="butt"/>');
    }
  });

  /* --- nombre y medidas de cada ambiente --- */
  function ajusta(txt, maxW, tam){
    var t = tam;
    /* 0,70 por carácter: el texto real sale un poco más ancho que el medido */
    while(t > 7 && txt.length*t*0.70 > maxW) t -= 0.5;
    return t;
  }
  es.forEach(function(e){
    var k = e.caja, cx = X((k[0]+k[2])/2), cy = Y((k[1]+k[3])/2);
    var anchoPx = (k[2]-k[0])*s, altoPx = (k[3]-k[1])*s;
    var nombre = (e.nombre || e.id).toUpperCase();
    var dims = num(k[2]-k[0],2)+' × '+num(k[3]-k[1],2)+' m · '+num(superficie(e),1)+' m²';
    /* un ambiente estrecho y largo (un pasillo) lleva la etiqueta de pie */
    var dePie = altoPx > anchoPx*1.5 && anchoPx < 170;
    var maxW = (dePie ? altoPx : anchoPx) - 16;
    var t1 = ajusta(nombre, maxW, 12.5), t2 = ajusta(dims, maxW, 10.5);
    o.push('<g'+(dePie ? ' transform="rotate(-90 '+cx.toFixed(1)+' '+cy.toFixed(1)+')"' : '')+'>');
    o.push('<text x="'+cx.toFixed(1)+'" y="'+(cy-12).toFixed(1)+'" text-anchor="middle" fill="'+COL.texto+
           '" font-family="IBM Plex Sans Condensed, system-ui, sans-serif" font-size="'+t1.toFixed(1)+'" font-weight="600" letter-spacing=".04em">'+
           esc(nombre)+'</text>');
    o.push('<text x="'+cx.toFixed(1)+'" y="'+(cy+3).toFixed(1)+'" text-anchor="middle" fill="'+COL.tenue+
           '" font-family="IBM Plex Mono, monospace" font-size="'+t2.toFixed(1)+'">'+esc(dims)+'</text>');
    if(e.codigo){
      o.push('<text x="'+cx.toFixed(1)+'" y="'+(cy+17).toFixed(1)+'" text-anchor="middle" fill="'+
             COL.muro+'" opacity=".65" font-family="IBM Plex Mono, monospace" font-size="9.5">'+esc(e.codigo)+'</text>');
    }
    o.push('</g>');
  });

  /* --- cotas generales --- */
  var cyC = Y(b.v1) + M*s*0.55, cxC = X(b.u1) + M*s*0.55;
  o.push('<g stroke="'+COL.tenue+'" stroke-width="1" opacity=".8">');
  o.push('<line x1="'+X(b.u0).toFixed(1)+'" y1="'+cyC.toFixed(1)+'" x2="'+X(b.u1).toFixed(1)+'" y2="'+cyC.toFixed(1)+'"/>');
  o.push('<line x1="'+X(b.u0).toFixed(1)+'" y1="'+(cyC-5).toFixed(1)+'" x2="'+X(b.u0).toFixed(1)+'" y2="'+(cyC+5).toFixed(1)+'"/>');
  o.push('<line x1="'+X(b.u1).toFixed(1)+'" y1="'+(cyC-5).toFixed(1)+'" x2="'+X(b.u1).toFixed(1)+'" y2="'+(cyC+5).toFixed(1)+'"/>');
  o.push('<line x1="'+cxC.toFixed(1)+'" y1="'+Y(b.v0).toFixed(1)+'" x2="'+cxC.toFixed(1)+'" y2="'+Y(b.v1).toFixed(1)+'"/>');
  o.push('<line x1="'+(cxC-5).toFixed(1)+'" y1="'+Y(b.v0).toFixed(1)+'" x2="'+(cxC+5).toFixed(1)+'" y2="'+Y(b.v0).toFixed(1)+'"/>');
  o.push('<line x1="'+(cxC-5).toFixed(1)+'" y1="'+Y(b.v1).toFixed(1)+'" x2="'+(cxC+5).toFixed(1)+'" y2="'+Y(b.v1).toFixed(1)+'"/>');
  o.push('</g>');
  o.push('<text x="'+((X(b.u0)+X(b.u1))/2).toFixed(1)+'" y="'+(cyC-7).toFixed(1)+'" text-anchor="middle" fill="'+COL.tenue+
         '" font-family="IBM Plex Mono, monospace" font-size="11">'+num(b.u1-b.u0,2)+' m</text>');
  o.push('<text x="'+(cxC-7).toFixed(1)+'" y="'+((Y(b.v0)+Y(b.v1))/2).toFixed(1)+'" text-anchor="middle" fill="'+COL.tenue+
         '" font-family="IBM Plex Mono, monospace" font-size="11" transform="rotate(-90 '+(cxC-7).toFixed(1)+' '+((Y(b.v0)+Y(b.v1))/2).toFixed(1)+')">'+
         num(b.v1-b.v0,2)+' m</text>');

  /* --- norte y escala --- */
  var nx = X(b.u0) - M*s*0.45, ny = Y(b.v0) - M*s*0.45;
  o.push('<g transform="translate('+nx.toFixed(1)+','+ny.toFixed(1)+')" fill="'+COL.texto+'">');
  o.push('<path d="M 0 10 L -7 -6 L 0 -2 L 7 -6 Z"/>');
  o.push('<text x="0" y="24" text-anchor="middle" font-family="IBM Plex Sans Condensed, sans-serif" font-size="12" font-weight="700">N</text>');
  o.push('</g>');
  var ex0 = X(b.u1) - 3*s, ey0 = Y(b.v1) + M*s*0.3;
  o.push('<g stroke="'+COL.texto+'" stroke-width="1.6"><line x1="'+ex0.toFixed(1)+'" y1="'+ey0.toFixed(1)+
         '" x2="'+(ex0+s).toFixed(1)+'" y2="'+ey0.toFixed(1)+'"/>'+
         '<line x1="'+ex0.toFixed(1)+'" y1="'+(ey0-4).toFixed(1)+'" x2="'+ex0.toFixed(1)+'" y2="'+(ey0+4).toFixed(1)+'"/>'+
         '<line x1="'+(ex0+s).toFixed(1)+'" y1="'+(ey0-4).toFixed(1)+'" x2="'+(ex0+s).toFixed(1)+'" y2="'+(ey0+4).toFixed(1)+'"/></g>');
  o.push('<text x="'+(ex0+s+6).toFixed(1)+'" y="'+(ey0+4).toFixed(1)+'" fill="'+COL.texto+
         '" font-family="IBM Plex Mono, monospace" font-size="11">1 m</text>');

  /* --- capa de códigos (interruptor) --- */
  if(EST.codigos){
    ms.forEach(function(w, i){
      var L = Math.hypot(w[2]-w[0], w[3]-w[1]);
      if(L < 0.5) return;
      nM++;
      o.push('<text x="'+X((w[0]+w[2])/2).toFixed(1)+'" y="'+(Y((w[1]+w[3])/2)+3.5).toFixed(1)+
             '" text-anchor="middle" fill="#0d1114" font-family="IBM Plex Mono, monospace" font-size="9.5" font-weight="700">'+
             'M-'+('0'+nM).slice(-2)+'</text>');
    });
    mbs.forEach(function(m){
      if(!m.uv) return;
      nF++;
      o.push('<text x="'+X(m.uv[0]).toFixed(1)+'" y="'+(Y(m.uv[1])+3.5).toFixed(1)+
             '" text-anchor="middle" fill="#0d1114" font-family="IBM Plex Mono, monospace" font-size="9.5" font-weight="700">'+
             'F-'+('0'+nF).slice(-2)+'</text>');
    });
    hs.forEach(function(h){
      var d = datosHueco(h);
      if(!(d.esPuerta || d.esPaso)) return;
      nP++;
      o.push('<text x="'+X(d.centroU).toFixed(1)+'" y="'+(Y(d.centroV)+3.5).toFixed(1)+
             '" text-anchor="middle" fill="#0d1114" font-family="IBM Plex Mono, monospace" font-size="9.5" font-weight="700">'+
             'P-'+('0'+nP).slice(-2)+'</text>');
    });
  }

  /* --- zonas tocables: entrar en un ambiente --- */
  es.forEach(function(e){
    var k = e.caja;
    o.push('<rect class="pl-estancia" data-e="'+esc(e.id)+'" x="'+X(k[0]).toFixed(1)+'" y="'+Y(k[1]).toFixed(1)+
           '" width="'+((k[2]-k[0])*s).toFixed(1)+'" height="'+((k[3]-k[1])*s).toFixed(1)+
           '" fill="transparent" style="pointer-events:all;cursor:pointer"/>');
  });
  o.push('</svg>');
  return o.join('');
}

/* =====================================================================================
   4 · Capa de anotación: UNA textura de canvas sobre un plano horizontal
   ===================================================================================== */
function creaLienzo(){
  var b = cajaPlano(), M = MARGEN;
  var anchoM = b.u1-b.u0 + 2*M, fondoM = b.v1-b.v0 + 2*M;
  var pxm = Math.min(62, 1400/anchoM);
  var W = Math.max(256, Math.round(anchoM*pxm)), H = Math.max(256, Math.round(fondoM*pxm));
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  EST.lienzo = cv; EST.ctx = cv.getContext('2d');
  EST.cajaAnot = {b:b, M:M, pxm:pxm, anchoM:anchoM, fondoM:fondoM};
  return cv;
}
function pintaAnotacion(){
  if(!EST.ctx) return;
  var g = EST.ctx, c = EST.cajaAnot, b = c.b, pxm = c.pxm, M = c.M;
  var es = estancias(), ms = muros(), hs = huecos(), mbs = muebles();
  function X(u){ return (u - b.u0 + M)*pxm; }
  function Y(v){ return (v - b.v0 + M)*pxm; }
  var FUENTE = '"IBM Plex Sans Condensed", system-ui, -apple-system, sans-serif';
  var MONO = '"IBM Plex Mono", ui-monospace, monospace';
  g.clearRect(0, 0, EST.lienzo.width, EST.lienzo.height);

  /* retícula de 1 m (los múltiplos de 5, más marcados) */
  for(var m=0; m<=Math.ceil(c.anchoM); m++){
    g.strokeStyle = m % 5 === 0 ? 'rgba(200,220,225,.16)' : 'rgba(200,220,225,.06)';
    g.lineWidth = m % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(X(b.u0-M+m), 0); g.lineTo(X(b.u0-M+m), EST.lienzo.height); g.stroke();
  }
  for(var n=0; n<=Math.ceil(c.fondoM); n++){
    g.strokeStyle = n % 5 === 0 ? 'rgba(200,220,225,.16)' : 'rgba(200,220,225,.06)';
    g.lineWidth = n % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(0, Y(b.v0-M+n)); g.lineTo(EST.lienzo.width, Y(b.v0-M+n)); g.stroke();
  }

  /* píldora con el nombre, las medidas y la superficie de cada ambiente */
  function pill(lineas, px, pz, fondo, borde, color){
    var padX = 9, padY = 6, w = 0, h = padY*2, i;
    for(i=0; i<lineas.length; i++){
      g.font = (lineas[i].peso || 700) + ' ' + Math.round(lineas[i].tam) + 'px ' + FUENTE;
      /* el ancho medido se multiplica por 1,12: si la fuente no está cargada el
         texto sale algo más ancho que lo medido y se salía de la píldora */
      w = Math.max(w, g.measureText(lineas[i].t).width*1.12);
      h += lineas[i].tam*1.12 + 1;
    }
    h -= 1;
    var x = px - w/2 - padX, y = pz - h/2, r = Math.min(8, h/2);
    g.beginPath();
    g.moveTo(x+r, y); g.arcTo(x+w, y, x+w, y+h, r); g.arcTo(x+w, y+h, x, y+h, r);
    g.arcTo(x, y+h, x, y, r); g.arcTo(x, y, x+w, y, r); g.closePath();
    g.fillStyle = fondo; g.fill();
    if(borde){ g.strokeStyle = borde; g.lineWidth = 1.5; g.stroke(); }
    var ty = y + padY;
    g.textAlign = 'center'; g.textBaseline = 'top';
    for(i=0; i<lineas.length; i++){
      g.font = (lineas[i].peso || 700) + ' ' + Math.round(lineas[i].tam) + 'px ' + FUENTE;
      g.fillStyle = lineas[i].color || '#1d241c';
      g.fillText(lineas[i].t, px, ty);
      ty += lineas[i].tam*1.12 + 1;
    }
  }
  es.forEach(function(e){
    var k = e.caja;
    var px = X((k[0]+k[2])/2), pz = Y((k[1]+k[3])/2);
    var anchoPx = (k[2]-k[0])*pxm, altoPx = (k[3]-k[1])*pxm;
    var nombre = (e.nombre || e.id).toUpperCase();
    var dims = num(k[2]-k[0],2)+' × '+num(k[3]-k[1],2)+' m';
    var m2 = num(superficie(e),1)+' m²';
    /* el texto se ajusta al ambiente: si no cabe, se encoge (y si no cabe,
       no se escribe: mejor un ambiente sin nombre que un nombre encima del vecino) */
    var maxW = Math.min(anchoPx - 14, 3.4*altoPx);
    if(maxW < 46 || altoPx < 44) return;
    function encaja(txt, tam){
      /* 0,70 por carácter: el ancho real sale un 12 % más que el medido */
      while(tam > 10 && txt.length*tam*0.70 > maxW) tam -= 1;
      return tam;
    }
    var t1 = encaja(nombre, Math.round(Math.min(34, (altoPx-16)*0.42)));
    if(t1 < 12) return;
    var t2 = encaja(dims, Math.max(13, t1*0.50));
    var t3 = encaja(m2, Math.max(12, t1*0.44));
    pill([{t:nombre, tam:t1, peso:800},
          {t:dims, tam:t2, peso:600, color:'#4a5347'},
          {t:m2, tam:t3, peso:700, color:'#6a7366'}],
         px, pz, 'rgba(250,248,240,.88)', 'rgba(45,55,46,.20)');
  });

  /* norte y escala */
  var nx = X(b.u0-M+0.8), ny = Y(b.v0-M+0.8);
  g.save();
  g.translate(nx, ny);
  g.fillStyle = 'rgba(235,240,235,.92)';
  g.beginPath(); g.moveTo(0, 34); g.lineTo(-11, 56); g.lineTo(0, 48); g.lineTo(11, 56); g.closePath(); g.fill();
  g.font = '800 22px ' + FUENTE; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(235,240,235,.92)'; g.fillText('N', 0, 22);
  g.restore();
  var barY = Y(b.v0-M+2.3);
  g.strokeStyle = 'rgba(235,240,235,.9)'; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(X(b.u0-M+1.4), barY); g.lineTo(X(b.u0-M+2.4), barY);
  g.moveTo(X(b.u0-M+1.4), barY-6); g.lineTo(X(b.u0-M+1.4), barY+6);
  g.moveTo(X(b.u0-M+2.4), barY-6); g.lineTo(X(b.u0-M+2.4), barY+6);
  g.stroke();
  g.font = '700 15px ' + MONO; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(235,240,235,.9)'; g.fillText('1 m', X(b.u0-M+2.55), barY+5);

  /* códigos */
  if(EST.codigos){
    var nM = 0, nF = 0, nP = 0;
    ms.forEach(function(w){
      var L = Math.hypot(w[2]-w[0], w[3]-w[1]);
      if(L < 0.5) return;
      nM++;
      pill([{t:'M-'+('0'+nM).slice(-2), tam:19, peso:800, color:'#f7f4e8'}],
           X((w[0]+w[2])/2), Y((w[1]+w[3])/2), 'rgba(31,38,31,.88)');
    });
    mbs.forEach(function(m){
      if(!m.uv) return;
      nF++;
      pill([{t:'F-'+('0'+nF).slice(-2), tam:18, peso:800, color:'#241d05'}],
           X(m.uv[0]), Y(m.uv[1]), 'rgba(246,198,74,.94)');
    });
    hs.forEach(function(h){
      var d = datosHueco(h);
      if(!(d.esPuerta || d.esPaso)) return;
      nP++;
      pill([{t:'P-'+('0'+nP).slice(-2), tam:18, peso:800, color:'#241d05'}],
           X(d.centroU), Y(d.centroV), 'rgba(255,255,255,.92)', 'rgba(45,55,46,.28)');
    });
  }
  if(EST.tex) EST.tex.needsUpdate = true;
}

/* =====================================================================================
   5 · Plano 3D: corte de planta con tapa de poché
   ===================================================================================== */
function materialPlano(color){
  return new THREE.MeshLambertMaterial({color:color});
}
function construyePlan3D(){
  if(EST.gPlan) return EST.gPlan;
  if(typeof THREE === 'undefined') return null;
  var g = new THREE.Group();
  var C = api().C || {origen:[0,0]}, o = C.origen || [0,0], suelo = api().SUELO || 0;
  g.position.set(o[0], suelo, o[1]);
  g.rotation.y = api().GIRO || 0;
  g.visible = false;
  api().escena.add(g);
  EST.gPlan = g;

  var cota = (api().C && api().C.cotaSuelo) || 0;      // el piso terminado está a esta altura
  var corte = cota + CORTE;                            // el corte, 1,15 m sobre el piso
  EST.corte = corte;

  var matMuro = materialPlano('#d6d2c4');               // neutro de planta: el color es para el 3D
  var matPoche = new THREE.MeshBasicMaterial({color:'#2f3630', toneMapped:false});
  var matVenta = new THREE.MeshBasicMaterial({color:COL.ventana, toneMapped:false});
  var matPuerta = new THREE.MeshBasicMaterial({color:COL.puerta, toneMapped:false});
  var matPaso = new THREE.MeshBasicMaterial({color:'#9fb0b6', toneMapped:false});

  function muro(grupo, x0, x1, e, y0, y1){
    var L = x1 - x0, cx = (x0+x1)/2, cy = (y0+y1)/2;
    var m = new THREE.Mesh(new THREE.BoxGeometry(L, y1-y0, e), matMuro);
    m.position.set(cx, cy, 0);
    grupo.add(m);
    return m;
  }
  function poche(grupo, x0, x1, e, y){
    var L = x1 - x0, cx = (x0+x1)/2;
    var m = new THREE.Mesh(new THREE.BoxGeometry(L+0.004, GROSOR_PANEL, e+0.004), matPoche);
    m.position.set(cx, y, 0);
    grupo.add(m);
    return m;
  }

  /* --- los muros, cortados a 1,15 m, con su poché --- */
  muros().forEach(function(w){
    var e = w[4] || 0.12;
    var L = Math.hypot(w[2]-w[0], w[3]-w[1]);
    var a = Math.atan2(w[3]-w[1], w[2]-w[0]);
    var gr = new THREE.Group();
    gr.position.set(w[0], 0, w[1]);
    gr.rotation.y = -a;
    g.add(gr);
    /* se alarga e/2 en las puntas para cerrar las esquinas, salvo donde empieza un hueco */
    var x0 = bordeHueco(w[0], w[1]) ? 0 : -e/2;
    var x1 = bordeHueco(w[2], w[3]) ? L : L + e/2;
    muro(gr, x0, x1, e, 0, corte);
    poche(gr, x0, x1, e, corte + GROSOR_PANEL/2 + 0.012);
  });

  /* --- los huecos: el alféizar queda como muro, la ventana se dibuja en el corte --- */
  huecos().forEach(function(h){
    var d = datosHueco(h);
    var L = d.L, e = d.e || 0.12;
    var a = d.a;
    var gr = new THREE.Group();
    gr.position.set(d.u0, 0, d.v0);
    gr.rotation.y = -a;
    g.add(gr);
    if(d.y0 >= corte){
      /* el hueco está entero por encima del corte: ahí el muro está entero */
      muro(gr, 0, L, e, 0, corte);
      poche(gr, 0, L, e, corte + GROSOR_PANEL/2 + 0.012);
      return;
    }
    if(d.y0 > 0){
      /* el peldaño del alféizar, de suelo a alféizar */
      muro(gr, 0, L, e, 0, d.y0);
    }
    if(d.esPuerta || d.esPaso){
      /* umbral: una raya en el corte, del color de la puerta */
      var m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.03, Math.max(0.05, e*0.45)), d.esPaso ? matPaso : matPuerta);
      m.position.set(L/2, corte, 0);
      gr.add(m);
      if(d.esPuerta){
        /* la hoja, tumbada en el suelo, en la posición en que la deja el 3D */
        var hoja = new THREE.Mesh(new THREE.BoxGeometry(d.L, 0.025, 0.05), matPuerta);
        hoja.rotation.y = Math.atan2(-d.lz, d.lx);
        hoja.position.set(d.bisX + d.lx/2, 0.02, d.off + d.lz/2);
        gr.add(hoja);
      }
    } else {
      /* vidrio: una raya fina en la altura del corte */
      var v = new THREE.Mesh(new THREE.BoxGeometry(L, 0.035, Math.max(0.05, e*0.4)), matVenta);
      v.position.set(L/2, corte, 0);
      gr.add(v);
    }
  });

  /* --- la capa de anotación: un plano horizontal con la textura de canvas --- */
  creaLienzo();
  pintaAnotacion();
  var t = new THREE.CanvasTexture(EST.lienzo);
  if('encoding' in t) t.encoding = THREE.sRGBEncoding;
  else if('colorSpace' in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  var cap = api().renderer && api().renderer.capabilities;
  t.anisotropy = Math.min(4, (cap && cap.getMaxAnisotropy) ? cap.getMaxAnisotropy() : 1);
  t.needsUpdate = true;
  EST.tex = t;
  var c = EST.cajaAnot, b = c.b, M = c.M;
  var plano = new THREE.Mesh(
    new THREE.PlaneGeometry(c.anchoM, c.fondoM),
    new THREE.MeshBasicMaterial({map:t, transparent:true, depthTest:false, depthWrite:false, toneMapped:false}));
  plano.rotation.x = -Math.PI/2;
  plano.position.set((b.u0+b.u1)/2, cota + 0.075, (b.v0+b.v1)/2);
  plano.renderOrder = 30;
  g.add(plano);
  EST.planoAnot = plano;
  return g;
}

/* =====================================================================================
   6 · Modo planta: qué se oculta y qué se restaura
   ===================================================================================== */
function cortaPorEncima(){
  /* Se oculta todo lo que asoma por encima del corte:_tabiques, revestimientos, luminarias
     y el mobiliario alto. Se guarda lo que había para devolverlo al salir. */
  var yCorte = (api().SUELO || 0) + (EST.corte || CORTE);
  var capas = api().capas || {};
  var guardados = [], caja = new THREE.Box3(), v = new THREE.Vector3();
  ['muros','interior'].forEach(function(nombre){
    var capa = capas[nombre];
    if(!capa) return;
    capa.traverse(function(o){
      if(!o.isMesh) return;
      if(!o.geometry) return;
      caja.setFromObject(o);
      if(!isFinite(caja.min.y)) return;
      if(caja.max.y > yCorte + 0.001){
        guardados.push([o, o.visible]);
        o.visible = false;
      }
    });
  });
  return guardados;
}

function entraPlan3D(){
  if(EST.plan3D) return true;
  var a = api();
  if(!a.escena || !a.aplicaVista) return false;

  /* Si se está paseando, la órbita y la cámara son del paseo: se sale del paseo antes. */
  if(a.pie && a.pie.activo){
    var salir = a.salirPie || (window.__visor && window.__visor.salirPie);
    if(!salir){ avisa('Sal del paseo (botón «Salir») antes de abrir el plano.'); return false; }
    salir();
  }
  if(a.TOUR && a.TOUR.activo){
    var salirT = a.salirTour || (window.__visor && window.__visor.salirTour);
    if(salirT) salirT(true);
  }

  var g = construyePlan3D();
  if(!g){ avisa('No se ha podido construir el plano 3D.'); return false; }

  /* estado que hay que devolver al salir */
  var capas = a.capas || {};
  EST.guardado = {
    cubierta: capas.cubierta ? capas.cubierta.visible : null,
    arboles: capas.arboles ? capas.arboles.visible : null,
    meshes: cortaPorEncima(),
    cam: camaraActual()
  };
  if(capas.cubierta) capas.cubierta.visible = false;
  if(capas.arboles) capas.arboles.visible = false;
  var pone = api().poneCapa;
  if(pone){ pone('cubierta', false); pone('arboles', false); }
  else{
    var cc = document.getElementById('capa-cubierta'), ca = document.getElementById('capa-arboles');
    if(cc) cc.checked = false;
    if(ca) ca.checked = false;
  }

  g.visible = true;
  EST.plan3D = true;

  /* la cámara, alta y con el norte arriba */
  var b = cajaPlano(), centro = aMundo((b.u0+b.u1)/2, (b.v0+b.v1)/2);
  var tam = Math.max(b.u1-b.u0, b.v1-b.v0);
  EST.PL.x = centro[0]; EST.PL.z = centro[1];
  EST.PL.dist = Math.max(12, tam*1.35);
  EST.PL.theta = a.GIRO || 0;              // con el norte hacia arriba
  EST.PL.phi = 0.62;                      // 35° de caída
  EST.PL.fov = fovObjetivo();

  muestraCapa3D();
  if(EST.btn) EST.btn.textContent = 'Salir del plano';
  return true;
}

function salePlan3D(restauraCamara){
  if(!EST.plan3D) return;
  var a = api(), capas = a.capas || {}, G = EST.guardado;
  EST.plan3D = false;
  if(G){
    (G.meshes || []).forEach(function(p){ p[0].visible = p[1]; });
    if(G.cubierta !== null && capas.cubierta) capas.cubierta.visible = G.cubierta;
    if(G.arboles !== null && capas.arboles) capas.arboles.visible = G.arboles;
    var pone = api().poneCapa;
    if(pone){
      if(G.cubierta !== null) pone('cubierta', G.cubierta);
      if(G.arboles !== null) pone('arboles', G.arboles);
    } else{
      var cc = document.getElementById('capa-cubierta'), ca = document.getElementById('capa-arboles');
      if(cc && G.cubierta !== null) cc.checked = G.cubierta;
      if(ca && G.arboles !== null) ca.checked = G.arboles;
    }
    if(restauraCamara !== false && G.cam) aplicaCamara(G.cam);
  }
  EST.guardado = null;
  if(EST.gPlan) EST.gPlan.visible = false;
  if(EST.overlay) EST.overlay.hidden = true;
  if(EST.hud3d) EST.hud3d.hidden = true;
  if(EST.btn) EST.btn.textContent = 'Plano';
}

/* Estado actual de la órbita, deducido de la cámara (el visor no lo expone). */
function camaraActual(){
  var a = api(), cam = a.camara;
  if(!cam) return null;
  var P = cam.position, dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  var u = dir.clone().negate();                    // del objetivo a la cámara
  if(u.y < 0.08) return null;                      // la cámara está por debajo: no se sabe
  var dist = (P.y - 1)/u.y;
  if(!isFinite(dist) || dist <= 0) return null;
  var obj = P.clone().addScaledVector(u, -dist);
  return {d:dist, t:r2d(Math.atan2(u.x, u.z)), p:r2d(Math.acos(Math.max(-1, Math.min(1, u.y)))), c:[obj.x, obj.z], fov:cam.fov};
}
function aplicaCamara(c){
  if(!c || !api().aplicaVista) return;
  api().aplicaVista({d:c.d, t:c.t, p:c.p, c:c.c, fov:c.fov});
}

/* FOV: se pide en horizontal (70°) y se pasa a vertical con el aspecto del lienzo. */
function fovObjetivo(){
  var a = api(), r = a.renderer && a.renderer.domElement;
  var w = r ? (r.clientWidth || r.width) : 1, h = r ? (r.clientHeight || r.height) : 1;
  var asp = Math.max(0.2, w/Math.max(1, h));
  var fv = r2d(2*Math.atan(Math.tan(d2r(70/2))/asp));
  return Math.max(50, Math.min(94, fv));
}

/* =====================================================================================
   7 · Gestos del plano 3D (capa invisible sobre el lienzo: el visor no los ve)
   ===================================================================================== */
var rayo = null;
function puntoEnElPlano(clientX, clientY){
  var a = api(), cam = a.camara, r = a.renderer && a.renderer.domElement;
  if(!cam || !r) return null;
  if(!rayo) rayo = new THREE.Raycaster();
  var rect = r.getBoundingClientRect();
  var nx = ((clientX - rect.left)/rect.width)*2 - 1;
  var ny = -((clientY - rect.top)/rect.height)*2 + 1;
  rayo.setFromCamera(new THREE.Vector2(nx, ny), cam);
  var d = rayo.ray.direction;
  if(Math.abs(d.y) < 0.02) return null;
  var cota = (api().C && api().C.cotaSuelo) || 0;
  var yPlan = (api().SUELO || 0) + cota + 0.075;
  var t = (yPlan - rayo.ray.origin.y)/d.y;
  if(t <= 0) return null;
  var p = rayo.ray.origin.clone().addScaledVector(d, t);
  var q = uvDe(p.x, p.z);
  return q;
}

function enganchaGestos(){
  var ov = EST.overlay;
  if(!ov) return;
  ov.addEventListener('pointerdown', function(e){
    ov.setPointerCapture(e.pointerId);
    EST.act.id = e.pointerId; EST.act.x = e.clientX; EST.act.y = e.clientY;
    EST.act.mx = e.clientX; EST.act.my = e.clientY; EST.act.mov = 0; EST.act.n = 1;
    EST.act.pinza = 0;
  });
  ov.addEventListener('pointermove', function(e){
    if(e.pointerId !== EST.act.id) return;
    var dx = e.clientX - EST.act.mx, dy = e.clientY - EST.act.my;
    EST.act.mov += Math.abs(dx) + Math.abs(dy);
    EST.act.mx = e.clientX; EST.act.my = e.clientY;
    if(e.pointerType === 'touch' && e.isPrimary === false){        // pinza con dos dedos
      EST.act.n = 2;
      var d = Math.hypot(e.clientX - EST.act.x, e.clientY - EST.act.y);
      if(EST.act.pinza) EST.PL.dist = acotaDist(EST.PL.dist * EST.act.pinza/d);
      EST.act.pinza = d;
      return;
    }
    if(EST.act.n > 1) return;
    EST.PL.theta -= dx*0.006;
    EST.PL.phi = acotaPhi(EST.PL.phi - dy*0.005);
  });
  function fin(e){
    if(e.pointerId !== EST.act.id) return;
    if(EST.act.mov < 8){                                          // un toque: entrar en el ambiente
      var q = puntoEnElPlano(e.clientX, e.clientY);
      if(q){
        var es = estanciaEn(q[0], q[1]);
        if(es) entraEstancia(es);
      }
    }
    EST.act.id = null; EST.act.n = 0; EST.act.pinza = 0; EST.act.mov = 0;
  }
  ov.addEventListener('pointerup', fin);
  ov.addEventListener('pointercancel', function(){ EST.act.id = null; EST.act.n = 0; EST.act.pinza = 0; });
  ov.addEventListener('wheel', function(e){
    e.preventDefault();
    EST.PL.dist = acotaDist(EST.PL.dist * Math.pow(1.0013, e.deltaY));
  }, {passive:false});
}
function acotaDist(d){ return Math.max(8, Math.min(90, d)); }
function acotaPhi(p){ return Math.max(0.18, Math.min(1.30, p)); }

/* =====================================================================================
   8 · Entrar en un ambiente
   ===================================================================================== */
function vistaDeEstancia(e){
  var k = e.caja, w = k[2]-k[0], d = k[3]-k[1];
  var c = aMundo((k[0]+k[2])/2, (k[1]+k[3])/2);
  return {d: Math.max(w, d)*1.5 + 7, t: 15, p: 20, c: c, sinTejado: true, fov: 42};
}
function entraEstancia(e){
  if(!e) return;
  var a = api();
  if(a.pie && a.pie.activo){
    var salir = a.salirPie || (window.__visor && window.__visor.salirPie);
    if(salir) salir();
  }
  if(EST.plan3D) salePlan3D(false);          // se sale del modo planta sin tocar la cámara
  cierraPanel();
  var vista = null;
  if(a.VISTAS){
    for(var i=0; i<a.VISTAS.length; i++) if(a.VISTAS[i][1] === e.id){ vista = a.VISTAS[i]; break; }
  }
  if(vista && a.eligeVista) a.eligeVista(e.id);
  else if(a.aplicaVista) a.aplicaVista(vistaDeEstancia(e));
  if(a.VISTAS) for(var j=0; j<a.VISTAS.length; j++) if(a.VISTAS[j][1] === e.id && a.eligeVista) a.eligeVista(e.id);
}

/* =====================================================================================
   9 · Panel propio (no es el #panel del visor) y botón del HUD
   ===================================================================================== */
function css(){
  var id = 'plano-css';
  if(document.getElementById(id)) return;
  var st = document.createElement('style');
  st.id = id;
  st.textContent =
   '#plano-panel{position:fixed;left:12px;top:12px;bottom:12px;width:min(430px,calc(100vw - 24px));z-index:30;'+
   'display:flex;flex-direction:column;background:'+COL.lamina+';border:1px solid #21323a;border-radius:6px;'+
   'box-shadow:0 10px 34px rgba(0,0,0,.55);color:'+COL.texto+';font-family:IBM Plex Sans Condensed,system-ui,sans-serif;'+
   'overflow:hidden;box-sizing:border-box}'+
   '#plano-panel[hidden]{display:none!important}'+
   '#plano-panel .pl-cab{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #1b2a31}'+
   '#plano-panel h2{margin:0;font-size:14px;font-weight:600;letter-spacing:.04em;flex:1}'+
   '#plano-panel .pl-x{width:30px;height:30px;border:1px solid #2a3d46;background:transparent;color:'+COL.texto+';'+
   'border-radius:4px;font-size:17px;line-height:1;cursor:pointer}'+
   '#plano-panel .pl-cuerpo{flex:1;overflow:auto;padding:10px 12px;-webkit-overflow-scrolling:touch}'+
   '#plano-panel svg{width:100%;height:auto;display:block;border-radius:4px;background:'+COL.fondo+'}'+
   '#plano-panel .pl-bot{display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid #1b2a31}'+
   '#plano-panel button.pl-b{font:inherit;font-size:13px;font-weight:600;color:'+COL.texto+';background:#16262d;'+
   'border:1px solid #2a3d46;border-radius:4px;padding:11px 12px;min-height:44px;cursor:pointer;flex:1 1 auto}'+
   '#plano-panel button.pl-b[aria-pressed="true"]{background:#26402f;border-color:'+COL.muro+';color:'+COL.muro+'}'+
   '#plano-panel .pl-ayuda{margin:8px 0 0;font-size:12px;line-height:1.45;color:'+COL.tenue+'}'+
   '#plano-panel .pl-leyenda{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 0;font-size:11.5px;color:'+COL.tenue+'}'+
   '#plano-panel .pl-leyenda i{display:inline-block;width:14px;height:4px;border-radius:2px;margin-right:5px;vertical-align:middle}'+
   '#plano-panel .pl-lista{margin:12px 0 0;display:grid;gap:4px}'+
   '#plano-panel .pl-lista button{display:flex;justify-content:space-between;gap:8px;font:inherit;font-size:12.5px;'+
   'text-align:left;color:'+COL.texto+';background:#101d23;border:1px solid #1e2f36;border-radius:4px;padding:9px 10px;'+
   'min-height:44px;cursor:pointer}'+
   '#plano-panel .pl-lista b{font-weight:600}'+
   '#plano-panel .pl-lista span{font-family:IBM Plex Mono,monospace;color:'+COL.tenue+';font-size:11.5px}'+
   '#plano-panel .pl-est{color:'+COL.muro+';font-family:IBM Plex Mono,monospace}'+
   '#plano-btn{position:fixed;right:12px;top:92px;z-index:24;height:44px;min-width:44px;padding:0 14px;'+
   'font:inherit;font-size:13px;font-weight:600;color:#eaf2f5;background:#16262d;border:1px solid #2a3d46;'+
   'border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer}'+
   '#plano-btn[aria-pressed="true"]{border-color:'+COL.muro+';color:'+COL.muro+'}'+
   '#plano-capa{position:fixed;inset:0;z-index:12;touch-action:none;background:transparent}'+
   '#plano-capa[hidden]{display:none!important}'+
   '#plano-hud3d{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:26;display:flex;gap:8px;'+
   'align-items:center;background:#0f1c22;border:1px solid #21323a;border-radius:6px;padding:6px 8px;'+
   'box-shadow:0 8px 24px rgba(0,0,0,.5)}'+
   '#plano-hud3d[hidden]{display:none!important}'+
   '#plano-hud3d span{font-size:12px;font-weight:600;letter-spacing:.05em;color:'+COL.muro+';padding:0 6px}'+
   '#plano-hud3d button{font:inherit;font-size:12.5px;font-weight:600;color:'+COL.texto+';background:#16262d;'+
   'border:1px solid #2a3d46;border-radius:4px;padding:10px 12px;min-height:44px;cursor:pointer}'+
   '#plano-hud3d button[aria-pressed="true"]{border-color:'+COL.muro+';color:'+COL.muro+'}'+
   '#plano-aviso{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:31;background:#2b2110;color:#ffd88a;'+
   'border:1px solid #6b5220;border-radius:4px;padding:10px 14px;font-size:12.5px;max-width:min(90vw,420px)}'+
   '#plano-aviso[hidden]{display:none!important}'+
   '@media (max-width:860px){#plano-panel{left:0;right:0;top:auto;bottom:0;width:auto;max-height:78dvh;'+
   'border-radius:8px 8px 0 0}#plano-btn{top:76px;right:12px}}';
  document.head.appendChild(st);
}

function avisa(txt){
  var a = document.getElementById('plano-aviso');
  if(!a){
    a = document.createElement('div');
    a.id = 'plano-aviso';
    a.hidden = true;
    document.body.appendChild(a);
  }
  a.textContent = txt;
  a.hidden = false;
  clearTimeout(EST.tAviso);
  EST.tAviso = setTimeout(function(){ a.hidden = true; }, 3200);
}

function creaPanel(){
  if(EST.panel) return;
  var p = document.createElement('div');
  p.id = 'plano-panel';
  p.hidden = true;
  p.innerHTML =
   '<div class="pl-cab"><h2>Plano de la casa</h2>'+
   '<button class="pl-x" type="button" aria-label="Cerrar el plano">×</button></div>'+
   '<div class="pl-cuerpo"><div class="pl-mapa"></div>'+
   '<p class="pl-ayuda">Toca un ambiente del plano para entrar en él. Arrastrar gira la vista en 3D, '+
   'pellizcar acerca y la rueda también.</p>'+
   '<div class="pl-leyenda">'+
   '<span><i style="background:'+COL.muro+'"></i>muro</span>'+
   '<span><i style="background:'+COL.ventana+'"></i>ventana</span>'+
   '<span><i style="background:'+COL.puerta+'"></i>puerta</span>'+
   '<span><i style="background:'+COL.paso+'"></i>paso</span></div>'+
   '<div class="pl-lista"></div></div>'+
   '<div class="pl-bot">'+
   '<button class="pl-b" id="plano-ver3d" type="button">Ver en 3D</button>'+
   '<button class="pl-b" id="plano-cod" type="button" aria-pressed="false">Códigos</button>'+
   '</div>';
  document.body.appendChild(p);
  EST.panel = p;
  EST.lista = p.querySelector('.pl-lista');
  p.querySelector('.pl-x').addEventListener('click', function(){ cierraPanel(); });
  p.querySelector('#plano-ver3d').addEventListener('click', function(){
    cierraPanel();
    if(!entraPlan3D()) avisa('No se ha podido abrir el plano 3D.');
  });
  var bc = p.querySelector('#plano-cod');
  bc.addEventListener('click', function(){ setCodigos(!EST.codigos); });
  EST.btnCod = bc;
  refrescaPlano();
}

function refrescaPlano(){
  if(!EST.panel) return;
  var cont = EST.panel.querySelector('.pl-mapa');
  cont.innerHTML = dibujaSVG();
  var svg = cont.querySelector('svg');
  EST.svg = svg;
  svg.addEventListener('click', function(ev){
    var t = ev.target;
    while(t && t !== svg && !(t.getAttribute && t.getAttribute('data-e'))) t = t.parentNode;
    if(!t || t === svg) return;
    var e = null, l = estancias();
    for(var i=0; i<l.length; i++) if(l[i].id === t.getAttribute('data-e')){ e = l[i]; break; }
    if(e) entraEstancia(e);
  });
  /* lista de ambientes: se entra también desde aquí */
  var html = '';
  estancias().forEach(function(e){
    var k = e.caja;
    html += '<button type="button" data-e="'+esc(e.id)+'"><b>'+esc(e.nombre || e.id)+'</b>'+
            '<span>'+num(k[2]-k[0],2)+'×'+num(k[3]-k[1],2)+' · '+num(superficie(e),1)+' m²</span></button>';
  });
  EST.lista.innerHTML = html;
  EST.lista.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('button[data-e]') : null;
    if(!b) return;
    var e = null, l = estancias();
    for(var i=0; i<l.length; i++) if(l[i].id === b.getAttribute('data-e')){ e = l[i]; break; }
    if(e) entraEstancia(e);
  });
}

function creaBoton(){
  if(EST.btn) return;
  var b = document.createElement('button');
  b.id = 'plano-btn';
  b.type = 'button';
  b.textContent = 'Plano';
  b.setAttribute('aria-pressed','false');
  b.addEventListener('click', function(){ alterna(); });
  document.body.appendChild(b);
  EST.btn = b;
}

function creaCapa3D(){
  if(EST.overlay) return;
  var ov = document.createElement('div');
  ov.id = 'plano-capa';
  ov.hidden = true;
  document.body.appendChild(ov);
  EST.overlay = ov;
  enganchaGestos();

  var h = document.createElement('div');
  h.id = 'plano-hud3d';
  h.hidden = true;
  h.innerHTML = '<span>PLANO 3D</span>'+
    '<button type="button" id="plano-h-cod" aria-pressed="false">Códigos</button>'+
    '<button type="button" id="plano-h-2d">Plano 2D</button>'+
    '<button type="button" id="plano-h-salir">Salir</button>';
  document.body.appendChild(h);
  EST.hud3d = h;
  h.querySelector('#plano-h-cod').addEventListener('click', function(){ setCodigos(!EST.codigos); });
  h.querySelector('#plano-h-2d').addEventListener('click', function(){ salePlan3D(true); abrePanel(); });
  h.querySelector('#plano-h-salir').addEventListener('click', function(){ salePlan3D(true); });
}
function muestraCapa3D(){
  if(EST.overlay) EST.overlay.hidden = false;
  if(EST.hud3d) EST.hud3d.hidden = false;
  if(EST.btn) EST.btn.setAttribute('aria-pressed','true');
}

/* =====================================================================================
   10 · API pública
   ===================================================================================== */
function abrePanel(){
  if(!EST.panel) creaPanel();
  refrescaPlano();
  EST.panel.hidden = false;
  EST.abierto = true;
  if(EST.btn) EST.btn.setAttribute('aria-pressed','true');
}
function cierraPanel(){
  if(EST.panel) EST.panel.hidden = true;
  EST.abierto = false;
  if(EST.btn && !EST.plan3D) EST.btn.setAttribute('aria-pressed','false');
}
function alterna(){
  if(EST.plan3D){ salePlan3D(true); cierraPanel(); return; }
  if(EST.abierto){ cierraPanel(); return; }
  abrePanel();
}
function setCodigos(v){
  EST.codigos = !!v;
  if(EST.btnCod) EST.btnCod.setAttribute('aria-pressed', EST.codigos ? 'true' : 'false');
  var hc = EST.hud3d && EST.hud3d.querySelector('#plano-h-cod');
  if(hc) hc.setAttribute('aria-pressed', EST.codigos ? 'true' : 'false');
  if(EST.ctx) pintaAnotacion();          // la misma textura de canvas, redibujada
  if(EST.abierto) refrescaPlano();
}
function esPlan3D(){ return EST.plan3D; }

AD.plano = {
  abrir: abrePanel,
  cerrar: function(){ salePlan3D(true); cierraPanel(); },
  alternar: alterna,
  esPlan3D: esPlan3D,
  setCodigos: setCodigos
};

/* =====================================================================================
   11 · Arranque: se espera a que el coordinator defina AD.api
   ===================================================================================== */
function monta(){
  if(EST.montado) return true;
  var a = api();
  if(!a.C || !a.INT || !a.escena || !a.camara) return false;
  css();
  creaPanel();
  creaBoton();
  creaCapa3D();
  EST.montado = true;
  if(AD.onFrame) AD.onFrame(frame);
  else enganchaFrame();
  if(AD.piezas && AD.piezas.registra){
    AD.piezas.registra({id:'PLANO-3D', etiqueta:'Plano 3D (corte de planta)', tipo:'vista', grupo:'Plano',
      abre:function(){ if(!EST.plan3D){ cierraPanel(); entraPlan3D(); } },
      cierra:function(){ salePlan3D(true); },
      estado:function(){ return EST.plan3D ? 1 : 0; }});
  }
  return true;
}
function enganchaFrame(){
  if(EST.frameHook) return;
  if(AD.onFrame){ AD.onFrame(frame); EST.frameHook = true; return; }
  setTimeout(enganchaFrame, 120);
}
/* Cada cuadro: en modo planta se manda la cámara y se refina el FOV. */
function frame(){
  if(!EST.plan3D) return;
  var a = api();
  if(!a.aplicaVista) return;
  if(a.pie && a.pie.activo) return;                 // el paseo manda
  var fv = fovObjetivo();
  if(Math.abs(fv - EST.PL.fov) > 0.4) EST.PL.fov = fv;
  a.aplicaVista({d:EST.PL.dist, t:r2d(EST.PL.theta), p:r2d(EST.PL.phi),
                 c:[EST.PL.x, EST.PL.z], fov:EST.PL.fov});
}

var intentos = 0;
function espera(){
  if(monta()) return;
  intentos++;
  if(intentos > 200) return;                        // 30 s: se agotó la espera
  setTimeout(espera, 150);
}
/* El coordinator avisa con AD.avisaListo cuando AD.api ya está; si no existe
   (o si este módulo se cargara antes que visor.js), se sigue probando. */
if(AD.avisaListo) AD.avisaListo(function(){ monta(); });
if(document.readyState === 'complete') espera();
else addEventListener('load', espera);
setTimeout(espera, 150);
addEventListener('resize', function(){ if(EST.plan3D) EST.PL.fov = fovObjetivo(); });

})();
