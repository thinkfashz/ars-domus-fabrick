/* Ars Domus FABRICK · modulo/exterior.js
   -------------------------------------------------------------------------------
   LA LUZ DE FUERA, CON CRITERIO DE PROYECTO.

   Este modulo no dibuja la finca: la ilumina. Todo lo que pone sale del dato
   (`exterior.farolas`, `exterior.piscina`, `exterior.construcciones`,
   `exterior.caminos`, `exterior.porton`) y de la escena que ya ha montado el
   visor. Ni una sola posicion escrita a mano.

   LA REGLA DE ORO
   ---------------
   Una lámpara ilumina su entorno y nada más. Alcance corto (2–6 m), intensidad
   baja, y la suma no satura la exposición. De noche se quiere ver DÓNDE SE PISA,
   no que la finca parezca un estadio. Por eso:

   · el huerto y la era no tienen ni una luz: de noche, la oscuridad es correcta;
   · la exposición general NO se toca jamás: si la noche se ve quemada, el
     arreglo es bajar intensidades, no subir exposición;
   · cada farolillo tiene su propia luz corta: no una grande que alumbre treinta
     metros desde el portalón.

   Ademas de la luz de fuera, este modulo deja el aire y las sombras como pide
   el motor de render:

   · la densidad de la luz volumétrica sigue la hora (0,004 de día, 0,007 de
     penumbra, 0,010 de noche) y cambia sola cuando cambia el sol;
   · el mapa de sombras del sol pasa a PCF (borde más nítido en el exterior) y
     el radio de sombra se deja en 1 texel;
   · de noche, la niebla de la escena hace de velo de aire: da profundidad al
     jardín sin borrar ni el cielo ni la casa.

   API pública: AD.exterior = {abrir(), cerrar(), alterna(), abierto(), estado()}.
*/
var AD = window.AD || (window.AD = {});
(function(){
'use strict';

/* ── Los tres ambientes del interruptor ───────────────────────────────────── */
var MODOS = ['noche', 'penumbra', 'apagado'];
var ETIQUETA = {dia:'Día', noche:'Noche de la finca', penumbra:'Penumbra', apagado:'Todo apagado'};

/* ── Color y número de cada luz ───────────────────────────────────────────── */
/* El color sale de la temperatura: 2700–3000 K es una bombilla cálida; el
   turquesa es el único color frío del jardín (el agua). */
var COL = {
  farolillo: '#ffbe86',   // 2700 K — la baliza del camino
  globo:     '#ffd3a4',   // 3000 K — la farola de globo de la piscina
  porton:    '#ffc78d',   // 2800 K — el acento del pilar
  pergola:   '#ffe0b8',   // 3200 K — la luz de volumen, casi blanca
  caseta:    '#ffdcae',   // 3000 K — la rendija de la puerta
  agua:      '#63e6df'    // turquesa — la luz bajo el agua
};
/* Intensidad (candela), alcance (m) y caída (decay). Corto, siempre. */
var NUM = {
  farolillo: {i:0.55, d:4.4, decay:1.8},
  porton:    {i:0.42, d:3.8, decay:1.8},
  pergola:   {i:0.22, d:4.6, decay:1.8},
  caseta:    {i:0.20, d:3.4, decay:1.8},
  agua:      {i:1.00, d:7.0, decay:1.5}
};
/* Cuánto pesa cada ambiente sobre la luz de fuera. De día la manda el panel
   (el grupo encendío o no); de noche manda el ambiente. */
var FACTOR = {noche:1.0, penumbra:0.55, apagado:0, dia:0.75};
/* La densidad del aire (luz volumétrica): por la hora del sol, no por el modo. */
var DENSIDAD = {dia:0.004, penumbra:0.007, noche:0.010};
/* El velo de aire de la noche: cerca para que se note, lejos para no borrar. */
var VELO = {noche:{near:22, far:240}, penumbra:{near:30, far:300}};

/* Cuántas luces puntuales de fuera se permiten: ocho, ni una más. En un móvil
   se Bajan a cuatro: con el reparto del visor (8), las de relleno por estancia
   y las de la luz globo, se llega a treinta y el frame se cae. */
var TACTIL = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
var MAX_LUCES = TACTIL ? 4 : 8;

var EST = {
  montado:false, modo:'dia', antes:null,
  luces:[], charcos:[], emisores:[], mallas:[],
  sol:null, tex:null, sombra:{hecha:false}
};

/* ── Utilidades ───────────────────────────────────────────────────────────── */
function api(){ return AD.api || null; }
function T(){ return window.THREE || null; }

/* El exterior: lo normal es que venga en `C0.exterior`; si el visor lo deja
   en la raíz de la casa (como hace la demo), se busca ahí. */
function datos(){
  var a = api(), c0 = a && a.C0, e = null;
  if(c0 && c0.exterior) e = c0.exterior;
  else if(window.CASA && window.CASA.exterior) e = window.CASA.exterior;
  else if(window.FINCA && window.FINCA.exterior) e = window.FINCA.exterior;
  return e || null;
}
function sueloBase(){ var a = api(); return (a && a.SUELO !== undefined) ? a.SUELO : 0.25; }
function d2r(d){ return d*Math.PI/180; }

/* El sol: la direccional que proyecta sombra. */
function buscaSol(){
  var a = api();
  if(!a || !a.escena) return null;
  var s = null;
  a.escena.traverse(function(o){ if(!s && o.isDirectionalLight && o.castShadow) s = o; });
  return s;
}

/* La altura del sol, en grados, leída de su posición: así el módulo se entera
   de la hora sin tocar el deslizador del visor. */
function alturaSol(){
  var s = EST.sol;
  if(!s) return 90;
  var p = s.position, l = Math.sqrt(p.x*p.x + p.y*p.y + p.z*p.z);
  if(!l) return 90;
  var v = Math.max(-1, Math.min(1, p.y/l));
  return Math.asin(v)*180/Math.PI;
}

/* El punto de luz del visor que corresponde a una farola (por su id). */
function puntoDe(id){
  var a = api();
  if(!a || !a.PUNTOS) return null;
  for(var i = 0; i < a.PUNTOS.length; i++){
    var p = a.PUNTOS[i];
    if(!p || !p.mallas || !p.mallas.length) continue;
    var info = p.mallas[0].userData && p.mallas[0].userData.info;
    if(info && info.id === id) return p;
  }
  return null;
}

/* La posición de una farola en el mundo: la del visor si existe; si no, la
   del dato (y = cota de la baliza). */
function posFarola(f){
  var t3 = T();
  var p = puntoDe(f.id);
  if(p && p.mallas[0] && t3){
    var v = p.mallas[0].getWorldPosition(new t3.Vector3());
    return [v.x, v.y, v.z];
  }
  var s = sueloBase();
  var y = f.tipo === 'globo' ? s + 2.45 : s + 0.95;
  return [f.mundo[0], y, f.mundo[1]];
}

/* ── Geometría mínima: ¿dentro de un polígono? ¿a cuánto de un eje? ─────── */
function dentro(poly, x, z){
  if(!poly || poly.length < 3) return false;
  var dentro_ = false;
  for(var i = 0, j = poly.length-1; i < poly.length; j = i++){
    var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if(((zi > z) !== (zj > z)) && (x < (xj-xi)*(z-zi)/(zj-zi) + xi)) dentro_ = !dentro_;
  }
  return dentro_;
}
function distEje(x, z, eje){
  if(!eje || eje.length < 2) return 1e9;
  var mejor = 1e9;
  for(var i = 1; i < eje.length; i++){
    var ax = eje[i-1][0], az = eje[i-1][1], bx = eje[i][0], bz = eje[i][1];
    var dx = bx-ax, dz = bz-az, l2 = dx*dx + dz*dz;
    var t = l2 ? ((x-ax)*dx + (z-az)*dz)/l2 : 0;
    t = Math.max(0, Math.min(1, t));
    var px = ax + dx*t, pz = az + dz*t;
    var d = Math.hypot(x-px, z-pz);
    if(d < mejor) mejor = d;
  }
  return mejor;
}
/* La cota del suelo en un punto: la explanada de la piscina, el camino, o el
   terreno. Sale del dato, no de un número escrito a mano. */
function sueloEn(x, z, d){
  var s = sueloBase(), res = 0.02;
  var P = d.piscina;
  if(P && P.plataforma && P.plataforma.cesped && dentro(P.plataforma.cesped, x, z))
    res = Math.max(res, s + (P.plataforma.alto || 0) + 0.02);
  (d.caminos || []).forEach(function(c, i){
    if(!c.eje) return;
    if(distEje(x, z, c.eje) <= (c.ancho || 1)/2 + 0.3)
      res = Math.max(res, s + 0.03 + i*0.004 + 0.015);
  });
  return res;
}

/* Rotación en Y: el visor gira las construcciones con PI - rumbo. */
function rota(th, x, z){
  var c = Math.cos(th), s = Math.sin(th);
  return [x*c + z*s, -x*s + z*c];
}

/* ── Piezas de luz ────────────────────────────────────────────────────────── */
/* El halo: un degradado radial dibujado en canvas, una sola vez para todo. */
function texHalo(){
  if(EST.tex) return EST.tex;
  var t3 = T();
  if(!t3) return null;
  var c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  var g = c.getContext('2d');
  if(g && g.createRadialGradient){
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.22, 'rgba(255,255,255,0.62)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.17)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  var t = new t3.CanvasTexture(c);
  if(t3.sRGBEncoding) t.encoding = t3.sRGBEncoding;
  EST.tex = t;
  return t;
}
/* El halo de una fuente de luz: sprite aditivo (siempre mira a la cámara). */
function halo(t3, color, size, opacidad){
  var tex = texHalo();
  if(!tex) return null;
  var s = new t3.Sprite(new t3.SpriteMaterial({map:tex, color:color, transparent:true,
    blending:t3.AdditiveBlending, depthWrite:false, toneMapped:false, opacity:opacidad || 0.9}));
  s.scale.set(size, size, 1);
  return s;
}
/* El charco de luz en el suelo: un plano tumbado con la misma textura. */
function charco(t3, color, size, opacidad){
  var tex = texHalo();
  if(!tex) return null;
  var m = new t3.Mesh(new t3.PlaneGeometry(size, size),
    new t3.MeshBasicMaterial({map:tex, color:color, transparent:true, side:t3.DoubleSide,
      blending:t3.AdditiveBlending, depthWrite:false, toneMapped:false, opacity:opacidad || 0.8}));
  m.rotation.x = -Math.PI/2;
  m.renderOrder = 3;
  return m;
}
/* La bombilla: una esfera emisiva que el tone mapping no puede apagar. */
function bombilla(t3, color, radio){
  var m = new t3.Mesh(new t3.SphereGeometry(radio || 0.115, 12, 10),
    new t3.MeshBasicMaterial({color:color, toneMapped:false}));
  m.renderOrder = 4;
  return m;
}

/* ── Lo que se enciende y lo que no ──────────────────────────────────────── */
/* El estado que hay que mirar para saber si un grupo está encendido: el visor
   lo decide con `LZ.todo` o con el grupo. Si el panel apaga «Camino», la luz
   de la finca se apaga con él. */
function grupoEncendido(grupo){
  var a = api(), LZ = a && a.LZ;
  if(!LZ) return false;
  if(LZ.todo) return true;
  return !!LZ.grupos[grupo];
}

/* ── Montaje: la luz de fuera ─────────────────────────────────────────────── */
function crea(){
  var a = api(), t3 = T(), d = datos();
  if(!a || !a.escena || !t3 || !d) return;
  var escena = a.escena, s = sueloBase();

  /* 1. Los farolillos del camino: luz globo, alcance corto y charco en el suelo. */
  (d.farolas || []).forEach(function(f){
    if(f.tipo !== 'farolillo' && f.tipo !== 'globo') return;
    var p = posFarola(f);
    var esGlobo = f.tipo === 'globo';
    var col = esGlobo ? COL.globo : COL.farolillo;
    var grupo = f.grupo || 'Camino';

    /* La esfera emisiva: en el farolillo sustituye a la bombilla cuadrada del
       visor (que queda dentro); en la farola de globo, el visor ya pone la
       esfera y aquí no se duplica. */
    if(!esGlobo){
      var bo = bombilla(t3, col, 0.115);
      bo.position.set(p[0], p[1], p[2]);
      bo.visible = false;
      escena.add(bo);
      EST.emisores.push({malla:bo, grupo:grupo, base:0});
      EST.mallas.push(bo);
    }

    /* El charco de luz en el suelo: la mancha cálida que dice dónde se pisa. */
    var suelo = sueloEn(p[0], p[2], d);
    var ch = charco(t3, col, esGlobo ? 5.2 : 3.4, esGlobo ? 0.55 : 0.85);
    if(ch){
      ch.position.set(p[0], suelo + 0.012, p[2]);
      ch.visible = false;
      escena.add(ch);
      EST.charcos.push({malla:ch, grupo:grupo, base:esGlobo ? 0.55 : 0.85});
      EST.mallas.push(ch);
    }

    /* La luz: solo los farolillos del camino llevan una propia (corta). Las
       farolas de globo de la piscina ya las alumbra el reparto del visor. */
    if(!esGlobo && EST.luces.length < MAX_LUCES){
      var luz = new t3.PointLight(col, 0, NUM.farolillo.d, NUM.farolillo.decay);
      luz.position.set(p[0], p[1], p[2]);
      escena.add(luz);
      EST.luces.push({luz:luz, base:NUM.farolillo.i, grupo:grupo});
    }
  });

  /* 2. La piscina: luz bajo el agua en la weir y reflejo en el borde. */
  var P = d.piscina;
  if(P && P.centro && EST.luces.length < MAX_LUCES){
    var r = d2r(P.rumbo || 0);
    var EJE_L = [Math.sin(r), -Math.cos(r)], EJE_A = [-Math.cos(r), -Math.sin(r)];
    function enPis(a, l){
      return [P.centro[0] + a*EJE_A[0] + l*EJE_L[0], P.centro[1] + a*EJE_A[1] + l*EJE_L[1]];
    }
    /* La weir es el borde del vaso más lejos de los escalones: ahí rebosa. */
    var esc = (P.escalones && P.escalones.length) ? enPis(P.escalones[0].a, P.escalones[0].l) : null;
    var w1 = enPis(P.ancho/2, 0), w2 = enPis(-P.ancho/2, 0);
    var weir = esc ? (Math.hypot(w1[0]-esc[0], w1[1]-esc[1]) >= Math.hypot(w2[0]-esc[0], w2[1]-esc[1]) ? w1 : w2) : w2;
    var dx = weir[0]-P.centro[0], dz = weir[1]-P.centro[1];
    var dl = Math.hypot(dx, dz) || 1;
    var posW = [P.centro[0] + dx/dl*(dl-0.5), P.centro[1] + dz/dl*(dl-0.5)];
    var hp = (P.plataforma && P.plataforma.alto) || 0;
    var aguaY = s + hp - 0.14;                    // la lámina de agua
    var luz = new t3.PointLight(COL.agua, 0, NUM.agua.d, NUM.agua.decay);
    luz.position.set(posW[0], aguaY - 0.3, posW[1]);
    escena.add(luz);
    var hAgua = halo(t3, COL.agua, 2.2, 0.75);
    if(hAgua){ hAgua.position.copy(luz.position); hAgua.visible = false; escena.add(hAgua); }
    EST.luces.push({luz:luz, base:NUM.agua.i, grupo:'Piscina', halo:hAgua, haloBase:0.75});

    /* El reflejo en el borde: el agua turquesa se derrama por la piedra. */
    var borde = charco(t3, COL.agua, 3.4, 0.7);
    if(borde){
      borde.position.set(posW[0], s + hp + 0.06, posW[1]);
      borde.visible = false;
      escena.add(borde);
      EST.charcos.push({malla:borde, grupo:'Piscina', base:0.7});
      EST.mallas.push(borde);
    }
  }

  /* 3. La pérgola y la caseta: luz baja que marca el volumen, no que lo baña. */
  (d.construcciones || []).forEach(function(k){
    if(!k.centro) return;
    var th = Math.PI - d2r(k.rumbo || 0);
    var y0 = s + (k.cota || 0);
    if(k.id === 'caseta'){
      /* La rendija de la puerta: la luz de dentro, que dibuja el hueco. */
      var off = rota(th, (k.ancho||2)/2 + 0.04, 0);
      var dxC = k.centro[0] + off[0], dzC = k.centro[1] + off[1];
      var rendija = new t3.Mesh(new t3.PlaneGeometry(1.3, 1.8),
        new t3.MeshBasicMaterial({color:COL.caseta, transparent:true, opacity:0.75,
          toneMapped:false, side:t3.DoubleSide, depthWrite:false}));
      rendija.position.set(dxC, y0 + 1.0, dzC);
      rendija.rotation.y = th + Math.PI/2;
      rendija.renderOrder = 4;
      rendija.visible = false;
      escena.add(rendija);
      EST.emisores.push({malla:rendija, grupo:'Piscina', base:0});
      EST.mallas.push(rendija);
      if(EST.luces.length < MAX_LUCES){
        var lp = rota(th, (k.ancho||2)/2 + 0.6, 0);
        var luz = new t3.PointLight(COL.caseta, 0, NUM.caseta.d, NUM.caseta.decay);
        luz.position.set(k.centro[0] + lp[0], y0 + 1.25, k.centro[1] + lp[1]);
        escena.add(luz);
        var hC = halo(t3, COL.caseta, 1.3, 0.8);
        if(hC){ hC.position.copy(luz.position); hC.visible = false; escena.add(hC); }
        EST.luces.push({luz:luz, base:NUM.caseta.i, grupo:'Piscina', halo:hC, haloBase:0.8});
      }
    } else {
      /* La pérgola: una regleta de LED bajo la viga larga y una luz baja dentro. */
      var off2 = rota(th, -((k.ancho||4)/2 - 0.05), 0);
      var barra = new t3.Mesh(new t3.BoxGeometry(0.05, 0.03, (k.largo||4) - 0.4),
        new t3.MeshBasicMaterial({color:COL.pergola, toneMapped:false}));
      barra.position.set(k.centro[0] + off2[0], y0 + (k.alto||2.5) - 0.06, k.centro[1] + off2[1]);
      barra.rotation.y = th;
      barra.renderOrder = 4;
      barra.visible = false;
      escena.add(barra);
      EST.emisores.push({malla:barra, grupo:'Piscina', base:0});
      EST.mallas.push(barra);
      if(EST.luces.length < MAX_LUCES){
        var luz2 = new t3.PointLight(COL.pergola, 0, NUM.pergola.d, NUM.pergola.decay);
        luz2.position.set(k.centro[0], y0 + (k.alto||2.5) - 0.9, k.centro[1]);
        escena.add(luz2);
        var hP = halo(t3, COL.pergola, 1.6, 0.55);
        if(hP){ hP.position.copy(luz2.position); hP.visible = false; escena.add(hP); }
        EST.luces.push({luz:luz2, base:NUM.pergola.i, grupo:'Piscina', halo:hP, haloBase:0.55});
      }
    }
  });

  /* 4. El portalón y la entrada: un acento en el pilar. */
  if(d.porton && d.porton.a && d.porton.b && EST.luces.length < MAX_LUCES){
    var po = d.porton, a = po.a, b = po.b;
    var thp = -Math.atan2(b[1]-a[1], b[0]-a[0]);
    var offp = rota(thp, -(po.pilar||0.5)/2, 0);
    var px = a[0] + offp[0], pz = a[1] + offp[1];
    /* Un poco hacia el camino, para que la luz pegue la cara del pilar. */
    var mitad = [(a[0]+b[0])/2, (a[1]+b[1])/2];
    var dl = Math.hypot(mitad[0]-px, mitad[1]-pz) || 1;
    px += (mitad[0]-px)/dl*0.42; pz += (mitad[1]-pz)/dl*0.42;
    var luzP = new t3.PointLight(COL.porton, 0, NUM.porton.d, NUM.porton.decay);
    luzP.position.set(px, s + (po.pilarAlto||2.2)*0.78, pz);
    escena.add(luzP);
    var hPo = halo(t3, COL.porton, 1.1, 0.85);
    if(hPo){ hPo.position.copy(luzP.position); hPo.visible = false; escena.add(hPo); }
    EST.luces.push({luz:luzP, base:NUM.porton.i, grupo:'Camino', halo:hPo, haloBase:0.85});
    var hc = charco(t3, COL.porton, 4.0, 0.5);
    if(hc){
      hc.position.set(px, sueloEn(px, pz, d) + 0.012, pz);
      hc.visible = false;
      escena.add(hc);
      EST.charcos.push({malla:hc, grupo:'Camino', base:0.5});
      EST.mallas.push(hc);
    }
  }

  /* 5. Lo que NO tiene luz: el huerto y la era. Se anotan para que se vea
     que es una decisión y no un olvido. */
  EST.oscuras = (d.zonas || []).filter(function(z){
    return z.mat === 'huerto' || z.mat === 'losa' || z.id === 'huerto' || z.id === 'era';
  }).map(function(z){ return z.nombre || z.id; });
}

/* ── El mapa de sombras: borde más nítido en el exterior ─────────────────── */
/* El visor usa PCFSoft, donde `shadow.radius` no hace nada: el borde sale
   difuminado aunque el radio valga 0,01. Con PCF el radio sí cuenta (en
   téxeles) y el borde exterior queda marcado. Cambiar el tipo de sombra
   obliga a recompilar los materiales: se hace una sola vez. */
function arreglaSombra(){
  if(EST.sombra.hecha) return;
  var a = api(), t3 = T();
  if(!a || !a.escena || !t3) return;
  EST.sombra.hecha = true;
  var sol = EST.sol || buscaSol();
  if(!sol) return;
  try{
    if(sol.shadow){
      /* El radio es del core (0,01: borde duro). No se toca aqui: este modulo
         no tiene por que decidir como de nitida es la sombra. */
      if(sol.shadow.blurSamples !== undefined) sol.shadow.blurSamples = 4;
    }
    var r = a.renderer;
    if(r && r.shadowMap && t3.PCFShadowMap && r.shadowMap.type !== t3.PCFShadowMap){
      r.shadowMap.type = t3.PCFShadowMap;
      a.escena.traverse(function(o){
        if(!o.material) return;
        if(o.material.needsUpdate !== undefined) o.material.needsUpdate = true;
      });
    }
  }catch(e){ /* si el renderer no es el de verdad, se deja como está */ }
}

/* ── La hora: el deslizador del visor ────────────────────────────────────── */
function deslizador(){
  try{ return document.getElementById ? document.getElementById('slider-hora') : null; }
  catch(e){ return null; }
}
function setHora(min){
  var s = deslizador();
  if(!s) return false;
  try{
    s.value = String(min);
    if(typeof s.dispatchEvent === 'function'){
      if(typeof Event === 'function') s.dispatchEvent(new Event('input', {bubbles:true}));
      else s.dispatchEvent('input');
    }
    return true;
  }catch(e){ return false; }
}
/* La hora a la que el sol está a la altura pedida: se busca en la rama de la
   tarde (720–1440), donde la altura baja sin parar. */
function horaPara(alturaObjetivo, porDefecto){
  var s = deslizador();
  if(!s || !EST.sol) return porDefecto;
  var lo = 720, hi = 1440, i;
  for(i = 0; i < 12 && hi - lo > 3; i++){
    var mid = (lo + hi) >> 1;
    setHora(mid);
    if(alturaSol() > alturaObjetivo) lo = mid; else hi = mid;
  }
  return hi;
}

/* ── Instantánea del visor: al salir, todo vuelve como estaba ───────────── */
function copiaGrupos(g){
  var o = {};
  for(var k in g) if(Object.prototype.hasOwnProperty.call(g, k)) o[k] = g[k];
  return o;
}
function foto(){
  var a = api();
  if(!a) return null;
  var LZ = a.LZ, s = deslizador();
  var escena = a.escena;
  var agua = a.MAT && a.MAT.agua;
  return {
    hora: s ? s.value : null,
    grupos: LZ ? copiaGrupos(LZ.grupos) : {},
    todo: LZ ? !!LZ.todo : false,
    noche: LZ ? !!LZ.noche : false,
    fogNear: (escena && escena.fog) ? escena.fog.near : null,
    fogFar: (escena && escena.fog) ? escena.fog.far : null,
    aguaEmis: agua ? agua.emissive.clone() : null,
    aguaInt: agua ? agua.emissiveIntensity : null,
    densidad: (AD.luz && typeof AD.luz.densidad === 'number') ? AD.luz.densidad : null
  };
}
function restaura(f){
  var a = api();
  if(!a || !f) return;
  var LZ = a.LZ;
  if(LZ){
    for(var k in LZ.grupos) if(Object.prototype.hasOwnProperty.call(LZ.grupos, k)) delete LZ.grupos[k];
    for(var j in f.grupos) if(Object.prototype.hasOwnProperty.call(f.grupos, j)) LZ.grupos[j] = f.grupos[j];
    LZ.todo = f.todo;
    LZ.sucio = true;
  }
  if(f.hora !== null && f.hora !== undefined) setHora(f.hora);
  var escena = a.escena;
  if(escena && escena.fog && f.fogNear !== null){
    escena.fog.near = f.fogNear;
    escena.fog.far = f.fogFar;
  }
  var agua = a.MAT && a.MAT.agua;
  if(agua && f.aguaEmis){
    agua.emissive.copy(f.aguaEmis);
    agua.emissiveIntensity = f.aguaInt;
  }
  if(f.densidad !== null && AD.luz && typeof AD.luz.ponDensidad === 'function'){
    try{ AD.luz.ponDensidad(f.densidad); }catch(e){}
  }
}

/* ── Aplicar un ambiente ──────────────────────────────────────────────────── */
function aplica(modo){
  var a = api();
  if(!a) return;
  var LZ = a.LZ;
  EST.modo = modo;
  var factor = FACTOR[modo] !== undefined ? FACTOR[modo] : 0;

  /* La hora: la noche hunde el sol 9° bajo el horizonte; la penumbra lo deja
     a 2,5°, que es cuando el cielo aún tiene color. */
  if(modo === 'noche' || modo === 'apagado'){
    var h = horaPara(-9, 1320);
    EST.horaModo = h;
  } else if(modo === 'penumbra'){
    EST.horaModo = horaPara(2.5, 1200);
  }

  /* Los grupos de luz de fuera: en la noche y en la penumbra se encienden los
     que ya define el dato (los grupos de los puntos de luz de fuera del
     visor); en «todo apagado», ninguno. */
  if(LZ){
    var grupos = gruposExteriores();
    for(var g in LZ.grupos) if(Object.prototype.hasOwnProperty.call(LZ.grupos, g)) LZ.grupos[g] = false;
    for(var k in grupos) if(Object.prototype.hasOwnProperty.call(grupos, k))
      LZ.grupos[k] = (modo === 'apagado') ? false : true;
    LZ.sucio = true;
  }
  aplicaLuces();
  ponDensidad();
}

/* Los grupos de las luces de fuera: los de los puntos del visor que están
   fuera, más los que usan las luces de este módulo. */
function gruposExteriores(){
  var a = api(), g = {};
  if(a && a.PUNTOS) a.PUNTOS.forEach(function(p){ if(p && p.fuera && p.grupo) g[p.grupo] = true; });
  EST.luces.forEach(function(l){ g[l.grupo] = true; });
  EST.charcos.forEach(function(c){ g[c.grupo] = true; });
  EST.emisores.forEach(function(e){ g[e.grupo] = true; });
  return g;
}

/* Pone las luces de fuera como toca: encendidas si su grupo está encendido y
   el ambiente no es «todo apagado». */
function aplicaLuces(){
  var factor = FACTOR[EST.modo] !== undefined ? FACTOR[EST.modo] : 0;
  /* El ambiente pone la cantidad; el grupo del panel decide cuál. */
  var on = factor > 0;
  EST.luces.forEach(function(l){
    var good = on && grupoEncendido(l.grupo);
    l.luz.intensity = good ? l.base*factor : 0;
    if(l.halo){
      l.halo.visible = good;
      l.halo.material.opacity = good ? l.haloBase*factor : 0;
    }
  });
  EST.charcos.forEach(function(c){
    var good = on && grupoEncendido(c.grupo);
    c.malla.visible = good;
    c.malla.material.opacity = good ? c.base*factor : 0;
  });
  EST.emisores.forEach(function(e){
    e.malla.visible = on && grupoEncendido(e.grupo);
  });
  /* El agua: turquesa cuando la luz de la piscina está encendida. */
  var a = api();
  var agua = a && a.MAT && a.MAT.agua;
  if(agua){
    var piscina = on && grupoEncendido('Piscina');
    var ei = 0.30*factor;
    if(piscina){
      if(EST.aguaOn !== true || EST.aguaInt !== ei){
        agua.emissive.set('#2fbfae');
        agua.emissiveIntensity = ei;
        EST.aguaOn = true; EST.aguaInt = ei;
      }
    } else if(EST.aguaOn){
      if(EST.antes && EST.antes.aguaEmis){
        agua.emissive.copy(EST.antes.aguaEmis);
        agua.emissiveIntensity = EST.antes.aguaInt;
      }
      EST.aguaOn = false;
    }
  }
  /* El velo de aire: la niebla da profundidad al jardín de noche. */
  var velo = VELO[EST.modo];
  var escena = a && a.escena;
  if(escena && escena.fog && velo){
    escena.fog.near = velo.near;
    escena.fog.far = velo.far;
  }
}

/* ── La luz volumétrica: la densidad sigue la hora ───────────────────────── */
function densidadActual(){
  var alt = alturaSol();
  if(alt < 0) return DENSIDAD.noche;
  if(alt < 8) return DENSIDAD.penumbra;
  return DENSIDAD.dia;
}
function ponDensidad(){
  if(!AD.luz || typeof AD.luz.ponDensidad !== 'function') return;
  var d = densidadActual();
  if(d === EST.densidad) return;
  EST.densidad = d;
  try{ AD.luz.ponDensidad(d); }catch(e){}
}

/* ── El botón de la barra ─────────────────────────────────────────────────── */
function registraBoton(){
  if(EST.boton) return;
  if(AD.iconos && !AD.iconos['lámpara']){
    AD.iconos['lámpara'] = '<path d="M6.5 8.5h5l1.2 4.2H5.3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'+
      '<path d="M7.2 8.5V6.2a1.8 1.8 0 0 1 3.6 0v2.3" fill="none" stroke="currentColor" stroke-width="1.4"/>'+
      '<path d="M9 12.7v2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>';
  }
  if(!AD.boton) return;
  AD.boton({id:'exterior', etiqueta:'Exterior', icono:'lámpara',
    alPulsar:function(){ AD.exterior.alterna(); },
    activo:function(){ return AD.exterior.abierto(); }});
  if(AD.pintaBarra) AD.pintaBarra();
  EST.boton = true;
}

/* ── API pública ──────────────────────────────────────────────────────────── */
AD.exterior = {
  /* Abre la noche de la finca. */
  abrir: function(){
    if(EST.modo === 'dia') EST.antes = foto();
    aplica('noche');
    if(AD.refrescaBarra) AD.refrescaBarra();
    return EST.modo;
  },
  /* Cierra: el visor vuelve a como estaba (luces de fuera, hora y niebla). */
  cerrar: function(){
    if(EST.modo === 'dia') return EST.modo;
    var f = EST.antes;
    EST.modo = 'dia';
    EST.luces.forEach(function(l){ l.luz.intensity = 0; if(l.halo) l.halo.visible = false; });
    EST.charcos.forEach(function(c){ c.malla.visible = false; c.malla.material.opacity = 0; });
    EST.emisores.forEach(function(e){ e.malla.visible = false; });
    restaura(f);
    EST.antes = null;
    if(AD.refrescaBarra) AD.refrescaBarra();
    return EST.modo;
  },
  /* Da vueltas por los ambientes: noche → penumbra → todo apagado → noche. */
  alterna: function(){
    if(EST.modo === 'dia') return AD.exterior.abrir();
    var i = MODOS.indexOf(EST.modo);
    var siguiente = MODOS[(i+1) % MODOS.length];
    if(siguiente === 'noche' && !EST.antes) EST.antes = foto();
    aplica(siguiente);
    if(AD.refrescaBarra) AD.refrescaBarra();
    return EST.modo;
  },
  /* ¿Está abierto el ambiente exterior? */
  abierto: function(){ return EST.modo !== 'dia'; },
  /* El ambiente actual: 'dia', 'noche', 'penumbra' o 'apagado'. */
  estado: function(){ return EST.modo; },
  /* Para el que quiera el detalle: intensidades, alcances y colores. */
  detalle: function(){
    return {
      modo: EST.modo,
      etiqueta: ETIQUETA[EST.modo] || EST.modo,
      luces: EST.luces.map(function(l){
        return {grupo:l.grupo, i:l.base, alcance:l.luz.distance, color:'#'+l.luz.color.getHexString()};
      }),
      charcos: EST.charcos.length,
      emisores: EST.emisores.length,
      densidad: EST.densidad,
      sombras: EST.sombra.hecha ? 'PCF' : 'sin tocar',
      sinLuz: EST.oscuras || []
    };
  }
};

/* ── Montaje ──────────────────────────────────────────────────────────────── */
function monta(){
  var a = api();
  if(!a || !a.escena) return false;
  if(EST.montado) return true;
  EST.montado = true;
  EST.sol = buscaSol();
  crea();
  registraBoton();
  if(AD.onFrame) AD.onFrame(paso);
  return true;
}

/* ── Cada cuadro ─────────────────────────────────────────────────────────── */
function paso(){
  /* El mapa de sombras se arregla en el primer cuadro, no al montar: cambiar
     el tipo de sombra recompila los materiales y así no se retrasa el primer
     render. */
  if(!EST.sombra.hecha) arreglaSombra();
  /* La densidad del aire va con la hora, sola: el usuario mueve el sol y el
     aire se espesa o se aclara sin tocar nada. */
  ponDensidad();
  /* Las luces de fuera siguen a los grupos del panel, siempre: si el usuario
     apaga «Camino», la luz de la finca se apaga con él. */
  aplicaLuces();
  /* El botón se registra cuando la barra existe: el módulo de la barra se
     carga el último, así que puede que al montar todavía no estuviera. */
  if(!EST.boton) registraBoton();
}
var intentos = 0;
function espera(){
  if(monta()) return;
  intentos++;
  if(intentos > 200) return;
  setTimeout(espera, 150);
}
if(AD.alListo) AD.alListo(function(){ espera(); });
if(typeof document !== 'undefined' && document.readyState === 'complete') espera();
else if(typeof addEventListener === 'function') addEventListener('load', espera);
if(typeof setTimeout === 'function') setTimeout(espera, 150);

})();
