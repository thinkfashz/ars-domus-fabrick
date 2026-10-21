/* Ars Domus FABRICK — contrato de modulos.
   Los modulos de modulo/ se cargan despues de este archivo y se enganchan aqui:
     AD.onFrame(function(dt){...})   animacion por cuadro (dt en segundos)
     AD.piezas.registra({...})       cajones, puertas de mueble, nevera, luces
   Este bloque debe quedar ANTES de que se definan las capas y la escena. */
var AD = window.AD || (window.AD = {});
AD.hooks = AD.hooks || [];
AD.piezas = AD.piezas || {items: [], registra: function(p){ AD.piezas.items.push(p); }};
AD.onFrame = AD.onFrame || function(fn){ AD.hooks.push(fn); return fn; };
/* Un modulo puede pedir que se avise cuando el visor ya esta listo.
   OJO: AD.alListo se llama COMO FUNCION (AD.alListo(fn)) y AD.avisaListo es su
   alias. Antes era un array y la mitad de los modulos lo llamaba como funcion:
   eso los dejaba sin arrancar. */
AD.listo = AD.listo || false;
AD.pendientes = AD.pendientes || [];
AD.alListo = function(fn){
  if(typeof fn !== 'function') return;
  if(AD.listo) fn(); else AD.pendientes.push(fn);
};
AD.avisaListo = AD.alListo;

/* Ars Domus: visor 3D de una casa. Lee window.CASA (casa.js; window.FINCA también vale) y usa three.js r128
   (global THREE). Todo lo que es de una casa concreta viene en los datos; aquí solo está cómo se dibuja. */
(function(){
'use strict';
if(typeof THREE === 'undefined'){
  document.getElementById('cargando').innerHTML = '<span class="rotulo">No se ha podido cargar three.js</span>';
  return;
}
var F = window.CASA || window.FINCA, C = F.casa, X = F.exterior;
['pilares','vigas','celosias','losas','chimeneas','escaleras','cubiertas'].forEach(function(k){ C[k] = C[k] || []; });
['zonas','caminos','sueltos','lindes','farolas','construcciones'].forEach(function(k){ X[k] = X[k] || []; });
F.arboles = F.arboles || [];
X.piscina.losas = X.piscina.losas || [];
/* El nombre de la casa, en la pestaña y en la cabecera del panel */
document.title = 'Maqueta de ' + F.meta.nombre;
document.querySelector('#panel .cabecera h1').textContent = F.meta.nombre;
document.querySelector('#panel .cabecera .sub').innerHTML = F.meta.subtitulo || 'Maqueta 3D';
/* Un enlace opcional bajo el subtítulo: meta.enlace = {texto, url} */
if(F.meta.enlace){
  var enl = document.createElement('a');
  enl.className = 'enlace'; enl.href = F.meta.enlace.url; enl.target = '_blank'; enl.rel = 'noopener';
  enl.textContent = F.meta.enlace.texto;
  document.querySelector('#panel .cabecera .sub').after(enl);
}
/* La versión mejorada (window.CASA_MEJORA) trae sus propios muros, huecos e interior. */
var FM = window.CASA_MEJORA || window.FINCA_MEJORA || null, C0 = C;
var QS = new URLSearchParams(location.search);
var CLAVE = F.meta.clave || 'ars-domus';           // prefijo de lo que se guarda en el navegador: uno por casa
var SUELO = 0.25;                       // cota de la plataforma de la parcela
var d2r = function(d){ return d*Math.PI/180; };
var GIRO = d2r(90 - C.rumbo);           // giro de la casa respecto al norte

/* Semilla fija: los árboles y las piedras salen igual en cada carga. */
var semilla = 20260925;
function azar(){ semilla = (semilla*1664525 + 1013904223) % 4294967296; return semilla/4294967296; }

function aMundo(u, v){                  // marco del plano -> mundo
  return [ C.origen[0] + u*Math.cos(GIRO) + v*Math.sin(GIRO),
           C.origen[1] - u*Math.sin(GIRO) + v*Math.cos(GIRO) ];
}
function areaPoly(p){
  var a = 0;
  for(var i=0,n=p.length; i<n; i++){ var j=(i+1)%n; a += p[i][0]*p[j][1] - p[j][0]*p[i][1]; }
  return Math.abs(a)/2;
}
function centroPoly(p){
  var x=0,z=0; p.forEach(function(q){ x+=q[0]; z+=q[1]; });
  return [x/p.length, z/p.length];
}
function cajaAPoly(c){ return [[c[0],c[1]],[c[2],c[1]],[c[2],c[3]],[c[0],c[3]]]; }
function circuloAPoly(cx, cz, r, n){
  var p = [];
  for(var i=0;i<n;i++){ var t=i/n*Math.PI*2; p.push([cx+r*Math.cos(t), cz+r*Math.sin(t)]); }
  return p;
}
function shapeDe(poly, huecos){
  var s = new THREE.Shape();
  poly.forEach(function(p,i){ i ? s.lineTo(p[0],p[1]) : s.moveTo(p[0],p[1]); });
  s.closePath();
  (huecos||[]).forEach(function(h){
    var pa = new THREE.Path();
    h.forEach(function(p,i){ i ? pa.lineTo(p[0],p[1]) : pa.moveTo(p[0],p[1]); });
    pa.closePath(); s.holes.push(pa);
  });
  return s;
}
/* Prisma vertical de planta `poly` (x, z) entre y=0 y y=alto. UV en metros. */
function prisma(poly, huecos, alto){
  var g = new THREE.ExtrudeGeometry(shapeDe(poly,huecos), {depth:alto, bevelEnabled:false});
  g.rotateX(Math.PI/2); g.translate(0,alto,0); return g;
}
function plano(poly, huecos){
  var g = new THREE.ShapeGeometry(shapeDe(poly,huecos));
  g.rotateX(Math.PI/2); return haciaArriba(g);
}
/* Da la vuelta a los triángulos que miran hacia abajo (según el sentido del polígono). */
function haciaArriba(g){
  g.computeVertexNormals();
  var idx = g.index;
  if(!idx || g.attributes.normal.getY(0) >= 0) return g;
  for(var i=0;i<idx.count;i+=3){ var a = idx.getX(i+1); idx.setX(i+1, idx.getX(i+2)); idx.setX(i+2, a); }
  g.computeVertexNormals(); return g;
}
/* Caja con UV en metros (la textura se repite a su tamaño real). `o` desplaza la UV
   para que los trozos de un mismo muro casen entre sí. */
function caja(w, h, d, o){
  var g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  o = o || [0,0];
  for(var i=0;i<uv.count;i++){
    var f = dims[Math.floor(i/4)];
    uv.setXY(i, uv.getX(i)*f[0] + o[0], uv.getY(i)*f[1] + o[1]);
  }
  return g;
}
/* Losa de canto `t` bajo el cuadrilátero p0..p3 ([x,y,z]); UV en metros sobre su cara. */
function losa4(p, t){
  var V = p.map(function(q){ return new THREE.Vector3(q[0],q[1],q[2]); });
  var B = V.map(function(q){ return q.clone().add(new THREE.Vector3(0,-t,0)); });
  var pos = [], uvs = [], cen = new THREE.Vector3();
  V.concat(B).forEach(function(q){ cen.add(q); }); cen.multiplyScalar(1/8);
  function cara(a,b,c,d){
    var e1 = b.clone().sub(a), e2 = d.clone().sub(a);
    e1.normalize(); e2.normalize();
    // que la cara mire hacia fuera del sólido, sea cual sea el orden de los vértices
    var n = b.clone().sub(a).cross(c.clone().sub(a));
    var orden = n.dot(a.clone().add(c).multiplyScalar(0.5).sub(cen)) >= 0 ? [a,b,c,a,c,d] : [a,c,b,a,d,c];
    orden.forEach(function(q){
      pos.push(q.x,q.y,q.z);
      var r = q.clone().sub(a); uvs.push(r.dot(e1), r.dot(e2));
    });
  }
  cara(V[0],V[3],V[2],V[1]); cara(B[0],B[1],B[2],B[3]);
  for(var i=0;i<4;i++){ var j=(i+1)%4; cara(B[i],B[j],V[j],V[i]); }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();
  return g;
}
/* Paño de muro en su plano local: x a lo largo (s0..s1), y arriba (y0..techo), z el espesor.
   El techo puede ir inclinado (t0 en s0, t1 en s1). */
function pano(s0, s1, y0, t0, t1, esp){
  var e = esp/2, pos = [], uvs = [];
  function q(a,b,c,d,uvf){
    [a,b,c,a,c,d].forEach(function(p){ pos.push(p[0],p[1],p[2]); var w=uvf(p); uvs.push(w[0],w[1]); });
  }
  var A=[s0,y0,e], B=[s1,y0,e], Cc=[s1,t1,e], D=[s0,t0,e];
  var A2=[s0,y0,-e], B2=[s1,y0,-e], C2=[s1,t1,-e], D2=[s0,t0,-e];
  var fr = function(p){ return [p[0], p[1]]; }, fs = function(p){ return [p[2], p[1]]; };
  q(A,B,Cc,D,fr); q(B2,A2,D2,C2,fr);            // caras grandes
  q(A2,A,D,D2,fs); q(B,B2,C2,Cc,fs);           // cantos de los extremos
  q(D,Cc,C2,D2,fr); q(A2,B2,B,A,fr);           // coronación y base
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();
  g.userData.muro = true;              // en el paseo, los muros paran aunque sean bajos y no se pisan
  return g;
}
/* Cinta sobre el suelo a lo largo de una polilínea (caminos). UV: (a lo largo, a lo ancho). */
function cinta(eje, ancho, y){
  var pos = [], uvs = [], idx = [], L = 0;
  for(var i=0;i<eje.length;i++){
    var a = eje[Math.max(0,i-1)], b = eje[Math.min(eje.length-1,i+1)];
    var dx = b[0]-a[0], dz = b[1]-a[1], n = Math.hypot(dx,dz)||1;
    var nx = -dz/n*ancho/2, nz = dx/n*ancho/2;
    if(i) L += Math.hypot(eje[i][0]-eje[i-1][0], eje[i][1]-eje[i-1][1]);
    pos.push(eje[i][0]+nx, y, eje[i][1]+nz, eje[i][0]-nx, y, eje[i][1]-nz);
    uvs.push(L, 0, L, ancho);
    if(i) idx.push(2*i-2, 2*i-1, 2*i, 2*i-1, 2*i+1, 2*i);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  g.setIndex(idx);
  return haciaArriba(g);
}
/* Bordes de una polilínea desplazados ±d (para bordillos y piedras). */
function bordes(eje, d){
  var izq = [], der = [];
  for(var i=0;i<eje.length;i++){
    var a = eje[Math.max(0,i-1)], b = eje[Math.min(eje.length-1,i+1)];
    var dx = b[0]-a[0], dz = b[1]-a[1], n = Math.hypot(dx,dz)||1;
    izq.push([eje[i][0]-dz/n*d, eje[i][1]+dx/n*d]); der.push([eje[i][0]+dz/n*d, eje[i][1]-dx/n*d]);
  }
  return [izq, der];
}

/* ===================== escena ===================== */
var cont = document.getElementById('escena');
var renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
/* three r128 escribe los colores en lineal, y eso sale lavado, con las luces fuertes
   recortadas en blanco. Con sRGB sale el color que de verdad se ha pintado, y con ACES las
   altas luces se «enrollan» en vez de reventar, que es lo que hace el ojo. De ahí que las
   intensidades de abajo sean más bajas: el espacio de color ya hace su parte. */
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
/* Sombras: son el mayor salto de realismo en arquitectura, pero en el móvil cuestan. En pantallas
   táctiles el mapa va a 2048 en vez de 4096. Se pueden apagar con el interruptor de «Luz». */
var TACTIL = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
renderer.shadowMap.enabled = QS.has('sombras') || !QS.has('nosombras');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
cont.appendChild(renderer.domElement);

var escena = new THREE.Scene();
var camara = new THREE.PerspectiveCamera(42, 1, 0.3, 3000);

var cielo = new THREE.Mesh(new THREE.SphereGeometry(900,32,16), new THREE.ShaderMaterial({
  side:THREE.BackSide, depthWrite:false,
  uniforms:{ cenit:{value:new THREE.Color('#7fa8c4')}, horizonte:{value:new THREE.Color('#dbe4e6')} },
  vertexShader:'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:'uniform vec3 cenit; uniform vec3 horizonte; varying vec3 vP;'+
    'void main(){ float h=clamp(normalize(vP).y*1.6+0.22,0.0,1.0); gl_FragColor=vec4(mix(horizonte,cenit,h),1.0); }'
}));
escena.add(cielo);
escena.fog = new THREE.Fog('#dfe5e3', 220, 700);

var hemi = new THREE.HemisphereLight('#cfe0ea','#8a7a5c',0.62); escena.add(hemi);
var sol = new THREE.DirectionalLight('#fff3dd',1.5);
sol.castShadow = true; sol.shadow.mapSize.set(TACTIL?2048:4096, TACTIL?2048:4096);
var sc = sol.shadow.camera;
sc.left=-75; sc.right=75; sc.top=95; sc.bottom=-95; sc.near=1; sc.far=460;
sol.shadow.bias = -0.0006; sol.shadow.normalBias = 0.03;
sol.shadow.radius = 0.01;                               // sombra marcada: borde duro, sin difuminado
sol.shadow.blurSamples = 8;                             // (solo PCFSoft lo usa; PCF no)
escena.add(sol); escena.add(sol.target);
var relleno = new THREE.DirectionalLight('#dce6ef',0.12);
relleno.position.set(-40,32,44); escena.add(relleno);

/* ===================== texturas y materiales ===================== */
var cargador = new THREE.TextureLoader();
function tex(nombre, anchoM, altoM){
  var t = cargador.load('texturas/'+nombre+'.jpg');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1/anchoM, 1/altoM);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function lienzo(w, h, pinta, anchoM, altoM){
  var c = document.createElement('canvas'); c.width=w; c.height=h;
  pinta(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1/anchoM, 1/altoM);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
/* Teja árabe: canales a lo largo de la pendiente, hiladas cada ~40 cm. 1 m × 0,8 m. */
var TEJA = lienzo(256, 256, function(g, w, h){
  var cols = 5, filas = 2, cw = w/cols, fh = h/filas;
  for(var f=0; f<filas; f++) for(var c=0; c<cols; c++){
    var tono = 14 + azar()*10, luz = 34 + azar()*9, sat = 26 + azar()*14;   // teja vieja, apagada
    var gr = g.createLinearGradient(c*cw, 0, (c+1)*cw, 0);
    gr.addColorStop(0, 'hsl('+tono+','+sat+'%,'+(luz-12)+'%)');
    gr.addColorStop(0.5, 'hsl('+tono+','+(sat+6)+'%,'+(luz+7)+'%)');
    gr.addColorStop(1, 'hsl('+tono+','+sat+'%,'+(luz-14)+'%)');
    g.fillStyle = gr; g.fillRect(c*cw, f*fh, cw, fh);
    for(var k=0;k<60;k++){ g.fillStyle='rgba('+(azar()<.5?'40,30,20':'230,210,190')+','+(azar()*0.12)+')';
      g.fillRect(c*cw+azar()*cw, f*fh+azar()*fh, 2+azar()*5, 2+azar()*5); }
    g.fillStyle = 'rgba(30,15,8,0.45)'; g.fillRect(c*cw, (f+1)*fh-5, cw, 5);
  }
}, 1.0, 0.8);
/* Celosía de obra blanca: bloques con aspa. Celda de 25 cm. */
var CELOSIA = lienzo(128, 128, function(g, w, h){
  g.clearRect(0,0,w,h); g.fillStyle='#f1eee8';
  g.fillRect(0,0,w,10); g.fillRect(0,0,10,h);
  g.lineWidth = 12; g.strokeStyle='#f1eee8';
  g.beginPath(); g.moveTo(0,0); g.lineTo(w,h); g.moveTo(w,0); g.lineTo(0,h); g.stroke();
  g.beginPath(); g.arc(w/2,h/2,18,0,Math.PI*2); g.fillStyle='#f1eee8'; g.fill();
}, 0.25, 0.25);
/* Panel FV: celdas 6×10 con marco. */
var FV = lienzo(96, 160, function(g, w, h){
  g.fillStyle='#b9bec2'; g.fillRect(0,0,w,h);
  for(var i=0;i<6;i++) for(var j=0;j<10;j++){
    g.fillStyle = 'hsl(215,35%,'+(16+azar()*6)+'%)'; g.fillRect(4+i*15, 4+j*15.2, 13.5, 13.8);
  }
}, 1.13, 2.28);

function lam(o){ return new THREE.MeshLambertMaterial(o); }
var MAT = {
  entorno:   lam({color:'#d7c7a6', map:tex('campo',16,8)}),
  terreno:   lam({color:'#ffffff', map:tex('campo',4,2)}),
  grava:     lam({color:'#ffffff', map:tex('grava',3,1.5)}),
  tierra:    lam({color:'#e0a57c', map:tex('grava',3,1.5)}),
  explanada: lam({color:'#efc3a2', map:tex('grava',3,1.5)}),      // tierra rojiza apisonada
  huerto:    lam({color:'#c98f66', map:tex('grava',1.6,0.8)}),       // tierra labrada (mejorada)
  grava_blanca: lam({color:'#fbf8f1', map:tex('grava',1.2,0.6)}),
  grava_parking: lam({color:'#e4e2dc', map:tex('campo',2.5,2.5)}),   // grava compactada de aparcamiento (mejorada)
  arena:     lam({color:'#f3e2b8', map:tex('grava',5,2.5)}),
  cesped:    lam({color:'#ffffff', map:tex('cesped',1.2,1.2)}),
  paret:     lam({color:'#ffffff', map:tex('paret',8,1)}),
  piedra:    lam({color:'#ffffff', map:tex('piedra',1.45,1.1)}),
  azul:      lam({color:'#26364f', map:tex('piedra',1.45,1.1)}),   // forro exterior, pintura azul oscuro
  mares:     lam({color:'#d9c7a2'}),
  blanco:    lam({color:'#eeeae1'}),
  crema:     lam({color:'#ece2cc'}),
  interior:  lam({color:'#efe9dd'}),
  hormigon:  lam({color:'#c4bcae'}),
  losa:      lam({color:'#c9b394'}),
  azotea:    lam({color:'#d8d0c2'}),
  teja:      lam({color:'#ffffff', map:TEJA}),
  madera:    lam({color:'#6e4b31'}),
  verde:     lam({color:'#35524f'}),
  mallorquina:lam({color:'#46657f'}),                  // las persianas de las ventanas: azuladas, no verdes
  negro:     lam({color:'#23272a'}),
  marron:    lam({color:'#4d3b2f'}),
  carpinteria: lam({color:'#f3f3f0'}),
  azul:      lam({color:'#2f5f8f'}),                   // la puerta de la entrada, por fuera
  vidrio:    new THREE.MeshPhongMaterial({color:'#2d3d45', shininess:90, specular:'#8aa0aa'}),
  cristal:   new THREE.MeshPhongMaterial({color:'#cfe3e8', transparent:true, opacity:0.2, shininess:120,
                                          specular:'#ffffff', depthWrite:false, side:THREE.DoubleSide}),
  // vidrio esmerilado de las puertas vidrieras
  esmerilado:new THREE.MeshPhongMaterial({color:'#eef2f2', transparent:true, opacity:0.55, shininess:60,
                                          specular:'#ffffff', depthWrite:false, side:THREE.DoubleSide}),
  cortina:   new THREE.MeshPhongMaterial({color:'#eef0ee', shininess:20, specular:'#444444', emissive:'#c9cecb', emissiveIntensity:0.2,
                                          transparent:true, opacity:0.8}),
  metal:     lam({color:'#e7e9e8'}),
  hierro:    lam({color:'#2f3a33'}),
  toldo:     lam({color:'#8e928f', side:THREE.DoubleSide}),
  celosia:   lam({color:'#ffffff', map:CELOSIA, alphaTest:0.5, side:THREE.DoubleSide, transparent:false}),
  canizo:    lam({color:'#8a7556'}),
  brezo:     lam({color:'#6f5f45'}),
  bloque:    lam({color:'#b8b2a6'}),
  malla:     lam({color:'#55605a', transparent:true, opacity:0.35, side:THREE.DoubleSide, depthWrite:false}),
  fv:        new THREE.MeshPhongMaterial({color:'#ffffff', map:FV, shininess:70, specular:'#9fb0c0'}),
  puertaAzul:lam({color:'#2f5f86'}),
  globo:     lam({color:'#ffffff', emissive:'#fff5d8', emissiveIntensity:0.25}),
  lena:      lam({color:'#7a5a3e'}),
  roca:      lam({color:'#c8b89c'}),
  agua:      new THREE.MeshPhongMaterial({color:'#2a93b0', transparent:true, opacity:0.86, shininess:140, specular:'#ffffff'}),
  vaso:      lam({color:'#8fc6d6', side:THREE.BackSide}),
  coronacion:lam({color:'#e6dccb'}),
  huella:    new THREE.LineBasicMaterial({color:'#c2504a'}),
  choque:    new THREE.MeshBasicMaterial({colorWrite:false, depthWrite:false}),
  linde:     new THREE.LineBasicMaterial({color:'#4a4436', transparent:true, opacity:0.55})
};

var capas = {};
['terreno','exterior','muros','interior','cubierta','piscina','arboles','catastro'].forEach(function(k){
  capas[k] = new THREE.Group(); escena.add(capas[k]);
});
/* La casa va en su marco: x = u, z = v. */
function grupoCasa(capa){
  var g = new THREE.Group();
  g.position.set(C.origen[0], SUELO, C.origen[1]); g.rotation.y = GIRO;
  capas[capa].add(g); return g;
}
var gMuros = grupoCasa('muros'), gCub = grupoCasa('cubierta');

var pick = [];
function reg(m, info){ m.userData.info = info; pick.push(m); return m; }
function malla(geo, mat, padre, x, y, z){
  var m = new THREE.Mesh(geo, mat); m.position.set(x||0, y||0, z||0); padre.add(m); return m;
}

/* ===================== la casa ===================== */
var INFO_CASA = {tipo:'Edificación', nombre:'Casa', datos:[
  ['Planta según plano', areaPoly(C.contorno).toFixed(0)+' m²']
].concat(C.ficha || [], [['Orientación', C.rumbo.toFixed(1).replace('.',',')+'° (eje largo)']]),
   centro:aMundo(0,0), etiqueta:'Casa', alturaEtq:SUELO+6.2, nota:C.nota || null};

/* Suelo de la casa */
reg(malla(prisma(C.contorno, null, C.cotaSuelo), MAT.losa, gMuros), INFO_CASA);

/* Un muro (o un hueco) va en su propio grupo, girado: x a lo largo, z el espesor. */
function grupoMuro(u0, v0, u1, v1){
  var g = new THREE.Group(); g.position.set(u0, 0, v0);
  g.rotation.y = -Math.atan2(v1-v0, u1-u0); gMuros.add(g);
  return {g:g, L:Math.hypot(u1-u0, v1-v0)};
}
/* Cada muro con su ficha y su ID (W-NNN); los trozos de un mismo muro comparten ficha. */
var NOMBRE_MURO = {piedra:'Forro de fachada (azul oscuro)', blanco:'Forro de fachada (azul oscuro)',
                   crema:'Forro de fachada (azul oscuro)', interior:'Tabique interior'};
/* El forro exterior va en pintura azul oscuro. La piedra suelta (portal, pilares,
   caseta, chimenea) se queda como esta: el contraste es lo que hace que la casa
   se lea. */
function matMuro(k){ return (k === 'piedra' || k === 'blanco' || k === 'crema') ? MAT.azul : MAT[k]; }
function construyeMuros(){ var fichas = {}; C.muros.forEach(function(w){
  var r = grupoMuro(w[0],w[1],w[2],w[3]), e = w[4], id = w[8] || null;
  var info = id ? fichas[id] = fichas[id] || {tipo:'Muro', id:id, nombre:NOMBRE_MURO[w[7]] || 'Muro', largo:0,
    datos:[['Espesor', e.toFixed(2).replace('.',',')+' m'], ['Alto', Math.max(w[5], w[6]).toFixed(2).replace('.',',')+' m']],
    nota:C.notaMuros || null} : INFO_CASA;
  // medio espesor de más en cada punta para cerrar las esquinas, salvo donde empieza un hueco:
  // ahí se metería en él y, por dentro, asomaría como un marco de piedra
  reg(malla(pano(bordeHueco(w[0], w[1]) ? 0 : -e/2, r.L + (bordeHueco(w[2], w[3]) ? 0 : e/2), 0, w[5], w[6], e), matMuro(w[7]), r.g), info);
}); }
function bordeHueco(u, v){
  return C.huecos.some(function(h){ return Math.hypot(h[0]-u, h[1]-v) < 0.03 || Math.hypot(h[2]-u, h[3]-v) < 0.03; });
}

/* Huecos. Alturas del alféizar y del dintel según el tipo. */
var TIPO_HUECO = {
  ventana:       {y0:0.95, y1:2.15, marco:'mares'},
  ventana_negra: {y0:0.75, y1:2.15, marco:'mares'},
  mallorquina:   {y0:1.00, y1:2.08, marco:'mares'},
  puerta:        {y0:0.00, y1:2.15, marco:'mares'},
  ventanal:      {y0:0.12, y1:2.22, marco:null},
  garaje:        {y0:0.00, y1:2.20, marco:'mares'},
  vidriera:      {y0:0.00, y1:2.15, marco:'mares'},
  ventana_int:   {y0:1.00, y1:2.10, marco:'mares'},
  ventanuco:     {y0:1.45, y1:2.05, marco:'mares'},
  arco:          {y0:0.00, y1:2.20, marco:'mares'},
  paso:          {y0:0.00, y1:2.30, marco:null},
  acristalado:   {y0:0.00, y1:9.00, marco:null}
};
/* Hoja de mallorquina de ancho w y alto h, centrada en (cx, ym, z) del grupo g: bastidor de 6 cm,
   travesaño en medio y lamas inclinadas cada 5 cm, todas en una sola malla */
var GEO_LAMAS = {};
function mallorquina(g, cx, ym, z, w, h, mat, info){
  var b = 0.06, e = 0.035;
  [-1, 1].forEach(function(q){ reg(malla(caja(b, h, e), mat, g, cx + q*(w/2 - b/2), ym, z), info); });
  [-1, 0, 1].forEach(function(q){ reg(malla(caja(w, q ? b : 0.05, e), mat, g, cx, ym + q*(h/2 - b/2), z), info); });
  var k = w.toFixed(2) + '|' + h.toFixed(2);
  if(!GEO_LAMAS[k]){
    var pos = [], nor = [], lw = w - 2*b + 0.01, m = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationX(0.7);
    for(var y = -h/2 + b + 0.03; y < h/2 - b - 0.01; y += 0.05){
      if(Math.abs(y) < 0.035) continue;                                  // el travesaño
      var bx = new THREE.BoxGeometry(lw, 0.006, 0.045).toNonIndexed();
      bx.applyMatrix4(m.makeTranslation(0, y, 0).multiply(rot));
      pos.push.apply(pos, bx.attributes.position.array); nor.push.apply(nor, bx.attributes.normal.array);
    }
    var gl = new THREE.BufferGeometry();
    gl.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gl.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    GEO_LAMAS[k] = gl;
  }
  reg(malla(GEO_LAMAS[k], mat, g, cx, ym, z), info);
}
/* Puertas que se abren y se cierran: cada una con su punto de referencia (en el grupo g) y la
   función que la pone en t (0 cerrada, 1 abierta). Salen todas abiertas; en el paseo, la
   más cercana se abre o se cierra con E o con el botón, y fuera del paseo, desde su ficha. */
var PUERTAS = [];
function puertaMovil(g, local, nombre, aplica){
  var p = {g:g, local:local, nombre:nombre, aplica:aplica, t:1, obj:1, w:null};
  aplica(1); PUERTAS.push(p); return p;
}
function giran(pivs, angs){ return function(t){ pivs.forEach(function(p, i){ p.rotation.y = angs[i]*t; }); }; }
/* Hoja de puerta con la bisagra en s = x; la hoja sale hacia +x (dir = 1) o hacia -x (dir = -1)
   y abierta queda girada `ang` radianes. */
function hoja(g, x, L, hh, y0, z, mat, dir, ang, info, mirilla, persiana){
  var piv = new THREE.Group(); piv.position.set(x, 0, z); g.add(piv);
  var m;
  if(mirilla){
    // vidrio fijo en lo alto de la hoja, solo para mirar: la hoja se hace con piezas alrededor
    var gv = 0.62, mg = 0.16, ya = y0 + hh - mg - gv, cx = dir*L/2;
    m = malla(caja(L, ya - y0, 0.05), mat, piv, cx, (y0 + ya)/2, 0);
    malla(caja(L, mg, 0.05), mat, piv, cx, y0 + hh - mg/2, 0);
    [-1, 1].forEach(function(q){ malla(caja(mg, gv, 0.05), mat, piv, cx + q*(L/2 - mg/2), ya + gv/2, 0); });
    malla(caja(L - 2*mg, gv, 0.012), MAT.cristal, piv, cx, ya + gv/2, 0);
  } else if(persiana){
    // puerta de persiana: bastidor con travesaño a media altura y lamas inclinadas, que dejan pasar la luz
    var b = 0.09, cx2 = dir*L/2, tr = [[y0, 0.16], [y0 + hh*0.5 - 0.05, 0.1], [y0 + hh - 0.1, 0.1]];
    m = malla(caja(b, hh, 0.045), mat, piv, cx2 - (L/2 - b/2), y0 + hh/2, 0);
    malla(caja(b, hh, 0.045), mat, piv, cx2 + (L/2 - b/2), y0 + hh/2, 0);
    tr.forEach(function(t){ malla(caja(L - 2*b, t[1], 0.045), mat, piv, cx2, t[0] + t[1]/2, 0); });
    [[y0 + 0.16, y0 + hh*0.5 - 0.05], [y0 + hh*0.5 + 0.05, y0 + hh - 0.1]].forEach(function(p){
      for(var yl = p[0] + 0.035; yl < p[1] - 0.02; yl += 0.055)
        malla(caja(L - 2*b, 0.006, 0.05), mat, piv, cx2, yl, 0).rotation.x = 0.7;
    });
  } else m = malla(caja(L, hh, 0.05), mat, piv, dir*L/2, y0 + hh/2, 0);
  var p = puertaMovil(g, [x + dir*L/2, y0 + hh/2, z], 'la puerta', giran([piv], [ang]));
  if(info) info.puerta = p;
  return m;
}
var NORMAL = {N:[0,-1], S:[0,1], E:[1,0], O:[-1,0]};
function construyeHuecos(){ C.huecos.forEach(function(h){
  var r = grupoMuro(h[0],h[1],h[2],h[3]), L = r.L, e = h[6], mat = MAT[h[9]], op = h[10] || {};
  var t = TIPO_HUECO[h[4]], y0 = t.y0, y1 = Math.min(t.y1, Math.min(h[7],h[8]) - 0.2);
  if(op.y0 !== undefined) y0 = op.y0;                     // alféizar y dintel propios (de los datos)
  if(op.y1 !== undefined) y1 = op.y1;
  // hacia qué lado del muro queda el exterior (z local)
  var a = Math.atan2(h[3]-h[1], h[2]-h[0]), nz = [-Math.sin(a), Math.cos(a)], n = NORMAL[h[5]];
  var sg = (n[0]*nz[0] + n[1]*nz[1]) >= 0 ? 1 : -1, fuera = sg*(e/2);
  // hacia qué lado gira la hoja (op.abre) y dónde va el pivote: en la cara de ese lado, para que
  // abierta del todo quede plegada contra la pared
  var nA = NORMAL[op.abre] || [-n[0], -n[1]], sgA = (nA[0]*nz[0] + nA[1]*nz[1]) >= 0 ? 1 : -1, zA = sgA*(e/2 + 0.03);
  if(y0 > 0) reg(malla(pano(0, L, 0, y0, y0, e), mat, r.g), INFO_CASA);
  if(h[4] !== 'acristalado') reg(malla(pano(0, L, y1, h[7], h[8], e), mat, r.g), INFO_CASA);
  var M = function(m){ return MAT[m]; };
  // marco de marès alrededor
  //
  var caras = h[4] === 'arco' ? [1, -1] : [sg];
  if(t.marco && (h[9] === 'piedra' || op.marco || h[4] === 'arco')) caras.forEach(function(c){
    var k = h[4] === 'arco' ? 0.2 : 0.13, s = 0.025, zf = c*(e/2);
    malla(caja(L+2*k, k, s), M(t.marco), r.g, L/2, y1+k/2, zf+c*s/2);
    if(y0 > 0) malla(caja(L+2*k+0.08, 0.07, 0.12), M(t.marco), r.g, L/2, y0-0.035, zf+c*0.04);
    malla(caja(k, y1-y0, s), M(t.marco), r.g, -k/2, (y0+y1)/2, zf+c*s/2);
    malla(caja(k, y1-y0, s), M(t.marco), r.g, L+k/2, (y0+y1)/2, zf+c*s/2);
  });
  if(h[4] === 'arco'){
    reg(malla(caja(L, 0.02, e), M(t.marco), r.g, L/2, y1+0.01, 0), {tipo:'Hueco', id:op.id || null, nombre:'Arco de marès', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m']]});
    [0.01, L-0.01].forEach(function(x){ malla(caja(0.02, y1, e), M(t.marco), r.g, x, y1/2, 0); });
  }
  var hh = y1 - y0, ym = (y0+y1)/2, zr = fuera - sg*0.06;   // la carpintería va retranqueada
  if(h[4] === 'ventana'){
    malla(caja(L, hh, 0.03), MAT.cristal, r.g, L/2, ym, zr);
    [ym-hh/2+0.035, ym+hh/2-0.035].forEach(function(y){ malla(caja(L, 0.07, 0.06), MAT.carpinteria, r.g, L/2, y, zr); });
    [0.035, L-0.035].forEach(function(x){ malla(caja(0.07, hh, 0.06), MAT.carpinteria, r.g, x, ym, zr); });
    malla(caja(0.05, hh, 0.06), MAT.carpinteria, r.g, L/2, ym, zr);
    // contraventanas verdes abiertas contra la fachada; con `op.persiana`, una sola
    // hoja de lamas abierta al lado
    if(op.persiana){
      var infoPs = {tipo:'Hueco', id:op.id || null, nombre:'Ventana con persiana', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m']]};
      // abierta al final del hueco o, con `op.lado` 'ini', al principio
      var zp = fuera + sg*0.03, cxp = op.lado === 'ini' ? -L/2 - 0.02 : L + L/2 + 0.02;
      mallorquina(r.g, cxp, ym, zp, L, hh, MAT.mallorquina, infoPs);
    } else {
      // dos hojas de mallorquina abiertas contra la fachada: bastidor,
      // travesaño a media altura y lamas inclinadas
      var infoC = {tipo:'Hueco', id:op.id || null, nombre:'Ventana con mallorquinas', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m']]};
      [-L/4, L+L/4].forEach(function(cx){ mallorquina(r.g, cx, ym, fuera+sg*0.03, L/2, hh, MAT.mallorquina, infoC); });
    }
  } else if(h[4] === 'ventanuco'){
    // ventanuco de PVC blanco, alto; con `op.persiana`, una hoja de lamas abierta contra la fachada,
    // al lado `op.lado` (fin: el extremo final del hueco; ini: el inicial)
    var infoV = {tipo:'Hueco', id:op.id || null, nombre:op.persiana ? 'Ventanuco con persiana' : 'Ventanuco', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m']]};
    reg(malla(caja(L, hh, 0.03), MAT.cristal, r.g, L/2, ym, zr), infoV);
    [0.035, L-0.035].forEach(function(x){ malla(caja(0.07, hh, 0.06), MAT.blanco, r.g, x, ym, zr); });
    [y0+0.035, y1-0.035].forEach(function(y){ malla(caja(L, 0.07, 0.06), MAT.blanco, r.g, L/2, y, zr); });
    if(op.persiana){
      var zv = fuera + sg*0.03, cxv = op.lado === 'ini' ? -L/2 - 0.02 : L + L/2 + 0.02;
      [cxv - L/2 + 0.03, cxv + L/2 - 0.03].forEach(function(x){ reg(malla(caja(0.06, hh, 0.035), MAT.mallorquina, r.g, x, ym, zv), infoV); });
      [ym - hh/2 + 0.03, ym + hh/2 - 0.03].forEach(function(y){ reg(malla(caja(L, 0.06, 0.035), MAT.mallorquina, r.g, cxv, y, zv), infoV); });
      for(var yv = ym - hh/2 + 0.08; yv < ym + hh/2 - 0.06; yv += 0.05)
        malla(caja(L - 0.1, 0.006, 0.04), MAT.mallorquina, r.g, cxv, yv, zv).rotation.x = 0.7;
    }
  } else if(h[4] === 'ventana_negra'){
    // carpintería negra con vidrio y la persiana recogida en su caja
    reg(malla(caja(L, hh, 0.03), MAT.cristal, r.g, L/2, ym, zr), {tipo:'Hueco', id:op.id || null, nombre:'Ventana de carpintería negra',
      datos:[['Ancho', L.toFixed(2).replace('.',',')+' m'], ['Persiana', 'recogida']]});
    [0.035, L/2, L-0.035].forEach(function(x){ malla(caja(0.07, hh, 0.06), MAT.negro, r.g, x, ym, zr); });
    malla(caja(L, 0.07, 0.06), MAT.negro, r.g, L/2, y0+0.035, zr);
    malla(caja(L, 0.22, 0.08), MAT.negro, r.g, L/2, y1-0.11, zr);
    // `op.persiana` 'plegable': mallorquina doble de librillo, cada lado dos hojas plegadas contra la fachada
    if(op.persiana === 'plegable'){
      var infoPl = {tipo:'Hueco', id:op.id || null, nombre:'Ventana con mallorquina plegable', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m'], ['Persiana', 'doble, de librillo']]};
      [[-1, -L/8 - 0.03], [1, L + L/8 + 0.03]].forEach(function(q){
        mallorquina(r.g, q[1], ym, fuera + sg*0.03, L/4, hh, MAT.mallorquina, infoPl);
        mallorquina(r.g, q[1] + q[0]*0.03, ym, fuera + sg*0.07, L/4, hh, MAT.mallorquina, infoPl);
      });
    }
  } else if(h[4] === 'mallorquina'){
    // dos hojas de persiana mallorquina con el vidrio detrás, azuladas como las de
    // las ventanas. Se abren hacia fuera hasta quedar contra la fachada; salen cerradas salvo `op.abierta`.
    malla(caja(L, hh, 0.03), MAT.cristal, r.g, L/2, ym, zr - sg*0.05);
    var infoM = {tipo:'Hueco', id:op.id || null, nombre:'Ventana con mallorquinas', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m'], ['Persianas', 'azuladas']]};
    var pivs = [];
    [[0, 1], [L, -1]].forEach(function(q){
      var piv = new THREE.Group(); piv.position.set(q[0], 0, fuera + sg*0.03); r.g.add(piv); pivs.push(piv);   // bisagras en la cara de fuera
      mallorquina(piv, q[1]*L/4, ym, 0, L/2-0.01, hh, MAT.mallorquina, infoM);
    });
    var pm = puertaMovil(r.g, [L/2, ym, zr], 'las persianas', giran(pivs, [-sg*0.95*Math.PI, sg*0.95*Math.PI]));
    if(!op.abierta){ pm.t = pm.obj = 0; pm.aplica(0); }
    infoM.puerta = pm;
  } else if(h[4] === 'puerta'){
    // bisagra en el extremo `op.bisagra` y giro de `op.giro` grados hacia `op.abre`
    var mh = op.hoja ? MAT[op.hoja] : h[9] === 'interior' ? MAT.carpinteria : L > 1.05 ? MAT.madera : MAT.verde;
    var infoP = {tipo:'Hueco', id:op.id || null, nombre:'Puerta', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m']]};
    var fin = op.bisagra === 'fin', gr = d2r(op.giro || 90);
    // de dos colores (op.hoja por fuera, op.dentro por dentro): las caras ±z de la caja, y z+ da afuera si sg > 0
    if(op.dentro){ var md = MAT[op.dentro], mf = mh; mh = [mf, mf, mf, mf, sg > 0 ? mf : md, sg > 0 ? md : mf]; }
    var hj = hoja(r.g, fin ? L : 0, L, hh, y0, zA, mh, fin ? -1 : 1, (fin ? 1 : -1)*sgA*gr, infoP, op.mirilla, op.persiana);
    if(op.persiana) infoP.nombre = 'Puerta de persiana';
    hj.parent.children.forEach(function(c){ reg(c, infoP); });
  } else if(h[4] === 'vidriera' || h[4] === 'ventana_int'){
    // doble puerta blanca de cuarterones con vidrio esmerilado, abierta de par en par, y la ventana
    // interior de una hoja
    var nh = h[4] === 'vidriera' ? 2 : 1, lh = L/nh, fr2 = 0.07, vid = nh === 2 ? MAT.esmerilado : MAT.cristal;
    var infoV = {tipo:'Hueco', id:op.id || null, nombre: op.nombre || (nh === 2 ? 'Puerta vidriera' : 'Ventana interior'),
      datos:[['Ancho', L.toFixed(2).replace('.',',')+' m']]};
    var pvs = [], angs = [];
    for(var q=0;q<nh;q++){
      // cada hoja en su pivote: la de la izquierda gira sobre s = 0 y la de la derecha sobre s = L
      var pv = new THREE.Group(); r.g.add(pv);
      pv.position.set(nh === 2 ? q*L : 0, 0, nh === 2 ? zA : zr);
      pvs.push(pv); angs.push((q ? 1 : -1)*sgA*d2r((op.giros || [90, 90])[q]));
      var x0 = nh === 2 && q ? -lh : 0, xc = x0 + lh/2;
      reg(malla(caja(lh-0.12, hh-0.12, 0.02), vid, pv, xc, ym, 0), infoV);
      malla(caja(lh, fr2, 0.05), MAT.carpinteria, pv, xc, y1-fr2/2, 0);
      malla(caja(lh, nh === 2 ? 0.45 : fr2, 0.05), MAT.carpinteria, pv, xc, y0 + (nh === 2 ? 0.225 : fr2/2), 0);
      malla(caja(fr2, hh, 0.05), MAT.carpinteria, pv, x0+fr2/2, ym, 0);
      malla(caja(fr2, hh, 0.05), MAT.carpinteria, pv, x0+lh-fr2/2, ym, 0);
      if(nh === 1) malla(caja(0.035, hh, 0.05), MAT.carpinteria, pv, xc, ym, 0);
    }
    if(nh === 2) infoV.puerta = puertaMovil(r.g, [L/2, ym, zr], 'la puerta vidriera', giran(pvs, angs));
  } else if(h[4] === 'acristalado'){
    // testero de vidrio de suelo a techo: fijos, una puerta abierta y vidrio hasta el techo inclinado
    var alto = function(x){ return h[7] + (h[8]-h[7])*x/L; }, P0 = 1.40, P1 = 2.30, tr = 2.15;
    var infoA = {tipo:'Hueco', id:op.id || null, nombre:op.nombre || 'Acristalamiento', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m'], ['Puerta', 'abatible, abierta']]};
    [[0, P0], [P1, L]].forEach(function(t){
      reg(malla(pano(t[0], t[1], 0.12, alto(t[0]), alto(t[1]), 0.02), MAT.cristal, r.g), infoA);
    });
    reg(malla(pano(P0, P1, tr, alto(P0), alto(P1), 0.02), MAT.cristal, r.g), infoA);
    [0, 0.7, P0, P1, 3.1, L].forEach(function(x){
      var xx = Math.min(L-0.03, Math.max(0.03, x));
      malla(caja(0.06, alto(xx), 0.07), MAT.carpinteria, r.g, xx, alto(xx)/2, 0);
    });
    malla(caja(L, 0.06, 0.07), MAT.carpinteria, r.g, L/2, tr, 0);
    malla(caja(L, 0.12, 0.07), MAT.carpinteria, r.g, L/2, 0.06, 0);
    // la puerta lleva la bisagra en P1 y abre hacia dentro, 180°: abierta queda
    // paralela a la cristalera, delante del fijo de al lado. El pivote, un poco por dentro
    var pv = hoja(r.g, P1, P1-P0, tr-0.14, 0.12, -sg*0.05, MAT.cristal, -1, -sg*d2r(178), infoA).parent;
    malla(caja(0.05, tr-0.14, 0.06), MAT.carpinteria, pv, -(P1-P0)+0.03, 0.12+(tr-0.14)/2, 0);
  } else if(h[4] === 'garaje'){
    // basculante de una pieza con muelles: gira sobre los brazos a un tercio de abajo y, abierta, queda
    // paralela al suelo bajo el dintel, con un tercio fuera y el resto dentro
    var pgar = new THREE.Group(); r.g.add(pgar);
    var gp = malla(caja(L, hh, 0.05), MAT.marron, pgar, L/2, hh*0.15, 0);
    for(var kg=1;kg<6;kg++) malla(caja(L - 0.1, 0.02, 0.01), lam({color:'#3f3027'}), pgar, L/2, -hh*0.35 + kg*hh/6, -sg*0.03);   // acanalado
    [0.06, L - 0.06].forEach(function(x){                                          // muelles en los lados, por dentro
      malla(new THREE.CylinderGeometry(0.025, 0.025, hh*0.6, 8), MAT.hierro, r.g, x, y0 + hh*0.35, zr - sg*0.12);
    });
    var infoG = {tipo:'Hueco', id:op.id || null, nombre:'Puerta del garaje', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m'], ['Alto', hh.toFixed(2).replace('.',',')+' m']]};
    reg(gp, infoG);
    infoG.puerta = puertaMovil(r.g, [L/2, ym, zr], 'la puerta del garaje', (function(pg, hh, y0, y1, zr, sg){
      return function(t){ pg.position.set(0, y0 + hh*0.35 + t*(y1 - 0.06 - y0 - hh*0.35), zr); pg.rotation.x = -sg*t*Math.PI/2; };
    })(pgar, hh, y0, y1, zr, sg));
  } else if(h[4] === 'ventanal'){
    // ventanal plegable de 4 hojas con cortinas
    var info = {tipo:'Hueco', id:op.id || null, nombre:'Ventanal', datos:[['Ancho', L.toFixed(2).replace('.',',')+' m'], ['Hojas', '4, plegables']]};
    reg(malla(caja(L, hh, 0.02), MAT.cristal, r.g, L/2, ym, zr), info);
    // visillos blancos recogidos a los lados, por dentro
    [0.22, L-0.22].forEach(function(x){ malla(caja(0.4, hh, 0.08), MAT.cortina, r.g, x, ym, zr - sg*0.1); });
    var fr = 0.07;
    malla(caja(L, fr, 0.08), MAT.carpinteria, r.g, L/2, y1-fr/2, zr);
    malla(caja(L, fr, 0.08), MAT.carpinteria, r.g, L/2, y0+fr/2, zr);
    for(var j=0;j<=4;j++) malla(caja(fr, hh, 0.08), MAT.carpinteria, r.g, Math.min(L-fr/2, Math.max(fr/2, L*j/4)), ym, zr);
  }
}); }
/* Las dos versiones de la casa: muros, huecos e interior se levantan una vez por versión, cada una
   en sus grupos, y ponVersion enseña una u otra. Lo demás (cubiertas, porches, exterior) es común;
   lo que la mejorada quita de fuera va en SOLO_ACTUAL. */
var TOLDOS = [];                          // toldos que se extienden al proyectar sombras
var VERSIONES = FM ? ['actual', 'mejorada'] : ['actual'], GRUPOS_V = {actual:[], mejorada:[]}, SOLO_ACTUAL = [];
var QUITA = FM && FM.quita || [];
function casaDe(v){ return v === 'mejorada' ? Object.assign({}, C0, FM.casa) : C0; }
function grupoV(capa, v){ var g = grupoCasa(capa); GRUPOS_V[v].push(g); return g; }
VERSIONES.forEach(function(v){
  C = casaDe(v); var base = gMuros; gMuros = grupoV('muros', v);
  construyeMuros(); construyeHuecos();
  gMuros = base;
});
C = C0;

/* Pilares y vigas de los porches */
C.pilares.forEach(function(p){
  var m = malla(caja(p[2], p[3], p[2]), MAT[p[4]], gMuros, p[0], p[3]/2, p[1]);
  malla(caja(p[2]+0.1, 0.1, p[2]+0.1), MAT.mares, gMuros, p[0], p[3]-0.05, p[1]);
  reg(m, {tipo:'Porche', nombre:'Pilar', datos:[['Sección', (p[2]*100).toFixed(0)+' cm'], ['Altura', p[3].toFixed(2).replace('.',',')+' m']]});
});
C.vigas.forEach(function(b){
  var r = grupoMuro(b[0],b[1],b[2],b[3]); r.g.parent.remove(r.g); gCub.add(r.g);
  if(b[5] === 'jacena')                        // jácena blanca de obra: el mismo remate arriba, 35 cm de canto
    reg(malla(caja(r.L+0.3, 0.35, 0.3), MAT.blanco, r.g, r.L/2, b[4]+0.22-0.175, 0), {tipo:'Porche', nombre:'Jácena', datos:[['Canto', '35 cm']]});
  else malla(caja(r.L+0.3, 0.22, 0.16), MAT.madera, r.g, r.L/2, b[4]+0.11, 0);
});
C.celosias.forEach(function(b){
  var r = grupoMuro(b[0],b[1],b[2],b[3]);
  var pl = malla(new THREE.PlaneGeometry(r.L, b[4]), MAT.celosia, r.g, r.L/2, C.cotaSuelo+b[4]/2, 0);
  var uv = pl.geometry.attributes.uv;
  for(var i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*r.L, uv.getY(i)*b[4]);
  malla(caja(r.L, 0.06, 0.18), MAT.blanco, r.g, r.L/2, C.cotaSuelo+b[4]+0.03, 0);
});
C.losas.forEach(function(l){
  var b0 = l.base || 0;                    // `base`: la cota de abajo, si baja de la plataforma
  reg(malla(prisma(cajaAPoly(l.caja), null, l.alto - b0), MAT[l.mat], gMuros, 0, b0, 0),
    {tipo:'Suelo', nombre: l.mat === 'hormigon' ? 'Solera de hormigón' : 'Acera de losas',
     datos:[['Superficie', areaPoly(cajaAPoly(l.caja)).toFixed(1).replace('.',',')+' m²'], ['Altura', (l.alto*100).toFixed(0)+' cm']]});
});

/* Cubiertas */
var VUELO = 0.45, VUELO_H = 0.25, CANTO = 0.12;
var canecillos = [];                     // [u, y, v, ángulo] bajo los aleros
function aleroCanecillos(ua, va, ub, vb, y, nu, nv){
  var L = Math.hypot(ub-ua, vb-va), n = Math.floor(L/0.55);
  for(var i=0;i<=n;i++){
    var t = (i+0.5)/(n+1);
    canecillos.push([ua+(ub-ua)*t + nu*0.22, y, va+(vb-va)*t + nv*0.22, Math.atan2(nv, nu)]);
  }
}
function hastial(u, va, vb, alero, cumbrera, e, mat){
  var s = new THREE.Shape();
  s.moveTo(va, alero); s.lineTo(vb, alero); s.lineTo((va+vb)/2, cumbrera); s.closePath();
  var g = new THREE.ExtrudeGeometry(s, {depth:e, bevelEnabled:false});
  var m = malla(g, mat, gMuros, u + e/2, 0, 0);    // girado: la extrusión va hacia -u
  m.rotation.y = -Math.PI/2;
  return reg(m, INFO_CASA);
}
C.cubiertas.forEach(function(c){
  var k = c.caja, u0=k[0], v0=k[1], u1=k[2], v1=k[3];
  var info = {tipo:'Cubierta', nombre:c.nombre || c.id,
    datos:[['Planta', ((u1-u0)*(v1-v0)).toFixed(0)+' m²']]};
  if(c.tipo === 'dos_aguas'){          // cumbrera a lo largo de u
    var vm = (v0+v1)/2, D = (v1-v0)/2, H = c.cumbrera - c.alero, pend = H/D;
    var yb = c.alero - VUELO*pend, top = c.cumbrera + CANTO, fal = c.faldon || [];
    var fO = fal.indexOf('O') >= 0, fE = fal.indexOf('E') >= 0;
    // con faldón, el alero da la vuelta (vuelo normal) y la cumbrera se acorta D a ese lado
    var pg2 = c.pegada || '';                          // lado contra la casa: sin vuelo
    var ua = fO ? u0-VUELO : pg2.indexOf('O') >= 0 ? u0 : u0-VUELO_H, ub = fE ? u1+VUELO : pg2.indexOf('E') >= 0 ? u1 : u1+VUELO_H;
    var ra = fO ? u0+D : ua, rb = fE ? u1-D : ub;
    reg(malla(losa4([[ra,top,vm],[rb,top,vm],[ub,yb+CANTO,v0-VUELO],[ua,yb+CANTO,v0-VUELO]], CANTO), MAT.teja, gCub), info);
    reg(malla(losa4([[rb,top,vm],[ra,top,vm],[ua,yb+CANTO,v1+VUELO],[ub,yb+CANTO,v1+VUELO]], CANTO), MAT.teja, gCub), info);
    if(fO) reg(malla(losa4([[ua,yb+CANTO,v0-VUELO],[ra,top,vm-0.01],[ra,top,vm+0.01],[ua,yb+CANTO,v1+VUELO]], CANTO), MAT.teja, gCub), info);
    if(fE) reg(malla(losa4([[ub,yb+CANTO,v1+VUELO],[rb,top,vm+0.01],[rb,top,vm-0.01],[ub,yb+CANTO,v0-VUELO]], CANTO), MAT.teja, gCub), info);
    // caballete
    malla(caja(rb-ra, 0.12, 0.26), MAT.teja, gCub, (ra+rb)/2, top+0.03, vm);
    // contra la casa, el hastial va entero del lado de fuera: si no, asoma en la estancia de al lado
    if(!fO) hastial(pg2.indexOf('O') >= 0 ? u0 + 0.08 : u0, v0, v1, c.alero, c.cumbrera, 0.16, MAT.piedra);
    else aleroCanecillos(u0, v0, u0, v1, c.alero - 0.14, -1, 0);
    if(!fE) hastial(u1, v0, v1, c.alero, c.cumbrera, 0.16, MAT.piedra);
    else aleroCanecillos(u1, v0, u1, v1, c.alero - 0.14, 1, 0);
    aleroCanecillos(u0, v0, u1, v0, c.alero - 0.14, 0, -1);
    aleroCanecillos(u0, v1, u1, v1, c.alero - 0.14, 0, 1);
    info.datos.push(['Tipo', 'dos aguas, teja árabe'], ['Alero', c.alero.toFixed(2).replace('.',',')+' m'],
      ['Cumbrera', c.cumbrera.toFixed(2).replace('.',',')+' m'], ['Pendiente', (Math.atan(pend)*180/Math.PI).toFixed(0)+'°']);
  } else if(c.tipo === 'una_agua'){
    var cae = c.cae, alto = c.alto + CANTO, bajo = c.bajo + CANTO, p, vu = c.vuelo || VUELO;
    var span = (cae==='N'||cae==='S') ? v1-v0 : u1-u0, pd = (c.alto-c.bajo)/span, bv = bajo - vu*pd;
    // el lado `pegada` apoya en un muro más alto de la casa: sin vuelo, que asomaría dentro
    var pg = c.pegada || '', ua = pg.indexOf('O') >= 0 ? u0 : u0-VUELO_H, ub = pg.indexOf('E') >= 0 ? u1 : u1+VUELO_H;
    if(cae === 'N') p = [[ua,alto,v1],[ub,alto,v1],[ub,bv,v0-vu],[ua,bv,v0-vu]];
    if(cae === 'S') p = [[ub,alto,v0],[ua,alto,v0],[ua,bv,v1+vu],[ub,bv,v1+vu]];
    reg(malla(losa4(p, CANTO), MAT.teja, gCub), info);
    if(cae === 'N') aleroCanecillos(u0, v0, u1, v0, c.bajo - 0.14, 0, -1);
    if(cae === 'S') aleroCanecillos(u0, v1, u1, v1, c.bajo - 0.14, 0, 1);
    info.datos.push(['Tipo', 'una agua, teja árabe'], ['Altura', c.bajo.toFixed(2).replace('.',',')+' – '+c.alto.toFixed(2).replace('.',',')+' m']);
  } else {                               // azotea: forjado, peto y albardilla
    var fo = malla(caja(u1-u0, 0.2, v1-v0), MAT.azotea, gCub, (u0+u1)/2, c.alto-0.1, (v0+v1)/2);
    reg(fo, info);
    // `paso_s` / `paso_n`: tramo del lado S o N sin peto ni albardilla, por donde se entra desde la escalera
    var ps = c.paso_s, pn = c.paso_n;
    var lados = (pn ? [[u0,v0,pn[0],v0],[pn[1],v0,u1,v0]] : [[u0,v0,u1,v0]]).concat([[u1,v0,u1,v1]],
                ps ? [[u1,v1,ps[1],v1],[ps[0],v1,u0,v1]] : [[u1,v1,u0,v1]], [[u0,v1,u0,v0]]);
    var pasoEn = function(u, v){ return (pn && Math.abs(v - v0) < 0.01 && (Math.abs(u - pn[0]) < 0.01 || Math.abs(u - pn[1]) < 0.01)) ||
                                        (ps && Math.abs(v - v1) < 0.01 && (Math.abs(u - ps[0]) < 0.01 || Math.abs(u - ps[1]) < 0.01)); };
    lados.forEach(function(s){
      var r = grupoMuro(s[0],s[1],s[2],s[3]); r.g.parent.remove(r.g); gCub.add(r.g);
      // en las esquinas sobresale 15 cm; junto a un paso, no, que taparía la entrada
      var e0 = pasoEn(s[0], s[1]) ? -0.15 : 0, e1 = pasoEn(s[2], s[3]) ? -0.15 : 0;
      malla(caja(r.L+0.3+e0+e1, 0.06, 0.3), MAT.mares, r.g, (r.L + e1 - e0)/2, c.peto+0.03, 0).geometry.userData.muro = true;
    });
    info.datos.push(['Tipo', 'azotea transitable'], ['Suelo', c.alto.toFixed(2).replace('.',',')+' m'], ['Peto', c.peto.toFixed(2).replace('.',',')+' m']);
  }
});
(function(){
  var im = new THREE.InstancedMesh(caja(0.42, 0.1, 0.08), MAT.madera, canecillos.length), o = new THREE.Object3D();
  canecillos.forEach(function(c, i){
    o.position.set(c[0], c[1], c[2]); o.rotation.set(0, -c[3], 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
  });
  gCub.add(im);
})();

/* Chimenea y barbacoa */
C.chimeneas.forEach(function(ch){
  var u = ch.uv[0], v = ch.uv[1], l = ch.lado;
  if(ch.barbacoa){
    var info = {tipo:'Exterior', nombre:'Barbacoa de obra', datos:[['Altura', ch.alto.toFixed(1).replace('.',',')+' m']]};
    // todas las piezas con la ficha: si la mejorada la quita, se va entera, chimenea incluida
    reg(malla(caja(0.95, 0.9, 0.7), MAT.piedra, gMuros, u, 0.45, v), info);
    reg(malla(caja(0.95, 0.06, 0.75), MAT.mares, gMuros, u, 0.93, v), info);
    reg(malla(caja(0.95, 0.9, 0.62), MAT.blanco, gMuros, u, 1.85, v-0.04), info);
    reg(malla(caja(l, ch.alto-2.3, l), MAT.blanco, gMuros, u, (ch.alto+2.3)/2, v-0.1), info);
    reg(malla(caja(l+0.12, 0.08, l+0.12), MAT.mares, gMuros, u, ch.alto+0.04, v-0.1), info);
  } else {
    var b0 = ch.base || 2.5;
    reg(malla(caja(l, ch.alto-b0, l), MAT.blanco, gCub, u, (ch.alto+b0)/2, v),
      {tipo:'Cubierta', nombre:'Chimenea', datos:[['Altura', ch.alto.toFixed(1).replace('.',',')+' m']]});
    malla(caja(l+0.14, 0.08, l+0.14), MAT.mares, gCub, u, ch.alto+0.04, v);
    malla(caja(l*0.8, 0.22, l*0.8), MAT.teja, gCub, u, ch.alto+0.2, v);
  }
});

/* Escaleras: tramos rectos y rellanos. De obra (macizas, blancas) o metálicas (al aire). */
function barandilla(g, x0, y0, x1, y1, z){          // en el grupo g, de (x0,y0) a (x1,y1), a z fija
  var L = Math.hypot(x1-x0, y1-y0), ang = Math.atan2(y1-y0, x1-x0), n = Math.max(1, Math.round(L/1.1));
  var p = malla(caja(L, 0.04, 0.04), MAT.metal, g, (x0+x1)/2, (y0+y1)/2+0.95, z); p.rotation.z = ang;
  var m = malla(caja(L, 0.025, 0.025), MAT.metal, g, (x0+x1)/2, (y0+y1)/2+0.5, z); m.rotation.z = ang;
  for(var j=0;j<=n;j++){ var t=j/n; malla(caja(0.035, 0.95, 0.035), MAT.metal, g, x0+t*(x1-x0), y0+t*(y1-y0)+0.47, z); }
  // pared invisible para el paseo: la barandilla no deja caerse por el lado
  var c = malla(caja(L, 1.0, 0.06), MAT.choque, g, (x0+x1)/2, (y0+y1)/2+0.5, z); c.rotation.z = ang;
  c.userData.soloChoque = true;
}
C.escaleras.forEach(function(s){
  var obra = s.tipo === 'obra', total = 0, sube = 0;
  s.tramos.forEach(function(t){ total += Math.round((t.y1-t.y0)/0.17); sube = Math.max(sube, t.y1); });
  var info = {tipo:'Exterior', nombre: s.nombre || (obra ? 'Escalera de obra' : 'Escalera metálica'),
    datos:[['Peldaños', total], ['Sube', sube.toFixed(2).replace('.',',')+' m'], ['Tramos', s.tramos.length]]};
  s.tramos.forEach(function(t){
    var r = grupoMuro(t.pie[0], t.pie[1], t.cabeza[0], t.cabeza[1]), L = r.L, H = t.y1 - t.y0;
    var n = Math.round(H/0.17), ang = Math.atan2(H, L), lz = Math.hypot(L, H), w = t.ancho;
    for(var i=0;i<n;i++){
      var x = (i+0.5)*L/n, y = t.y0 + (i+1)*H/n;
      if(obra){
        reg(malla(caja(L/n+0.01, y, w), MAT.blanco, r.g, x, y/2, 0), info);
        malla(caja(L/n+0.03, 0.03, w+0.02), MAT.hormigon, r.g, x, y+0.015, 0);
      } else reg(malla(caja(L/n+0.04, 0.04, w), MAT.metal, r.g, x, y, 0), info);
    }
    if(obra) [-1, 1].forEach(function(lado){ barandilla(r.g, 0, t.y0 + H/n, L, t.y1, lado*w/2); });   // a los dos lados
    else [-1,1].forEach(function(lado){
      var z = lado*(w/2+0.02);
      var zanca = malla(caja(lz, 0.18, 0.03), MAT.metal, r.g, L/2, t.y0 + H/2, z); zanca.rotation.z = ang;
      barandilla(r.g, 0, t.y0, L, t.y1, z);
    });
  });
  (s.rellanos || []).forEach(function(q){
    var k = q.caja, cu = (k[0]+k[2])/2, cv = (k[1]+k[3])/2;
    if(obra){
      reg(malla(caja(k[2]-k[0], q.y, k[3]-k[1]), MAT.blanco, gMuros, cu, q.y/2, cv), info);
      malla(caja(k[2]-k[0]+0.02, 0.03, k[3]-k[1]+0.02), MAT.hormigon, gMuros, cu, q.y+0.015, cv);
    } else {
      // de rejilla, colgado de la pared y de la escalera: sin pies hasta el suelo
      reg(malla(caja(k[2]-k[0], 0.05, k[3]-k[1]), MAT.metal, gMuros, cu, q.y-0.025, cv), info);
    }
    (q.barandilla || []).forEach(function(lado){
      var r = {O:[k[0],k[1],k[0],k[3]], E:[k[2],k[1],k[2],k[3]], N:[k[0],k[1],k[2],k[1]], S:[k[0],k[3],k[2],k[3]]}[lado];
      r = grupoMuro(r[0], r[1], r[2], r[3]);
      barandilla(r.g, 0, q.y, r.L, q.y, 0);
    });
  });
});

/* Tendedero sobre una azotea (C.tendedero: la cubierta y los cuatro postes): travesaños arriba y cuerdas */
(function(){
  var az = C.tendedero && C.cubiertas.filter(function(c){ return c.id === C.tendedero.cubierta; })[0];
  if(!az) return;
  var T = C.tendedero.postes, H = 1.8, y = az.alto + H;
  T.forEach(function(p){ malla(caja(0.05, H, 0.05), MAT.metal, gCub, p[0], az.alto+H/2, p[1]); });
  // travesaños de lado corto (a lo largo de u) y cuerdas de un travesaño al otro
  [[T[0], T[1]], [T[3], T[2]]].forEach(function(par){
    var a = par[0], b = par[1];
    malla(caja(Math.abs(b[0]-a[0])+0.05, 0.04, 0.04), MAT.metal, gCub, (a[0]+b[0])/2, y-0.02, a[1]);
  });
  var u0 = Math.min(T[0][0], T[1][0]), u1 = Math.max(T[0][0], T[1][0]), v0 = T[0][1], v1 = T[3][1];
  for(var i=0;i<5;i++){
    var u = u0 + 0.12 + i*(u1-u0-0.24)/4;
    malla(caja(0.012, 0.012, Math.abs(v1-v0)), MAT.hierro, gCub, u, y-0.03, (v0+v1)/2);
  }
})();

/* Leñero adosado a un muro, con su tejadillo: solera, dos muretes y la leña apilada dentro
   */
(function(){
  var p = C.lenero; if(!p) return;
  var k = p.caja, cu = (k[0]+k[2])/2, cv = (k[1]+k[3])/2, W = k[2]-k[0], D = k[3]-k[1];
  var info = {tipo:'Exterior', nombre:'Leñero', datos:[]};
  reg(malla(caja(W, 0.1, D), MAT.hormigon, gMuros, cu, 0.05, cv), info);
  [k[1]+0.06, k[3]-0.06].forEach(function(v){ reg(malla(caja(W, p.tejado, 0.12), MAT.blanco, gMuros, cu, p.tejado/2, v), info); });
  var t = reg(malla(caja(W+0.35, 0.08, D+0.3), MAT.teja, gMuros, cu-0.1, p.tejado+0.05, cv), info); t.rotation.z = -0.25;
  // troncos de ~40 cm, con la testa hacia fuera, en dos hileras y capas hasta ~1,3 m
  var r = 0.065, hileras = [k[0]+0.25, k[0]+0.68], n = Math.floor((D-0.3)/(2*r+0.01)), capas = 10;
  var geo = new THREE.CylinderGeometry(1, 1, 1, 7); geo.rotateZ(Math.PI/2);
  var im = new THREE.InstancedMesh(geo, lam({color:'#ffffff'}), hileras.length*n*capas), o = new THREE.Object3D(), col = new THREE.Color(), i = 0;
  hileras.forEach(function(u){
    for(var c=0;c<capas;c++) for(var j=0;j<n;j++){
      var rr = r*(0.75+azar()*0.5);
      o.position.set(u + (azar()-.5)*0.06, 0.1 + r + c*2*r*0.93, k[1]+0.15+r + j*(2*r+0.01) + (c%2)*r*0.5);
      o.rotation.set((azar()-.5)*0.15, (azar()-.5)*0.2, 0);
      o.scale.set(0.4 + azar()*0.06, rr, rr); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, col.set(azar() < 0.5 ? '#8a6a4a' : '#a88660').offsetHSL(0, 0, (azar()-.5)*0.1)); i++;
    }
  });
  im.count = i; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  gMuros.add(im);
})();
/* Máquinas en una azotea (C.azoteaSO: la cubierta, las condensadoras del aire y la parabólica) */
(function(){
  var a = C.azoteaSO, az = a && C.cubiertas.filter(function(c){ return c.id === a.cubierta; })[0];
  if(!a || !az) return;
  var info = {tipo:'Cubierta', nombre:'Condensadora del aire', datos:[]};
  a.maquinas.forEach(function(p){
    reg(malla(caja(0.32, 0.6, 0.82), MAT.blanco, gCub, p[0], az.alto+0.3, p[1]), info);
    cil(gCub, 0.22, 0.22, 0.01, MAT.hierro, p[0]-0.165, az.alto+0.32, p[1], 20).rotation.z = Math.PI/2;
  });
  var q = a.parabolica; if(!q) return;
  var d = cil(gCub, 0.4, 0.3, 0.06, MAT.blanco, q[0], az.peto+0.35, q[1], 24);
  d.rotation.set(0.9, 0, 0.4);
})();

/* ===================== interior =====================
   Suelos y revestimientos en la capa «interior»; techos y vigas con la cubierta, para que al
   quitarla se vea todo desde arriba. Muebles a ojo, con primitivas. */
var INT = C.interior || {estancias:[], muebles:[]};
var gInt = grupoCasa('interior');
var TARIMA = lienzo(512, 512, function(g, w, h){       // tarima gris clara, tablas de 19 cm
  var n = 6, aw = w/n;
  g.fillStyle = 'hsl(34,16%,70%)'; g.fillRect(0, 0, w, h);          // sin fondo quedaban huecos negros
  for(var i=0;i<n;i++){
    var off = azar()*h;
    for(var k=-1;k<2;k++){
      var y = off + k*h*0.62;
      g.fillStyle = 'hsl(34,'+(12+azar()*8)+'%,'+(66+azar()*9)+'%)';
      [y - h, y, y + h].forEach(function(yy){ g.fillRect(i*aw, yy, aw, h*0.62); });   // repetida arriba y abajo: la textura se repite
      for(var f=0;f<18;f++){ g.fillStyle='rgba(90,70,50,'+(azar()*0.08)+')'; g.fillRect(i*aw+azar()*aw, y, 1+azar()*2, h*0.62); }
      g.fillStyle='rgba(60,50,40,0.35)'; [y - h, y, y + h].forEach(function(yy){ g.fillRect(i*aw, yy, aw, 2); });
    }
    g.fillStyle='rgba(60,50,40,0.35)'; g.fillRect(i*aw, 0, 2, h);
  }
}, 1.14, 1.14);
var BARRO = lienzo(256, 256, function(g, w, h){        // baldosa de barro de 33 cm a junta recta
  var n = 2, t = w/n;
  g.fillStyle = '#b7a58f'; g.fillRect(0,0,w,h);
  for(var i=0;i<n;i++) for(var j=0;j<n;j++){
    g.fillStyle = 'hsl('+(17+azar()*7)+','+(30+azar()*10)+'%,'+(42+azar()*8)+'%)';
    g.fillRect(i*t+2, j*t+2, t-4, t-4);
    for(var k=0;k<40;k++){ g.fillStyle='rgba('+(azar()<.5?'70,35,20':'230,190,150')+','+(azar()*0.1)+')';
      g.fillRect(i*t+3+azar()*(t-10), j*t+3+azar()*(t-10), 2+azar()*6, 2+azar()*6); }
  }
}, 0.66, 0.66);
var GRES = lienzo(256, 256, function(g, w, h){          // baldosa gris oscura de 60 × 30
  g.fillStyle = '#4e4d4b'; g.fillRect(0,0,w,h);
  for(var j=0;j<4;j++) for(var i=0;i<2;i++){
    g.fillStyle = 'hsl(40,3%,'+(46+azar()*5)+'%)'; g.fillRect(i*w/2+1, j*h/4+1, w/2-2, h/4-2);
  }
}, 1.2, 1.2);
var BEIGE = lienzo(128, 128, function(g, w, h){         // baldosa beige de 33 cm
  g.fillStyle = '#b8ab95'; g.fillRect(0,0,w,h);
  for(var j=0;j<2;j++) for(var i=0;i<2;i++){ g.fillStyle = 'hsl(38,'+(26+azar()*8)+'%,'+(60+azar()*6)+'%)'; g.fillRect(i*w/2+1, j*h/2+1, w/2-2, h/2-2); }
}, 0.66, 0.66);
var AZULEJO = lienzo(128, 128, function(g, w, h){       // azulejo blanco de 20 × 20
  g.fillStyle = '#8f8f8a'; g.fillRect(0,0,w,h);
  for(var j=0;j<2;j++) for(var i=0;i<2;i++){ g.fillStyle = '#f3f3ef'; g.fillRect(i*w/2+1, j*h/2+1, w/2-2, h/2-2); }
}, 0.4, 0.4);
var MIMBRE = lienzo(128, 128, function(g, w, h){       // trenzado de los sillones colgantes
  g.clearRect(0,0,w,h); g.strokeStyle = '#ffffff'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(0,0); g.lineTo(w,h); g.moveTo(w,0); g.lineTo(0,h);
  g.moveTo(-w/2,h/2); g.lineTo(w/2,h*1.5); g.moveTo(w/2,-h/2); g.lineTo(w*1.5,h/2);
  g.moveTo(w/2,-h/2); g.lineTo(-w/2,h/2); g.moveTo(w*1.5,h/2); g.lineTo(w/2,h*1.5); g.stroke();
}, 1, 1);
MIMBRE.repeat.set(28, 16);
/* Suelos de la versión mejorada */
var PARQUET = lienzo(512, 512, function(g, w, h){      // roble cálido en lamas anchas de 22 cm
  var n = 5, aw = w/n;
  g.fillStyle = 'hsl(31,38%,60%)'; g.fillRect(0, 0, w, h);
  for(var i=0;i<n;i++){
    var off = azar()*h*0.55;
    for(var k=-1;k<2;k++){
      var y = off + k*h*0.55;
      g.fillStyle = 'hsl(31,'+(34+azar()*10)+'%,'+(58+azar()*8)+'%)'; g.fillRect(i*aw, y, aw, h*0.55);
      for(var f=0;f<26;f++){ g.fillStyle='rgba(110,70,35,'+(azar()*0.09)+')'; g.fillRect(i*aw+azar()*aw, y, 1+azar()*2, h*0.55); }
      g.fillStyle='rgba(70,45,25,0.35)'; g.fillRect(i*aw, y, aw, 2);
    }
    g.fillStyle='rgba(70,45,25,0.35)'; g.fillRect(i*aw, 0, 2, h);
  }
}, 1.1, 1.1);
var HIDRAULICA = lienzo(256, 256, function(g, w, h){   // baldosa hidráulica de 20 cm: flor en verde, crema y gris
  var t = w/2;
  for(var i=0;i<2;i++) for(var j=0;j<2;j++){
    var x = i*t, y = j*t;
    g.fillStyle = '#e9e2d3'; g.fillRect(x, y, t, t);
    g.fillStyle = '#6f8a78';
    g.beginPath(); g.moveTo(x+t/2, y+t*0.12); g.lineTo(x+t*0.88, y+t/2); g.lineTo(x+t/2, y+t*0.88); g.lineTo(x+t*0.12, y+t/2); g.closePath(); g.fill();
    g.fillStyle = '#e9e2d3'; g.beginPath(); g.arc(x+t/2, y+t/2, t*0.2, 0, Math.PI*2); g.fill();
    g.fillStyle = '#9a9387'; [[0,0],[t,0],[0,t],[t,t]].forEach(function(c){ g.beginPath(); g.arc(x+c[0], y+c[1], t*0.16, 0, Math.PI*2); g.fill(); });
    g.fillStyle = 'rgba(80,70,60,0.35)'; g.fillRect(x, y, t, 1); g.fillRect(x, y, 1, t);
  }
}, 0.4, 0.4);
/* Esferas de reloj, una por estilo: fondo (color, o 'madera': tablas decapadas en horizontal),
   tinta, números ('arabes', 'romanos', 'cuartos' — solo 12, 3, 6 y 9 — o 'ninguno'), `radial`
   (girados hacia el centro), marcas ('minutos', 'horas', 'puntos' o 'ninguna'), `rayos` (trazos entre
   números), `aro` (radio de un círculo fino, sobre 128), peso, tamaño y fuente de la letra, radio de
   los números y un texto pequeño bajo el eje (la marca) */
var ESFERAS = {};
var ROMANOS = ['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
function esferaReloj(o){
  o = Object.assign({fondo:'#f7f5f0', tinta:'#1d1d1d', numeros:'arabes', marcas:'minutos', peso:600, letra:30,
                     radio:86, fuente:'"IBM Plex Sans", sans-serif', texto:''}, o || {});
  var k = JSON.stringify(o); if(ESFERAS[k]) return ESFERAS[k];
  var c = document.createElement('canvas'); c.width = c.height = 512;
  var g = c.getContext('2d'); g.scale(2, 2);
  if(o.fondo === 'madera'){
    // tablas de ~3 cm (en un reloj de 40) de madera blanqueada, con veta y juntas
    var az = semilla; semilla = 777;
    for(var y = 0; y < 256; y += 26){
      g.fillStyle = 'hsl(' + (20 + azar()*14) + ',' + (10 + azar()*8) + '%,' + (70 + azar()*8) + '%)'; g.fillRect(0, y, 256, 26);
      for(var v = 0; v < 14; v++){
        g.strokeStyle = 'rgba(90,70,60,' + (0.08 + azar()*0.12) + ')'; g.lineWidth = 0.6 + azar();
        var yv = y + 2 + azar()*22; g.beginPath(); g.moveTo(0, yv);
        g.bezierCurveTo(80, yv + (azar()-.5)*4, 170, yv + (azar()-.5)*4, 256, yv + (azar()-.5)*3); g.stroke();
      }
      g.fillStyle = 'rgba(60,45,40,0.45)'; g.fillRect(0, y, 256, 1.2);
    }
    semilla = az;
  } else { g.fillStyle = o.fondo; g.fillRect(0, 0, 256, 256); }
  g.translate(128, 128); g.fillStyle = o.tinta; g.strokeStyle = o.tinta;
  if(o.marcas === 'puntos') for(var i=0;i<60;i++){
    var q = i%5 === 0, a0 = i/60*2*Math.PI; g.beginPath(); g.arc(116*Math.sin(a0), -116*Math.cos(a0), q ? 2.6 : 1.8, 0, 2*Math.PI); g.fill();
  } else if(o.marcas !== 'ninguna') for(var i=0;i<60;i++){
    var q = i%5 === 0; if(!q && o.marcas === 'horas') continue;
    g.save(); g.rotate(i/60*2*Math.PI); g.fillRect(q ? -3 : -1, -122, q ? 6 : 2, q ? 16 : 7); g.restore();
  }
  if(o.aro){ g.lineWidth = 2.2; g.beginPath(); g.arc(0, 0, o.aro, 0, 2*Math.PI); g.stroke(); }
  if(o.rayos) for(var j=0;j<12;j++){
    var ar = (j + 0.5)/12*2*Math.PI; g.lineWidth = 1.4; g.beginPath();
    g.moveTo((o.aro || 60)*Math.sin(ar), -(o.aro || 60)*Math.cos(ar)); g.lineTo(126*Math.sin(ar), -126*Math.cos(ar)); g.stroke();
  }
  g.font = o.peso + ' ' + o.letra + 'px ' + o.fuente; g.textAlign = 'center'; g.textBaseline = 'middle';
  for(var n=1;n<=12;n++){
    if(o.numeros === 'ninguno' || (o.numeros === 'cuartos' && n%3)) continue;
    var a = n/12*2*Math.PI, txt = o.numeros === 'romanos' ? ROMANOS[n%12] : String(n);
    if(o.radial){ g.save(); g.rotate(a); g.fillText(txt, 0, -o.radio); g.restore(); }
    else g.fillText(txt, o.radio*Math.sin(a), -o.radio*Math.cos(a));
  }
  if(o.texto){ g.font = '500 11px ' + o.fuente; g.fillText(o.texto, 0, 38); }
  var t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return (ESFERAS[k] = mate({color:'#ffffff', map:t}));
}
var ESFERA_RELOJ = esferaReloj();
var RELOJES = [];
/* Nogal: veta oscura a lo largo; su propio azar para no mover el de todo lo demás */
var NOGAL = lienzo(512, 256, function(g, w, h){
  var sem = 7, rnd = function(){ sem = (sem*16807) % 2147483647; return sem/2147483647; };
  g.fillStyle = 'hsl(24,34%,30%)'; g.fillRect(0, 0, w, h);
  for(var i=0;i<90;i++){
    var y = rnd()*h, a = 2+rnd()*9, f = rnd()*0.05, cl = rnd() < 0.5;
    g.strokeStyle = cl ? 'rgba(150,100,62,'+(0.10+rnd()*0.18)+')' : 'rgba(35,20,12,'+(0.12+rnd()*0.22)+')';
    g.lineWidth = 0.8+rnd()*2.4; g.beginPath();
    for(var x=0;x<=w;x+=8){ var yy = y + a*Math.sin(x*f*0.25 + i) ; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
    g.stroke();
  }
}, 1.4, 0.7);
/* Suelos, techos y paredes en Phong: Lambert ilumina por vértice y con las luces de dentro
   los paños grandes (cuatro vértices lejos de la luz) quedaban negros. */
function mate(o){ o.shininess = 4; o.specular = new THREE.Color('#141414'); return new THREE.MeshPhongMaterial(o); }
var MI = {
  tarima: mate({color:'#d6cfc2', map:TARIMA}),
  barro:  mate({color:'#ffffff', map:BARRO}),
  techo:  mate({color:'#f1f0ec', emissive:'#34332f'}),
  piedra: mate({color:'#e4ded4', map:MAT.piedra.map}),
  tablero:mate({color:'#7b4c31'}),                     // techo de madera del porche
  viga:   lam({color:'#4a3122'}),
  roble:  lam({color:'#c9a36e'}),
  nogal:  mate({color:'#ffffff', map:NOGAL}),
  segundero: lam({color:'#c0392b'}),
  negro:  lam({color:'#1f1d1c'}),
  cuero:  lam({color:'#5b3b2a'}),
  blanco: lam({color:'#f1f0ec'}),
  gris:   lam({color:'#8d8a84'}),
  tela:   lam({color:'#b9b3a6'}),
  cojin:  lam({color:'#cfc3ad'}),
  madera: lam({color:'#6b4a2f'}),
  oscura: lam({color:'#3b2b20'}),
  rojo:   lam({color:'#c8352e'}),
  azul:   lam({color:'#2f7fc1'}),
  maceta: lam({color:'#2b2b2a'}),
  hoja:   lam({color:'#4c6a33'}),
  cuadro: lam({color:'#9ec3d4'}),
  pantalla: lam({color:'#1d2227', emissive:'#2b4260', emissiveIntensity:0.55}),
  led:    lam({color:'#3a5cff', emissive:'#3a5cff', emissiveIntensity:1}),
  mimbre: lam({color:'#2b2927', map:MIMBRE, alphaTest:0.5, side:THREE.DoubleSide}),
  laminado: mate({color:'#c9ae88', map:TARIMA}),        // laminado de roble claro
  gres:   mate({color:'#ffffff', map:GRES}),
  porcelanico: mate({color:'#c9c7c3', map:GRES}),
  beige:  mate({color:'#ffffff', map:BEIGE}),       // baldosa grande gris clara de la cocina
  azulejo:mate({color:'#ffffff', map:AZULEJO}),
  pino:   lam({color:'#d9b27a'}),
  parquet: mate({color:'#ffffff', map:PARQUET}),
  hidraulica: mate({color:'#ffffff', map:HIDRAULICA}),
  microcemento: mate({color:'#cfc8bc'}),
  hormigon: mate({color:'#c4bcae'}),
  espejo: new THREE.MeshPhongMaterial({color:'#b9c6cc', shininess:120, specular:'#ffffff'}),
  loza:   new THREE.MeshPhongMaterial({color:'#f6f6f3', shininess:60, specular:'#555555'})
};

/* ===================== puntos de luz =====================
   Cada luminaria deja aquí su punto: la bombilla (con su propio material, para encenderla sola), el
   halo, la estancia y el grupo. Todas van apagadas: de noche se encienden solas las de la estancia
   donde estás, y las de fuera (jardín y porches), por grupos desde el panel. three.js paga cada luz
   en cada píxel, así que lo que alumbra de verdad son unas pocas (LUCES_N) que se reparten entre
   los puntos encendidos; las bombillas y los halos sí salen todos. */
var PUNTOS = [], V_CONS = '', LUZ_CTX = null;
var TONO_LUZ = {calida:'#ffc890', neutra:'#ffe8cc', fria:'#eaf0ff'};
var HALO = (function(){
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
/* La parte que brilla de una luminaria (una malla o varias, que comparten material).
   o: tono ('calida', 'neutra', 'fria' o un color), fuerza y alcance de la luz, halo (tamaño en m;
   0 sin halo), baja (la luz sale tanto por debajo de la bombilla, para que el techo no se coma el foco)
   y frente (tanto hacia el +z de la bombilla: una tira contra la pared alumbra más pared desde ahí).
   La estancia y el grupo salen de LUZ_CTX, que pone quien construye (o de o.cod, o.fuera, o.grupo). */
function bombilla(mallas, o){
  mallas = [].concat(mallas); o = o || {};
  var ctx = Object.assign({}, LUZ_CTX || {}, o), tono = new THREE.Color(TONO_LUZ[o.tono] || o.tono || TONO_LUZ.calida);
  var mat = mallas[0].material.clone(); mat.emissive = tono.clone(); mat.emissiveIntensity = 0;
  mallas.forEach(function(m){ m.material = mat; });
  var s = null;
  if(o.halo !== 0){
    s = new THREE.Sprite(new THREE.SpriteMaterial({map:HALO, color:tono, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:0.85}));
    // hijo de la bombilla, para que se mueva y se oculte con ella; su tamaño, sin la escala de la bombilla
    var b = mallas[0]; s.scale.setScalar((o.halo || 0.4)/b.scale.x);
    // en el techo, el halo cuelga de la bombilla: si no, el techo se come la mitad de arriba
    if(o.baja > 0){ s.center.set(0.5, 1); s.position.y = -0.012/b.scale.y; }
    s.visible = false; b.add(s);
  }
  var p = {cb:o.alEncender || null, mallas:mallas, mat:mat, halo:s, tono:tono, fuerza:o.fuerza || 0.6, alcance:o.alcance || 5, baja:o.baja || 0, frente:o.frente || 0,
           cod:ctx.cod || 'EXT', fuera:ctx.fuera !== undefined ? !!ctx.fuera : true, grupo:ctx.grupo || 'Jardín', version:V_CONS, on:false};
  PUNTOS.push(p); return p;
}
/* Luminarias: tipo de mueble → cómo se llama su luz en la ficha */
var LUMINARIA = {proyector:'proyector', flexo:'flexo', farola:'farola', foco:'foco empotrado', colgante:'colgante', plafon:'plafón', aplique:'aplique', tira:'tira LED',
  farol:'farol', lampara_techo:'colgante', lampara_pie:'lámpara de pie', lampara_rincon:'barra LED de rincón', farolillo:'baliza', guirnalda:'guirnalda'};

/* Referencia de foto de un mueble o una estancia: «t5: 12» es la foto 12 de la tanda t5, con el
   nombre de la tanda en meta.tandas; sin prefijo, la de meta.tandas.defecto */
var TANDAS = F.meta.tandas || {};
function textoFoto(f){
  var t = /^(t\d+):/.exec(f);
  return t ? (TANDAS[t[1]] || t[1])+', '+f.slice(t[0].length).trim() : (TANDAS.defecto ? TANDAS.defecto+' ' : '')+f;
}
function estanciaEn(u, v){
  return INT.estancias.filter(function(e){ var k = e.caja; return u >= k[0] && u <= k[2] && v >= k[1] && v <= k[3]; })[0];
}
function techoEn(e, v){
  var t = e.techo, k = e.caja;
  if(t.cumbrera !== undefined)                 // a dos aguas, cumbrera a lo largo de u en v = vc
    return t.alto + (t.cumbrera - t.alto)*(v < t.vc ? (v - k[1])/(t.vc - k[1]) : (k[3] - v)/(k[3] - t.vc));
  if(t.alto !== undefined) return t.alto;
  return t.alto0 + (t.alto1 - t.alto0)*(v - e.caja[1])/(e.caja[3] - e.caja[1]);
}

var RELLENO = [];                        // la luz de relleno de las estancias: de noche casi se apaga
function construyeEstancias(){ INT.estancias.forEach(function(e){
  var k = e.caja, info = {tipo:'Estancia', id:e.codigo || null, nombre:e.nombre, datos:[
    ['Superficie', ((k[2]-k[0]-0.14)*(k[3]-k[1]-0.14)).toFixed(1).replace('.',',')+' m²'],
    ['Suelo', {tarima:'tarima gris clara', barro:'baldosa de barro', laminado:'laminado de roble claro', gres:'gres gris', porcelanico:'porcelánico gris claro', beige:'baldosa beige', parquet:'roble en lamas anchas', hidraulica:'baldosa hidráulica', microcemento:'microcemento', hormigon:'solera de hormigón'}[e.suelo]],
  ].concat(e.idea ? [['Propuesta', 'versión mejorada']] : e.fotos ? [['Fotos', textoFoto(e.fotos)]] : []), nota:e.idea || e.nota || null};
  var a = k[0]+0.06, b = k[1]+0.06, c = k[2]-0.06, d = k[3]-0.06;
  // suelo: si la estancia va más alta que la casa, un escalón; si no, un plano
  var cu = (a+c)/2, cv = (b+d)/2, W = c-a, D = d-b;
  if(e.cota > C.cotaSuelo + 0.02) reg(malla(caja(W, e.cota - C.cotaSuelo, D), MI[e.suelo], gInt, cu, (e.cota + C.cotaSuelo)/2, cv), info);
  else {
    var pg = new THREE.PlaneGeometry(W, D), uv = pg.attributes.uv;
    for(var i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*W, uv.getY(i)*D);
    reg(malla(pg, MI[e.suelo], gInt, cu, e.cota + 0.004, cv), info).rotation.x = -Math.PI/2;
  }
  // techo, justo bajo la cubierta, y vigas de madera de fachada a fachada
  var t = e.techo, y0 = techoEn(e, k[1]), y1 = techoEn(e, k[3]), mt = t.mat === 'blanco' ? MI.techo : MI[t.mat];
  // a dos aguas, dos faldones que se juntan en la cumbrera
  var tramos = t.cumbrera !== undefined ? [[k[1], t.vc], [t.vc, k[3]]] : [[k[1], k[3]]];
  tramos.forEach(function(tr){
    var va = tr[0], vb = tr[1], ya = techoEn(e, va), yb = techoEn(e, vb);
    reg(malla(losa4([[k[0],ya+0.02,va],[k[2],ya+0.02,va],[k[2],yb+0.02,vb],[k[0],yb+0.02,vb]], 0.02), mt, gCub), info);
    if(!t.vigas && !t.huecos) return;
    var Lv = Math.hypot(vb-va, ya-yb), ang = Math.atan2(ya-yb, vb-va);
    // `vigas`: una cada tantos metros; `huecos`: tantos huecos iguales, con una viga pegada a cada extremo
    var us = [];
    if(t.huecos) for(var i = 0; i <= t.huecos; i++) us.push(k[0] + 0.05 + (k[2] - k[0] - 0.1)*i/t.huecos);
    else for(var u = k[0] + t.vigas/2; u < k[2]; u += t.vigas) us.push(u);
    us.forEach(function(u){
      malla(caja(0.1, 0.14, Lv), MI.viga, gCub, u, (ya+yb)/2 - 0.07, (va+vb)/2).rotation.x = ang;
    });
  });
  if(t.cumbrera !== undefined) malla(caja(k[2]-k[0], 0.2, 0.14), MI.viga, gCub, (k[0]+k[2])/2, t.cumbrera - 0.08, t.vc);
  // luz de relleno: dentro solo llega el cielo por los huecos y los techos quedarían negros
  var nl = e.luz === false ? 0 : Math.max(1, Math.round((k[2]-k[0])/5));
  for(var q=0;q<nl;q++){
    var luz = new THREE.PointLight('#fff4e6', 0.45, 10, 1.2);
    luz.position.set(k[0] + (k[2]-k[0])*(q+0.5)/nl, Math.min(y0, y1) - 0.5, (k[1]+k[3])/2); gInt.add(luz); RELLENO.push(luz);
  }
  // revestimiento de las paredes por el lado de la estancia: pintura o la piedra vista
  if(!e.pared) return;
  var pinta = function(p){ return p === 'piedra' || p === 'azulejo' ? MI[p] : mate({color:p}); };
  var mp = pinta(e.pared), otras = {};
  Object.keys(e.paredes || {}).forEach(function(l){ otras[l] = pinta(e.paredes[l]); });
  var lados = [['N', k[1], k[0], k[2], 1], ['S', k[3], k[0], k[2], -1], ['O', k[0], k[1], k[3], 1], ['E', k[2], k[1], k[3], -1]];
  function reviste(s, s0, s1, esp, ya, tA, tB){             // tramo s0..s1 del lado s, de ya a tA..tB
    var hor = s[0] === 'N' || s[0] === 'S';
    var g = new THREE.Group(); gInt.add(g);
    var z = s[1] + s[4]*(esp/2 + 0.006);
    if(hor) g.position.set(0, 0, z); else { g.position.set(z, 0, 0); g.rotation.y = -Math.PI/2; }
    var tope = function(p, th){ return Math.min(th, techoEn(e, hor ? s[1] : p)); };
    var vc = e.techo.cumbrera !== undefined && !hor ? e.techo.vc : null;
    if(vc !== null && vc > s0 + 0.05 && vc < s1 - 0.05 && tA === tB && tA < 9){   // hastial: dos paños hasta la cumbrera
      reviste(s, s0, vc, esp, ya, 9, 9); reviste(s, vc, s1, esp, ya, 9, 9); return;   // el techo lo recorta
    }
    var m = malla(pano(s0, s1, Math.max(ya, e.cota), tope(s0, tA), tope(s1, tB), 0.01), otras[s[0]] || mp, g);
    reg(m, info);
  }
  lados.forEach(function(s){
    var hor = s[0] === 'N' || s[0] === 'S';
    function recorta(w, cb){                                  // el tramo de w que cae en este lado
      var dh = Math.abs(w[3]-w[1]) < Math.abs(w[2]-w[0]);
      if(dh !== hor) return;
      var fijo = hor ? (w[1]+w[3])/2 : (w[0]+w[2])/2;
      if(Math.abs(fijo - s[1]) > 0.05) return;
      var p0 = hor ? w[0] : w[1], p1 = hor ? w[2] : w[3];
      var lo = Math.max(Math.min(p0,p1), s[2]), hi = Math.min(Math.max(p0,p1), s[3]);
      if(hi - lo < 0.02) return;
      var altoEn = function(p){ return p0 === p1 ? w[5] : w[5] + (w[6]-w[5])*(p-p0)/(p1-p0); };
      cb(lo, hi, altoEn);
    }
    C.muros.forEach(function(w){
      recorta([w[0],w[1],w[2],w[3],0,w[5],w[6]], function(lo, hi, al){ reviste(s, lo, hi, w[4], 0, al(lo), al(hi)); });
    });
    C.huecos.forEach(function(h){
      if(h[4] === 'acristalado' || h[4] === 'ventanal') return;
      var tp = TIPO_HUECO[h[4]], op = h[10] || {};
      var hy0 = op.y0 !== undefined ? op.y0 : tp.y0, hy1 = op.y1 !== undefined ? op.y1 : Math.min(tp.y1, Math.min(h[7],h[8]) - 0.2);
      recorta([h[0],h[1],h[2],h[3],0,h[7],h[8]], function(lo, hi, al){
        if(hy0 > 0) reviste(s, lo, hi, h[6], 0, hy0, hy0);
        reviste(s, lo, hi, h[6], hy1, al(lo), al(hi));
        mocheta(s, h, lo, hi, hy0, hy1);
      });
    });
  });
  /* Mochetas: los lados, el alféizar y el dintel del hueco llevan por dentro el acabado de la
     estancia, desde la cara de la pared hasta la carpintería (en las ventanas, retranqueada hacia
     fuera) o hasta el eje del muro; si no, se ve la piedra de la fachada */
  function mocheta(s, h, lo, hi, y0, y1){
    var hor = s[0] === 'N' || s[0] === 'S', esp = h[6], mat = otras[s[0]] || mp;
    var ext = h[9] !== 'interior' && /^ventana/.test(h[4]) && h[4] !== 'ventana_int';
    var dep = ext ? Math.max(esp/2, esp - 0.075) : esp/2, a0 = Math.max(y0, e.cota);
    var g = new THREE.Group(); gInt.add(g);
    if(hor) g.position.set(0, 0, s[1]); else { g.position.set(s[1], 0, 0); g.rotation.y = -Math.PI/2; }
    var sz = hor ? s[4] : -s[4], zc = sz*(esp/2 + 0.006 - dep/2), d = dep + 0.006;
    var q0 = hor ? h[0] : h[1], q1 = hor ? h[2] : h[3];
    [[lo, Math.min(q0, q1), 1], [hi, Math.max(q0, q1), -1]].forEach(function(b){
      if(Math.abs(b[0] - b[1]) > 0.01) return;                // cortado por la caja de la estancia: ahí no acaba el hueco
      reg(malla(caja(0.006, y1 - a0, d), mat, g, b[0] + b[2]*0.003, (a0 + y1)/2, zc), info);
    });
    if(y0 > 0) reg(malla(caja(hi - lo, 0.006, d), mat, g, (lo + hi)/2, y0 + 0.003, zc), info);
    reg(malla(caja(hi - lo, 0.006, d), mat, g, (lo + hi)/2, y1 - 0.003, zc), info);
  }
}); }

/* Muebles. Cada uno en su grupo: origen en el centro de su planta, frente hacia +z. */
var NOMBRE_MUEBLE = {
  mueble_bajo:'Mueble bajo', alfombra:'Alfombra', sofa_tela:'Sofá de tela', mesa_centro:'Mesa de centro',
  butaca_tela:'Butaca', carrito:'Carrito auxiliar', lampara_pie:'Lámpara de pie', lampara_rincon:'Lámpara de rincón', mesa_madera:'Mesa de madera', silla_madera:'Silla de madera',
  lampara_techo:'Lámpara de techo', libreria:'Librería', tipi:'Tipi', columnas:'Columnas de horno y nevera', estantes:'Estantes',
  isla:'Isla de cocina', banqueta:'Banqueta', mesa_redonda_madera:'Mesa redonda de madera', planta:'Planta',
  escritorio:'Escritorio', panel_listones:'Panel de listones', banco_tapizado:'Banco tapizado',
  vestidor_abierto:'Vestidor abierto', cama_casita:'Cama casita', ducha_obra:'Ducha de obra', mueble_lavabo:'Mueble de lavabo',
  espejo_redondo:'Espejo redondo', banco_recibidor:'Banco del recibidor', armario_alto:'Armario alto',
  lavanderia:'Lavandería', bicicletas:'Bicicletas', guirnalda:'Guirnalda de luces', tumbona:'Tumbona', chillout:'Chillout', armario_exterior:'Armario de jardín', cubos_reciclaje:'Cubos de reciclaje', horno_lena:'Horno de leña', kamado:'Kamado', topiario:'Seto de boj recortado', palmera:'Palmera pequeña', huerto_vertical:'Huerto vertical de aromáticas', barbacoa_obra:'Barbacoa de obra', canasta:'Canasta de baloncesto', pergola_plantas:'Pérgola con trepadoras', sombrilla:'Sombrilla',
  lavanda:'Lavanda', brasero:'Brasero', emparrado:'Emparrado', bancal:'Bancal', arbol:'Árbol', hamaca:'Hamaca',
  farolillo:'Baliza solar',mesa:'Mesa de trabajo de nogal', monitor:'Monitor', silla_oficina:'Silla de oficina',
  kallax:'Estantería de cubos', radiador:'Radiador', split:'Aire acondicionado',
  armario:'Armario', mueble_tv:'Mueble de la tele', tv:'Televisor', cuadro:'Cuadro',
  silla:'Silla', silla_nino:'Silla infantil', sofa:'Sofá de piel', mesa_redonda:'Mesa redonda',
  huevo:'Sillón colgante de mimbre', reloj:'Reloj de pared', banco:'Banco de madera', maceta:'Maceta',
  cubo:'Cubo', farol:'Farol', registro:'Registro', felpudo:'Felpudo',
  aparador:'Aparador', espejo:'Espejo', zapatero:'Zapatero', cama:'Cama de matrimonio', mesilla:'Mesilla',
  empotrado:'Armario empotrado', armario_espejo:'Armario de puertas de espejo', armarito:'Armario de dos puertas',
  cama_infantil:'Cama infantil de pino', cuadros:'Láminas', cambiador:'Estantería de pino', tv_pared:'Televisor',
  comoda:'Cómoda', banera:'Bañera', lavabo:'Lavabo', cajonera:'Cajonera', inodoro:'Inodoro',
  chimenea:'Chimenea de pared', sofa_l:'Sofá rinconera', sillon:'Butaca', mesa_comedor:'Mesa de comedor',
  columna:'Columna del horno', encimera:'Encimera', nevera:'Nevera', carro:'Carro de cocina',
  estanteria_metal:'Estantería metálica', futbolin:'Futbolín', lavadora:'Lavadora y secadora',
  pila_lavar:'Pila', banco_trabajo:'Banco de trabajo', rack:'Rack de comunicaciones', mesa_camilla:'Mesa camilla', inversor:'Inversor de las placas', mesa_jardin:'Mesa de listones',
  cortina:'Cortinas', chimenea_esquina:'Chimenea en esquina', mesa_nino:'Mesa infantil con sillitas',
  caldera:'Caldera de gasoil', deposito_gasoil:'Depósito de gasoil (1000 l)', plato_ducha:'Ducha a ras de suelo', bide:'Bidé', lavabo_cajones:'Mueble de lavabo', toallero:'Toallero',
  ducha_exterior:'Ducha de la piscina', jazmin:'Jazmín trepador en maceta',
  proyector:'Proyector', camara:'Cámara de vigilancia', flexo:'Flexo', farola:'Farola', foco:'Foco empotrado', colgante:'Lámpara colgante', plafon:'Plafón', aplique:'Aplique', tira:'Tira LED'};
function pz(g, w, h, d, mat, x, y, z){ return malla(caja(w, h, d), mat, g, x, y, z); }
function cil(g, r0, r1, h, mat, x, y, z, n){ return malla(new THREE.CylinderGeometry(r0, r1, h, n || 20), mat, g, x, y, z); }
function silla(g, s, mp, ma){
  pz(g, 0.42*s, 0.04, 0.42*s, ma, 0, 0.45*s, 0);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.035, 0.45*s, 0.035, mp, q[0]*0.19*s, 0.225*s, q[1]*0.19*s); });
  [-1,1].forEach(function(q){ pz(g, 0.035, 0.5*s, 0.035, mp, q*0.19*s, 0.72*s, -0.19*s); });
  pz(g, 0.42*s, 0.2*s, 0.025, mp, 0, 0.84*s, -0.19*s);
}
/* Un juguete de colores para una balda o un cubo (k elige cuál y sus colores), apoyado en (x, y, z) */
var COLOR_JUGUETE = ['#e2483d', '#f2b631', '#3f86d6', '#4fae5b', '#ef7fb0', '#8a5cc7', '#f08a2c'];
function juguete(g, k, x, y, z){
  var c = function(n){ return lc(COLOR_JUGUETE[(k+n) % COLOR_JUGUETE.length]); };
  switch(k % 6){
    case 0: bola(g, 0.1, c(0), x, y+0.1, z); break;                                     // pelota
    case 1: [0, 1, 2].forEach(function(n){ pz(g, 0.08, 0.08, 0.08, c(n), x-0.06+n*0.06, y+0.04, z+(n%2)*0.05); });
            pz(g, 0.08, 0.08, 0.08, c(3), x-0.03, y+0.12, z+0.02); break;                // bloques
    case 2: bola(g, 0.09, lc('#a8784a'), x, y+0.09, z, 0.95); bola(g, 0.065, lc('#a8784a'), x, y+0.23, z+0.01);
            [-1, 1].forEach(function(q){ bola(g, 0.025, lc('#8a5e38'), x+q*0.05, y+0.29, z); }); break;   // osito
    case 3: pz(g, 0.2, 0.06, 0.1, c(0), x, y+0.06, z); pz(g, 0.1, 0.05, 0.09, c(4), x-0.02, y+0.11, z);
            [-1, 1].forEach(function(a){ [-1, 1].forEach(function(b){
              cil(g, 0.025, 0.025, 0.02, MI.negro, x+a*0.065, y+0.025, z+b*0.05, 10).rotation.x = Math.PI/2; }); }); break;   // coche
    case 4: for(var n=0;n<5;n++) pz(g, 0.025, 0.2+0.03*(n%2), 0.16, c(n), x-0.08+n*0.035, y+0.1+0.015*(n%2), z); break;      // cuentos
    default: cil(g, 0.09, 0.075, 0.14, c(2), x, y+0.07, z, 16);                              // cubo de piezas
            [0, 1, 2].forEach(function(n){ pz(g, 0.04, 0.03, 0.04, c(n+3), x-0.03+n*0.03, y+0.155, z+(n-1)*0.02); });
  }
}
/* Materiales por color, compartidos (los muebles nuevos llevan su color en el modelo). */
var LAMC = {};
function lc(c){ return LAMC[c] || (LAMC[c] = lam({color:c})); }
var LIBRO = ['#8c3b2e','#35506b','#c9a24a','#4d6b4a','#d8d2c4','#7a5a3c'].map(lc);
var GEO_BOLA = new THREE.IcosahedronGeometry(1, 1);
function bola(g, r, mat, x, y, z, sy){ var b = malla(GEO_BOLA, mat, g, x, y, z); b.scale.set(r, r*(sy || 1), r); return b; }
/* ---- lo de fuera: coches, cochera, buzón, barbacoa, toldos, vóley ---- */
/* Pieza de perfil: el contorno [z, y] (de lado) extruido a lo ancho (x), centrado */
function perfil(g, pts, ancho, mat, x0){
  var sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for(var i=1;i<pts.length;i++) sh.lineTo(pts[i][0], pts[i][1]);
  var geo = new THREE.ExtrudeGeometry(sh, {depth:ancho, bevelEnabled:false}), p = geo.attributes.position;
  for(var k=0;k<p.count;k++){ var sx = p.getX(k), sy = p.getY(k), d = p.getZ(k); p.setXYZ(k, ancho/2 - d + (x0 || 0), sy, sx); }
  geo.computeVertexNormals();
  return malla(geo, mat, g);
}
/* Azar propio de cada pieza, para no mover el de la casa */
function azarDe(s){ return function(){ s = (s*1664525 + 1013904223) % 4294967296; return s/4294967296; }; }
function brillo(c, s){ return new THREE.MeshPhongMaterial({color:c, shininess:s || 80, specular:'#9aa3aa'}); }
var ME = {};                       // materiales de estas piezas, hechos al usarlos por primera vez
function me(k){
  if(ME[k]) return ME[k];
  var r = azarDe(4242);
  if(k === 'ladrillo') ME[k] = lam({color:'#ffffff', map:lienzoFijo(256, 128, function(g, w, h){   // ladrillo pintado de blanco roto
    g.fillStyle = '#d9d0c0'; g.fillRect(0, 0, w, h);
    for(var f=0;f<4;f++) for(var c=-1;c<3;c++){
      var x = c*w/2 + (f % 2)*w/4, y = f*h/4;
      g.fillStyle = 'hsl(40,' + (18 + r()*8) + '%,' + (88 + r()*5) + '%)'; g.fillRect(x+3, y+3, w/2-6, h/4-6);
    }
  }, 0.5, 0.26)});
  else if(k === 'red') ME[k] = lam({color:'#ffffff', side:THREE.DoubleSide, transparent:true, alphaTest:0.4, map:lienzoFijo(64, 64, function(g, w, h){
    g.clearRect(0, 0, w, h); g.strokeStyle = '#1c1c1c'; g.lineWidth = 5; g.strokeRect(0, 0, w, h);
  }, 0.1, 0.1)});
  else if(k === 'lona') ME[k] = lam({color:'#ffffff', side:THREE.DoubleSide, map:lienzoFijo(128, 16, function(g, w, h){   // rayas crudo y verde
    g.fillStyle = '#efe7d3'; g.fillRect(0, 0, w, h); g.fillStyle = '#4f7564'; g.fillRect(0, 0, w/2, h);
  }, 0.5, 0.5)});
  return ME[k];
}
function lienzoFijo(w, h, pinta, anchoM, altoM){       // como lienzo(), sin tocar el azar de la casa
  var c = document.createElement('canvas'); c.width = w; c.height = h; pinta(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1/anchoM, 1/altoM);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
}
/* Rueda de coche: neumático y llanta, a un lado (s = ±1) */
function rueda(g, x, y, z, r, s, llanta){
  var n = cil(g, r, r, 0.24, lc('#1b1b1b'), x, y, z, 20); n.rotation.z = Math.PI/2;
  var l = cil(g, r*0.62, r*0.62, 0.02, llanta, x + s*0.12, y, z, 16); l.rotation.z = Math.PI/2;
}
/* Obra de ladrillo pintado con su albardilla, del suelo a H (un buzón o una caseta de contadores): el z
   local mira al camino, con 0 en la linde; va de z0 a z1. Por dentro, la puerta de chapa, igual en las dos */
var OBRA_LINDE = {H:1.7, dentro:-1.0};
function obraLinde(g, W, z1){
  var H = OBRA_LINDE.H, z0 = OBRA_LINDE.dentro, D = z1 - z0, zc = (z0 + z1)/2, ac = lc('#56605b');
  pz(g, W, H, D, me('ladrillo'), 0, H/2, zc);
  pz(g, W + 0.08, 0.06, D + 0.08, lc('#e6e0d4'), 0, H + 0.03, zc);
  pz(g, W - 0.3, 1.3, 0.04, ac, 0, 0.85, z0 - 0.02);
  pz(g, 0.04, 0.14, 0.03, lc('#b8bcbf'), W/2 - 0.24, 0.85, z0 - 0.05);
  return {H:H, z0:z0};
}
/* La cochera con la cubierta cayendo de lado, hacia `cae` (±1, en x): vigas inclinadas delante y detrás */
function cocheraLado(g, m){
  var W = m.ancho || 6.4, D = m.fondo || 5.8, ha = 2.75, hb = 2.5, s = m.cae, mad = lc('#8a5f3c');
  var alto = function(x){ return ha + (hb - ha)*(s*x/W + 0.5); }, pend = (ha - hb)/W;
  pz(g, W + 0.4, 0.1, D + 0.6, MAT.hormigon, 0, 0.05, 0.1);
  [-1, 0, 1].forEach(function(i){ [-1, 1].forEach(function(j){
    if(!i && j > 0) return;                                          // delante, sin pie en medio: se entra holgado
    var x = i*(W/2 - 0.1), h = alto(x);
    pz(g, 0.15, h, 0.15, mad, x, 0.1 + h/2, j*(D/2 - 0.1));
    pz(g, 0.3, 0.12, 0.3, MAT.hormigon, x, 0.16, j*(D/2 - 0.1));
  }); });
  [1, -1].forEach(function(j){                                        // vigas delante y detrás, con la caída
    var v = pz(g, W + 0.3, 0.3, 0.16, mad, 0, 0.1 + (ha + hb)/2 + 0.15, j*(D/2 - 0.1)); v.rotation.z = s*Math.atan(pend);
  });
  for(var k=0;k<=8;k++){                                             // correas de delante atrás
    var x = -W/2 - 0.1 + k*(W + 0.2)/8;
    pz(g, 0.08, 0.16, D + 0.5, mad, x, 0.1 + alto(x) + 0.38, 0);
  }
  var xa = -s*(W/2 + 0.35), xb = s*(W/2 + 0.35), ya = 0.1 + ha + 0.46 + pend*0.35, yb = 0.1 + hb + 0.46 - pend*0.35;
  var q = [[xa, ya, D/2 + 0.35], [xb, yb, D/2 + 0.35], [xb, yb, -D/2 - 0.35], [xa, ya, -D/2 - 0.35]];
  if(s < 0) q.reverse();
  malla(losa4(q, 0.06), MAT.teja, g);
  cil(g, 0.05, 0.05, D + 0.7, lc('#8d9296'), xb + s*0.05, yb - 0.08, 0, 8).rotation.x = Math.PI/2;   // canalón, del lado de las placas
}
function patas(g, mat, w, h, dx, dz){ [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, w, h, w, mat, q[0]*dx, h/2, q[1]*dz); }); }
var MUEBLE = {
  mesa: function(g, m){
    var L = m.largo, D = m.fondo, H = 0.74;
    pz(g, L, 0.03, D, MI.nogal, 0, H-0.015, 0);                         // tablero de nogal
    [-L/2+0.2, L/2-0.2].forEach(function(x){ pz(g, 0.36, 0.7, 0.58, MI.negro, x, 0.35, -D/2+0.3); });   // dos patas, una en cada extremo
  },
  monitor: function(g, m){
    var W = m.ancho, H = W*0.58, y = 0.74;
    pz(g, 0.24, 0.012, 0.2, MI.negro, 0, y+0.006, 0);
    pz(g, 0.05, 0.3, 0.04, MI.negro, 0, y+0.15, -0.04);
    pz(g, W, H, 0.03, MI.negro, 0, y+0.18+H/2, 0);
    pz(g, W-0.03, H-0.03, 0.004, MI.pantalla, 0, y+0.18+H/2, 0.016);
  },
  silla_oficina: function(g, m){                                      // m.escala: más pequeña (la infantil, ~0.8)
    if(m.escala){ var s = new THREE.Group(); s.scale.setScalar(m.escala); g.add(s); return MUEBLE.silla_oficina(s, Object.assign({}, m, {escala:0})); }
    var c = lam({color:m.color});
    for(var i=0;i<5;i++){ var a = pz(g, 0.3, 0.03, 0.04, MI.negro, 0, 0.06, 0); a.geometry.translate(0.15, 0, 0); a.rotation.y = i*Math.PI*2/5; }
    cil(g, 0.025, 0.025, 0.36, MI.negro, 0, 0.25, 0, 8);
    pz(g, 0.5, 0.08, 0.48, c, 0, 0.47, 0);
    pz(g, 0.46, 0.66, 0.06, c, 0, 0.86, -0.24).rotation.x = -0.12;
    [-1,1].forEach(function(q){ pz(g, 0.05, 0.05, 0.3, MI.negro, q*0.27, 0.66, 0); pz(g, 0.03, 0.18, 0.03, MI.negro, q*0.27, 0.56, -0.05); });
  },
  carrito: function(g, m){                                            // carrito auxiliar de baldas con ruedas; m.baldas, m.color, m.cosas
    var n = m.baldas || 3, W = m.ancho || 0.42, D = m.fondo || 0.3, H = m.alto || 0.8, c = lc(m.color || '#e8c35a');
    [-1,1].forEach(function(a){ [-1,1].forEach(function(b){
      pz(g, 0.02, H-0.06, 0.02, c, a*(W/2-0.01), 0.06+(H-0.06)/2, b*(D/2-0.01));
      bola(g, 0.025, MI.negro, a*(W/2-0.03), 0.025, b*(D/2-0.03));
    }); });
    for(var i=0;i<n;i++){
      var y = 0.1 + i*(H-0.12)/(n-1);
      pz(g, W, 0.012, D, c, 0, y, 0);                                   // bandeja
      [-1,1].forEach(function(q){ pz(g, W, 0.06, 0.008, c, 0, y+0.03, q*(D/2-0.004)); pz(g, 0.008, 0.06, D, c, q*(W/2-0.004), y+0.03, 0); });
      if(!m.cosas) continue;
      for(var k=0;k<3;k++){                                              // botes, ceras y cuadernos
        var x = -W/2+0.08+k*(W-0.16)/2, col = lc(COLOR_JUGUETE[(i*3+k) % COLOR_JUGUETE.length]);
        if((i+k)%3 === 0) cil(g, 0.035, 0.035, 0.09, col, x, y+0.05, 0, 12);
        else if((i+k)%3 === 1) pz(g, 0.1, 0.05, 0.14, col, x, y+0.03, 0);
        else { cil(g, 0.03, 0.03, 0.08, lc('#d9d4c8'), x, y+0.045, 0, 10);
               [-1,0,1].forEach(function(d){ pz(g, 0.008, 0.12, 0.008, col, x+d*0.012, y+0.1, d*0.008); }); }   // vaso de pinceles
      }
    }
  },
  kallax: function(g, m){                                             // estantería de cubos; m.color, m.cajas, m.juguetes, m.libros (fila de libros),
                                                                      //   m.arriba: cajas de almacenaje grandes encima
    var pc = 0.3675, W = m.cols*pc + 0.035, H = m.filas*pc + 0.035, D = 0.39;
    var c = m.color ? lc(m.color) : MI.negro, cj = m.cajas ? lc(m.cajas) : MI.blanco;
    [0, H].forEach(function(y){ pz(g, W, 0.035, D, c, 0, y === 0 ? 0.0175 : H-0.0175, 0); });
    [-1,1].forEach(function(q){ pz(g, 0.035, H, D, c, q*(W/2-0.0175), H/2, 0); });
    for(var i=1;i<m.cols;i++) pz(g, 0.016, H-0.07, D, c, -W/2+0.0175+i*pc, H/2, 0);
    for(var j=1;j<m.filas;j++) pz(g, W-0.07, 0.016, D, c, 0, 0.0175+j*pc, 0);
    pz(g, W, H, 0.006, c, 0, H/2, -D/2+0.003);
    // ordenada: cajas blancas en damero y el resto de cubos vacíos; o juguetes sueltos, cada cubo con uno
    for(i=0;i<m.cols;i++) for(j=0;j<m.filas;j++){
      var cx = -W/2+0.0175+(i+0.5)*pc, cy = 0.035+j*pc;
      if(m.libros === j){                                                // la fila de libros: el cubo lleno, de pie
        for(var b=0, xb=cx-0.16; xb < cx+0.13; b++){
          var gb = 0.025+0.012*((i*3+b)%3), hb = 0.2+0.04*((i+b*5)%3);
          pz(g, gb, hb, 0.22+0.03*(b%2), LIBRO[(i*5+b)%LIBRO.length], xb+gb/2, cy+hb/2, 0.03); xb += gb+0.003;
        }
        continue;
      }
      if(m.juguetes){ if((i*7+j*3)%9 !== 4) juguete(g, i*5+j*3+i*j, cx, cy, 0.02); continue; }
      if((i+j)%2) continue;
      pz(g, 0.32, 0.31, 0.34, cj, cx, cy+0.16, 0.01);
    }
    if(m.arriba){                                                      // cajas con tapa, en fila encima
      var na = m.arriba, wa = (W-0.02)/na - 0.02, ha = m.altoArriba || 0.36, ca = lc(m.colorArriba || '#e9e4da');
      for(i=0;i<na;i++){
        var xa = -W/2+0.02+wa/2+i*(wa+0.02);
        pz(g, wa, ha, D-0.02, ca, xa, H+ha/2, 0);
        pz(g, wa+0.01, 0.02, D-0.01, ca, xa, H+ha+0.01, 0);                                         // tapa
        pz(g, 0.12, 0.035, 0.004, MI.gris, xa, H+ha-0.07, (D-0.02)/2+0.002);                         // asa
      }
    }
  },
  radiador: function(g){
    for(var i=0;i<10;i++) pz(g, 0.06, 0.58, 0.08, MI.blanco, -0.36+i*0.08, 0.44, 0);
    pz(g, 0.8, 0.04, 0.03, MI.blanco, 0, 0.7, 0.03);
  },
  split: function(g){ pz(g, 0.85, 0.29, 0.2, MI.blanco, 0, 2.35, 0); pz(g, 0.7, 0.03, 0.01, MI.gris, 0, 2.24, 0.1); },
  armario: function(g){ pz(g, 0.45, 1.8, 0.4, MI.negro, 0, 0.9, 0); pz(g, 0.004, 1.7, 0.005, MI.gris, 0, 0.9, 0.2); },
  mueble_tv: function(g, m){
    pz(g, m.largo, 0.42, 0.42, MI.oscura, 0, 0.21, 0);
    pz(g, m.largo-0.1, 0.01, 0.005, MI.negro, 0, 0.26, 0.21);
  },
  tv: function(g, m){
    var W = m.ancho, H = W*0.57;
    pz(g, 0.4, 0.02, 0.22, MI.negro, 0, 0.43, 0); pz(g, 0.08, 0.1, 0.04, MI.negro, 0, 0.49, -0.02);
    pz(g, W, H, 0.04, MI.negro, 0, 0.53+H/2, 0);
    pz(g, W-0.03, H-0.03, 0.004, lam({color:'#16191c'}), 0, 0.53+H/2, 0.022);
  },
  cuadro: function(g, m){ pz(g, m.ancho, m.alto, 0.03, MI.blanco, 0, m.y, 0); pz(g, m.ancho-0.06, m.alto-0.06, 0.004, m.color ? lam({color:m.color}) : MI.cuadro, 0, m.y, 0.016); },
  silla: function(g){ silla(g, 1, MI.oscura, MI.tela); },
  silla_nino: function(g, m){ var c = m.color ? lc(m.color) : MI.rojo; silla(g, 0.62, c, c); },
  sofa: function(g, m){                                               // sofá de piel marrón, tres plazas
    var L = m.largo, D = 0.95;
    pz(g, L, 0.36, D, MI.cuero, 0, 0.18, 0);
    pz(g, L, 0.5, 0.24, MI.cuero, 0, 0.61, -D/2+0.12);
    [-1,1].forEach(function(q){ pz(g, 0.22, 0.62, D, MI.cuero, q*(L/2-0.11), 0.31, 0); });
    for(var i=0;i<3;i++){
      var w = (L-0.44)/3, x = -L/2+0.22+w*(i+0.5);
      pz(g, w-0.02, 0.16, D-0.3, MI.cuero, x, 0.44, 0.12);
      pz(g, w-0.02, 0.42, 0.16, MI.cuero, x, 0.72, -D/2+0.3).rotation.x = -0.15;
    }
    pz(g, 0.42, 0.12, 0.42, lam({color:'#cfd3d6'}), L/2-0.5, 0.58, 0.1).rotation.y = 0.5;   // cojín
  },
  mesa_redonda: function(g, m){
    cil(g, m.radio, m.radio, 0.03, MI.blanco, 0, 0.745, 0, 32);
    cil(g, 0.05, 0.05, 0.72, MI.blanco, 0, 0.37, 0, 12);
    cil(g, 0.28, 0.3, 0.03, MI.blanco, 0, 0.015, 0, 24);
  },
  huevo: function(g){                                                 // sillón huevo colgante, negro
    cil(g, 0.42, 0.44, 0.04, MI.negro, 0, 0.02, 0, 24);
    pz(g, 0.05, 0.04, 0.55, MI.negro, 0, 0.04, -0.27);
    pz(g, 0.05, 1.95, 0.05, MI.negro, 0, 0.99, -0.55).rotation.x = -0.08;
    pz(g, 0.05, 0.05, 0.62, MI.negro, 0, 1.97, -0.27).rotation.x = 0.25;
    pz(g, 0.02, 0.3, 0.02, MI.gris, 0, 1.76, 0);
    var e = malla(new THREE.SphereGeometry(0.5, 24, 16, Math.PI/2+0.95, Math.PI*2-1.9, 0.25, Math.PI-0.25), MI.mimbre, g, 0, 1.0, 0);
    e.scale.set(1, 1.22, 1);
    var cj = malla(new THREE.SphereGeometry(0.36, 16, 10), MI.cojin, g, 0, 0.6, 0.02); cj.scale.set(1, 0.3, 1);
    var cr = malla(new THREE.SphereGeometry(0.34, 16, 10), MI.cojin, g, 0, 0.98, -0.22); cr.scale.set(1, 1, 0.35);
  },
  /* Reloj de pared que da la hora de verdad. Opciones:
     radio (exterior), bisel (ancho del aro), fondo (del aro hacia la pared), marco (color),
     esfera (estilo, ver esferaReloj), agujas (color), segundero (color, o false) y cristal */
  reloj: function(g, m){
    var R = m.radio || 0.17, bis = m.bisel || 0.02, F = m.fondo || 0.03, rE = R - bis, k = rE/0.15;
    var marco = m.marco ? lc(m.marco) : MI.negro;
    cil(g, R, R, F, marco, 0, m.y, 0, 40).rotation.x = Math.PI/2;
    malla(new THREE.CircleGeometry(rE, 48), m.esfera ? esferaReloj(m.esfera) : ESFERA_RELOJ, g, 0, m.y, F/2 + 0.0005);
    if(m.bisel_alto){                                                  // aro en relieve delante de la esfera: canto y cara, huecos
      malla(new THREE.CylinderGeometry(R, R, m.bisel_alto, 48, 1, true).rotateX(Math.PI/2), marco, g, 0, m.y, F/2 + m.bisel_alto/2);
      malla(new THREE.RingGeometry(rE, R, 48), marco, g, 0, m.y, F/2 + m.bisel_alto);
    }
    var ag = m.agujas ? lc(m.agujas) : MI.negro, sg = m.segundero === false ? null : m.segundero ? lc(m.segundero) : MI.segundero;
    var r = {}, z0 = F/2;
    // agujas: giran alrededor del eje de la esfera; el segundero, con contrapeso
    [['h', 0.018, 0.085, 0.005, ag], ['m', 0.012, 0.125, 0.009, ag]].concat(sg ? [['s', 0.004, 0.135, 0.013, sg]] : []).forEach(function(a){
      var eje = new THREE.Group(); eje.position.set(0, m.y, z0 + a[3]); g.add(eje);
      // nunca por debajo de ~1 cm de ancho: más finas, desde unos metros desaparecen entre píxeles
      var ancho = Math.max(a[0] === 's' ? 0.006 : 0.01, a[1]*k*(m.finas && a[0] !== 's' ? 0.5 : 1)*(m.grosor || 1));
      var geo = caja(ancho, (a[2] + 0.025)*k, 0.004); geo.translate(0, (a[2] - 0.025)*k/2, 0);
      malla(geo, a[4], eje, 0, 0, 0); r[a[0]] = eje;
      if(m.finas && a[0] !== 's'){                                      // agujas antiguas: pica en la horaria, rombo en la minutera
        var pk = malla(caja(a[1]*k*1.9, a[1]*k*1.9, 0.004), a[4], eje, 0, a[2]*k*(a[0] === 'h' ? 0.72 : 0.8), 0); pk.rotation.z = Math.PI/4;
        if(a[0] === 'h') malla(caja(a[1]*k*1.2, a[1]*k*1.2, 0.004), a[4], eje, 0, a[2]*k*0.98, 0).rotation.z = Math.PI/4;
      }
    });
    cil(g, 0.008*k, 0.008*k, 0.006, sg || ag, 0, m.y, z0 + 0.016, 12).rotation.x = Math.PI/2;
    if(m.cristal !== false) malla(new THREE.CircleGeometry(rE, 48), MAT.cristal, g, 0, m.y, z0 + Math.max(0.022, m.bisel_alto || 0));
    RELOJES.push(r); ponHora();
  },
  banco: function(g, m){                                              // banco de jardín de madera
    var L = m.largo;
    [-0.14, 0, 0.14].forEach(function(z){ pz(g, L, 0.03, 0.12, MI.madera, 0, 0.45, z); });
    [[-1,0.18],[1,0.18],[-1,-0.19],[1,-0.19]].forEach(function(q){ pz(g, 0.05, 0.44, 0.05, MI.madera, q[0]*(L/2-0.05), 0.22, q[1]); });
    [-1,1].forEach(function(q){ pz(g, 0.05, 0.9, 0.05, MI.madera, q*(L/2-0.05), 0.45, -0.22); pz(g, 0.05, 0.04, 0.48, MI.madera, q*(L/2-0.05), 0.66, -0.01); });
    [0.6, 0.72, 0.84].forEach(function(y){ pz(g, L-0.1, 0.07, 0.025, MI.madera, 0, y, -0.22); });
  },
  maceta: function(g, m){
    var r = m.radio, hm = r*1.9;
    cil(g, r, r*0.78, hm, MI.maceta, 0, hm/2, 0, 16);
    if(m.planta > 1){                                                 // arbolito en maceta
      cil(g, 0.025, 0.035, m.planta*0.55, MI.madera, 0, hm + m.planta*0.27, 0, 6);
      var c = malla(new THREE.IcosahedronGeometry(m.planta*0.3, 1), MI.hoja, g, 0, hm + m.planta*0.72, 0); c.scale.set(1, 0.9, 1);
      if(m.frutos) for(var q=0;q<9;q++){                              // frutos por fuera de la copa
        var an = q*2.4, el = 0.35 + 0.3*Math.sin(q*1.7), rr = m.planta*0.29;
        bola(g, 0.035, lc(m.frutos), Math.cos(an)*rr*Math.cos(el), hm + m.planta*0.72 + rr*0.9*Math.sin(el) - 0.05, Math.sin(an)*rr*Math.cos(el));
      }
    } else [[0,0.55],[0.12,0.4],[-0.1,0.35]].forEach(function(p){
      malla(new THREE.IcosahedronGeometry(m.planta*0.3, 1), MI.hoja, g, p[0], hm + m.planta*p[1], p[0]*0.6);
    });
  },
  jazmin: function(g, m){                                            // jazmín en maceta trepando por un pilar
    var r = 0.2, hm = 0.38, H = m.alto || 2.3, h = m.hacia || [0, -0.4], verde = lc('#3f6a33'), flor = lc('#f7f5ee');
    cil(g, r, r*0.78, hm, MI.maceta, 0, hm/2, 0, 16);
    [-0.12, 0, 0.12].forEach(function(dx, i){
      // del tiesto a la cara del pilar, y luego pilar arriba
      var x0 = dx*0.5, x1 = h[0] + dx, z1 = h[1], L1 = Math.hypot(x1-x0, z1, 0.5);
      var t1 = cil(g, 0.012, 0.012, L1, MI.madera, (x0+x1)/2, hm + 0.25, z1/2, 5);
      t1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1-x0, 0.5, z1).normalize());
      var y0 = hm + 0.5, y1 = H - i*0.12;
      cil(g, 0.012, 0.012, y1-y0, MI.madera, x1, (y0+y1)/2, z1, 5);
      // hojas en manojos irregulares pegados a la cara del pilar, y flores blancas sueltas
      for(var y = y0; y < y1; y += 0.09){
        var ox = Math.sin(y*7.3 + i*2.1)*0.09 + Math.sin(y*17 + i)*0.04, oz = 0.03 + 0.03*(0.5 + 0.5*Math.sin(y*13 + i));
        bola(g, 0.045 + 0.025*(0.5 + 0.5*Math.sin(y*9 + i*3)), verde, x1 + ox, y, z1 + oz, 0.7);
        if(Math.sin(y*23 + i*5) > 0.1) bola(g, 0.018, flor, x1 + ox + 0.03*Math.sin(y*31), y + 0.02, z1 + oz + 0.04);
      }
    });
  },
  cubo: function(g){ cil(g, 0.15, 0.12, 0.28, MI.azul, 0, 0.14, 0, 16); },
  farol: function(g, m, e){                                           // farol negro colgado de las vigas
    var yt = (m.techo || techoEn(e, m.uv[1]) - e.cota) - 0.14;          // fuera de las estancias, `techo` a mano
    var vara = Math.max(0.02, 0.49 - (m.sube || 0));                    // `sube`: más arriba, con la varilla más corta
    pz(g, 0.015, vara, 0.015, MI.negro, 0, yt + 0.14 - vara/2, 0);
    var y = yt + 0.14 - vara;
    malla(new THREE.ConeGeometry(0.15, 0.1, 4), MI.negro, g, 0, y-0.05, 0).rotation.y = Math.PI/4;
    bombilla(pz(g, 0.15, 0.26, 0.15, MAT.globo, 0, y-0.23, 0), {fuerza:0.7, alcance:6, halo:0.6});
    pz(g, 0.19, 0.03, 0.19, MI.negro, 0, y-0.37, 0);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.015, 0.28, 0.015, MI.negro, q[0]*0.08, y-0.23, q[1]*0.08); });
  },
  registro: function(g){ pz(g, 0.64, 0.012, 0.64, MI.gris, 0, 0.006, 0); },
  felpudo: function(g){ pz(g, 0.8, 0.012, 0.5, lam({color:'#2e2b28'}), 0, 0.006, 0); },
  // --- dormitorios, baños y recibidor ---
  aparador: function(g, m){                                           // aparador de roble claro
    var L = m.largo, mc = lam({color:'#d9c6a5'});
    pz(g, L, 0.76, 0.42, mc, 0, 0.42, 0);
    pz(g, L+0.02, 0.03, 0.44, mc, 0, 0.815, 0);
    for(var i=1;i<4;i++) pz(g, 0.006, 0.66, 0.005, MI.gris, -L/2+i*L/4, 0.42, 0.212);
    [-1,1].forEach(function(q){ pz(g, 0.06, 0.04, 0.4, MI.gris, q*(L/2-0.05), 0.02, 0); });
  },
  espejo: function(g, m){
    pz(g, m.ancho, m.alto, 0.03, lam({color:m.marco}), 0, m.y, 0);
    pz(g, m.ancho-0.1, m.alto-0.1, 0.004, MI.espejo, 0, m.y, 0.016);
  },
  zapatero: function(g){                                              // zapatero negro de tres trampillas
    pz(g, 0.6, 1.25, 0.28, MI.negro, 0, 0.625, 0);
    for(var i=1;i<3;i++) pz(g, 0.58, 0.008, 0.005, MI.gris, 0, i*0.41, 0.141);
  },
  cama: function(g, m){                                               // cabecero atrás (-z), pies hacia +z
    var W = m.ancho, L = m.largo, mm = lam({color:m.madera}), ropa = lam({color:m.ropa});
    var alto = m.estilo === 'listones' ? 1.15 : 0.85, zc = -L/2+0.04;
    pz(g, W+0.08, 0.3, L-0.08, mm, 0, 0.25, 0.04);                    // bastidor
    pz(g, W, 0.2, L-0.2, MI.blanco, 0, 0.5, 0.06);                    // colchón
    pz(g, W+0.02, 0.06, L-0.5, ropa, 0, 0.62, 0.25);                  // nórdico
    [-1,1].forEach(function(q){ pz(g, W/2-0.1, 0.12, 0.4, ropa, q*W/4, 0.64, zc+0.35); });   // almohadas
    pz(g, W+0.1, alto, 0.06, mm, 0, alto/2, zc);
    if(m.estilo === 'listones'){                                      // Hemnes: listones y pie alto
      for(var i=0;i<9;i++) pz(g, 0.05, 0.4, 0.065, lam({color:'#5c5048'}), -W/2+0.1+i*(W-0.2)/8, alto-0.35, zc);
      pz(g, W+0.1, 0.5, 0.05, mm, 0, 0.3, L/2-0.02);
    }
  },
  mesilla: function(g, m){                                            // mesilla con cajón
    var c = lam({color:m.color});
    pz(g, 0.42, 0.03, 0.36, c, 0, 0.5, 0);
    pz(g, 0.4, 0.15, 0.34, m.color === '#1f1d1c' ? c : MI.blanco, 0, 0.41, 0);
    if(m.color === '#1f1d1c') pz(g, 0.42, 0.5, 0.36, c, 0, 0.25, 0);
    else [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.03, 0.34, 0.03, c, q[0]*0.18, 0.17, q[1]*0.14).rotation.z = q[0]*0.08; });
  },
  empotrado: function(g, m){                                          // empotrado blanco con altillo
    var W = m.ancho, D = 0.6, H = 2.55;
    pz(g, W, H, D, MI.blanco, 0, H/2, 0);
    pz(g, W-0.04, 0.008, 0.005, MI.gris, 0, 2.02, D/2);
    for(var i=1;i<(W > 2.1 ? 3 : 2);i++) pz(g, 0.006, H-0.1, 0.005, MI.gris, -W/2+i*W/(W > 2.1 ? 3 : 2), H/2, D/2);
    [-0.03, 0.03].forEach(function(x){ pz(g, 0.02, 0.2, 0.02, MI.gris, x, 1.1, D/2+0.01); });
  },
  armario_espejo: function(g, m){                                     // corredero de marco oscuro y dos espejos
    var W = m.ancho, D = 0.6, H = 2.2, mo = lam({color:'#4a4441'});
    pz(g, W, H, D, mo, 0, H/2, 0);
    [-1,1].forEach(function(q){ pz(g, W/2-0.1, H-0.16, 0.01, MI.espejo, q*W/4, H/2, D/2+0.005 + (q > 0 ? 0.02 : 0)); });
  },
  armarito: function(g){                                              // armario gris de dos puertas
    pz(g, 0.8, 1.8, 0.5, lam({color:'#cfcac2'}), 0, 0.9, 0);
    pz(g, 0.004, 1.7, 0.005, MI.gris, 0, 0.9, 0.25);
    [-0.05, 0.05].forEach(function(x){ pz(g, 0.015, 0.16, 0.02, MI.gris, x, 1.0, 0.26); });
  },
  cama_infantil: function(g, m){                                      // cama infantil de pino con barandilla; m.alta: dada la
    var W = 0.99, L = 2.09, H = 1.16, alta = !!m.alta;                //   vuelta, el somier arriba y abajo libre, sin barras
    var yb = alta ? 0.78 : 0.15, rail = alta ? [0.78, H-0.03] : [0.35, H-0.03];
    if(alta) pz(g, W, 0.05, L, MI.pino, 0, yb, 0);                     // somier arriba
    else pz(g, W, 0.3, L, MI.blanco, 0, 0.15, 0);
    pz(g, W-0.1, 0.12, L-0.1, lam({color:m.funda || '#3a4f86'}), 0, alta ? yb+0.085 : 0.36, 0);   // colchón
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.06, H, 0.06, MI.pino, q[0]*(W/2-0.03), H/2, q[1]*(L/2-0.03)); });
    var ae = 0.45;                                                     // alta: la escalera, en el lado -x hacia +z, con su paso
    rail.forEach(function(y){
      [-1,1].forEach(function(q){
        if(alta && q < 0 && y > yb) pz(g, 0.04, 0.06, L-ae, MI.pino, -W/2+0.02, y, -ae/2);   // barandilla abierta encima de la escalera
        else pz(g, 0.04, 0.06, L, MI.pino, q*(W/2-0.02), y, 0);
        pz(g, W, 0.06, 0.04, MI.pino, 0, y, q*(L/2-0.02));
      });
    });
    if(alta){                                                          // escalera en el plano del lado -x: del poste de la esquina
      pz(g, 0.06, H, 0.06, MI.pino, -W/2+0.03, H/2, L/2-ae);           //   a un poste más, con los peldaños entre los dos
      for(var i=1;i<=3;i++) pz(g, 0.035, 0.035, ae-0.03, MI.pino, -W/2+0.02, i*0.22, L/2-ae/2);
    }
    else for(var i=1;i<4;i++) pz(g, 0.35, 0.03, 0.03, MI.pino, -W/2+0.25, 0.35+i*0.2, -L/2+0.02);   // escalera
  },
  cuadros: function(g, m){                                            // láminas enmarcadas en fila
    for(var i=0;i<m.n;i++){
      var x = (i - (m.n-1)/2)*0.42;
      pz(g, 0.32, 0.4, 0.025, MI.blanco, x, 1.55, 0);
      pz(g, 0.24, 0.3, 0.004, lam({color:['#f0d060','#d7d2c6','#e2c35c','#cfd6db'][i%4]}), x, 1.55, 0.014);
    }
  },
  cambiador: function(g){                                             // estantería baja de pino
    [-1,1].forEach(function(q){ [-1,1].forEach(function(p){ pz(g, 0.035, 0.9, 0.035, MI.pino, q*0.38, 0.45, p*0.2); }); });
    [0.1, 0.5, 0.88].forEach(function(y){ pz(g, 0.8, 0.02, 0.44, MI.pino, 0, y, 0); });
  },
  tv_pared: function(g, m){
    var W = m.ancho, H = W*0.57;
    pz(g, W, H, 0.04, MI.negro, 0, m.y, 0.02);
    pz(g, W-0.03, H-0.03, 0.004, lam({color:'#16191c'}), 0, m.y, 0.042);
  },
  comoda: function(g, m){                                             // cómoda de cajones (negra y de cuatro, salvo m.color, m.cajones)
    var n = m.cajones || 4, H = m.alto || 1.0, W = m.ancho || 0.8;
    pz(g, W, H, 0.48, m.color ? lc(m.color) : MI.negro, 0, H/2, 0);
    for(var i=1;i<n;i++) pz(g, W-0.02, 0.006, 0.005, MI.gris, 0, i*H/n, 0.241);
  },
  banera: function(g){                                                // bañera de obra alicatada
    pz(g, 1.6, 0.52, 0.72, MI.azulejo, 0, 0.26, 0);
    pz(g, 1.6, 0.04, 0.72, MI.loza, 0, 0.54, 0);
    pz(g, 1.4, 0.02, 0.52, lam({color:'#dfe7ea'}), 0, 0.555, 0);
  },
  lavabo: function(g){                                                // lavabo de pie
    cil(g, 0.08, 0.1, 0.72, MI.loza, 0, 0.36, -0.1, 16);
    pz(g, 0.56, 0.16, 0.45, MI.loza, 0, 0.8, 0);
    pz(g, 0.03, 0.12, 0.03, MI.gris, 0, 0.93, -0.16);
  },
  cajonera: function(g){ pz(g, 0.4, 0.72, 0.45, MI.blanco, 0, 0.36, 0); for(var i=1;i<3;i++) pz(g, 0.38, 0.006, 0.005, MI.gris, 0, i*0.24, 0.226); },
  // --- salón, cocina, despensa y garaje ---
  chimenea: function(g){                                              // chimenea de cassette colgada
    pz(g, 0.95, 0.6, 0.12, lam({color:'#9a9c9c'}), 0, 1.0, 0.06);
    pz(g, 0.75, 0.42, 0.01, lam({color:'#141414', emissive:'#3a1c08', emissiveIntensity:0.4}), 0, 1.0, 0.125);
  },
  sofa_l: function(g, m){                                             // rinconera gris con chaiselongue
    // chaise: 'der' = a la derecha de quien se sienta; si no, a su izquierda
    var L = m.largo, D = 0.95, gr = lam({color:'#55575a'}), cj = lam({color:'#6b6d70'}), s = m.chaise === 'der' ? -1 : 1;
    pz(g, L, 0.42, D, gr, 0, 0.21, 0);
    pz(g, L, 0.45, 0.22, gr, 0, 0.64, -D/2+0.11);
    pz(g, 0.2, 0.62, D, gr, -s*(L/2-0.1), 0.31, 0);
    pz(g, 0.9, 0.42, 0.75, gr, s*(L/2-0.45), 0.21, D/2+0.37);       // chaiselongue
    for(var i=0;i<3;i++) pz(g, (L-0.3)/3-0.03, 0.12, D-0.3, cj, s*(-L/2+0.2+(i+0.5)*(L-0.3)/3), 0.48, 0.1);
    [['#e2b23a', -0.6], ['#c9d3d8', 0.1], ['#e2b23a', 0.8]].forEach(function(c){
      pz(g, 0.38, 0.34, 0.12, lam({color:c[0]}), c[1], 0.66, -D/2+0.3).rotation.x = -0.25;   // cojines
    });
  },
  sillon: function(g){                                                // butaca gris claro
    var c = lam({color:'#b7b5b1'});
    pz(g, 0.72, 0.42, 0.75, c, 0, 0.21, 0); pz(g, 0.72, 0.6, 0.16, c, 0, 0.7, -0.3);
    [-1,1].forEach(function(q){ pz(g, 0.12, 0.25, 0.7, c, q*0.3, 0.55, 0); });
  },
  mesa_comedor: function(g, m){                                       // mesa con mantel
    var L = m.largo, D = 0.9;
    pz(g, L, 0.04, D, lam({color:'#e8c9bd'}), 0, 0.74, 0);
    pz(g, L+0.04, 0.2, D+0.04, lam({color:'#e8c9bd'}), 0, 0.64, 0);                    // faldón del mantel
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.06, 0.54, 0.06, MI.oscura, q[0]*(L/2-0.1), 0.27, q[1]*(D/2-0.1)); });
  },
  columna: function(g){                                               // columna con horno y microondas
    var bl = lam({color:'#e5e3df'});
    pz(g, 0.6, 2.2, 0.6, bl, 0, 1.1, 0);
    pz(g, 0.56, 0.58, 0.01, MI.negro, 0, 0.95, 0.305); pz(g, 0.56, 0.38, 0.01, MI.negro, 0, 1.5, 0.305);
  },
  encimera: function(g, m){                                           // muebles bajos blancos y encimera negra
    var L = m.largo, bl = m.frente ? lc(m.frente) : lam({color:'#e5e3df'}), tp = m.tapa ? lc(m.tapa) : MI.negro;
    pz(g, L, 0.82, 0.58, bl, 0, 0.47, -0.01);
    pz(g, L, 0.1, 0.5, MI.negro, 0, 0.05, -0.04);                     // zócalo
    pz(g, L+0.02, 0.04, 0.62, tp, 0, 0.9, 0);
    for(var i=1;i<Math.round(L/0.6);i++) pz(g, 0.005, 0.76, 0.005, MI.gris, -L/2+i*L/Math.round(L/0.6), 0.47, 0.285);
    if(m.fregadero !== undefined){
      pz(g, 0.7, 0.012, 0.42, lam({color:'#2c2c2c'}), m.fregadero, 0.925, 0);
      pz(g, 0.03, 0.35, 0.03, MI.gris, m.fregadero, 1.08, -0.24);
    }
    if(m.placa !== undefined){                                        // placa, azulejo hexagonal y campana negra
      pz(g, 0.6, 0.008, 0.5, MI.negro, m.placa, 0.925, 0);
      pz(g, 1.1, 0.9, 0.01, m.azulejo ? lc(m.azulejo) : lam({color:'#b9b9b6'}), m.placa, 1.37, -0.3);
      var c = pz(g, 0.8, 0.5, 0.06, MI.negro, m.placa, 1.75, -0.12); c.rotation.x = -0.6;
      pz(g, 0.25, 0.6, 0.2, MI.negro, m.placa, 2.25, -0.2);
    }
  },
  nevera: function(g){                                                // combi de acero
    pz(g, 0.6, 1.9, 0.65, lam({color:'#8f9295'}), 0, 0.95, 0);
    pz(g, 0.58, 0.01, 0.01, MI.negro, 0, 1.25, 0.33);
  },
  carro: function(g){                                                 // carro negro con tablero de madera
    pz(g, 0.8, 0.05, 0.5, MI.roble, 0, 0.88, 0);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.04, 0.86, 0.04, MI.negro, q[0]*0.37, 0.43, q[1]*0.22); });
    [0.15, 0.5].forEach(function(y){ pz(g, 0.76, 0.03, 0.46, MI.negro, 0, y, 0); });
  },
  estanteria_metal: function(g, m){                                   // estantería de ángulo ranurado
    var W = m.ancho || 0.9, mt = lam({color:'#3c3f42'}), n = Math.max(1, Math.round(W/0.95));
    for(var i=0;i<=n;i++) [-1,1].forEach(function(q){ pz(g, 0.035, 1.9, 0.035, mt, -W/2+0.02+i*(W-0.04)/n, 0.95, q*0.18); });
    [0.1, 0.55, 1.0, 1.45, 1.88].forEach(function(y){ pz(g, W, 0.02, 0.4, lam({color:'#9fa3a6'}), 0, y, 0); });
    if(m.cajas){                                                     // cajas de plástico de colores, con su tapa
      var r = azarDe(Math.round((m.uv[0]*100 + m.uv[1]*7)*10)), col = ['#2f6fb3', '#c8352e', '#3f8f4a', '#e3b52b', '#8d9296', '#e9ecea', '#26282a', '#e07b2a'];
      [0.11, 0.56, 1.01, 1.46].forEach(function(y){
        for(var x = -W/2 + 0.03; ; ){
          var w = 0.3 + r()*0.25, h = 0.2 + r()*0.18; if(x + w > W/2 - 0.03) break;
          if(r() < 0.82){
            var c = col[Math.floor(r()*col.length)];
            pz(g, w, h, 0.36, lc(c), x + w/2, y + 0.01 + h/2, 0);
            pz(g, w + 0.02, 0.03, 0.38, lc(c === '#e9ecea' ? '#2f6fb3' : c), x + w/2, y + 0.01 + h + 0.015, 0);
          }
          x += w + 0.03;
        }
      });
    }
  },
  futbolin: function(g){                                              // futbolín negro
    pz(g, 1.4, 0.3, 0.75, MI.negro, 0, 0.78, 0);
    pz(g, 1.3, 0.01, 0.65, lam({color:'#3f7d3a'}), 0, 0.935, 0);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.12, 0.66, 0.12, MI.negro, q[0]*0.6, 0.33, q[1]*0.28); });
    for(var i=0;i<8;i++) cil(g, 0.008, 0.008, 1.2, MI.gris, -0.56+i*0.16, 0.9, 0, 6).rotation.x = Math.PI/2;
  },
  lavadora: function(g){                                              // lavadora con la secadora encima
    [0.42, 1.27].forEach(function(y){
      pz(g, 0.6, 0.84, 0.6, MI.blanco, 0, y, 0);
      cil(g, 0.17, 0.17, 0.02, MI.gris, 0, y-0.05, 0.3, 20).rotation.x = Math.PI/2;
    });
  },
  pila_lavar: function(g){ cil(g, 0.08, 0.1, 0.62, MI.loza, 0, 0.31, -0.08, 12); pz(g, 0.55, 0.3, 0.45, MI.loza, 0, 0.75, 0); },
  banco_trabajo: function(g, m){                                      // banco con el panel de herramientas
    var L = m.largo || 1.4, h = [], i;
    pz(g, L, 0.05, 0.6, MI.roble, 0, 0.9, 0);
    pz(g, L-0.1, 0.03, 0.5, MI.roble, 0, 0.2, 0);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.05, 0.88, 0.05, MI.gris, q[0]*(L/2-0.04), 0.44, q[1]*0.26); });
    pz(g, L, 0.85, 0.02, lam({color:'#c9c4bb'}), 0, 1.55, -0.29);
    for(i=0;i<Math.round(L*6);i++) h.push(-L/2+0.12+i*(L-0.24)/Math.max(1, Math.round(L*6)-1));
    h.forEach(function(x, k){                                         // herramientas colgadas, grosso modo
      var c = ['#b3261e','#2d2d2d','#e0a526','#6b6f73'][k%4];
      pz(g, 0.05+0.04*(k%3), 0.18+0.1*(k%2), 0.03, lam({color:c}), x, 1.45+0.25*(k%3), -0.26);
    });
  },
  rack: function(g){                                                  // armario rack negro de comunicaciones
    pz(g, 0.6, 1.0, 0.6, MI.negro, 0, 0.5, 0);
    pz(g, 0.5, 0.8, 0.01, lam({color:'#202224'}), 0, 0.52, 0.305);
    for(var i=0;i<6;i++) pz(g, 0.4, 0.015, 0.01, MI.gris, 0, 0.25+i*0.1, 0.312);
  },
  inversor: function(g){                                              // inversor de las placas y el cuadro, en la pared
    pz(g, 0.45, 0.6, 0.2, lam({color:'#b9bcbf'}), 0, 1.75, -0.1+0.1);
    pz(g, 0.45, 0.08, 0.01, lam({color:'#c0392b'}), 0, 1.98, 0.005);
    pz(g, 0.4, 0.4, 0.1, lam({color:'#e8ece8'}), 0, 1.15, -0.05);
    pz(g, 0.3, 0.12, 0.01, lam({color:'#6fa37a'}), 0, 1.25, 0.005);
  },
  mesa_jardin: function(g){                                           // mesa de listones de madera gris
    for(var i=0;i<6;i++) pz(g, 1.5, 0.03, 0.12, lam({color:'#9c8f7f'}), 0, 0.74, -0.33+i*0.132);
    [-1,1].forEach(function(q){ pz(g, 0.05, 0.72, 0.7, lam({color:'#8a7e70'}), q*0.65, 0.36, 0); });
  },
  cortina: function(g, m, e){                                         // dos paños recogidos a los lados, con la barra
    var c = new THREE.MeshPhongMaterial({color:m.color, shininess:8, specular:'#222222', side:THREE.DoubleSide});
    var yt = Math.min(2.35, techoEn(e, m.uv[1]) - 0.08), W = m.ancho + 0.7;
    cil(g, 0.012, 0.012, W, MI.gris, 0, yt, 0.06, 8).rotation.z = Math.PI/2;
    [-1, 1].forEach(function(q){
      for(var i=0;i<4;i++)                                            // pliegues
        pz(g, 0.1, yt - 0.03, 0.03, c, q*(m.ancho/2 + 0.05 + i*0.075), (yt-0.03)/2, 0.07 + (i%2)*0.035);
    });
  },
  chimenea_esquina: function(g, m){                                   // paño en diagonal que cierra la esquina
    var d = m.lado, H = 2.68, sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(d, 0); sh.lineTo(0, -d); sh.closePath();
    var geo = new THREE.ExtrudeGeometry(sh, {depth:H, bevelEnabled:false}); geo.rotateX(-Math.PI/2);
    malla(geo, MI.blanco, g, 0, 0, 0);
    var f = new THREE.Group(); f.position.set(d/2 + 0.01, 0, d/2 + 0.01); f.rotation.y = Math.PI/4; g.add(f);
    pz(f, 0.8, 0.5, 0.06, lam({color:'#9a9c9c'}), 0, 0.95, 0.02);
    pz(f, 0.64, 0.36, 0.01, lam({color:'#141414', emissive:'#3a1c08', emissiveIntensity:0.4}), 0, 0.95, 0.055);
  },
  mesa_nino: function(g){                                             // mesa infantil con sillitas
    var az = lam({color:'#2f78c4'});
    pz(g, 0.77, 0.04, 0.55, az, 0, 0.48, 0);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.06, 0.46, 0.06, az, q[0]*0.33, 0.23, q[1]*0.22); });
    [[-0.2, 0.45, 0], [0.2, 0.45, 0], [-0.2, -0.45, Math.PI], [0.2, -0.45, Math.PI]].forEach(function(c){
      var s = new THREE.Group(); s.position.set(c[0], 0, c[1]); s.rotation.y = c[2]; g.add(s);
      pz(s, 0.3, 0.03, 0.3, az, 0, 0.3, 0);
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(s, 0.04, 0.29, 0.04, az, q[0]*0.12, 0.145, q[1]*0.12); });
      pz(s, 0.3, 0.2, 0.03, az, 0, 0.45, 0.14);
    });
  },
  mesa_camilla: function(g, m){                                       // mesa camilla redonda con faldón, de mesilla
    var c = lam({color:m.color || '#d8cfc0'});
    cil(g, 0.26, 0.3, 0.64, c, 0, 0.32, 0, 24);
    cil(g, 0.27, 0.27, 0.02, c, 0, 0.65, 0, 24);
  },
  // --- baño ---
  plato_ducha: function(g, m){                                        // plato antracita a ras de suelo y grifo visto
    var W = m.ancho || 1.2, D = m.fondo || 0.8;
    pz(g, W, 0.02, D, lc('#34373a'), 0, 0.01, 0);
    pz(g, 0.2, 0.06, 0.07, MI.gris, 0, 1.1, -D/2+0.04);
    pz(g, 0.02, 0.5, 0.02, MI.gris, 0.12, 1.35, -D/2+0.03).rotation.z = 0.25;
    pz(g, 0.3, 0.35, 0.02, lc('#8f8c86'), -W/2+0.35, 1.3, -D/2+0.005);   // hornacina
  },
  bide: function(g){
    cil(g, 0.13, 0.16, 0.4, MI.loza, 0, 0.2, 0.02, 16);
    var t = cil(g, 0.18, 0.18, 0.04, MI.loza, 0, 0.4, 0.04, 20); t.scale.set(1, 1, 1.3);
    pz(g, 0.05, 0.08, 0.05, MI.gris, 0, 0.45, -0.18);
  },
  lavabo_cajones: function(g, m){                                     // mueble de roble de tres cajones y lavabo integrado
    var W = m.ancho || 0.8, c = lc('#b08a5c');
    pz(g, W, 0.8, 0.45, c, 0, 0.4, 0);
    for(var i=1;i<3;i++) pz(g, W-0.02, 0.006, 0.006, lc('#6f5638'), 0, i*0.27, 0.228);
    pz(g, W+0.02, 0.06, 0.47, MI.loza, 0, 0.83, 0);
    pz(g, W-0.3, 0.02, 0.3, lc('#e9eae8'), 0, 0.86, 0.02);
    pz(g, 0.03, 0.18, 0.03, MI.gris, 0, 0.95, -0.17);
  },
  toallero: function(g){                                              // radiador toallero negro
    [-0.24, 0.24].forEach(function(x){ pz(g, 0.03, 1.1, 0.03, MI.negro, x, 1.05, 0.05); });
    for(var i=0;i<8;i++) pz(g, 0.48, 0.02, 0.02, MI.negro, 0, 0.6+i*0.13, 0.05);
  },
  deposito_gasoil: function(g){                                       // depósito de 1000 l de doble pared, verde
    var L = 1.15, W = 0.72, H = 1.62, v = lam({color:'#3d5a3a'});
    pz(g, L, H-0.06, W, v, 0, (H-0.06)/2, 0);
    [-1, 1].forEach(function(q){ [0.35, 1.05].forEach(function(y){ pz(g, L-0.1, 0.05, 0.03, v, 0, y, q*(W/2+0.01)); }); });  // costillas
    pz(g, L-0.12, 0.06, W-0.12, v, 0, H-0.03, 0);
    cil(g, 0.1, 0.1, 0.05, MI.negro, -0.25, H+0.02, 0, 16);             // boca de carga
    cil(g, 0.04, 0.04, 0.12, MI.negro, 0.2, H+0.06, 0, 10);             // indicador de nivel
    cil(g, 0.012, 0.012, 1.2, MI.gris, 0.42, H+0.3, -0.2, 6);           // tubo de ventilación
  },
  caldera: function(g){                                               // caldera de pie, de gasoil, envolvente blanca
    var W = 0.60, H = 0.85, D = 0.68;
    pz(g, W, H, D, MI.blanco, 0, H/2, 0);
    pz(g, W+0.002, 0.14, 0.2, MI.gris, 0, H-0.07, D/2-0.1);                 // cuadro de mandos arriba, delante
    [-0.16, 0, 0.16].forEach(function(x){ cil(g, 0.022, 0.022, 0.012, MI.negro, x, H-0.07, D/2+0.004, 12).rotation.x = Math.PI/2; });
    pz(g, W-0.06, 0.004, 0.004, MI.gris, 0, H-0.16, D/2+0.002);             // junta de la puerta frontal
    pz(g, 0.004, 0.62, 0.004, MI.gris, 0, 0.4, D/2+0.002);
    cil(g, 0.065, 0.065, 1.6, MI.gris, 0, H+0.8, -D/2+0.14, 16);            // salida de humos, sube al tejado
    [-0.12, 0.12].forEach(function(x){ cil(g, 0.014, 0.014, 0.5, MI.gris, x, H-0.05, -D/2-0.05, 8).rotation.x = Math.PI/2; });  // ida y retorno
  },
  // --- más muebles: los que suelen salir en una propuesta de reforma ---
  alfombra: function(g, m){                                           // ancho en x, largo en z
    pz(g, m.ancho, 0.012, m.largo, lc(m.color || '#d8cbb3'), 0, 0.006, 0);
    if(m.borde) [-1,1].forEach(function(q){
      pz(g, m.ancho-0.16, 0.014, 0.06, lc(m.borde), 0, 0.007, q*(m.largo/2-0.14));
      pz(g, 0.06, 0.014, m.largo-0.16, lc(m.borde), q*(m.ancho/2-0.14), 0.007, 0);
    });
  },
  mesa_centro: function(g, m){
    var L = m.largo || 1.1, D = m.fondo || 0.6, c = lc(m.color || '#a97c50');
    pz(g, L, 0.05, D, c, 0, 0.405, 0); pz(g, L-0.12, 0.03, D-0.12, c, 0, 0.12, 0);
    patas(g, c, 0.05, 0.38, L/2-0.05, D/2-0.05);
  },
  sofa_tela: function(g, m){                                          // sofá de tela, brazos bajos y patas de madera
    var L = m.largo || 2.4, D = m.fondo || 0.95, c = lc(m.color || '#d9d2c3');
    pz(g, L, 0.28, D, c, 0, 0.26, 0);
    pz(g, L, 0.42, 0.2, c, 0, 0.61, -D/2+0.1);
    [-1,1].forEach(function(q){ pz(g, 0.18, 0.26, D, c, q*(L/2-0.09), 0.53, 0); });
    var n = Math.max(2, Math.round((L-0.36)/0.8)), w = (L-0.36)/n;
    for(var i=0;i<n;i++){
      var x = -L/2+0.18+w*(i+0.5);
      pz(g, w-0.02, 0.14, D-0.28, c, x, 0.47, 0.08);
      pz(g, w-0.04, 0.4, 0.14, c, x, 0.72, -D/2+0.27).rotation.x = -0.12;
    }
    (m.cojines || ['#b86b4b', '#8a9a7b']).forEach(function(col, i){
      pz(g, 0.42, 0.38, 0.1, lc(col), (i%2 ? 1 : -1)*(L/2-0.45), 0.74, -D/2+0.4).rotation.x = -0.2;
    });
    patas(g, MI.oscura, 0.05, 0.12, L/2-0.08, D/2-0.08);
    if(m.chaise) pz(g, 0.85, 0.42, 0.8, c, (m.chaise > 0 ? 1 : -1)*(L/2-0.425), 0.33, D/2+0.4);
  },
  butaca_tela: function(g, m){
    var c = lc(m.color || '#c7a27c');
    pz(g, 0.74, 0.3, 0.78, c, 0, 0.31, 0);
    pz(g, 0.74, 0.52, 0.14, c, 0, 0.7, -0.32).rotation.x = -0.12;
    [-1,1].forEach(function(q){ pz(g, 0.1, 0.22, 0.72, c, q*0.32, 0.57, 0); });
    patas(g, MI.oscura, 0.04, 0.16, 0.32, 0.33);
  },
  lampara_pie: function(g){
    cil(g, 0.14, 0.16, 0.03, MI.negro, 0, 0.015, 0, 16); cil(g, 0.012, 0.012, 1.45, MI.negro, 0, 0.74, 0, 6);
    bombilla(cil(g, 0.13, 0.2, 0.26, lam({color:'#efe6d4'}), 0, 1.5, 0, 16), {fuerza:0.45, alcance:4, halo:0.5});
  },
  lampara_rincon: function(g, m){                                     // barra LED de pie para un rincón, de color; m.alto, m.tono
    var H = m.alto || 1.4;
    cil(g, 0.11, 0.12, 0.02, MI.negro, 0, 0.01, 0, 20);
    pz(g, 0.035, H, 0.035, MI.negro, 0, H/2+0.02, 0);
    bombilla(pz(g, 0.022, H-0.1, 0.012, lam({color:'#f4f4f4'}), 0, H/2+0.04, 0.02),
             {tono:m.tono || '#9b5cff', fuerza:0.5, alcance:3.5, halo:0.8, frente:0.3});
  },
  lampara_techo: function(g, m, e){                                   // colgante de fibra o de cerámica
    var yt = (m.techo || techoEn(e, m.uv[1]) - e.cota), y = m.y || Math.max(1.85, yt - 0.85), r = m.radio || 0.22;
    cil(g, 0.006, 0.006, yt - y, MI.negro, 0, (yt + y)/2, 0, 4);
    var p = malla(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI*2, 0, Math.PI/2), lam({color:m.color || '#c9a36e', side:THREE.DoubleSide}), g, 0, y - r, 0);
    p.scale.set(1, 0.8, 1);
    bombilla(bola(g, 0.05, lam({color:'#fff3d6'}), 0, y - r*0.55, 0), {tono:m.luz, fuerza:0.6, alcance:5, halo:0.3});
  },
  colgante: function(g, m, e){ MUEBLE.lampara_techo(g, m, e); },
  /* Proyector de pared: el origen en la cara de la pared, a la altura `y`; mira a +z y hacia abajo */
  proyector: function(g, m){                                         // `escala` > 1: más grande y más potente; `potencia`, solo más luz
    var y = m.y || 2.0, k = m.escala || 1, t = new THREE.Group();
    t.position.set(0, y, 0); t.scale.setScalar(k); g.add(t);
    pz(t, 0.08, 0.1, 0.06, MI.negro, 0, 0, 0.03);
    var cuerpo = new THREE.Group(); cuerpo.position.set(0, -0.02, 0.1); cuerpo.rotation.x = 0.7; t.add(cuerpo);
    pz(cuerpo, 0.24, 0.18, 0.07, lc('#2b2d2f'), 0, 0, 0);
    bombilla(pz(cuerpo, 0.2, 0.14, 0.01, lam({color:'#e8ecef'}), 0, 0, 0.04),
             {tono:'neutra', fuerza:2.6*k*k*(m.potencia || 1), alcance:12*k*Math.sqrt(m.potencia || 1), halo:0.7*k, baja:1.2*k, frente:1.2*k});
  },
  /* Cámara de vigilancia de pared: soporte y cuerpo cilíndrico blanco, mirando a +z y algo abajo */
  camara: function(g, m){
    var y = m.y || 2.6;
    pz(g, 0.1, 0.14, 0.03, MI.blanco, 0, y, 0.015);
    pz(g, 0.03, 0.03, 0.12, MI.blanco, 0, y, 0.08);
    var c = new THREE.Group(); c.position.set(0, y - 0.03, 0.2); c.rotation.x = 0.35; g.add(c);
    malla(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 16).rotateX(Math.PI/2), MI.blanco, c, 0, 0, 0);
    malla(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16).rotateX(Math.PI/2), MI.negro, c, 0, 0, 0.1);
    pz(c, 0.11, 0.01, 0.24, MI.blanco, 0, 0.055, 0.01);                // visera
  },
  /* Flexo de brazo sobre una mesa (con `cota` a la altura del tablero): la pantalla mira a +z */
  flexo: function(g){
    cil(g, 0.08, 0.09, 0.02, MI.negro, 0, 0.01, 0, 16);
    var a = pz(g, 0.018, 0.42, 0.018, MI.negro, 0, 0.21, -0.05); a.rotation.x = -0.25;
    var b = pz(g, 0.018, 0.36, 0.018, MI.negro, 0, 0.44, 0.07); b.rotation.x = 1.15;
    var p = malla(new THREE.ConeGeometry(0.07, 0.13, 18, 1, true), lam({color:'#1f1d1c', side:THREE.DoubleSide}), g, 0, 0.47, 0.24);
    p.rotation.x = Math.PI + 0.35;                                      // boca abajo, un poco hacia delante
    bombilla(bola(g, 0.028, lam({color:'#fff6e0'}), 0, 0.43, 0.24), {tono:'neutra', fuerza:0.35, alcance:2.5, halo:0.25});
  },
  farola: function(g){                                                // farola de globo
    cil(g, 0.04, 0.06, 2.3, MAT.hierro, 0, 1.15, 0, 8);
    bombilla(bola(g, 0.2, MAT.globo, 0, 2.45, 0), {fuerza:0.9, alcance:9, halo:1.1});
  },
  /* Foco empotrado: aro blanco enrasado con el techo y el difusor, que es lo que se enciende */
  foco: function(g, m, e){
    var yt = (m.techo || techoEn(e, m.uv[1]) - e.cota), r = (m.diametro || 0.09)/2;
    cil(g, r + 0.012, r + 0.012, 0.012, MI.blanco, 0, yt - 0.006, 0, 20);
    bombilla(cil(g, r, r, 0.006, lam({color:'#f4f1ea'}), 0, yt - 0.014, 0, 20), {tono:m.luz, fuerza:0.55, alcance:4.5, halo:0.22, baja:0.35});
  },
  plafon: function(g, m, e){
    var yt = (m.techo || techoEn(e, m.uv[1]) - e.cota), r = (m.diametro || 0.35)/2;
    bombilla(cil(g, r, r*0.9, 0.07, lam({color:'#f4f1ea'}), 0, yt - 0.035, 0, 24), {tono:m.luz, fuerza:0.8, alcance:6, halo:0.6, baja:0.3});
  },
  /* Aplique: el origen en la cara de la pared; alumbra hacia +z */
  aplique: function(g, m){
    var y = m.y || 2.0;
    pz(g, 0.1, 0.16, 0.02, MI.negro, 0, y, 0.01);
    bombilla(pz(g, 0.14, 0.12, 0.09, lam({color:'#f4f1ea'}), 0, y, 0.065), {tono:m.luz, fuerza:0.5, alcance:4, halo:0.45});
  },
  /* Tira LED a lo largo de x, bajo el techo o a la altura `y`; con `y2`, otra a esa altura que se
     enciende con ella (la de una mesa, que asoma por encima y por debajo del tablero) */
  tira: function(g, m, e){
    var y = m.y || ((m.techo || techoEn(e, m.uv[1]) - e.cota) - 0.04);
    [y].concat(m.y2 ? [m.y2] : []).forEach(function(yy){
      bombilla(pz(g, m.largo || 3, 0.014, 0.02, lam({color:'#fbf6ec'}), 0, yy, 0), {tono:m.luz, fuerza:m.fuerza || 0.5, alcance:4, halo:0, frente:m.frente});
    });
  },
  libreria: function(g, m){                                           // librería de suelo a techo, con libros
    var W = m.ancho, H = m.alto || 2.3, D = m.fondo || 0.35, c = lc(m.color || '#efe9df');
    var n = Math.max(1, Math.round(W/0.8)), f = Math.max(2, Math.round(H/0.38)), cw = (W-0.03)/n, fh = (H-0.03)/f;
    pz(g, W, H, 0.02, c, 0, H/2, -D/2+0.01);
    for(var i=0;i<=n;i++) pz(g, 0.03, H, D, c, -W/2+0.015+i*cw, H/2, 0);
    for(var j=0;j<=f;j++) pz(g, W, 0.03, D, c, 0, 0.015+j*fh, 0);
    for(i=0;i<n;i++) for(j=(m.bajo ? 2 : 0);j<f;j++){
      if((i*7+j*3)%5 === 0) continue;                                // algún hueco con objetos, sin libros
      var x0 = -W/2+0.03+i*cw, hb = Math.min(fh-0.06, 0.2+0.05*((i+j)%3));
      pz(g, cw*(0.45+0.1*((i+2*j)%4)), hb, 0.24, LIBRO[(i*3+j)%LIBRO.length], x0+cw*0.3, 0.03+j*fh+hb/2, 0.03);
    }
    if(m.bajo) pz(g, W, 2*fh, D+0.02, c, 0, fh, 0.01);                // cerrado abajo, con puertas
  },
  mesa_madera: function(g, m){
    var L = m.largo || 2.2, D = m.fondo || 0.95, c = lc(m.color || '#a97c50');
    pz(g, L, 0.05, D, c, 0, 0.745, 0);
    patas(g, c, 0.07, 0.72, L/2-0.12, D/2-0.1);
  },
  mesa_redonda_madera: function(g, m){
    var r = m.radio || 0.6, c = lc(m.color || '#a97c50');
    cil(g, r, r, 0.045, c, 0, 0.75, 0, 32); cil(g, 0.07, 0.1, 0.72, c, 0, 0.36, 0, 12); cil(g, 0.3, 0.32, 0.04, c, 0, 0.02, 0, 20);
  },
  silla_madera: function(g, m){ silla(g, 1, lc(m.color || '#8a6a48'), lc(m.asiento || '#d9cdb4')); },
  banqueta: function(g, m){
    var c = lc(m.color || '#8a6a48');
    cil(g, 0.19, 0.19, 0.05, lc(m.asiento || '#d9cdb4'), 0, 0.66, 0, 16);
    patas(g, c, 0.035, 0.64, 0.13, 0.13);
    pz(g, 0.3, 0.02, 0.02, c, 0, 0.25, 0.13);
  },
  isla: function(g, m){                                               // muebles hacia -z, voladizo con taburetes hacia +z
    var L = m.largo || 2.2, D = m.fondo || 0.95, fr = lc(m.frente || '#8f9e86'), tp = lc(m.tapa || '#b98b5e'), n = Math.round(L/0.6);
    pz(g, L, 0.8, D-0.3, fr, 0, 0.5, -0.15); pz(g, L, 0.1, D-0.35, MI.negro, 0, 0.05, -0.15);
    pz(g, L+0.05, 0.05, D, tp, 0, 0.905, 0);
    for(var i=1;i<n;i++) pz(g, 0.006, 0.74, 0.006, MI.gris, -L/2+i*L/n, 0.5, -D/2-0.004);
    if(m.fregadero !== undefined){
      pz(g, 0.6, 0.012, 0.4, lc('#2c2c2c'), m.fregadero, 0.935, -0.12);
      pz(g, 0.03, 0.35, 0.03, MI.gris, m.fregadero, 1.1, 0.12);
    }
  },
  columnas: function(g, m){                                           // columnas de horno y nevera integrada, hasta arriba
    var n = m.n || 2, fr = lc(m.frente || '#8f9e86');
    for(var i=0;i<n;i++){
      var x = (i-(n-1)/2)*0.6;
      pz(g, 0.6, 2.25, 0.6, fr, x, 1.125, 0);
      pz(g, 0.006, 2.1, 0.006, MI.gris, x+0.3, 1.1, 0.302);
      if(i === (m.horno || 0)){ pz(g, 0.56, 0.58, 0.01, MI.negro, x, 0.95, 0.305); pz(g, 0.56, 0.38, 0.01, MI.negro, x, 1.5, 0.305); }
      else pz(g, 0.02, 0.5, 0.03, MI.gris, x+0.24, 1.1, 0.31);
    }
  },
  estantes: function(g, m){                                           // baldas de madera en la pared
    var W = m.ancho || 1.2, c = lc(m.color || '#b98b5e');
    (m.alturas || [1.45, 1.85]).forEach(function(y, j){
      pz(g, W, 0.04, 0.26, c, 0, y, 0);
      for(var k=0;k<Math.round(W/0.3);k++) if((k+j)%3) pz(g, 0.12, 0.16, 0.14, (k+j)%2 ? MI.loza : lc('#c9b89a'), -W/2+0.15+k*0.3, y+0.1, 0);
    });
  },
  planta: function(g, m){                                             // planta grande en maceta: olivo, ficus o kentia
    var h = m.alto || 1.6, r = m.radio || 0.25, hm = r*1.6, tipo = m.especie || 'olivo';
    cil(g, r, r*0.8, hm, lc(m.maceta || '#b5653a'), 0, hm/2, 0, 16);
    var hoja = lc(tipo === 'olivo' ? '#8a9670' : '#3f6b35');
    if(tipo === 'olivo'){
      cil(g, 0.03, 0.05, h*0.55, MI.madera, 0, hm+h*0.27, 0, 6);
      bola(g, h*0.28, hoja, 0, hm+h*0.72, 0, 0.75).scale.x *= 1.15;
    } else [[0,0.3,0.28],[0.1,0.55,0.25],[-0.08,0.75,0.22],[0.04,0.92,0.17]].forEach(function(p){
      bola(g, h*p[2]*0.8, hoja, p[0]*h, hm+h*p[1], p[0]*h*0.5);
    });
  },
  escritorio: function(g, m){
    var L = m.largo || 1.6, D = m.fondo || 0.7, H = m.alto || 0.76, c = lc(m.color || '#b98b5e');   // m.alto: hasta arriba del tablero
    var pa = m.patas ? lc(m.patas) : lc('#2b2b2a');
    pz(g, L, 0.04, D, c, 0, H-0.02, 0);
    [-1,1].forEach(function(q){ pz(g, 0.04, H-0.04, D-0.1, pa, q*(L/2-0.1), (H-0.04)/2, 0); });
    if(L > 2) pz(g, 0.04, H-0.04, D-0.1, pa, 0, (H-0.04)/2, 0);
  },
  panel_listones: function(g, m){                                     // cabecero de listones de madera de pared a pared
    var W = m.ancho, H = m.alto || 2.4, c = lc(m.color || '#b98b5e'), n = Math.round(W/0.09);
    pz(g, W, H, 0.012, lc('#3a2d24'), 0, H/2, 0.006);
    for(var i=0;i<n;i++) pz(g, 0.05, H, 0.02, c, -W/2+0.045+i*(W-0.09)/(n-1), H/2, 0.022);
  },
  banco_tapizado: function(g, m){
    var L = m.largo || 1.4, c = lc(m.color || '#c7a27c');
    pz(g, L, 0.12, 0.42, c, 0, 0.42, 0);
    patas(g, MI.oscura, 0.04, 0.36, L/2-0.06, 0.16);
  },
  mueble_bajo: function(g, m){                                        // aparador o mueble bajo de puertas
    var W = m.ancho || 1.6, H = m.alto || 0.75, D = m.fondo || 0.45, c = lc(m.color || '#b98b5e'), n = Math.max(2, Math.round(W/0.5));
    pz(g, W, H-0.12, D, c, 0, 0.12+(H-0.12)/2, 0);
    for(var i=1;i<n;i++) pz(g, 0.006, H-0.2, 0.006, lc('#3a2d24'), -W/2+i*W/n, 0.12+(H-0.12)/2, D/2+0.003);
    patas(g, MI.oscura, 0.04, 0.12, W/2-0.06, D/2-0.06);
  },
  vestidor_abierto: function(g, m){                                   // módulos abiertos: ropa colgada y baldas, cajones abajo
    var W = m.ancho, H = 2.3, D = 0.55, c = lc(m.color || '#e9e2d6'), n = Math.max(1, Math.round(W/0.9)), w = W/n;
    var ropa = ['#2f3a4a','#c9b9a3','#7d8a74','#e8e3da','#8c5a44'].map(lc);
    pz(g, W, H, 0.02, c, 0, H/2, -D/2+0.01);
    for(var i=0;i<=n;i++) pz(g, 0.025, H, D, c, -W/2+0.0125+i*(W-0.025)/n, H/2, 0);
    pz(g, W, 0.025, D, c, 0, H-0.0125, 0); pz(g, W, 0.025, D, c, 0, 1.95, 0);
    for(i=0;i<n;i++){
      var x = -W/2+(i+0.5)*w;
      pz(g, w-0.04, 0.7, D-0.02, c, x, 0.35, 0.01);
      pz(g, w-0.06, 0.005, 0.005, MI.gris, x, 0.35, D/2+0.005);
      if(i%2 === 0){
        cil(g, 0.012, 0.012, w-0.05, MI.gris, x, 1.85, 0, 6).rotation.z = Math.PI/2;
        pz(g, w-0.12, 0.95, 0.42, ropa[i%ropa.length], x, 1.33, 0);
      } else [0.95, 1.3, 1.65].forEach(function(y, k){ pz(g, w-0.04, 0.02, D-0.04, c, x, y, 0); pz(g, w*0.6, 0.16, 0.34, ropa[(i+k)%ropa.length], x, y+0.09, 0); });
    }
  },
  cama_casita: function(g, m){                                        // cama casita de 90, con el tejadito de listones
    var W = 0.98, L = 2.0, H = 1.55, c = lc(m.color || '#e9dcc6'), a = Math.atan2(0.3, W/2), lr = Math.hypot(0.3, W/2);
    pz(g, W, 0.3, L, c, 0, 0.15, 0); pz(g, W-0.08, 0.14, L-0.08, lc(m.ropa || '#9fb4a8'), 0, 0.37, 0);
    pz(g, W/2-0.1, 0.12, 0.4, MI.blanco, 0, 0.5, -L/2+0.3);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.05, H, 0.05, c, q[0]*(W/2-0.025), H/2, q[1]*(L/2-0.025)); });
    [-1,1].forEach(function(q){
      [-1,1].forEach(function(s){ pz(g, lr, 0.05, 0.05, c, s*W/4, H+0.15, q*(L/2-0.025)).rotation.z = -s*a; });
      pz(g, 0.05, 0.05, L, c, q*(W/2-0.025), 0.45, 0);
    });
    pz(g, 0.05, 0.05, L, c, 0, H+0.3, 0);
    if(m.guirnalda) for(var i=0;i<7;i++) bola(g, 0.025, lam({color:'#fff3d6', emissive:'#ffcf80', emissiveIntensity:1}), 0, H+0.25, -L/2+0.2+i*0.27);
  },
  tipi: function(g, m){
    malla(new THREE.ConeGeometry(0.62, 1.7, 5, 1, true), lam({color:m.color || '#efe6d6', side:THREE.DoubleSide}), g, 0, 0.85, 0);
    [0,1,2,3,4].forEach(function(i){ var p = pz(g, 0.025, 2.0, 0.025, MI.pino, 0, 0.95, 0); p.geometry.translate(0, 0, 0); p.rotation.set(0.33*Math.cos(i*1.257), 0, 0.33*Math.sin(i*1.257)); });
    cil(g, 0.55, 0.55, 0.05, lc('#d9a38f'), 0, 0.025, 0, 20);
  },
  ducha_obra: function(g, m){                                         // plato enrasado, mampara fija y rociador de techo
    var W = m.ancho || 1.4, D = m.fondo || 0.9;
    pz(g, W, 0.03, D, lc('#e3ded5'), 0, 0.015, 0);
    pz(g, W*0.6, 1.95, 0.01, MAT.cristal, -W*0.2, 1.0, D/2);
    pz(g, 0.03, 1.95, 0.03, MI.gris, W*0.1, 1.0, D/2);
    pz(g, 0.02, 0.02, 0.3, MI.gris, 0, 2.1, -D/2+0.15);
    cil(g, 0.13, 0.13, 0.02, MI.gris, 0, 2.08, -D/2+0.3, 20);
    pz(g, 0.35, 0.08, 0.04, MI.gris, W/2-0.35, 1.1, -D/2+0.03);
  },
  mueble_lavabo: function(g, m){                                      // mueble de madera y lavabo sobre encimera
    var W = m.ancho || 1.0, c = lc(m.color || '#a97c50');
    pz(g, W, 0.42, 0.48, c, 0, 0.6, 0); pz(g, W+0.02, 0.03, 0.5, lc('#e9e4da'), 0, 0.825, 0);
    cil(g, 0.2, 0.15, 0.14, MI.loza, 0, 0.91, 0.02, 20);
    pz(g, 0.03, 0.3, 0.03, MI.gris, 0, 1.0, -0.18); pz(g, 0.03, 0.03, 0.14, MI.gris, 0, 1.14, -0.12);
    patas(g, MI.oscura, 0.035, 0.39, W/2-0.05, 0.2);
  },
  espejo_redondo: function(g, m){
    var r = m.radio || 0.35;
    cil(g, r, r, 0.03, lc(m.marco || '#b98b5e'), 0, m.y || 1.55, 0.015, 32).rotation.x = Math.PI/2;
    cil(g, r-0.03, r-0.03, 0.01, MI.espejo, 0, m.y || 1.55, 0.033, 32).rotation.x = Math.PI/2;
  },
  banco_recibidor: function(g, m){                                    // banco zapatero con panel, perchas y balda
    var L = m.largo || 1.6, c = lc(m.color || '#b98b5e'), pn = lc(m.panel || '#e2d8c6');
    pz(g, L, 0.04, 0.4, c, 0, 0.46, 0);
    for(var i=0;i<=3;i++) pz(g, 0.03, 0.44, 0.38, c, -L/2+0.015+i*(L-0.03)/3, 0.22, 0);
    pz(g, L, 0.03, 0.38, c, 0, 0.12, 0);
    pz(g, L, 1.25, 0.02, pn, 0, 1.1, -0.19);
    pz(g, L, 0.03, 0.26, c, 0, 1.74, -0.07);
    for(i=0;i<5;i++) cil(g, 0.015, 0.015, 0.08, MI.negro, -L/2+0.2+i*(L-0.4)/4, 1.5, -0.14, 6).rotation.x = Math.PI/2;
  },
  armario_alto: function(g, m){                                       // armarios altos cerrados
    var W = m.ancho || 1.8, H = m.alto || 2.2, D = m.fondo || 0.55, c = lc(m.color || '#d9d6cf'), n = Math.max(1, Math.round(W/0.6));
    pz(g, W, H, D, c, 0, H/2, 0);
    for(var i=1;i<n;i++) pz(g, 0.006, H-0.1, 0.006, MI.gris, -W/2+i*W/n, H/2, D/2+0.003);
    for(i=0;i<n;i++) pz(g, 0.02, 0.2, 0.02, MI.gris, -W/2+(i+0.5)*W/n + (i%2 ? -0.22 : 0.22), 1.1, D/2+0.012);
  },
  lavanderia: function(g, m){                                         // lavadora y secadora bajo encimera, armario encima
    var W = m.ancho || 1.4, tp = lc(m.tapa || '#b98b5e'), c = lc(m.color || '#d9d6cf');
    [-0.33, 0.33].forEach(function(x){
      pz(g, 0.6, 0.85, 0.6, MI.blanco, x*W/1.4, 0.425, 0);
      cil(g, 0.17, 0.17, 0.02, MI.gris, x*W/1.4, 0.45, 0.3, 20).rotation.x = Math.PI/2;
    });
    pz(g, W, 0.04, 0.65, tp, 0, 0.9, 0);
    pz(g, W, 0.7, 0.35, c, 0, 1.85, -0.15);
    pz(g, 0.006, 0.66, 0.006, MI.gris, 0, 1.85, 0.028);
  },
  bicicletas: function(g, m){                                         // bicis colgadas de un riel en la pared (x a lo largo)
    var n = m.n || 2, rueda = new THREE.TorusGeometry(0.31, 0.025, 6, 20);
    for(var i=0;i<n;i++){
      var x = (i-(n-1)/2)*0.45, b = new THREE.Group(); b.position.set(x, 0, 0); b.rotation.y = Math.PI/2; g.add(b);
      [0.35, 1.4].forEach(function(y){ malla(rueda, MI.negro, b, 0, y, 0); });
      pz(b, 0.03, 1.05, 0.03, lc(['#2f78c4','#c8352e','#3f7d3a'][i%3]), 0, 0.88, 0);
      pz(b, 0.03, 0.5, 0.03, lc(['#2f78c4','#c8352e','#3f7d3a'][i%3]), 0.18, 0.9, 0).rotation.z = 0.6;
    }
    pz(g, n*0.45+0.1, 0.05, 0.04, MI.gris, 0, 1.75, -0.3);
  },
  guirnalda: function(g, m){                                          // guirnalda de bombillas en catenaria, a lo largo de x
    var L = m.largo || 4, y = m.alto || 2.3, fl = m.flecha !== undefined ? m.flecha : 0.35, n = Math.round(L/0.35), cb = lam({color:'#fff3d6'}), bs = [];
    for(var i=0;i<=n;i++){
      var t = i/n, x = -L/2 + t*L, yy = y - fl*4*t*(1-t);
      bs.push(bola(g, 0.035, cb, x, yy - 0.05, 0));
      if(i < n){ var t2 = (i+1)/n, y2 = y - fl*4*t2*(1-t2), s = pz(g, Math.hypot(L/n, y2-yy), 0.008, 0.008, MI.negro, x + L/n/2, (yy+y2)/2, 0); s.rotation.z = Math.atan2(y2-yy, L/n); }
    }
    bombilla(bs, {tono:'#ffcf80', fuerza:0.5, alcance:5, halo:0});
  },
  // --- fuera ---
  tumbona: function(g, m){                                            // a lo largo de z, respaldo hacia -z
    var c = lc(m.color || '#e9e4da'), f = lc(m.madera || '#a97c50');
    pz(g, 0.65, 0.07, 1.95, f, 0, 0.3, 0); pz(g, 0.6, 0.07, 1.3, c, 0, 0.37, 0.3);
    pz(g, 0.6, 0.07, 0.7, c, 0, 0.56, -0.68).rotation.x = 0.7;
    patas(g, f, 0.05, 0.27, 0.28, 0.9);
  },
  chillout: function(g){                                              // sofá de exterior, dos butacas y mesa baja; mira a +z
    var arm = lc('#5d5852'), coj = lc('#e6dfd0'), res = lc('#b9ae98'), teca = lc('#8a6a4a');
    function asiento(x, z, ancho, giro){
      var s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = giro; g.add(s);
      pz(s, ancho, 0.3, 0.85, arm, 0, 0.2, 0);                                  // base de trenzado
      pz(s, ancho, 0.42, 0.18, arm, 0, 0.56, -0.34);                            // respaldo
      [-1, 1].forEach(function(q){ pz(s, 0.16, 0.25, 0.85, arm, q*(ancho/2 - 0.08), 0.47, 0); });   // brazos
      pz(s, ancho - 0.34, 0.14, 0.66, coj, 0, 0.42, 0.06);                      // cojín del asiento
      var n = Math.max(1, Math.round((ancho - 0.34)/0.62));
      for(var k=0;k<n;k++){ var c = pz(s, (ancho - 0.34)/n - 0.04, 0.42, 0.14, res, -(ancho - 0.34)/2 + (k + 0.5)*(ancho - 0.34)/n, 0.68, -0.2); c.rotation.x = -0.2; }
    }
    asiento(0, -0.75, 2.2, 0);
    asiento(-1.45, 0.45, 0.9, Math.PI/2); asiento(1.45, 0.45, 0.9, -Math.PI/2);
    pz(g, 1.1, 0.04, 0.65, teca, 0, 0.4, 0.4);                                 // mesa baja de teca
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.06, 0.38, 0.06, teca, q[0]*0.5, 0.19, 0.4 + q[1]*0.28); });
  },
  sombrilla: function(g, m){
    var r = m.radio || 1.3;
    cil(g, 0.25, 0.25, 0.06, MI.gris, 0, 0.03, 0, 16); cil(g, 0.02, 0.02, 2.4, lc('#e9e4da'), 0, 1.2, 0, 6);
    malla(new THREE.ConeGeometry(r, 0.45, 8, 1, true), lam({color:m.color || '#efe7d6', side:THREE.DoubleSide}), g, 0, 2.25, 0);
  },
  ducha_exterior: function(g){
    for(var i=0;i<6;i++) pz(g, 1.0, 0.03, 0.14, MI.madera, 0, 0.03, -0.43+i*0.172);   // tarima cuadrada de 1 × 1 m
    cil(g, 0.025, 0.025, 2.2, MI.gris, 0, 1.1, -0.35, 8);
    pz(g, 0.03, 0.03, 0.3, MI.gris, 0, 2.18, -0.22); cil(g, 0.12, 0.12, 0.02, MI.gris, 0, 2.15, -0.08, 16);
  },
  bancal: function(g, m){                                             // bancal de madera con la tierra y la hortaliza
    var W = m.ancho || 1.2, L = m.largo || 2.4, H = m.alto || 0.45, c = lc('#8b6a48'), hj = [lc('#5f8a3a'), lc('#7aa04a'), lc('#48702e')];
    [-1,1].forEach(function(q){ pz(g, W, H, 0.05, c, 0, H/2, q*(L/2-0.025)); pz(g, 0.05, H, L, c, q*(W/2-0.025), H/2, 0); });
    pz(g, W-0.1, 0.03, L-0.1, MAT.tierra, 0, H-0.06, 0);
    for(var i=0;i<Math.floor((L-0.2)/0.35);i++) [-1,1].forEach(function(q){
      bola(g, 0.12+0.04*((i+q+2)%3), hj[(i+q+3)%3], q*W/4, H, -L/2+0.25+i*0.35, 0.8);
    });
  },
  brasero: function(g){                                               // brasero de fuego de obra, a ras del suelo
    cil(g, 0.6, 0.65, 0.35, lc('#6a6560'), 0, 0.175, 0, 20);
    cil(g, 0.48, 0.48, 0.02, lam({color:'#3a1c08', emissive:'#ff6a1a', emissiveIntensity:0.6}), 0, 0.3, 0, 20);
    [-0.5, 0.4, 1.4].forEach(function(a){ var l = cil(g, 0.05, 0.05, 0.6, MI.madera, 0, 0.33, 0, 6); l.rotation.set(Math.PI/2, 0, a); });
  },
  hamaca: function(g, m){                                             // hamaca de tela entre dos árboles, a lo largo de x
    var L = m.largo || 3.2, y = 1.5, n = 10, c = lc(m.color || '#e0c9a2');
    for(var i=0;i<n;i++){
      var t = (i+0.5)/n, x = -L*0.35 + t*L*0.7, yy = y - 0.7*4*t*(1-t);
      pz(g, L*0.7/n+0.01, 0.02, 0.8, c, x, yy, 0);
    }
    [-1,1].forEach(function(q){ var s = pz(g, L*0.18, 0.012, 0.012, MI.gris, q*L*0.41, y+0.18, 0); s.rotation.z = q*0.5; });
  },
  emparrado: function(g, m){                                          // pérgola de madera con parra: ancho en x, fondo en z
    var W = m.ancho, D = m.fondo, H = m.alto || 2.5, c = lc('#8b6a48'), n = Math.max(1, Math.round(W/3));
    for(var i=0;i<=n;i++){
      var x = -W/2+0.08+i*(W-0.16)/n;
      pz(g, 0.14, H, 0.14, c, x, H/2, D/2-0.08);
      pz(g, 0.1, 0.18, D, c, x, H+0.09, 0);
    }
    pz(g, W, 0.18, 0.12, c, 0, H+0.09, D/2-0.08); pz(g, W, 0.12, 0.1, c, 0, H+0.06, -D/2+0.05);
    for(i=0;i<Math.round(W/0.5);i++) pz(g, 0.05, 0.05, D, c, -W/2+0.25+i*0.5, H+0.2, 0);
    var hojas = ['#6f8f45', '#5d7d3a', '#83a052'].map(function(c){ return lam({color:c, transparent:true, opacity:0.85}); });
    for(i=0;i<Math.round(W/0.55);i++) for(var j=0;j<Math.round(D/0.55);j++){
      var k = (i*7 + j*13) % 11;
      if(k === 0 || k === 5) continue;                                // claros entre la parra
      bola(g, 0.3+0.05*(k%4), hojas[k%3], -W/2+0.3+i*0.55+0.08*((k%3)-1), H+0.26+0.03*(k%2), -D/2+0.3+j*0.55, 0.28);
    }
    for(i=0;i<=n;i++) bola(g, 0.12, hojas[1], -W/2+0.08+i*(W-0.16)/n, H*0.55, D/2-0.08, 3.2);   // la cepa subiendo por el poste
  },
  lavanda: function(g, m){                                            // hilera de matas de lavanda y romero, a lo largo de x
    var L = m.largo || 3, n = Math.round(L/0.45), mt = [lc('#8a79b8'), lc('#7d8f6a'), lc('#9a86c4')];
    for(var i=0;i<n;i++) bola(g, 0.22, mt[i%3], -L/2+0.22+i*(L-0.44)/Math.max(1, n-1), 0.18, ((i*7)%3-1)*0.06, 0.8);
  },
  arbol: function(g, m){                                              // árbol plantado de nuevo: frutal, olivo, almendro
    var C = {olivo:['#7f8b66', '#5e5244'], almendro:['#8fa060', '#5e4b3a'], limonero:['#4f7a36', '#5e4b3a'],
             granado:['#5f7f3a', '#5e4b3a'], frutal:['#6b8c44', '#5e4b3a'], algarrobo:['#3b5a2c', '#4f4034']}[m.especie || 'frutal'];
    var r = m.r || 1.4, h = m.alto || 2.8;
    cil(g, 0.08, 0.13, h*0.5, lc(C[1]), 0, h*0.25, 0, 6);
    bola(g, r, lc(C[0]), 0, h*0.5+r*0.55, 0, 0.75);
  },
  cochera: function(g, m){                                            // cochera abierta de madera; +z, a la explanada
    if(m.cae) return cocheraLado(g, m);
    var W = m.ancho || 6.4, D = m.fondo || 5.8, hf = 2.75, ht = 2.5, mad = lc('#8a5f3c');
    pz(g, W + 0.4, 0.1, D + 0.6, MAT.hormigon, 0, 0.05, 0.1);
    [-1, 0, 1].forEach(function(i){ [-1, 1].forEach(function(j){
      if(!i && j > 0) return;                                        // delante, sin pie en medio: se entra holgado
      var h = j > 0 ? hf : ht;
      pz(g, 0.15, h, 0.15, mad, i*(W/2 - 0.1), 0.1 + h/2, j*(D/2 - 0.1));
      pz(g, 0.3, 0.12, 0.3, MAT.hormigon, i*(W/2 - 0.1), 0.16, j*(D/2 - 0.1));
    }); });
    // vigas a lo ancho arriba de los postes, y correas de delante atrás
    [[1, hf, 0.3], [-1, ht, 0.22]].forEach(function(q){ pz(g, W + 0.3, q[2], 0.16, mad, 0, 0.1 + q[1] + q[2]/2, q[0]*(D/2 - 0.1)); });
    var pend = (hf - ht)/(D - 0.2);
    for(var k=0;k<=8;k++){
      var c = pz(g, 0.08, 0.16, D + 0.5, mad, -W/2 - 0.1 + k*(W + 0.2)/8, 0.1 + (hf + ht)/2 + 0.3, 0);
      c.rotation.x = -Math.atan(pend);
    }
    var y0 = 0.1 + ht + 0.4 - pend*0.35, y1 = 0.1 + hf + 0.4 + pend*0.35;
    malla(losa4([[-W/2 - 0.35, y1, D/2 + 0.35], [W/2 + 0.35, y1, D/2 + 0.35], [W/2 + 0.35, y0, -D/2 - 0.35], [-W/2 - 0.35, y0, -D/2 - 0.35]], 0.06), MAT.teja, g);
  },
  coche_suv: function(g, m){                                          // SUV compacto (negro, o `pintura`); el morro hacia +z
    var W = 1.84, pin = brillo(m.pintura || '#15171a', 90), vid = brillo('#26303a', 120), plata = lc('#b9bcbf');
    if(m.pintura) [-1, 1].forEach(function(s){                        // con otro color, las molduras negras de abajo
      pz(g, 0.02, 0.2, 4.2, lc('#1c1d1f'), s*(W/2 + 0.005), 0.36, 0);
    });
    perfil(g, [[-2.2, 0.25], [2.2, 0.25], [2.24, 0.62], [2.16, 0.86], [1.15, 1.0], [-2.08, 1.02], [-2.24, 0.9], [-2.24, 0.3]], W, pin);
    perfil(g, [[1.15, 0.99], [0.25, 1.57], [-1.55, 1.58], [-2.08, 1.35], [-2.1, 1.0]], W - 0.18, pin);
    perfil(g, [[1.2, 1.0], [0.29, 1.55], [-1.53, 1.55], [-2.12, 1.33], [-2.14, 1.02]], W - 0.16, vid);
    pz(g, W - 0.15, 0.48, 0.1, pin, 0, 1.26, -0.45);                          // pilar B
    [-1, 1].forEach(function(s){
      pz(g, 0.03, 0.04, 1.6, plata, s*(W/2 - 0.2), 1.61, -0.7);               // barras del techo
      rueda(g, s*(W/2 - 0.12), 0.35, 1.33, 0.35, s, plata); rueda(g, s*(W/2 - 0.12), 0.35, -1.33, 0.35, s, plata);
      pz(g, 0.34, 0.07, 0.04, lc('#f4f4f0'), s*0.62, 0.8, 2.2);                // faros
      pz(g, 0.34, 0.08, 0.04, lc('#a3171c'), s*0.62, 0.92, -2.23);            // pilotos
      pz(g, 0.18, 0.1, 0.12, pin, s*(W/2 + 0.04), 1.08, 0.95);                // retrovisores
    });
    pz(g, 0.9, 0.24, 0.03, lc('#101112'), 0, 0.6, 2.23);                      // parrilla
  },
  furgoneta: function(g){                                             // furgoneta de dos tonos; morro hacia +z
    var W = 1.9, blanco = brillo('#f3f3ef', 70), color = brillo('#2e7f86', 90), vid = brillo('#26303a', 120), negro = lc('#161718');
    perfil(g, [[-2.45, 0.3], [2.43, 0.3], [2.47, 0.72], [2.35, 1.0], [1.75, 1.12], [1.05, 1.93], [-2.38, 1.98], [-2.47, 1.9], [-2.47, 0.35]], W, blanco);
    perfil(g, [[-2.48, 0.29], [2.44, 0.29], [2.48, 0.72], [2.37, 1.0], [2.1, 1.06], [-2.48, 1.06]], W + 0.012, color);
    perfil(g, [[1.77, 1.16], [1.12, 1.87], [-1.95, 1.87], [-1.95, 1.2]], W + 0.012, vid);
    pz(g, 1.5, 0.55, 0.02, vid, 0, 1.55, -2.475);                             // luna trasera
    pz(g, W + 0.02, 0.62, 0.08, blanco, 0, 1.53, 0.95);                       // pilar B
    pz(g, W + 0.03, 0.035, 4.9, lc('#c9cccf'), 0, 1.07, 0);                   // junquillo cromado entre los dos colores
    [-1, 1].forEach(function(s){
      rueda(g, s*(W/2 - 0.12), 0.36, 1.5, 0.36, s, negro); rueda(g, s*(W/2 - 0.12), 0.36, -1.5, 0.36, s, negro);
      pz(g, 0.38, 0.12, 0.04, lc('#f4f4f0'), s*0.66, 0.9, 2.46);
      pz(g, 0.14, 0.34, 0.04, lc('#a3171c'), s*(W/2 - 0.1), 1.2, -2.48);
      pz(g, 0.2, 0.16, 0.12, negro, s*(W/2 + 0.05), 1.28, 1.6);
    });
    pz(g, 0.95, 0.16, 0.03, negro, 0, 0.9, 2.465);                            // parrilla
    var em = cil(g, 0.1, 0.1, 0.02, lc('#dfe2e4'), 0, 0.9, 2.49, 20); em.rotation.x = Math.PI/2;
    pz(g, W - 0.1, 0.22, 0.06, negro, 0, 0.42, 2.47);                         // paragolpes
  },
  buzon_paquetes: function(g, m){                                     // atraviesa la pared: asoma 5 cm al camino (+z) y sube por encima
    var W = m.ancho || 1.1, zo = 0.05, o = obraLinde(g, W, zo), ac = lc('#3a3d40');
    pz(g, 0.62, 0.3, 0.04, ac, 0, 1.3, zo + 0.02);                           // trampilla, al camino, por encima de la pared
    pz(g, 0.3, 0.035, 0.03, lc('#b8bcbf'), 0, 1.4, zo + 0.05);
  },
  caseta_contadores: function(g, m){                                  // detrás de la pared, sin asomar al camino
    var W = m.ancho || 1.1, o = obraLinde(g, W, -0.28);
    for(var k=0;k<5;k++) pz(g, 0.5, 0.025, 0.02, lc('#3d4541'), 0, 1.2 + k*0.05, o.z0 - 0.045);   // ventilación de la puerta
  },
  barbacoa_grande: function(g, m){                                    // contra la pared (z = 0, +z fuera); +x, el horno
    var L = m.largo || 4.4, obra = MAT.blanco, piedra = lc('#6f6b66'), negro = lc('#1d1c1b'), madera = lc('#7a5234');
    var xh = L/2 - 0.65, xb = -L/2 + 0.75, xe0 = -L/2 + 1.5, xe1 = L/2 - 1.3;
    // horno de leña: base con leñera, losa y cúpula de barro con la boca en arco
    pz(g, 1.3, 0.95, 1.2, obra, xh, 0.475, 0.6);
    pz(g, 0.9, 0.55, 0.05, negro, xh, 0.36, 1.18);
    pz(g, 1.36, 0.08, 1.26, piedra, xh, 0.99, 0.6);
    var cup = bola(g, 0.58, lc('#b86f47'), xh, 1.03, 0.58, 0.85); cup.scale.z = 0.58;
    var arco = malla(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 18, 1, false, -Math.PI/2, Math.PI), lc('#c98a5e'), g, xh, 1.03, 1.08);
    arco.rotation.x = -Math.PI/2;
    var boca = malla(new THREE.CylinderGeometry(0.19, 0.19, 0.22, 18, 1, false, -Math.PI/2, Math.PI), negro, g, xh, 1.03, 1.1);
    boca.rotation.x = -Math.PI/2;
    cil(g, 0.07, 0.07, 1.0, lc('#3a3a3a'), xh, 1.95, 0.35, 10);
    cil(g, 0.13, 0.08, 0.1, lc('#3a3a3a'), xh, 2.48, 0.35, 10);
    // encimera con armarios de madera
    pz(g, xe1 - xe0, 0.86, 0.66, obra, (xe0 + xe1)/2, 0.43, 0.33);
    pz(g, xe1 - xe0 + 0.04, 0.05, 0.72, piedra, (xe0 + xe1)/2, 0.885, 0.36);
    [0.25, 0.75].forEach(function(f){ pz(g, (xe1 - xe0)/2 - 0.1, 0.62, 0.03, madera, xe0 + (xe1 - xe0)*f, 0.42, 0.675); });
    // barbacoa: hogar, parrilla, campana y chimenea por la pared
    pz(g, 1.5, 0.8, 0.72, obra, xb, 0.4, 0.36);
    pz(g, 0.12, 0.45, 0.72, obra, xb - 0.69, 1.03, 0.36); pz(g, 0.12, 0.45, 0.72, obra, xb + 0.69, 1.03, 0.36);
    pz(g, 1.26, 0.45, 0.1, obra, xb, 1.03, 0.05);
    pz(g, 1.26, 0.04, 0.62, negro, xb, 0.82, 0.37);
    for(var k=0;k<12;k++) pz(g, 0.012, 0.012, 0.6, lc('#5a5a5a'), xb - 0.58 + k*0.105, 0.98, 0.37);
    pz(g, 1.54, 0.08, 0.76, piedra, xb, 1.28, 0.38);
    var gc = new THREE.CylinderGeometry(0.28, 0.95, 0.6, 4, 1); gc.rotateY(Math.PI/4);
    malla(gc, obra, g, xb, 1.62, 0.36).scale.set(1.1, 1, 0.52);
    pz(g, 0.42, 1.75, 0.38, obra, xb, 2.77, 0.19);
    pz(g, 0.56, 0.06, 0.52, piedra, xb, 3.67, 0.19);
  },
  toldo_brazos: function(g, m){                                       // toldo de brazos: caja en la pared, lona hasta +z
    var W = m.ancho || 3.5, S = m.salida || 3, H = m.alto || 2.8, caida = 0.45, bl = lc('#efefea');
    pz(g, W + 0.1, 0.16, 0.2, bl, 0, H + 0.05, 0.1);
    malla(losa4([[-W/2, H, 0.2], [W/2, H, 0.2], [W/2, H - caida, S], [-W/2, H - caida, S]], 0.01), me('lona'), g);
    pz(g, W + 0.04, 0.07, 0.07, bl, 0, H - caida - 0.03, S);
    pz(g, W, 0.22, 0.01, me('lona'), 0, H - caida - 0.15, S + 0.04);          // faldón
    [-1, 1].forEach(function(s){                                     // brazos articulados, con el codo hacia dentro
      var a = new THREE.Vector3(s*(W/2 - 0.25), H - 0.12, 0.2), c = new THREE.Vector3(s*(W/2 - 0.25) - s*0.9, H - caida*0.6, S*0.5),
          b = new THREE.Vector3(s*(W/2 - 0.35), H - caida - 0.05, S - 0.05);
      [[a, c], [c, b]].forEach(function(q){
        var v = q[1].clone().sub(q[0]), br = malla(new THREE.BoxGeometry(0.05, 0.05, v.length()), bl, g);
        br.position.copy(q[0]).add(q[1]).multiplyScalar(0.5); br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.normalize());
      });
    });
  },
  rocalla: function(g, m){                                            // cantos rodados sobre la grava, alrededor del tronco, hasta `radio`
    var r = azarDe(216), mat = [lc('#e9e5dc'), lc('#d6d0c4'), lc('#bdb6a8')], R = m.radio || 2.1, f = R/2.1;
    for(var k=0;k<Math.round(22*f);k++){
      var t = (0.1 + r()*0.16)*Math.max(0.7, f), a = r()*Math.PI*2, d = 0.4 + r()*(R - 0.4 - t);
      var b = bola(g, t, mat[k % 3], Math.cos(a)*d, t*0.35, Math.sin(a)*d, 0.55); b.rotation.y = r()*3;
    }
    [[1.3, 0.4, 0.34], [-1.1, -0.9, 0.28], [0.2, 1.5, 0.3]].forEach(function(q){ bola(g, q[2]*Math.max(0.7, f), mat[2], q[0]*f, q[2]*0.4, q[1]*f, 0.7); });
  },
  vela: function(g, m){                                               // vela de sombra entre tres postes (puntos relativos al centro)
    var P = m.puntos, A = m.altos || [4.5, 4.5, 4.5], acero = lc('#a9adb0');
    var c = P.reduce(function(s, p){ return [s[0] + p[0]/3, s[1] + p[1]/3]; }, [0, 0]);
    var esq = P.map(function(p, i){                                   // la vela acaba 40 cm antes del poste
      var dx = p[0] - c[0], dz = p[1] - c[1], L = Math.hypot(dx, dz), k = (L - 0.4)/L;
      cil(g, 0.06, 0.07, A[i] + 0.3, acero, p[0], (A[i] + 0.3)/2, p[1], 10);
      cil(g, 0.16, 0.16, 0.08, MAT.hormigon, p[0], 0.04, p[1], 12);
      var e = new THREE.Vector3(c[0] + dx*k, A[i] - 0.1, c[1] + dz*k);
      var tr = malla(new THREE.BoxGeometry(0.015, 0.015, 0.4), acero, g); tr.position.set((e.x + p[0])/2, A[i] - 0.05, (e.z + p[1])/2);
      tr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(p[0] - e.x, 0.1, p[1] - e.z).normalize());
      return e;
    });
    var cen = new THREE.Vector3(c[0], (A[0] + A[1] + A[2])/3 - 0.25, c[1]), borde = [], N = 10;
    for(var i=0;i<3;i++){                                             // bordes curvados hacia dentro
      var a = esq[i], b = esq[(i + 1) % 3];
      for(var j=0;j<N;j++){
        var t = j/N, p = a.clone().lerp(b, t), f = 0.09*4*t*(1 - t);
        p.x += (cen.x - p.x)*f*2; p.z += (cen.z - p.z)*f*2; borde.push(p);
      }
    }
    var pos = [];
    for(var k=0;k<borde.length;k++){ var q = borde[k], w = borde[(k + 1) % borde.length]; pos.push(cen.x, cen.y, cen.z, q.x, q.y, q.z, w.x, w.y, w.z); }
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    malla(geo, lam({color:'#efe6d0', emissive:'#6f6858', side:THREE.DoubleSide}), g);   // la lona clarea: por debajo no se ve negra
  },
  voley: function(g, m){                                              // arenero con la pista de 16 × 8 y la red; x a lo largo
    var L = m.largo || 18, A = m.ancho || 10, mad = lc('#8a6a4a'), cinta = lc('#2f6fb3');
    pz(g, L, 0.1, A, MAT.arena, 0, 0.05, 0);
    [-1, 1].forEach(function(s){ pz(g, L + 0.24, 0.16, 0.12, mad, 0, 0.08, s*(A/2 + 0.06)); pz(g, 0.12, 0.16, A, mad, s*(L/2 + 0.06), 0.08, 0); });
    [-1, 1].forEach(function(s){ pz(g, 16, 0.012, 0.05, cinta, 0, 0.106, s*4); pz(g, 0.05, 0.012, 8, cinta, s*8, 0.106, 0); });
    [-1, 1].forEach(function(s){ cil(g, 0.05, 0.05, 2.55, lc('#d8dadb'), 0, 1.33, s*4.9, 10); });
    var red = malla(new THREE.PlaneGeometry(8.6, 1.0), me('red'), g, 0, 1.93, 0); red.rotation.y = Math.PI/2;
    red.geometry.attributes.uv.array.forEach(function(v, i, a){ a[i] = i % 2 ? v*1.0 : v*8.6; });
    pz(g, 0.02, 0.07, 8.6, lc('#f4f4f0'), 0, 2.43, 0); pz(g, 0.02, 0.05, 8.6, lc('#f4f4f0'), 0, 1.43, 0);
    [-1, 1].forEach(function(s){ cil(g, 0.01, 0.01, 1.8, lc('#c8352e'), 0, 2.1, s*4, 6); });
  },
  horno_lena: function(g){                                            // horno de leña de cúpula sobre base de obra, contra la pared (z = 0, +z fuera)
    var obra = MAT.blanco, piedra = lc('#6f6b66'), negro = lc('#1d1c1b');
    pz(g, 1.3, 0.95, 1.2, obra, 0, 0.475, 0.6);
    pz(g, 0.9, 0.55, 0.05, negro, 0, 0.36, 1.18);                            // leñera
    pz(g, 1.36, 0.08, 1.26, piedra, 0, 0.99, 0.6);
    var cup = bola(g, 0.58, lc('#b86f47'), 0, 1.03, 0.58, 0.85); cup.scale.z = 0.58;
    var arco = malla(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 18, 1, false, -Math.PI/2, Math.PI), lc('#c98a5e'), g, 0, 1.03, 1.08);
    arco.rotation.x = -Math.PI/2;
    var boca = malla(new THREE.CylinderGeometry(0.19, 0.19, 0.22, 18, 1, false, -Math.PI/2, Math.PI), negro, g, 0, 1.03, 1.1);
    boca.rotation.x = -Math.PI/2;
    cil(g, 0.07, 0.07, 1.0, lc('#3a3a3a'), 0, 1.95, 0.35, 10);
    cil(g, 0.13, 0.08, 0.1, lc('#3a3a3a'), 0, 2.48, 0.35, 10);
  },
  barbacoa_obra: function(g){                                         // barbacoa de obra exenta: hogar, parrilla, campana y chimenea; +z delante
    var obra = MAT.blanco, piedra = lc('#6f6b66'), negro = lc('#1d1c1b'), W = 1.7, D = 0.8;
    pz(g, W, 0.8, D, obra, 0, 0.4, 0);                                        // base
    pz(g, 0.7, 0.45, 0.04, negro, -0.35, 0.3, D/2 + 0.001);                  // leñera
    pz(g, W + 0.06, 0.06, D + 0.06, piedra, 0, 0.83, 0);                      // encimera
    [-1, 1].forEach(function(s){ pz(g, 0.12, 0.5, D, obra, s*(W/2 - 0.06), 1.11, 0); });   // costados del hogar
    pz(g, W, 0.5, 0.12, obra, 0, 1.11, -D/2 + 0.06);                          // fondo
    pz(g, W - 0.24, 0.04, D - 0.14, negro, 0, 0.88, 0.05);                    // hogar
    for(var k=0;k<14;k++) pz(g, 0.012, 0.012, D - 0.2, lc('#5a5a5a'), -W/2 + 0.2 + k*(W - 0.4)/13, 1.05, 0.05);   // parrilla
    pz(g, W + 0.06, 0.08, D + 0.06, piedra, 0, 1.4, 0);
    var gc = new THREE.CylinderGeometry(0.25, 0.85, 0.55, 4, 1); gc.rotateY(Math.PI/4);
    malla(gc, obra, g, 0, 1.72, 0).scale.set(1.05, 1, 0.55);                   // campana
    pz(g, 0.38, 1.3, 0.38, obra, 0, 2.62, -0.05);                            // chimenea
    pz(g, 0.52, 0.06, 0.52, piedra, 0, 3.3, -0.05);
  },
  canasta: function(g){                                               // tablero y aro de baloncesto en la pared (z = 0, +z fuera); aro a 3,05 m
    var bl = lc('#f4f4f0'), rojo = lc('#c8352e'), neg = lc('#2b2d30'), zt = 0.6;
    [-1, 1].forEach(function(s){                                     // soporte: dos brazos de tubo y la placa en la pared
      pz(g, 0.06, 0.06, zt, neg, s*0.35, 2.95, zt/2); pz(g, 0.05, 0.05, 0.75, neg, s*0.35, 2.7, zt/2 - 0.05).rotation.x = 0.9;
      pz(g, 0.14, 0.5, 0.02, neg, s*0.35, 2.85, 0.01);
    });
    pz(g, 1.2, 0.8, 0.03, bl, 0, 3.2, zt);                                    // tablero
    [[0, 3.58, 1.2, 0.04], [0, 2.82, 1.2, 0.04], [-0.58, 3.2, 0.04, 0.8], [0.58, 3.2, 0.04, 0.8]].forEach(function(q){ pz(g, q[2], q[3], 0.01, neg, q[0], q[1], zt + 0.02); });
    [[0, 3.33, 0.5, 0.03], [0, 3.05, 0.5, 0.03], [-0.235, 3.19, 0.03, 0.3], [0.235, 3.19, 0.03, 0.3]].forEach(function(q){ pz(g, q[2], q[3], 0.01, rojo, q[0], q[1], zt + 0.021); });
    var zc = zt + 0.15 + 0.225;
    pz(g, 0.2, 0.04, 0.16, rojo, 0, 3.05, zt + 0.08);                          // anclaje del aro
    var aro = malla(new THREE.TorusGeometry(0.225, 0.01, 6, 28), rojo, g, 0, 3.05, zc); aro.rotation.x = Math.PI/2;
    var red = malla(new THREE.CylinderGeometry(0.225, 0.14, 0.42, 12, 3, true), lam({color:'#f4f4f0', wireframe:true}), g, 0, 2.84, zc);
  },
  topiario: function(g, m){                                           // boj recortado: bola, cubo o cono
    var v = lam({color:'#3e6a33'}), f = m.forma || 'bola';
    if(f === 'bola') bola(g, 0.4, v, 0, 0.4, 0, 1);
    else if(f === 'cubo'){ pz(g, 0.6, 0.6, 0.6, v, 0, 0.3, 0); pz(g, 0.62, 0.02, 0.62, lam({color:'#4c7c3d'}), 0, 0.6, 0); }
    else malla(new THREE.ConeGeometry(0.34, 1.3, 16), v, g, 0, 0.65, 0);
  },
  palmera: function(g, m){                                            // palmera enana: tronco con anillos y penacho de hojas arqueadas
    var H = m.alto || 1.7, tr = lc('#6d5a45'), an = lc('#5a4a39'), hoja = lc('#4f7a3a');
    cil(g, 0.1, 0.14, H, tr, 0, H/2, 0, 10);
    for(var y=0.2;y<H;y+=0.18) cil(g, 0.125, 0.13, 0.04, an, 0, y, 0, 10);
    for(var k=0;k<14;k++){
      var p = new THREE.Group(); p.position.set(0, H, 0); p.rotation.y = k*Math.PI*2/14 + (k % 2)*0.1; g.add(p);
      var inc = -0.35 + (k % 3)*0.3;                                   // unas más levantadas que otras
      var a = new THREE.Group(); a.rotation.z = inc; p.add(a);
      pz(a, 0.55, 0.012, 0.2, hoja, 0.27, 0, 0);
      var b = new THREE.Group(); b.position.set(0.54, 0, 0); b.rotation.z = -0.55; a.add(b);
      pz(b, 0.5, 0.012, 0.16, hoja, 0.24, 0, 0);
    }
  },
  huerto_vertical: function(g, m){                                    // jardinera escalonada de madera con aromáticas; +z delante; `niveles` (3 o 4); `jazmin`: trepando por detrás y por arriba
    var W = m.ancho || 2.3, mad = lc('#8a6a4a'), osc = lc('#6e5238'), tierra = lc('#5a4030');
    var verdes = ['#5d7458', '#5f9a3e', '#4f8f4a', '#7c8a60', '#4a7f35', '#8a9a7c'].map(function(c){ return lc(c); });
    var r = azarDe(2809), flor = lc('#a58bc9');
    [-1, 1].forEach(function(s){ pz(g, 0.07, 1.75, 0.07, osc, s*(W/2 - 0.035), 0.875, -0.12); pz(g, 0.07, 0.4, 0.07, osc, s*(W/2 - 0.035), 0.2, 0.55); });
    for(var k=0;k<7;k++) pz(g, W, 0.09, 0.02, mad, 0, 0.25 + k*0.22, -0.16);   // listones de atrás
    [[0.3, 0.5], [0.72, 0.33], [1.14, 0.16], [1.56, 0.0]].slice(0, m.niveles || 4).forEach(function(q){    // jardineras escalonadas
      var y = q[0], z = q[1];
      pz(g, W - 0.1, 0.2, 0.26, mad, 0, y, z);
      pz(g, W - 0.16, 0.01, 0.2, tierra, 0, y + 0.1, z);
      for(var x = -W/2 + 0.2; x < W/2 - 0.1; x += 0.26 + r()*0.08){
        bola(g, 0.1 + r()*0.05, verdes[Math.floor(r()*verdes.length)], x, y + 0.16, z + (r()-0.5)*0.06, 1.1 + r()*0.5);
        if(r() < 0.25) bola(g, 0.03, flor, x + 0.04, y + 0.3, z + 0.05, 1);
      }
      if(y < 0.5) [-1, 1].forEach(function(s){ pz(g, 0.05, y - 0.1, 0.05, osc, s*(W/2 - 0.12), (y - 0.1)/2, z); });
    });
    if(m.jazmin){                                                     // jazmín: sube por la cara de atrás y asoma arriba
      var hj = [lc('#3f6a32'), lc('#4b7a3a'), lc('#355c2b')], blanco = lc('#fbfaf4');
      for(var i=0;i<46;i++){
        var x = (r() - 0.5)*(W - 0.1), yy = 0.15 + r()*1.65, zz = -0.2 - r()*0.06;
        if(yy > 1.35) zz = -0.22 + r()*0.26;                            // arriba, en la franja sin aromáticas, también por delante
        bola(g, 0.12 + r()*0.08, hj[i % 3], x, yy, zz, 0.8);
        if(r() < 0.55) bola(g, 0.025, blanco, x + (r()-0.5)*0.12, yy + (r()-0.5)*0.1, zz + (zz < -0.15 ? -0.1 : 0.1), 1);
      }
      pz(g, 0.3, 0.3, 0.3, lc('#9a5a3a'), -W/2 + 0.25, 0.15, -0.42);   // la maceta de barro al pie, por detrás
    }
  },
  kamado: function(g){                                                // kamado de cerámica rojo en su carro con dos baldas; +z delante
    var rojo = brillo('#a8231b', 110), negro = lc('#1d1e20'), acero = lc('#b8bcbf'), bambu = lc('#c9a46a');
    pz(g, 0.62, 0.04, 0.62, negro, 0, 0.12, 0);                               // carro
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){ pz(g, 0.04, 0.42, 0.04, negro, q[0]*0.28, 0.33, q[1]*0.28); cil(g, 0.05, 0.05, 0.04, negro, q[0]*0.28, 0.06, q[1]*0.28, 10).rotation.z = Math.PI/2; });
    pz(g, 0.62, 0.04, 0.62, negro, 0, 0.52, 0);
    bola(g, 0.36, rojo, 0, 0.9, 0, 1.15);                                     // el huevo
    cil(g, 0.365, 0.365, 0.04, acero, 0, 0.98, 0, 24);                        // la junta de la tapa
    cil(g, 0.07, 0.09, 0.08, lc('#5a5c5e'), 0, 1.33, 0, 12);                  // tiro de arriba
    pz(g, 0.2, 0.03, 0.05, acero, 0, 1.08, 0.37);                             // asa
    pz(g, 0.1, 0.07, 0.02, negro, 0, 0.72, 0.35);                             // tiro de abajo
    [-1, 1].forEach(function(s){ pz(g, 0.34, 0.025, 0.4, bambu, s*0.58, 0.98, 0); pz(g, 0.2, 0.02, 0.03, acero, s*0.42, 0.97, 0); });   // baldas
  },
  pergola_plantas: function(g, m){                                    // pérgola sencilla de madera con trepadoras; x ancho, z fondo
    var W = m.ancho || 3.2, D = m.fondo || 2.8, H = 2.4, mad = lc('#7a5a3c'), hoja = [lc('#4d6d35'), lc('#5f7f3e'), lc('#3f5d2d')];
    var flor = lc('#c2307e'), r = azarDe(4711);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){
      pz(g, 0.12, H, 0.12, mad, q[0]*(W/2 - 0.06), H/2, q[1]*(D/2 - 0.06));
      pz(g, 0.24, 0.06, 0.24, MAT.hormigon, q[0]*(W/2 - 0.06), 0.03, q[1]*(D/2 - 0.06));
    });
    [-1, 1].forEach(function(q){ pz(g, W + 0.4, 0.16, 0.08, mad, 0, H + 0.08, q*(D/2 - 0.06)); });   // vigas
    for(var k=0;k<=7;k++) pz(g, 0.06, 0.1, D + 0.3, mad, -W/2 + k*W/7, H + 0.21, 0);                // listones
    // trepadoras: una buganvilla por los dos postes de un lado y otra por uno del otro; arriba, la copa
    [[-1,-1],[-1,1],[1,1]].forEach(function(q){
      var x = q[0]*(W/2 - 0.06), z = q[1]*(D/2 - 0.06);
      for(var y=0.3;y<H;y+=0.32) bola(g, 0.16 + r()*0.08, hoja[Math.floor(r()*3)], x + (r()-0.5)*0.12, y, z + (r()-0.5)*0.12, 1.3);
    });
    for(var i=0;i<26;i++){
      var x = (r() - 0.5)*(W + 0.2), z = (r() - 0.5)*(D + 0.1);
      if(r() < 0.35 && x > 0.3 && z < -0.3) continue;                  // un claro: no cubre del todo
      bola(g, 0.28 + r()*0.2, hoja[i % 3], x, H + 0.32 + r()*0.08, z, 0.45);
      if(r() < 0.6) bola(g, 0.07, flor, x + (r()-0.5)*0.3, H + 0.42, z + (r()-0.5)*0.3, 0.6);
    }
  },
  cubos_reciclaje: function(g, m){                                    // tres cubos cuadrados en fila a lo largo de x, contra la pared (z = 0), tapa a +z
    var W = 0.5, D = 0.55, H = 0.95, osc = lc('#2e3134');
    (m.colores || ['#e3b92b', '#2f6db3', '#3f8a3c']).forEach(function(c, i, t){
      var x = (i - (t.length - 1)/2)*(W + 0.04), col = lc(c);
      pz(g, W, H - 0.05, D, col, x, (H - 0.05)/2, D/2 + 0.02);
      pz(g, W + 0.03, 0.05, D + 0.03, col, x, H - 0.025, D/2 + 0.02);                   // tapa
      pz(g, W*0.5, 0.03, 0.04, osc, x, H - 0.06, D + 0.05);                           // asa de la tapa
      pz(g, W*0.6, 0.18, 0.005, lc('#f4f4f0'), x, H*0.62, D + 0.023);                 // etiqueta
      pz(g, 0.2, 0.04, 0.06, osc, x, 0.06, D + 0.045);                                // pedal
    });
  },
  armario_exterior: function(g, m){                                   // armario de resina de dos puertas, contra la pared (z = 0), abre a +z
    var W = m.ancho || 1.4, H = 1.85, D = 0.6, res = lc('#4b5054'), claro = lc('#5b6166'), osc = lc('#2e3134');
    pz(g, W, 0.06, D, osc, 0, 0.03, D/2);                                     // base
    pz(g, W, H - 0.06, D - 0.04, res, 0, 0.06 + (H - 0.06)/2, D/2 - 0.02);
    pz(g, W + 0.06, 0.06, D + 0.06, osc, 0, H + 0.03, D/2);                   // tapa
    [-1, 1].forEach(function(q){
      var x = q*W/4;
      pz(g, W/2 - 0.03, H - 0.2, 0.02, claro, x, 0.06 + (H - 0.2)/2 + 0.05, D - 0.01);   // hoja
      for(var k=0;k<7;k++) pz(g, W/2 - 0.12, 0.012, 0.01, osc, x, 0.25 + k*0.22, D + 0.005);   // imitación de tablas
      pz(g, 0.03, 0.2, 0.03, osc, q*0.06, 1.0, D + 0.02);                     // tiradores, en el centro
    });
    pz(g, 0.01, H - 0.2, 0.012, osc, 0, 0.06 + (H - 0.2)/2 + 0.05, D);       // junta entre las hojas
  },
  bomba_agua: function(g){                                            // grupo de presión pequeño, en el suelo
    pz(g, 0.34, 0.08, 0.24, lc('#3a3d40'), 0, 0.04, 0);
    var m = cil(g, 0.1, 0.1, 0.24, lc('#2f5f9a'), -0.05, 0.19, 0, 16); m.rotation.z = Math.PI/2;
    cil(g, 0.07, 0.07, 0.1, lc('#b8bcbf'), 0.1, 0.19, 0, 12).rotation.z = Math.PI/2;
    cil(g, 0.02, 0.02, 0.5, lc('#b8bcbf'), 0.12, 0.45, 0, 8);
    cil(g, 0.12, 0.12, 0.3, lc('#c8352e'), 0.02, 0.2, -0.28, 16);          // vaso de expansión
  },
  termo: function(g, m){                                              // termo eléctrico pequeño colgado de la pared (z = 0)
    var y = m.y || 1.6;
    cil(g, 0.19, 0.19, 0.55, MI.blanco, 0, y, 0.21, 20);
    [-1, 1].forEach(function(s){ cil(g, 0.013, 0.013, 0.35, lc('#b8bcbf'), s*0.06, y - 0.43, 0.21, 8); });
    pz(g, 0.08, 0.06, 0.02, lc('#8d9296'), 0, y - 0.1, 0.405);
  },
  descalcificador: function(g){                                       // botella de resina y depósito de sal, junto a la pared (z = 0 delante)
    // bajo, por debajo de 0,95 m
    cil(g, 0.13, 0.13, 0.68, lc('#2f5a86'), 0, 0.34, 0, 20);
    pz(g, 0.24, 0.14, 0.2, lc('#26282a'), 0, 0.75, 0);
    pz(g, 0.45, 0.6, 0.38, lc('#e4e6e3'), -0.4, 0.3, 0.02);
    pz(g, 0.47, 0.04, 0.4, lc('#2f5a86'), -0.4, 0.62, 0.02);
    cil(g, 0.015, 0.015, 0.1, lc('#b8bcbf'), 0, 0.87, -0.08, 8);
  },
  cargador_ve: function(g, m){                                        // wallbox en la pared (+z hacia fuera), con la manguera al coche
    var y = m.y || 1.0, gris = lc('#2b2d30');
    pz(g, 0.26, 0.36, 0.11, lc('#eceeec'), 0, y, 0.055);
    pz(g, 0.2, 0.05, 0.01, lc('#3fb3e8'), 0, y + 0.08, 0.112);
    pz(g, 0.08, 0.12, 0.08, gris, 0, y - 0.24, 0.07);
    if(m.cable){
      var pts = m.cable.map(function(p){ return new THREE.Vector3(p[0], p[1], p[2]); });
      malla(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.013, 6, false), gris, g);
      var e = pts[pts.length - 1]; pz(g, 0.07, 0.07, 0.07, gris, e.x, e.y, e.z);
    }
  },
  farolillo: function(g){                                             // baliza solar de camino
    cil(g, 0.04, 0.05, 0.45, MI.negro, 0, 0.225, 0, 8);
    bombilla(cil(g, 0.06, 0.06, 0.08, lam({color:'#fff3d6'}), 0, 0.49, 0, 8), {fuerza:0.25, alcance:2.5, halo:0.35});
  },
  inodoro: function(g){                                               // inodoro con cisterna baja
    pz(g, 0.36, 0.38, 0.18, MI.loza, 0, 0.62, -0.22);
    cil(g, 0.13, 0.16, 0.4, MI.loza, 0, 0.2, 0.04, 16);
    var t = cil(g, 0.19, 0.19, 0.05, MI.loza, 0, 0.42, 0.06, 20); t.scale.set(1, 1, 1.25);
  }
};
/* ---- piezas de lujo (la mejorada de la casa de ejemplo): deportivos, pérgola bioclimática, helipuerto,
   pádel, jacuzzi, chiringuito, cine, fuente con estatua, sauna y green. Origen en el centro, frente a +z ---- */
Object.assign(MUEBLE, {
  deportivo: function(g, m){                                          // superdeportivo: `estilo` 'cuna' (de aristas) o 'curvas'; morro a +z
    var W = 2.0, pin = brillo(m.pintura || '#f2c200', 110), vid = brillo('#1d242b', 130), negro = lc('#151617'), llanta = brillo('#2b2d30', 80);
    var cuna = m.estilo !== 'curvas';
    var bajo = cuna ? [[-2.25, 0.3], [2.2, 0.24], [2.33, 0.4], [1.1, 0.79], [-2.2, 0.86], [-2.3, 0.55]]
                    : [[-2.3, 0.32], [2.2, 0.27], [2.34, 0.47], [1.6, 0.72], [0.9, 0.8], [-1.6, 0.88], [-2.3, 0.72]];
    var cab = cuna ? [[1.1, 0.78], [0.15, 1.12], [-0.95, 1.11], [-2.2, 0.85]] : [[0.9, 0.79], [0.0, 1.19], [-0.85, 1.17], [-1.7, 0.87]];
    var cri = cuna ? [[1.0, 0.82], [0.17, 1.09], [-0.8, 1.08], [-0.95, 0.86]] : [[0.8, 0.82], [0.02, 1.16], [-0.6, 1.15], [-0.75, 0.9]];
    perfil(g, bajo, W, pin); perfil(g, cab, W - 0.42, pin); perfil(g, cri, W - 0.4, vid);
    [-1, 1].forEach(function(s){
      rueda(g, s*(W/2 - 0.12), 0.34, 1.42, 0.34, s, llanta); rueda(g, s*(W/2 - 0.12), 0.35, -1.38, 0.36, s, llanta);
      pz(g, 0.42, 0.05, 0.05, lc('#f6f6f2'), s*0.6, cuna ? 0.42 : 0.5, 2.27);                  // faros
      pz(g, 0.5, 0.05, 0.04, lc('#c0141c'), s*0.55, cuna ? 0.74 : 0.76, -2.29);               // pilotos
      if(cuna) pz(g, 0.03, 0.22, 0.7, negro, s*(W/2 + 0.004), 0.62, -0.75);                   // tomas de aire
      pz(g, 0.14, 0.08, 0.1, pin, s*(W/2 - 0.12), 0.98, 0.75);                                // retrovisores
    });
    if(cuna){ pz(g, W - 0.15, 0.04, 0.32, negro, 0, 1.02, -2.05); [-1, 1].forEach(function(s){ pz(g, 0.05, 0.16, 0.12, negro, s*0.55, 0.92, -2.05); }); }
    pz(g, 0.9, 0.12, 0.03, negro, 0, 0.32, 2.3);                                              // boca delantera
  },
  pergola_bio: function(g, m){                                        // bioclimática de aluminio: lamas orientables, LED en el marco
    var W = m.ancho || 7, D = m.fondo || 6, H = m.alto || 2.7, al = lc(m.color || '#3a3d40'), led = lc('#fff6e0');
    if(m.suelo) pz(g, W, 0.04, D, lc(m.suelo), 0, 0.02, 0);
    var px = W > 5 ? [-W/2 + 0.08, 0, W/2 - 0.08] : [-W/2 + 0.08, W/2 - 0.08];
    px.forEach(function(x){ [-1, 1].forEach(function(s){ pz(g, 0.15, H, 0.15, al, x, H/2, s*(D/2 - 0.08)); }); });
    [-1, 1].forEach(function(s){ pz(g, W, 0.22, 0.15, al, 0, H + 0.11, s*(D/2 - 0.08)); pz(g, 0.15, 0.22, D, al, s*(W/2 - 0.08), H + 0.11, 0); });
    for(var z = -D/2 + 0.3; z < D/2 - 0.2; z += 0.21) pz(g, W - 0.3, 0.02, 0.19, al, 0, H + 0.12, z).rotation.x = 0.45;
    var tiras = [];
    [-1, 1].forEach(function(s){
      tiras.push(pz(g, W - 0.4, 0.015, 0.03, led, 0, H - 0.005, s*(D/2 - 0.17)));
      tiras.push(pz(g, 0.03, 0.015, D - 0.4, led, s*(W/2 - 0.17), H - 0.005, 0));
    });
    bombilla(tiras, {fuerza:1.0, alcance:9, halo:0, baja:0.5});
  },
  helipuerto: function(g, m){                                         // plataforma con la H, balizas verdes y, salvo helicoptero:false, el helicóptero
    var R = m.radio || 5;
    var tx = lienzoFijo(512, 512, function(c, w, h){
      c.fillStyle = '#3b3e42'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f4f4ef'; c.lineWidth = 14; c.beginPath(); c.arc(w/2, h/2, w*0.36, 0, Math.PI*2); c.stroke();
      c.strokeStyle = '#e8c21a'; c.lineWidth = 8; c.beginPath(); c.arc(w/2, h/2, w*0.47, 0, Math.PI*2); c.stroke();
      c.fillStyle = '#f4f4ef'; c.fillRect(w*0.36, h*0.33, w*0.06, h*0.34); c.fillRect(w*0.58, h*0.33, w*0.06, h*0.34); c.fillRect(w*0.36, h*0.47, w*0.28, h*0.06);
    }, 1, 1);
    cil(g, R, R, 0.15, lam({color:'#ffffff', map:tx}), 0, 0.075, 0, 48);
    var bal = [];
    for(var k = 0; k < 12; k++){ var a = k*Math.PI/6; bal.push(cil(g, 0.07, 0.07, 0.08, lc('#7ce08a'), Math.cos(a)*(R - 0.1), 0.19, Math.sin(a)*(R - 0.1), 8)); }
    bombilla(bal, {tono:'#9dffb0', fuerza:0.4, alcance:4, halo:0.25});
    if(m.helicoptero === false) return;
    var hg = new THREE.Group(); hg.position.set(0, 0.15, 0.6); hg.rotation.y = 0.3; g.add(hg);
    var pin = brillo(m.color || '#13202e', 100), vid = brillo('#2a3a46', 140), gris = lc('#4a4d50');
    var cuerpo = malla(new THREE.SphereGeometry(1, 24, 16), pin, hg, 0, 1.45, 0.4); cuerpo.scale.set(0.95, 0.95, 2.0);
    var cabina = malla(new THREE.SphereGeometry(1, 24, 16), vid, hg, 0, 1.6, 1.55); cabina.scale.set(0.8, 0.7, 0.9);
    var cola = cil(hg, 0.14, 0.3, 4.6, pin, 0, 1.75, -3.6, 12); cola.rotation.x = Math.PI/2;
    pz(hg, 0.06, 1.0, 0.7, pin, 0, 2.2, -5.75); pz(hg, 1.3, 0.05, 0.4, pin, 0, 1.75, -5.4);
    var rc = pz(hg, 0.03, 1.1, 0.1, gris, 0.12, 2.0, -5.85);
    pz(hg, 0.5, 0.25, 0.5, gris, 0, 2.48, 0.2); cil(hg, 0.07, 0.07, 0.35, gris, 0, 2.7, 0.2, 10);
    for(var b = 0; b < 4; b++){ var p = new THREE.Group(); p.position.set(0, 2.88, 0.2); p.rotation.y = b*Math.PI/2 + 0.4; hg.add(p); pz(p, 0.28, 0.03, 5.2, gris, 0, 0, 2.6); }
    [-1, 1].forEach(function(s){
      pz(hg, 0.08, 0.06, 3.4, gris, s*0.9, 0.04, 0.3);
      [-0.6, 1.2].forEach(function(z){ pz(hg, 0.05, 0.75, 0.05, gris, s*0.75, 0.4, z).rotation.z = s*0.35; });
    });
  },
  padel: function(g, m){                                              // pista de pádel de 10 × 20: césped azul, cristal al fondo y malla a los lados
    var W = 10, L = 20, H = 3, mt = lc('#1f1f1f');
    var tx = lienzoFijo(256, 512, function(c, w, h){
      c.fillStyle = m.color || '#2c6aa0'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffffff'; c.lineWidth = 3;
      var k = h/L; [3.05, L - 3.05].forEach(function(z){ c.beginPath(); c.moveTo(0, z*k); c.lineTo(w, z*k); c.stroke(); });
      c.beginPath(); c.moveTo(w/2, 3.05*k); c.lineTo(w/2, (L - 3.05)*k); c.stroke();
      c.strokeRect(1, 1, w - 2, h - 2);
    }, 1, 1);
    var suelo = new THREE.PlaneGeometry(W, L); suelo.rotateX(-Math.PI/2);
    malla(suelo, lam({color:'#ffffff', map:tx}), g, 0, 0.03, 0);
    pz(g, W + 0.4, 0.03, L + 0.4, lc('#7d8288'), 0, 0.015, 0);
    [-1, 1].forEach(function(s){
      malla(caja(W, H, 0.02), MAT.cristal, g, 0, H/2, s*L/2);                                 // fondos de cristal
      [-1, 1].forEach(function(q){
        malla(caja(0.02, H, 4), MAT.cristal, g, q*W/2, H/2, s*(L/2 - 2));                     // laterales de cristal junto al fondo
        var r = new THREE.PlaneGeometry(L - 8, H); r.rotateY(Math.PI/2);
        if(s > 0) malla(r, me('red'), g, q*W/2, H/2, 0);                                       // malla en el centro de los laterales
      });
    });
    for(var x = -W/2; x <= W/2 + 0.01; x += 2.5) [-1, 1].forEach(function(s){ pz(g, 0.08, H + 0.1, 0.08, mt, x, (H + 0.1)/2, s*L/2); });
    for(var z = -L/2; z <= L/2 + 0.01; z += 2) [-1, 1].forEach(function(q){ pz(g, 0.08, H + 0.1, 0.08, mt, q*W/2, (H + 0.1)/2, z); });
    var red = new THREE.PlaneGeometry(W, 0.88); malla(red, me('red'), g, 0, 0.47, 0);
    pz(g, W, 0.05, 0.03, lc('#f4f4ef'), 0, 0.9, 0);
    [-1, 1].forEach(function(q){ pz(g, 0.08, 0.95, 0.08, mt, q*(W/2 + 0.05), 0.47, 0); });
    var focos = [];
    [-1, 1].forEach(function(s){ [-1, 1].forEach(function(q){ pz(g, 0.1, 6, 0.1, mt, q*(W/2 + 0.3), 3, s*(L/2 - 4)); focos.push(pz(g, 0.5, 0.15, 0.35, lc('#f4f4ef'), q*(W/2 - 0.05), 6, s*(L/2 - 4))); }); });
    bombilla(focos, {tono:'neutra', fuerza:1.2, alcance:16, halo:0.8});
  },
  jacuzzi: function(g, m){                                            // jacuzzi redondo de madera con el agua iluminada
    var R = m.radio || 1.1, mad = lc('#7a5a3c');
    cil(g, R + 0.15, R + 0.15, 0.8, mad, 0, 0.4, 0, 32);
    var borde = malla(new THREE.TorusGeometry(R + 0.08, 0.1, 8, 40), lc('#d9d2c3'), g, 0, 0.82, 0); borde.rotation.x = Math.PI/2;
    var agua = cil(g, R, R, 0.02, new THREE.MeshPhongMaterial({color:'#3fb6cc', shininess:140, specular:'#ffffff'}), 0, 0.81, 0, 32);
    bombilla(agua, {tono:'#bff4ff', fuerza:0.5, alcance:4, halo:0});
    for(var k = 0; k < 9; k++){ var a = k*2.4, rr = (k % 3 + 1)*R/4; bola(g, 0.05, lc('#e8fbff'), Math.cos(a)*rr, 0.82, Math.sin(a)*rr, 0.4); }
    pz(g, 0.9, 0.2, 0.45, mad, 0, 0.1, R + 0.35);                                             // peldaño
  },
  chiringuito: function(g, m){                                        // barra de madera bajo una palapa, con botellas y taburetes; +z, los clientes
    var L = m.largo || 3, mad = lc('#8a6a4a'), paja = lc('#c9a868');
    pz(g, L, 1.05, 0.6, mad, 0, 0.525, 0); pz(g, L + 0.2, 0.06, 0.8, lc('#e9e1d0'), 0, 1.08, 0.05);
    pz(g, L, 0.04, 0.35, mad, 0, 1.45, -1.0); pz(g, L, 0.04, 0.35, mad, 0, 1.85, -1.0);
    var col = ['#2d6b3a', '#7a1f2b', '#d8c27a', '#1f3f6b', '#e0e0d8'];
    for(var i = 0; i < 14; i++){ var x = -L/2 + 0.15 + i*(L - 0.3)/13; cil(g, 0.04, 0.04, 0.3, lc(col[i % 5]), x, i % 2 ? 1.62 : 2.02, -1.0, 8); }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(q){ cil(g, 0.08, 0.08, 2.6, mad, q[0]*(L/2 + 0.4), 1.3, q[1]*1.2 - 0.3, 8); });
    malla(new THREE.ConeGeometry(L/2 + 1.4, 1.3, 12), paja, g, 0, 3.2, -0.3);
    for(var k = 0; k < 4; k++){ var t = new THREE.Group(); t.position.set(-L/2 + 0.4 + k*(L - 0.8)/3, 0, 0.75); t.scale.set(1, 1.15, 1); g.add(t); MUEBLE.banqueta(t, {color:'#3a3d40', asiento:'#e9e1d0'}); }
  },
  cine: function(g, m){                                               // pantalla de cine al aire libre y pufs delante (+z)
    var W = m.ancho || 5, H = W*0.56, n = lc('#1d1e20');
    [-1, 1].forEach(function(s){ pz(g, 0.12, H + 1.2, 0.12, n, s*(W/2 + 0.1), (H + 1.2)/2, 0); });
    pz(g, W + 0.3, 0.12, 0.12, n, 0, H + 1.2, 0);
    var tx = lienzoFijo(256, 144, function(c, w, h){
      var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2a65a'); gr.addColorStop(0.6, '#d9566b'); gr.addColorStop(1, '#3b2a5a');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(w*0.5, h*0.62, h*0.18, 0, Math.PI*2); c.fill();
      c.fillStyle = '#1d1b2e'; c.fillRect(0, h*0.7, w, h*0.3);
    }, 1, 1);
    var pl = new THREE.PlaneGeometry(W, H);
    malla(pl, new THREE.MeshBasicMaterial({map:tx}), g, 0, 1.0 + H/2, 0.07);
    var cs = ['#e0c9a2', '#8a9a7b', '#c66b4b', '#efe9df', '#3a5a6b', '#d8b45a'];
    for(var i = 0; i < 6; i++){ var b = bola(g, 0.45, lc(cs[i]), -2.2 + (i % 3)*2.2, 0.3, 4.0 + Math.floor(i/3)*1.6, 0.6); b.scale.z = 0.5; }
  },
  fuente_estatua: function(g, m){                                     // fuente de piedra con una estatua dorada en el centro
    var R = m.radio || 2.2, pi = lc('#d8cfbd'), oro = brillo('#d4af37', 120);
    cil(g, R, R + 0.1, 0.5, pi, 0, 0.25, 0, 40); cil(g, R - 0.2, R - 0.2, 0.02, MAT.agua, 0, 0.42, 0, 40);
    cil(g, 0.45, 0.6, 1.1, pi, 0, 0.55, 0, 20);
    var e = new THREE.Group(); e.position.set(0, 1.1, 0); e.scale.setScalar(1.5); g.add(e);
    [-1, 1].forEach(function(s){ cil(e, 0.07, 0.06, 0.8, oro, s*0.1, 0.4, 0, 10); });
    pz(e, 0.4, 0.6, 0.22, oro, 0, 1.1, 0); bola(e, 0.14, oro, 0, 1.55, 0, 1.1);
    var b1 = cil(e, 0.05, 0.05, 0.75, oro, -0.3, 1.55, 0, 8); b1.rotation.z = 0.5;
    var b2 = cil(e, 0.05, 0.05, 0.75, oro, 0.3, 1.55, 0, 8); b2.rotation.z = -0.5;
    bola(e, 0.12, oro, 0.48, 1.9, 0, 1);                                                      // y una bola dorada en alto, por si acaso
    for(var k = 0; k < 8; k++){ var a = k*Math.PI/4, j = cil(g, 0.02, 0.02, 0.9, new THREE.MeshPhongMaterial({color:'#dff6ff', transparent:true, opacity:0.55}), Math.cos(a)*(R - 0.6), 0.85, Math.sin(a)*(R - 0.6), 6); j.rotation.set(Math.sin(a)*0.35, 0, -Math.cos(a)*0.35); }
  },
  sauna_barril: function(g, m){                                       // sauna de barril de madera, a lo largo de z, con el vidrio a +z
    var R = 1.05, L = m.largo || 2.4, mad = lc('#a8784a'), osc = lc('#5e4630');
    var c = cil(g, R, R, L, mad, 0, R + 0.15, 0, 24); c.rotation.x = Math.PI/2;
    [-L/2 + 0.2, L/2 - 0.2].forEach(function(z){ var a = cil(g, R + 0.03, R + 0.03, 0.06, osc, 0, R + 0.15, z, 24); a.rotation.x = Math.PI/2; });
    var v = cil(g, R*0.85, R*0.85, 0.02, MAT.cristal, 0, R + 0.15, L/2 + 0.01, 24); v.rotation.x = Math.PI/2;
    [-0.6, 0.6].forEach(function(z){ pz(g, 1.6, 0.15, 0.2, osc, 0, 0.075, z); });
    cil(g, 0.08, 0.08, 0.9, lc('#2b2b2a'), 0.5, 2.3, -0.6, 10);
  },
  bandera_golf: function(g){                                          // el hoyo del green: bandera roja y la bola al lado
    cil(g, 0.054, 0.054, 0.01, lc('#111111'), 0, 0.005, 0, 16); cil(g, 0.012, 0.012, 2.1, lc('#f4f4ef'), 0, 1.05, 0, 6);
    pz(g, 0.02, 0.35, 0.5, lc('#d0202a'), 0, 1.9, 0.25); bola(g, 0.021, lc('#ffffff'), 0.4, 0.021, 0.3, 1);
  },
  palmera_alta: function(g, m){                                       // palmera de porte: la enana, a escala
    var s = new THREE.Group(), k = (m.alto || 6)/2.6; s.scale.setScalar(k); g.add(s);
    MUEBLE.palmera(s, {alto:2.6});
  }
});
Object.assign(NOMBRE_MUEBLE, {deportivo:'Superdeportivo', pergola_bio:'Pérgola bioclimática', helipuerto:'Helipuerto', padel:'Pista de pádel',
  jacuzzi:'Jacuzzi', chiringuito:'Chiringuito', cine:'Cine al aire libre', fuente_estatua:'Fuente con estatua dorada',
  sauna_barril:'Sauna de barril', bandera_golf:'Hoyo del green', palmera_alta:'Palmera'});
function construyeMueble(m, padre){
  // fuera de las estancias (jardín, piscina, porches abiertos) el suelo es la cota que diga, o el terreno
  // lo que lleva `mundo` va fuera, en el grupo exterior de su versión y en coordenadas del mundo
  var e = !m.mundo && estanciaEn(m.uv[0], m.uv[1]) || {nombre:'Exterior', cota:0, caja:[-1, -1, 1, 1], techo:{alto:3}};
  var g = new THREE.Group(), q = m.mundo || m.uv;
  g.position.set(q[0], m.cota !== undefined ? m.cota : e.cota, q[1]); g.rotation.y = d2r(m.giro || 0);
  (padre || (m.mundo && G_EXT[V_CONS]) || gInt).add(g);
  var luz = LUMINARIA[m.tipo], n0 = PUNTOS.length;
  LUZ_CTX = {cod:e.codigo || 'EXT', fuera:!e.codigo || !!e.fuera, grupo:m.grupo || (e.codigo ? e.nombre : 'Jardín')};
  MUEBLE[m.tipo](g, m, e);
  LUZ_CTX = null;
  var info = {tipo: m.idea ? 'Propuesta' : luz ? 'Iluminación' : 'Mueble', id:m.id || null, nombre:m.nombre || NOMBRE_MUEBLE[m.tipo] || m.tipo,
              datos:[['Estancia', e.nombre]].concat(m.foto ? [['Foto', textoFoto(m.foto)]] : []),
              nota: m.idea || (m.nuevo ? 'Añadido en el visor; Claude lo pasa a la maqueta.' : m.nota || F.meta.notaMueble || null)};
  if(luz){
    var p = PUNTOS[n0];
    info.datos.push(['Luz', luz + (p && p.fuera ? ' · se enciende con «' + p.grupo + '»' : ' · de noche, al estar dentro')]);
    if(m.ha) info.datos.push(['Home Assistant', m.ha]);
  }
  g.traverse(function(o){ if(o.isMesh) reg(o, info); });
  return {grupo:g, info:info};
}
function construyeMuebles(){ INT.muebles.concat(INT.luces || []).forEach(function(m){ construyeMueble(m); }); }
var G_INT = {}, G_EXT = {};              // el grupo del interior de cada versión, para lo que se añade luego,
VERSIONES.forEach(function(v){           // y el de fuera (en el marco del mundo, a ras de suelo)
  G_EXT[v] = new THREE.Group(); G_EXT[v].position.y = SUELO; capas.exterior.add(G_EXT[v]); GRUPOS_V[v].push(G_EXT[v]);
  C = casaDe(v); INT = C.interior; V_CONS = v;
  var bI = gInt, bC = gCub; gInt = G_INT[v] = grupoV('interior', v); gCub = grupoV('cubierta', v);
  construyeEstancias(); construyeMuebles();
  gInt = bI; gCub = bC;
});
C = C0; INT = C.interior; V_CONS = '';

/* ===================== terreno ===================== */
var P = X.piscina;
var PR = d2r(P.rumbo), EJE_L = [Math.sin(PR), -Math.cos(PR)], EJE_A = [-Math.cos(PR), -Math.sin(PR)];
function enPiscina(a, l){ return [P.centro[0] + a*EJE_A[0] + l*EJE_L[0], P.centro[1] + a*EJE_A[1] + l*EJE_L[1]]; }
var pisMundo = [enPiscina(-P.ancho/2,-P.largo/2), enPiscina(P.ancho/2,-P.largo/2), enPiscina(P.ancho/2,P.largo/2), enPiscina(-P.ancho/2,P.largo/2)];

/* El terreno sigue el lindero real (lindeReal, si lo hay); la parcela oficial va en la capa «catastro». */
var LR = F.lindeReal || F.parcela;
var fuera = new THREE.Mesh(plano([[-600,-600],[600,-600],[600,600],[-600,600]], [LR]), MAT.entorno);
fuera.receiveShadow = true; capas.terreno.add(fuera);
var bajoPad = new THREE.Mesh(plano(LR, [pisMundo]), MAT.entorno); bajoPad.position.y = -0.01;
capas.terreno.add(bajoPad);

var pad = new THREE.Mesh(prisma(LR, [pisMundo].concat(X.rebaje ? [X.rebaje.poly] : []), SUELO), MAT.terreno);
pad.receiveShadow = true; capas.terreno.add(pad);
reg(pad, {tipo:'Parcela', nombre:F.meta.nombre, datos:[
  ['Superficie', areaPoly(F.parcela).toFixed(0)+' m²']
].concat(F.lindeReal ? [['Hasta las lindes reales', areaPoly(LR).toFixed(0)+' m²']] : [], F.fichaParcela || []), nota:F.notaParcela || null});
/* La capa «catastro»: la parcela oficial y la huella del edificio, si los datos las traen */
if(F.huellaCatastral){
  capas.catastro.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(F.parcela.map(function(p){
      return new THREE.Vector3(p[0], SUELO+0.05, p[1]); })), MAT.huella));
  capas.catastro.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(F.huellaCatastral.map(function(p){
      return new THREE.Vector3(p[0], SUELO+0.08, p[1]); })), MAT.huella));
}

/* ===================== exterior ===================== */
var gExt = capas.exterior;
/* Grupo girado en el marco de la piscina: x a lo ancho, z a lo largo. */
function grupoRumbo(padre, centro, rumbo, y){
  var g = new THREE.Group(); g.position.set(centro[0], y||0, centro[1]); g.rotation.y = Math.PI - d2r(rumbo);
  padre.add(g); return g;
}

/* Piedras sueltas (bordes de camino, círculos de piedras, montones) en un solo InstancedMesh. */
var piedras = [], PIEDRAS_IM = null, PIEDRAS_SOLO_ACTUAL = [];
// `de`: la ficha del objeto al que pertenecen (si la mejorada lo quita, se van con él)
function piedrasEn(puntos, tam, jit, y, de){
  puntos.forEach(function(p){ piedras.push([p[0]+(azar()-.5)*jit, p[1]+(azar()-.5)*jit, tam*(0.6+azar()*0.8), y || 0, de]); });
}
/* Una zona del suelo: un plano (o un prisma de `alto`) con su material; y, la altura sobre el padre */
function construyeZona(z, padre, y){
  var poly = z.circulo ? circuloAPoly(z.circulo[0], z.circulo[1], z.circulo[2], 40) : z.poly;
  var info = {tipo:'Zona exterior', id:z.ref || null, nombre:z.nombre, datos:[['Superficie', areaPoly(poly).toFixed(0)+' m²']],
    centro:centroPoly(poly), etiqueta: z.id === 'redondel' || z.sinEtiqueta ? null : z.nombre, alturaEtq:SUELO+0.6,
    nota: z.idea || z.nota || (z.aprox ? 'Posición aproximada.' : null)};
  if(z.idea) info.tipo = 'Propuesta';
  var m = z.alto ? malla(prisma(poly, null, z.alto), [MAT[z.mat], MAT[z.lado || 'paret']], padre, 0, y, 0)
                 : malla(plano(z.piezas ? z.piezas[0] : poly), MAT[z.mat], padre, 0, y, 0);
  reg(m, info);
  (z.piezas || []).slice(1).forEach(function(pz){ reg(malla(plano(pz), MAT[z.mat], padre, 0, y, 0), info); });   // trozos sin el rebaje
  return {poly:poly, info:info};
}
X.zonas.forEach(function(z, i){
  var r = construyeZona(z, gExt, SUELO+0.012+i*0.004), poly = r.poly;
  if(z.banco){                           // banco de piedra: losa sobre dos pies de marès
    var gb = grupoRumbo(gExt, z.banco, P.rumbo, SUELO+0.02), ib = {tipo:'Exterior', nombre:'Banco de piedra', datos:[]};
    reg(malla(caja(0.45, 0.08, 1.2), MAT.roca, gb, 0, 0.46, 0), ib);
    [-0.4, 0.4].forEach(function(zz){ reg(malla(caja(0.4, 0.42, 0.3), MAT.mares, gb, 0, 0.21, zz), ib); });
  }
  if(z.id === 'redondel') piedrasEn(circuloAPoly(z.circulo[0], z.circulo[1], z.circulo[2], 26), 0.28, 0.1, 0, r.info);
});

/* Rebaje de la tierra delante de una acera (X.rebaje): baja con sus escalones y se funde con el terreno. En el
   plano de la casa; la plataforma y la explanada llevan el hueco. Una malla por versión (tierra o grava). */
if(X.rebaje) VERSIONES.forEach(function(v){
  var R = X.rebaje, pf = R.perfil, paso = 0.2;
  var g = function(u){ for(var i=1;i<pf.length;i++) if(u <= pf[i][0]){ var t = (u - pf[i-1][0])/(pf[i][0] - pf[i-1][0]); return pf[i-1][1] + t*(pf[i][1] - pf[i-1][1]); } return pf[pf.length-1][1]; };
  var f = function(w){ if(w <= R.v_acera) return 1; var t = Math.min(1, (w - R.v_acera)/(R.v1 - R.v_acera)); return 1 - t*t*(3 - 2*t); };
  var nu = Math.ceil((R.u1 - R.u0)/paso), nv = Math.ceil((R.v1 - R.v0)/paso), pos = [], uvs = [], idx = [];
  for(var j=0;j<=nv;j++) for(var i=0;i<=nu;i++){
    var u = R.u0 + (R.u1 - R.u0)*i/nu, w = R.v0 + (R.v1 - R.v0)*j/nv;
    pos.push(u, g(u)*f(w), w); uvs.push(u, w);
  }
  for(var j=0;j<nv;j++) for(var i=0;i<nu;i++){ var a = j*(nu+1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx); haciaArriba(geo);
  var gr = grupoV('terreno', v), m = malla(geo, v === 'mejorada' ? MAT.grava_parking : MAT.explanada, gr, 0, 0.012, 0);
  m.receiveShadow = true;
  reg(m, {tipo:'Zona exterior', nombre:'Explanada', datos:[['Rebaje', 'baja con la acera hasta ' + (-Math.min.apply(null, pf.map(function(p){ return p[1]; }))*100).toFixed(0) + ' cm']]});
});

X.caminos.forEach(function(c, i){
  var m = malla(cinta(c.eje, c.ancho, (c.fuera ? 0.02 : SUELO+0.03)+i*0.004), MAT[c.mat], gExt);
  var L = 0; for(var k=1;k<c.eje.length;k++) L += Math.hypot(c.eje[k][0]-c.eje[k-1][0], c.eje[k][1]-c.eje[k-1][1]);
  var mid = c.eje[Math.floor(c.eje.length/2)];
  reg(m, {tipo:'Camino', nombre:c.nombre, datos:[['Longitud', L.toFixed(0)+' m'], ['Ancho', c.ancho.toFixed(1).replace('.',',')+' m']],
    centro:mid, etiqueta: (c.id === 'entrada' || c.id === 'camino_fuera') ? c.nombre : null, alturaEtq:SUELO+0.8});
  var bs = bordes(c.eje, c.ancho/2 + 0.2);
  if(c.piedras){
    // donde el camino entra en la zona «explanada» ya no hay borde: sin piedras
    var expl = (X.zonas.filter(function(z){ return z.id === 'explanada'; })[0] || {}).poly;
    var libre = function(x, z){ return !expl || !enPoligono(expl, x, z); };
    // solo por el lado de fuera: el borde de la casa no lleva piedras
    var cc = aMundo(0, 0), lejos = function(b){ return b.reduce(function(s, p){ return s + Math.hypot(p[0]-cc[0], p[1]-cc[1]); }, 0)/b.length; };
    bs.filter(function(b){ return c.piedras !== 'fuera' || lejos(b) >= Math.max.apply(null, bs.map(lejos)); }).forEach(function(b){
      for(var k=1;k<b.length;k++){
        var n = Math.ceil(Math.hypot(b[k][0]-b[k-1][0], b[k][1]-b[k-1][1])/0.55);
        for(var j=0;j<n;j++){
          var t=j/n, px = b[k-1][0]+(b[k][0]-b[k-1][0])*t, pz = b[k-1][1]+(b[k][1]-b[k-1][1])*t;
          if(azar() < 0.6 && libre(px, pz)) piedrasEn([[px, pz]], 0.15, 0.3);
        }
      }
    });
  }
  if(c.bordillo){                        // bordillos de obra a ambos lados
    // `pasoFinal`: los últimos metros sin bordillo, un paso a cada lado
    if(c.pasoFinal){
      var ej = c.eje.map(function(p){ return p.slice(); }), q = c.pasoFinal;
      while(ej.length > 2 && q > 0){
        var A = ej[ej.length-2], B = ej[ej.length-1], d = Math.hypot(B[0]-A[0], B[1]-A[1]);
        if(d > q){ B[0] -= (B[0]-A[0])*q/d; B[1] -= (B[1]-A[1])*q/d; q = 0; } else { ej.pop(); q -= d; }
      }
      bs = bordes(ej, c.ancho/2 + 0.2);
    }
    bs.forEach(function(b){
      for(var k=1;k<b.length;k++){
        var r = {g:new THREE.Group(), L:Math.hypot(b[k][0]-b[k-1][0], b[k][1]-b[k-1][1])};
        r.g.position.set(b[k-1][0], SUELO, b[k-1][1]); r.g.rotation.y = -Math.atan2(b[k][1]-b[k-1][1], b[k][0]-b[k-1][0]);
        gExt.add(r.g);
        reg(malla(caja(r.L+0.25, c.bordillo, 0.25), MAT.mares, r.g, r.L/2, c.bordillo/2, 0),
          {tipo:'Camino', nombre:'Bordillo de obra', datos:[['Altura', (c.bordillo*100).toFixed(0)+' cm']]});
      }
    });
  }
});
/* Pasos de losa sueltos sobre la tierra */
(X.pasos || []).forEach(function(eje){
  var info = {tipo:'Camino', nombre:'Pasos de losa', datos:[]};
  for(var k=1;k<eje.length;k++){
    var a = eje[k-1], b = eje[k], L = Math.hypot(b[0]-a[0], b[1]-a[1]), n = Math.max(1, Math.round(L/0.75));
    for(var j=(k === 1 ? 0 : 1);j<=n;j++){
      var t = j/n, l = malla(caja(0.62, 0.05, 0.42), MAT.losa, gExt, a[0]+(b[0]-a[0])*t, SUELO+0.02, a[1]+(b[1]-a[1])*t);
      l.rotation.y = -Math.atan2(b[1]-a[1], b[0]-a[0]) + (azar()-0.5)*0.2 + Math.PI/2;
      reg(l, info);
    }
  }
});
var GEO_MONTON = (function(){
  var g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI*2, 0, Math.PI/2), p = g.attributes.position;
  for(var i=0;i<p.count;i++){
    var x=p.getX(i), y=p.getY(i), z=p.getZ(i), k = 1 + 0.12*Math.sin(x*4.1+z*2.3) + 0.08*Math.cos(z*5.7-x);
    p.setXYZ(i, x*k, y*k*(0.8+0.2*Math.sin(x*3+z*3)), z*k);
  }
  g.computeVertexNormals(); return g;
})();
X.sueltos.forEach(function(s){
  if(s.tipo === 'monton'){               // montón de tierra: media esfera deformada
    var mt = malla(GEO_MONTON, MAT.tierra, gExt, s.centro[0], SUELO, s.centro[1]);
    mt.scale.set(s.r, s.alto, s.r*0.85); mt.rotation.y = 0.6;
    if(QUITA.indexOf('monton') >= 0) SOLO_ACTUAL.push(mt);
    reg(mt, {tipo:'Exterior', nombre:'Montón de tierra', datos:[['Diámetro', '≈ '+(2*s.r).toFixed(0)+' m'], ['Alto', '≈ '+s.alto.toFixed(1).replace('.',',')+' m']],
      nota:s.nota || null});
  } else if(s.tipo === 'piedras'){
    for(var i=0;i<22;i++){ var a=azar()*Math.PI*2, r=Math.sqrt(azar())*s.r;
      piedras.push([s.centro[0]+Math.cos(a)*r, s.centro[1]+Math.sin(a)*r, 0.25+azar()*0.35]); }
  } else if(s.tipo === 'monton_piedras'){
    // montón grande de piedras gordas: un núcleo en cono y bolos encima, con su propio azar para no
    // cambiar el del resto de la parcela
    var sem = s.centro[0]*97.3 + s.centro[1]*13.1, rnd = function(){ sem += 1; var x = Math.sin(sem*12.9898)*43758.5453; return x - Math.floor(x); };
    var nucleo = new THREE.ConeGeometry(s.r*0.85, s.alto*0.8, 9, 1); nucleo.translate(0, s.alto*0.4, 0);
    var im0 = {tipo:'Exterior', nombre:'Montón de piedras', datos:[['Diámetro', '≈ '+(2*s.r).toFixed(1).replace('.',',')+' m'], ['Alto', '≈ '+s.alto.toFixed(1).replace('.',',')+' m']],
      nota:s.nota || null};
    var mc = reg(malla(nucleo, MAT.roca, gExt, s.centro[0], SUELO, s.centro[1]), im0); mc.scale.z = s.alargado || 1; mc.rotation.y = s.giro || 0;
    var nb = Math.round(s.r*s.r*9);
    for(var i=0;i<nb;i++){
      var a = rnd()*Math.PI*2, rr = Math.sqrt(rnd())*s.r, tam = 0.3 + rnd()*0.35;
      var lx = Math.cos(a)*rr, lz = Math.sin(a)*rr*(s.alargado || 1), gy = s.giro || 0;
      var x = s.centro[0] + lx*Math.cos(gy) + lz*Math.sin(gy), z = s.centro[1] - lx*Math.sin(gy) + lz*Math.cos(gy);
      piedras.push([x, z, tam, Math.max(0, s.alto*(1 - rr/s.r)*(0.75 + rnd()*0.3) - tam*0.4), im0]);
    }
  } else if(s.tipo === 'lena'){
    var g = grupoRumbo(gExt, s.centro, s.rumbo, SUELO);
    if(QUITA.indexOf('lena') >= 0) SOLO_ACTUAL.push(g);
    for(var k=0;k<24;k++){
      var tr = malla(new THREE.CylinderGeometry(0.07,0.08,s.dims[1],6), MAT.lena, g,
        -s.dims[0]/2 + (k%8)*s.dims[0]/8 + 0.15, 0.08 + Math.floor(k/8)*0.15, 0);
      tr.rotation.x = Math.PI/2;
    }
  }
});

function enPoligono(poly, x, z){
  var dentro = false;
  for(var i=0, j=poly.length-1; i<poly.length; j=i++){
    var a = poly[i], b = poly[j];
    if((a[1] > z) !== (b[1] > z) && x < (b[0]-a[0])*(z-a[1])/(b[1]-a[1]) + a[0]) dentro = !dentro;
  }
  return dentro;
}
/* Borde de la tierra junto a la piscina (piscina.tierraBorde): piedras sueltas una tras otra; donde hay
   escalera, el borde se abre */
(function(){
  var b = X.piscina.tierraBorde || [], hp = X.piscina.plataforma.alto, esc = X.piscina.escalerasTierra || [];
  var escM = FM && FM.exterior && FM.exterior.escaleras || [];      // las de la mejorada
  var libre = function(x, z, lista){ return lista.every(function(e){ return Math.hypot(x-e.centro[0], z-e.centro[1]) > e.ancho/2 + 0.55; }); };
  for(var k=1;k<b.length;k++){
    var n = Math.ceil(Math.hypot(b[k][0]-b[k-1][0], b[k][1]-b[k-1][1])/0.42);
    for(var q=0;q<n;q++){
      var t = q/n, x = b[k-1][0]+(b[k][0]-b[k-1][0])*t, z = b[k-1][1]+(b[k][1]-b[k-1][1])*t;
      // donde abre una escalera de la mejorada, la piedra solo sale en la actual (misma tirada de azar)
      if(libre(x, z, esc)) piedrasEn([[x, z]], 0.2, 0.18, hp, libre(x, z, escM) ? undefined : 'soloActual');
    }
  }
  // escaleras de hormigón: dos peldaños bajando hacia fuera y dos piedras grandes a cada lado
  esc.forEach(function(e){ escaleraTierra(e, capas.piscina, SUELO, {tipo:'Exterior', nombre:'Escalera de hormigón',
    nota:e.nota || 'Con dos piedras grandes a cada lado.'}); });
  escM.forEach(function(e){ escaleraTierra(e, G_EXT.mejorada, 0, {tipo:'Propuesta', id:e.ref || null, nombre:e.nombre || 'Escalera de hormigón', nota:e.idea || null}); });
  function escaleraTierra(e, padre, y0, base){
    var g = new THREE.Group(); g.position.set(e.centro[0], y0, e.centro[1]);
    g.rotation.y = -Math.atan2(e.dir[1], e.dir[0]); padre.add(g);
    var info = Object.assign({datos:[['Ancho', e.ancho.toFixed(1).replace('.',',')+' m'], ['Baja', (hp*100).toFixed(0)+' cm']]}, base);
    [[hp*2/3, 0.16], [hp/3, 0.48]].forEach(function(p){ reg(malla(caja(0.34, p[0], e.ancho), MAT.hormigon, g, p[1], p[0]/2, 0), info); });
    reg(malla(caja(0.3, hp, e.ancho), MAT.hormigon, g, -0.13, hp/2, 0), info);         // el rellano, contra la tierra
    [-1, 1].forEach(function(sd){
      [[0.0, 0.42], [0.5, 0.36]].forEach(function(q, i){
        var m = reg(malla(new THREE.DodecahedronGeometry(1, 0), MAT.roca, g, q[0], q[1]*0.55, sd*(e.ancho/2 + 0.3 + i*0.05)), info);
        m.scale.set(q[1]*1.1, q[1]*0.8, q[1]*0.95); m.rotation.set(0.4*sd, 0.9*i + 0.3, 0.2);
      });
    });
  }
})();

(function(){
  var g = new THREE.DodecahedronGeometry(1, 0), im = PIEDRAS_IM = new THREE.InstancedMesh(g, MAT.roca, piedras.length);
  var o = new THREE.Object3D(), col = new THREE.Color();
  piedras.forEach(function(p, i){
    o.position.set(p[0], SUELO + p[3] + p[2]*0.25, p[1]);
    o.rotation.set(azar()*3, azar()*3, azar()*3);
    o.scale.set(p[2]*(0.8+azar()*0.5), p[2]*0.6, p[2]*(0.8+azar()*0.5)); o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    im.setColorAt(i, col.set('#ffffff').offsetHSL(0, 0, (azar()-.5)*0.15));
    if(p[4] === 'soloActual') PIEDRAS_SOLO_ACTUAL.push([i, o.matrix.clone()]);
  });
  gExt.add(im);
})();
/* Las piedras que solo son de la actual (donde la mejorada abre una escalera): se esconden en la otra */
function piedrasDeVersion(v){
  if(!PIEDRAS_SOLO_ACTUAL.length) return;
  var cero = new THREE.Matrix4().makeScale(0, 0, 0);
  PIEDRAS_SOLO_ACTUAL.forEach(function(q){ PIEDRAS_IM.setMatrixAt(q[0], v === 'actual' ? q[1] : cero); });
  PIEDRAS_IM.instanceMatrix.needsUpdate = true;
}

/* Rampas: una cinta con pendiente siguiendo el eje [x, z, altura], con sus costados hasta el suelo */
(X.rampas || []).forEach(function(rp){
  var e = rp.eje, w = rp.ancho/2, pos = [], idx = [];
  var borde = function(i){
    var a = e[Math.max(0, i-1)], b = e[Math.min(e.length-1, i+1)], dx = b[0]-a[0], dz = b[1]-a[1], L = Math.hypot(dx, dz);
    return [-dz/L*w, dx/L*w];
  };
  e.forEach(function(p, i){
    var n = borde(i), y = SUELO + p[2] + 0.02;
    pos.push(p[0]+n[0], y, p[1]+n[1],  p[0]-n[0], y, p[1]-n[1],  p[0]+n[0], SUELO-0.02, p[1]+n[1],  p[0]-n[0], SUELO-0.02, p[1]-n[1]);
    if(i){ var o = (i-1)*4, q = i*4;
      idx.push(o, q, o+1,  o+1, q, q+1);                       // arriba
      idx.push(o+2, q+2, o, o, q+2, q);                         // costado izquierdo
      idx.push(o+1, q+1, o+3, o+3, q+1, q+3);                   // costado derecho
    }
  });
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  var L = 0; for(var k=1;k<e.length;k++) L += Math.hypot(e[k][0]-e[k-1][0], e[k][1]-e[k-1][1]);
  var m = malla(g, lam({color:'#c4bcae', side:THREE.DoubleSide}), capas.piscina);
  reg(m, {tipo:'Exterior', nombre:rp.nombre, datos:[['Largo', L.toFixed(1).replace('.',',')+' m'], ['Ancho', rp.ancho.toFixed(1).replace('.',',')+' m'],
    ['Sube', (e[e.length-1][2]*100).toFixed(0)+' cm']], nota:rp.nota || null});
});

/* Lindes: cerramientos según el tramo. Encima de cada muro, en todo el perímetro, una rejilla de
   simple torsión de 1,2 m con postes cada 5 m. */
var LINDE = {
  paret:        {base:['paret',1.1,0.6]},
  paret_canizo: {base:['paret',1.0,0.6]},
  bloque_canizo:{base:['bloque',1.0,0.2]},
  mares_malla:  {base:['mares',0.9,0.25]},
  mares_brezo:  {base:['mares',0.9,0.25]}
};
var NOMBRE_LINDE = {paret:'Pared seca con rejilla', paret_canizo:'Pared seca con rejilla', bloque_canizo:'Muro de bloque con rejilla',
  mares_malla:'Muro de marès con rejilla', mares_brezo:'Muro de marès con rejilla'};
var REJILLA = {alto:1.2, postes:5};
var TEX_REJILLA = lienzo(128, 128, function(g, w, h){       // rombos de ~5 cm, alambre verde
  g.clearRect(0, 0, w, h); g.strokeStyle = '#4f6b4c'; g.lineWidth = 2.2;
  for(var k=-4;k<=8;k++){
    g.beginPath(); g.moveTo(k*w/4, 0); g.lineTo(k*w/4 + w, h); g.stroke();
    g.beginPath(); g.moveTo(k*w/4, h); g.lineTo(k*w/4 + w, 0); g.stroke();
  }
}, 0.2, 0.2);
var MAT_REJILLA = lam({map:TEX_REJILLA, transparent:true, alphaTest:0.35, side:THREE.DoubleSide});
var MAT_POSTE = lam({color:'#3f5a3e'});
var SIN_REJILLA = FM && FM.exterior && FM.exterior.sinRejilla || [];
X.lindes.forEach(function(t){
  var e = LINDE[t.tipo], n = LR.length;
  for(var i=t.desde; i<t.hasta; i++){
    var p = LR[i%n], q = LR[(i+1)%n];
    var L = Math.hypot(q[0]-p[0], q[1]-p[1]);
    var g = new THREE.Group(); g.position.set(p[0], SUELO, p[1]); g.rotation.y = -Math.atan2(q[1]-p[1], q[0]-p[0]); gExt.add(g);
    // el muro va por dentro de la linde
    var b = e.base, off = b[2]/2;
    var info = {tipo:'Linde', nombre:NOMBRE_LINDE[t.tipo], datos:[['Tramo', L.toFixed(0)+' m'], ['Altura', (b[1] + REJILLA.alto).toFixed(1).replace('.',',')+' m'],
      ['Rejilla', REJILLA.alto.toFixed(1).replace('.',',')+' m, postes cada '+REJILLA.postes+' m']]};
    reg(malla(caja(L, b[1], b[2]), MAT[b[0]], g, L/2, b[1]/2, off), info);
    // rejilla sobre el muro: un paño con la textura en metros, y postes de tubo verde cada 5 m. Los
    // trozos que quita la mejorada (FM.exterior.sinRejilla) van aparte, con su ID
    var trozos = [[0, L, null]];
    SIN_REJILLA.filter(function(c){ return c.tramo === i; }).forEach(function(c){
      var ux = (q[0]-p[0])/L, uz = (q[1]-p[1])/L, t = function(w){ return (w[0]-p[0])*ux + (w[1]-p[1])*uz; };
      var a = Math.min(t(c.desde), t(c.hasta)), bb = Math.max(t(c.desde), t(c.hasta)), r = trozos.pop();
      trozos.push([r[0], a, null], [a, bb, {tipo:'Linde', id:c.ref, nombre:c.nombre || 'Rejilla', datos:[]}], [bb, r[1], null]);
    });
    trozos.forEach(function(tz){
      var l = tz[1] - tz[0], pg = new THREE.PlaneGeometry(l, REJILLA.alto), uvr = pg.attributes.uv;
      for(var j=0;j<uvr.count;j++) uvr.setXY(j, tz[0] + uvr.getX(j)*l, uvr.getY(j)*REJILLA.alto);
      var rj = malla(pg, MAT_REJILLA, g, tz[0] + l/2, b[1] + REJILLA.alto/2, off); rj.userData.sinSombra = true;
      var al = malla(caja(l, 0.012, 0.012), MAT_POSTE, g, tz[0] + l/2, b[1] + REJILLA.alto, off);   // alambre de arriba
      if(tz[2]){ reg(rj, tz[2]); reg(al, tz[2]); }
    });
    var np = Math.max(1, Math.round(L/REJILLA.postes));
    for(var k=0;k<=np;k++) malla(new THREE.CylinderGeometry(0.022, 0.022, REJILLA.alto+0.05, 6), MAT_POSTE, g, k*L/np, b[1] + (REJILLA.alto+0.05)/2, off);
  }
});

/* Paredes secas sueltas */
(X.tapias || []).forEach(function(t){
  var info = {tipo:'Exterior', nombre:t.nombre, datos:[['Alto', t.alto.toFixed(2).replace('.',',')+' m']], nota:t.nota || null};
  for(var k=1;k<t.puntos.length;k++){
    var p = t.puntos[k-1], q = t.puntos[k], L = Math.hypot(q[0]-p[0], q[1]-p[1]);
    var g = new THREE.Group(); g.position.set(p[0], SUELO, p[1]); g.rotation.y = -Math.atan2(q[1]-p[1], q[0]-p[0]); gExt.add(g);
    reg(malla(caja(L+t.grueso*0.5, t.alto, t.grueso), MAT[t.mat || 'paret'], g, L/2, t.alto/2, 0), info);
    if(!t.mat) malla(caja(L+t.grueso*0.5, 0.08, t.grueso*0.8), MAT.paret, g, L/2, t.alto+0.03, 0);   // albardilla de piedra
  }
});

/* Portón corredero y pilares de marès */
(function(){
  if(!X.porton) return;
  var p = X.porton, a = p.a, b = p.b, L = Math.hypot(b[0]-a[0], b[1]-a[1]);
  var g = new THREE.Group(); g.position.set(a[0], SUELO, a[1]); g.rotation.y = -Math.atan2(b[1]-a[1], b[0]-a[0]); gExt.add(g);
  var info = {tipo:'Entrada', nombre:'Portón corredero', datos:[['Luz', L.toFixed(1).replace('.',',')+' m'], ['Alto', p.alto.toFixed(1).replace('.',',')+' m']],
    centro:[(a[0]+b[0])/2, (a[1]+b[1])/2], etiqueta:'Portón', alturaEtq:SUELO+2.8};
  // la hoja corre por dentro (-z), detrás de los pilares, sobre un carril; se abre hacia a (-x), hacia la
  // esquina, y el motor queda ahí, detrás del pilar
  var zh = -(p.pilar/2 + 0.1), Lh = L + 0.3, xh = L/2 - (p.abierta ? L + 0.25 : 0);
  var hoja = new THREE.Group(); hoja.position.set(xh, 0, zh); g.add(hoja);
  reg(malla(caja(Lh, p.alto, 0.06), lam({color:'#7d8285'}), hoja, 0, p.alto/2+0.05, 0), info);   // gris
  for(var i=0;i<=12;i++) malla(caja(0.04, p.alto, 0.08), MAT.hierro, hoja, -Lh/2 + Lh*i/12, p.alto/2+0.05, 0);
  malla(caja(2*L + 0.6, 0.03, 0.06), MAT.hierro, g, -0.15, 0.015, zh);                     // carril
  var gris = lam({color:'#5d6166'});
  reg(malla(caja(0.3, 0.32, 0.22), gris, g, -0.3, 0.16, zh - 0.2), {tipo:'Entrada', nombre:'Motor del portón', datos:[]});
  malla(caja(0.32, 0.03, 0.24), lam({color:'#44474b'}), g, -0.3, 0.335, zh - 0.2);
  [-p.pilar/2, L+p.pilar/2].forEach(function(x){
    reg(malla(caja(p.pilar, p.pilarAlto, p.pilar), MAT.mares, g, x, p.pilarAlto/2, 0), info);
    malla(caja(p.pilar+0.14, 0.12, p.pilar+0.14), MAT.mares, g, x, p.pilarAlto+0.06, 0);
    malla(new THREE.ConeGeometry(p.pilar*0.55, 0.3, 4), MAT.mares, g, x, p.pilarAlto+0.27, 0).rotation.y = Math.PI/4;
  });
})();

/* Placas solares en el suelo; y0, la altura del suelo en el padre */
function construyePlacas(pl, padre, y0){
  var inc = d2r(pl.inclinacion), n = 0;
  var info = {tipo:pl.idea ? 'Propuesta' : 'Energía', id:pl.ref || null, nombre:'Campo fotovoltaico', datos:[], etiqueta:'Placas', alturaEtq:SUELO+2.4,
    nota:pl.idea || pl.nota || null};
  pl.filas.forEach(function(f){
    var L = Math.hypot(f.hasta[0]-f.desde[0], f.hasta[1]-f.desde[1]);
    var g = new THREE.Group(); g.position.set(f.desde[0], y0, f.desde[1]);
    g.rotation.y = -Math.atan2(f.hasta[1]-f.desde[1], f.hasta[0]-f.desde[0]); padre.add(g);
    // el eje z local mira al sur si la fila va de O a E
    for(var i=0;i<f.n;i++){
      var cota = f.cota !== undefined ? f.cota : pl.cota;   // una mesa de varias filas: cada una, a su altura
      var x = (i+0.5)*L/f.n, pz = pl.panel[1]/2*Math.cos(inc), py = cota + pl.panel[1]/2*Math.sin(inc);
      var m = reg(malla(new THREE.BoxGeometry(pl.panel[0]-0.03, 0.04, pl.panel[1]), MAT.fv, g, x, py, 0), info);
      m.rotation.x = inc;                  // borde norte arriba: miran al sur
      if(i % 2 === 0){
        // los pies también llevan la ficha: si la mejorada quita las placas, se van con ellas
        reg(malla(caja(0.05, cota+pl.panel[1]*Math.sin(inc), 0.05), MAT.metal, g, x, (cota+pl.panel[1]*Math.sin(inc))/2, -pz+0.1), info);
        reg(malla(caja(0.05, cota, 0.05), MAT.metal, g, x, cota/2, pz-0.1), info);
      }
      n++;
    }
    reg(malla(caja(L, 0.05, 0.05), MAT.metal, g, L/2, (f.cota !== undefined ? f.cota : pl.cota)+0.02, pl.panel[1]/2*Math.cos(inc)-0.1), info);
    info.centro = [f.desde[0], f.desde[1]];
  });
  info.datos.push(['Módulos', n], ['Filas', pl.filas.length], ['Inclinación', pl.inclinacion+'°'],
    ['Superficie', (n*pl.panel[0]*pl.panel[1]).toFixed(0)+' m²']);
}
if(X.placas) construyePlacas(X.placas, gExt, SUELO);
/* Lo de fuera que solo tiene la mejorada: zonas y placas, en su grupo exterior (ya a ras de suelo) */
if(FM && FM.exterior){
  (FM.exterior.zonas || []).forEach(function(z, i){ construyeZona(z, G_EXT.mejorada, (z.cota || 0) + (z.alto ? 0 : 0.026) + 0.001*i); });
  (FM.exterior.caminos || []).forEach(function(c, i){
    reg(malla(cinta(c.eje, c.ancho, 0.04 + 0.002*i), MAT[c.mat], G_EXT.mejorada),
      {tipo:'Propuesta', id:c.ref || null, nombre:c.nombre, datos:[['Ancho', c.ancho.toFixed(1).replace('.',',')+' m']], nota:c.idea || null});
  });
  if(FM.exterior.placas) construyePlacas(FM.exterior.placas, G_EXT.mejorada, 0);
}
/* Aceras de piedra con bordillo y canales del tejado (mejorada), en el plano de la casa */
if(FM && FM.exterior && FM.exterior.aceras){
  // losas de piedra caliza en hiladas de largo variable, con su junta; la textura cubre 1,2 × 1,2 m
  var LOSA_PIEDRA = lienzo(256, 256, function(g, w, h){
    g.fillStyle = '#9d9483'; g.fillRect(0, 0, w, h);
    var filas = 4, fh = h/filas;
    for(var f=0; f<filas; f++){
      var x = -azar()*60;
      while(x < w){
        var lw = 50 + azar()*70, luz = 70 + azar()*10, tono = 36 + azar()*8;
        g.fillStyle = 'hsl('+tono+',18%,'+luz+'%)'; g.fillRect(x+2, f*fh+2, lw-4, fh-4);
        for(var k=0;k<25;k++){ g.fillStyle = 'rgba('+(azar()<.5?'90,80,65':'250,245,235')+','+(azar()*0.15)+')';
          g.fillRect(x+2+azar()*(lw-6), f*fh+2+azar()*(fh-6), 1+azar()*4, 1+azar()*4); }
        if(x + lw > w){ g.fillStyle = 'hsl('+tono+',18%,'+luz+'%)'; g.fillRect(x+2-w, f*fh+2, lw-4, fh-4); }   // que empalme
        x += lw;
      }
    }
  }, 1.2, 1.2);
  var mPiedra = lam({color:'#ffffff', map:LOSA_PIEDRA}), mBordillo = lam({color:'#d9d2c3'});
  var gAc = grupoV('muros', 'mejorada');
  FM.exterior.aceras.forEach(function(a){
    var k = a.caja, info = {tipo:'Propuesta', id:a.ref || null, nombre:a.nombre, nota:a.idea || null,
      datos:[['Superficie', areaPoly(cajaAPoly(k)).toFixed(1).replace('.',',')+' m²'], ['Altura', (a.alto*100).toFixed(0)+' cm']]};
    var b0 = a.base || 0;
    reg(malla(prisma(cajaAPoly(k), null, a.alto - b0), [mPiedra, mBordillo], gAc, 0, b0, 0), info);
    var cu = (k[0]+k[2])/2, cv = (k[1]+k[3])/2, e = 0.12, hb = a.alto + 0.03 - b0;
    (a.bordillo || []).forEach(function(b){                       // por dentro del borde, 3 cm más alto que la acera
      var L = Math.hypot(b[2]-b[0], b[3]-b[1]), hor = Math.abs(b[3]-b[1]) < 0.01, mu = (b[0]+b[2])/2, mv = (b[1]+b[3])/2;
      if(hor) mv += (cv > mv ? 1 : -1)*e/2; else mu += (cu > mu ? 1 : -1)*e/2;
      reg(malla(hor ? caja(L, hb, e) : caja(e, hb, L), mBordillo, gAc, mu, b0 + hb/2, mv), info);
    });
  });
}
if(FM && FM.exterior && FM.exterior.canales){
  var gCa = grupoV('cubierta', 'mejorada'), zinc = lam({color:'#9ea3a6', side:THREE.DoubleSide});
  var tubo = function(g, a, b, r, info){                              // tubo recto de a a b
    var d = new THREE.Vector3().subVectors(b, a), L = d.length();
    var m = malla(new THREE.CylinderGeometry(r, r, L, 10), zinc, g, (a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return reg(m, info);
  };
  FM.exterior.canales.forEach(function(c){
    var L = c.u1 - c.u0, info = {tipo:'Propuesta', id:c.ref || null, nombre:c.nombre, nota:c.idea || null,
      datos:[['Longitud', L.toFixed(1).replace('.',',')+' m'], ['Material', 'zinc']]};
    var ge = new THREE.CylinderGeometry(0.07, 0.07, L, 14, 1, true, Math.PI, Math.PI); ge.rotateZ(Math.PI/2);   // media caña abierta arriba
    reg(malla(ge, zinc, gCa, (c.u0+c.u1)/2, c.y, c.v), info);
    [c.u0, c.u1].forEach(function(u){ var t = malla(new THREE.CircleGeometry(0.07, 14, Math.PI, Math.PI), zinc, gCa, u, c.y, c.v); t.rotation.y = Math.PI/2; });
    for(var u=c.u0+0.4; u<c.u1; u+=0.9) reg(malla(caja(0.03, 0.02, 0.2), zinc, gCa, u, c.y - 0.06, c.v - 0.06), info);   // ganchos
    if(!c.bajante) return;                                            // vierte en la bajante de otro tramo
    // bajante: sale del fondo de la canal, codo hacia la pared y baja hasta la acera, con zapata
    var bu = c.bajante[0], bv = c.bajante[1], V = THREE.Vector3;
    var p0 = new V(c.salida, c.y - 0.05, c.v), p1 = new V(c.salida, c.y - 0.3, c.v), p2 = new V(bu, c.y - 0.75, bv), p3 = new V(bu, 0.3, bv), p4 = new V(bu, 0.14, bv + 0.14);
    [[p0, p1], [p1, p2], [p2, p3], [p3, p4]].forEach(function(t){ tubo(gCa, t[0], t[1], 0.045, info); });
    [p1, p2, p3].forEach(function(p){ malla(new THREE.SphereGeometry(0.045, 10, 8), zinc, gCa, p.x, p.y, p.z); });
    [1.0, 1.8].forEach(function(y){ malla(caja(0.1, 0.03, 0.06), zinc, gCa, bu, y, bv - 0.04); });   // abrazaderas
  });
}

/* Farolas */
/* Farolas: puntos de luz de fuera, cada una con su grupo del panel */
X.farolas.forEach(function(f){
  var x = f.mundo[0], z = f.mundo[1], ctx = {cod:'EXT', fuera:true, grupo:f.grupo};
  var datos = function(d){ return d.concat([['Luz', 'se enciende con «' + f.grupo + '»']]); };
  // el palo y la bola comparten ficha: así se eligen y se mueven juntos
  if(f.tipo === 'globo'){
    var ig = {tipo:'Iluminación', id:f.id, nombre:'Farola de globo', datos:datos([['Altura', '2,6 m']])};
    reg(malla(new THREE.CylinderGeometry(0.04,0.06,2.3,8), MAT.hierro, gExt, x, SUELO+1.15, z), ig);
    bombilla(reg(malla(new THREE.SphereGeometry(0.2,16,10), MAT.globo, gExt, x, SUELO+2.45, z), ig),
             Object.assign({fuerza:0.9, alcance:9, halo:1.1}, ctx));
  } else if(f.tipo === 'farolillo'){
    var il = {tipo:'Iluminación', id:f.id, nombre:'Farolillo del camino', datos:datos([])};
    reg(malla(caja(0.12, 0.35, 0.12), MAT.hierro, gExt, x, SUELO+0.5+0.17, z), il);
    bombilla(reg(malla(caja(0.18, 0.2, 0.18), MAT.globo, gExt, x, SUELO+0.5+0.45, z), il),
             Object.assign({fuerza:0.4, alcance:4, halo:0.6}, ctx));
  } else if(f.tipo === 'piscina'){
    // foco empotrado en la pared del vaso, bajo el agua, mirando al centro; encendido, el agua brilla
    var yF = SUELO + P.plataforma.alto - 0.14 - 0.45;
    var is = {tipo:'Iluminación', id:f.id, nombre:'Foco de la piscina', datos:datos([['Luz', 'blanca, bajo el agua']])};
    var geo = new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24); geo.rotateX(Math.PI/2);
    var lente = reg(malla(geo, lam({color:'#dfe6ea'}), gExt, x, yF, z), is);
    lente.lookAt(f.hacia[0], yF, f.hacia[1]);
    bombilla(lente, Object.assign({tono:'#ffffff', fuerza:1.2, alcance:8, halo:0.9, baja:-0.6, frente:1.2,
      alEncender:function(){
        var n = PUNTOS.filter(function(q){ return q.on && q.mallas[0].userData.info && q.mallas[0].userData.info.nombre === 'Foco de la piscina'; }).length;
        MAT.agua.emissive.set('#d8f8ff');   // luz blanca, no cian MAT.agua.emissiveIntensity = n ? 0.25 + 0.2*n : 0;
      }}, ctx));
  } else if(f.tipo === 'foco_viga'){
    // foco de superficie atornillado bajo una viga, con la boca hacia abajo; `y`, la cara de la viga
    var iv = {tipo:'Iluminación', id:f.id, nombre:'Foco de la pérgola', datos:datos([['Altura', (f.y || 3).toFixed(1).replace('.', ',') + ' m']])};
    var yv = SUELO + (f.y || 3.0);
    reg(malla(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 16), lam({color:'#f0f0ec'}), gExt, x, yv - 0.055, z), iv);
    bombilla(reg(malla(new THREE.CylinderGeometry(0.042, 0.042, 0.006, 16), lam({color:'#f4f1ea'}), gExt, x, yv - 0.113, z), iv),
             Object.assign({tono:'neutra', fuerza:1.1, alcance:7, halo:0.35, baja:0.5}, ctx));
  } else {
    var ip = {tipo:'Iluminación', id:f.id, nombre:'Farol del pilar', datos:datos([])};
    bombilla(reg(malla(caja(0.2, 0.35, 0.2), MAT.globo, gExt, x, SUELO+2.6, z), ip),
             Object.assign({fuerza:0.7, alcance:6, halo:0.8}, ctx));
  }
});

/* ===================== piscina ===================== */
var gPis = capas.piscina, PL = P.plataforma, hp = PL.alto;
var infoPis = {tipo:'Lámina de agua', nombre:'Piscina', datos:[
  ['Dimensiones', P.ancho.toFixed(2).replace('.',',')+' × '+P.largo.toFixed(2).replace('.',',')+' m'],
  ['Superficie', (P.ancho*P.largo).toFixed(0)+' m²'],
  ['Profundidad', '≈ '+P.profundidad.toFixed(1).replace('.',',')+' m'],
  ['Volumen', '≈ '+(P.ancho*P.largo*P.profundidad).toFixed(0)+' m³']
].concat(P.ficha || []), centro:P.centro, etiqueta:'Piscina', alturaEtq:SUELO+hp+1.0,
   nota:P.nota || null};
var matPlat = [MAT.cesped, MAT.paret];
reg(malla(prisma(PL.cesped, [pisMundo], hp), matPlat, gPis, 0, SUELO, 0),
  {tipo:'Zona exterior', nombre:'Césped artificial de la piscina', datos:[['Superficie', (areaPoly(PL.cesped)-P.ancho*P.largo).toFixed(0)+' m²'], ['Elevado', (hp*100).toFixed(0)+' cm']]});
if(P.tierra) reg(malla(prisma(P.tierra, null, hp-0.01), [MAT.tierra, MAT.paret], gPis, 0, SUELO, 0),
  {tipo:'Zona exterior', nombre:'Tierra de la pérgola', datos:[['Superficie', areaPoly(P.tierra).toFixed(0)+' m²'], ['Borde', 'piedras sueltas']],
   nota:P.notaTierra || null});
P.losas.forEach(function(l){
  reg(malla(prisma(l, null, hp+0.02), [MAT.losa, MAT.paret], gPis, 0, SUELO, 0),
    {tipo:'Zona exterior', nombre:'Losas de hormigón', datos:[['Superficie', areaPoly(l).toFixed(0)+' m²'], ['Acabado', 'piezas de hormigón']]});
});
var yA = SUELO + hp;
if(P.leon){                                          // figura de escayola (piscina.leon)
  var gl = grupoRumbo(gPis, enPiscina(P.leon.a, P.leon.l), P.rumbo, SUELO + hp), esc = lam({color:'#efece4'});
  gl.rotation.y += d2r(P.leon.giro || 0);
  var il = {tipo:'Exterior', nombre:P.leon.nombre || 'Figura de escayola', datos:[]};
  reg(malla(caja(0.3, 0.12, 0.55), esc, gl, 0, 0.06, 0), il);
  reg(malla(caja(0.22, 0.26, 0.42), esc, gl, 0, 0.25, -0.04), il);
  reg(malla(new THREE.SphereGeometry(0.13, 12, 8), esc, gl, 0, 0.46, 0.17), il);
}
(P.escalones || []).forEach(function(e){            // dos peldaños de losa contra la plataforma
  var g = grupoRumbo(gPis, enPiscina(e.a, e.l), P.rumbo, SUELO);
  if(e.eje === 'l') g.rotation.y -= Math.PI/2;       // bajan a lo largo de la piscina, no de través
  [[0.22, 0.3], [0.52, 0.15]].forEach(function(p){
    reg(malla(caja(0.32, p[1], e.ancho), MAT.losa, g, e.hacia*p[0], p[1]/2, 0),
      {tipo:'Zona exterior', nombre:'Escalones al césped', datos:[]});
  });
});
malla(prisma(pisMundo, null, P.profundidad), MAT.vaso, gPis, 0, yA-P.profundidad, 0);
reg(malla(plano(pisMundo), MAT.agua, gPis, 0, yA-0.14, 0), infoPis);
(function(){                              // coronación de piedra clara
  var c = P.coronacion, e = [];
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(s){ e.push(enPiscina(s[0]*(P.ancho/2+c), s[1]*(P.largo/2+c))); });
  malla(prisma(e, [pisMundo], 0.05), MAT.coronacion, gPis, 0, yA, 0);
})();

X.construcciones.forEach(function(k){
  var y0 = SUELO + (k.cota || 0), g = grupoRumbo(gPis, k.centro, k.rumbo, y0);
  var info = {tipo:'Construcción', nombre:k.nombre, datos:[['Planta', k.ancho.toFixed(1).replace('.',',')+' × '+k.largo.toFixed(1).replace('.',',')+' m']],
    centro:k.centro, etiqueta:k.etiqueta || (k.id === 'caseta' ? 'Caseta' : 'Pérgola'), alturaEtq:y0+(k.cumbrera||k.alto)+0.8,
    nota:k.nota || (k.aprox ? 'Medidas a ojo.' : null)};
  if(k.id === 'caseta'){
    reg(malla(caja(k.ancho, k.alto, k.largo), MAT.blanco, g, 0, k.alto/2, 0), info);
    var H = k.cumbrera - k.alto, D = k.ancho/2 + 0.3, top = k.cumbrera + 0.1;
    reg(malla(losa4([[0,top,-k.largo/2-0.3],[0,top,k.largo/2+0.3],[-D,k.alto-0.3*H/(k.ancho/2)+0.1,k.largo/2+0.3],[-D,k.alto-0.3*H/(k.ancho/2)+0.1,-k.largo/2-0.3]], 0.1), MAT.teja, g), info);
    reg(malla(losa4([[0,top,k.largo/2+0.3],[0,top,-k.largo/2-0.3],[D,k.alto-0.3*H/(k.ancho/2)+0.1,-k.largo/2-0.3],[D,k.alto-0.3*H/(k.ancho/2)+0.1,k.largo/2+0.3]], 0.1), MAT.teja, g), info);
    [-1,1].forEach(function(s){
      var sh = new THREE.Shape(); sh.moveTo(-k.ancho/2, k.alto); sh.lineTo(k.ancho/2, k.alto); sh.lineTo(0, k.cumbrera); sh.closePath();
      malla(new THREE.ExtrudeGeometry(sh, {depth:0.05, bevelEnabled:false}), MAT.blanco, g, 0, 0, s*k.largo/2 - (s>0?0.05:0));
    });
    // puerta doble azul
    // abierta: las dos hojas giradas hacia fuera, contra la fachada; el hueco, oscuro
    malla(caja(0.02, 2.0, 1.5), MAT.negro, g, k.ancho/2+0.005, 1.0, 0);
    var pvC = [-1, 1].map(function(q){
      var pv = new THREE.Group(); pv.position.set(k.ancho/2+0.03, 0, q*0.75); g.add(pv);
      reg(malla(caja(0.04, 2.0, 0.75), MAT.puertaAzul, pv, 0, 1.0, -q*0.375), info);
      return pv;
    });
    info.puerta = puertaMovil(g, [k.ancho/2+0.03, 1.0, 0], 'la puerta de la caseta', giran(pvC, [d2r(80), -d2r(80)]));
  } else {
    // pérgola de aluminio blanco sobre dados de hormigón, con su toldo de palillería y los carriles de
    // través. El toldo corre por las vigas largas: recogido, plegado contra
    // un extremo; extendido (con «Proyectar sombras»), en ondas entre los palillos
    var bl = lam({color:'#f0f0ec'}), tl = lam({color:'#e6dfd0'});
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(s){
      var x = s[0]*(k.ancho/2-0.05), z = s[1]*(k.largo/2-0.05);
      malla(caja(0.5, 0.06, 0.5), MAT.hormigon, g, x, 0.03, z);
      reg(malla(caja(0.08, k.alto, 0.08), bl, g, x, k.alto/2+0.06, z), info);
    });
    var yv = k.alto + 0.06;
    [-1,1].forEach(function(s){
      reg(malla(caja(0.08, 0.14, k.largo), bl, g, s*(k.ancho/2-0.05), yv, 0), info);
      reg(malla(caja(k.ancho, 0.14, 0.08), bl, g, 0, yv, s*(k.largo/2-0.05)), info);
    });
    var gTo = new THREE.Group(); gTo.rotation.y = -Math.PI/2; g.add(gTo);   // recoge hacia +x y se extiende hacia -x
    TOLDOS.push(toldoPalilleria(gTo, k.largo - 0.16, k.ancho - 0.16, yv - 0.07, tl, bl, info));
    for(var i=1;i<4;i++) malla(caja(k.ancho-0.1, 0.05, 0.04), bl, g, 0, yv+0.05, -k.largo/2+i*k.largo/4);
    // tumbonas de lona gris y marco blanco
    var gT = new THREE.Group(); g.add(gT);
    if(QUITA.indexOf('tumbonas_pergola') >= 0) SOLO_ACTUAL.push(gT);
    [-0.75, 0.55].forEach(function(x, q){
      var t = new THREE.Group(); t.position.set(x, 0.02, k.largo/2-1.4 + q*0.3); t.rotation.y = Math.PI + (q ? 0.15 : 0); gT.add(t);
      MUEBLE.tumbona(t, {color:'#8c8f8e', madera:'#f1f0ec'});
    });
  }
});

/* Toldo de palillería entre las vigas: ancho W (x), largo L (z), colgado a la altura y. Devuelve los
   dos estados: la tela extendida en ondas entre palillos cada 50 cm, y el paquete plegado en -z */
function toldoPalilleria(g, W, L, y, tela, perfil, info){
  var mt = new THREE.MeshLambertMaterial({color:tela.color, side:THREE.DoubleSide});
  var abierto = new THREE.Group(), recogido = new THREE.Group(); g.add(abierto); g.add(recogido);
  var n = Math.max(2, Math.round(L/0.5)), paso = L/n, caida = 0.13;
  var geo = new THREE.PlaneGeometry(W, L, 1, n*8); geo.rotateX(-Math.PI/2);
  var pos = geo.attributes.position;
  for(var i=0;i<pos.count;i++){ var t = ((pos.getZ(i) + L/2)/paso) % 1; pos.setY(i, -caida*Math.sin(Math.PI*t)); }
  geo.computeVertexNormals();
  reg(malla(geo, mt, abierto, 0, y - 0.02, 0), info);
  for(var k=0;k<=n;k++) reg(malla(caja(W, 0.03, 0.04), perfil, abierto, 0, y - 0.02, -L/2 + k*paso), info);   // palillos
  // recogido: los palillos juntos y la tela colgando en pliegues contra el extremo
  for(var j=0;j<n;j++){
    reg(malla(caja(W, 0.03, 0.04), perfil, recogido, 0, y - 0.02, -L/2 + 0.03 + j*0.045), info);
    reg(malla(caja(W - 0.02, 0.2, 0.02), mt, recogido, 0, y - 0.12, -L/2 + 0.05 + j*0.045), info);
  }
  var t = {abierto:abierto, recogido:recogido};
  ponToldo(t, renderer.shadowMap.enabled);
  return t;
}
function ponToldo(t, abierto){ t.abierto.visible = abierto; t.recogido.visible = !abierto; }

/* ===================== árboles ===================== */
/* Altura, forma y color por especie. La copa sale de un icosaedro deformado. */
var ESPECIE = {
  pino:      {nombre:'Pino',            copa:'#4b6335', tronco:'#6b5140', alto:function(r){ return 2.0*r+4.0; }, forma:[1,0.55], base:0.78},
  encina:    {nombre:'Encina',          copa:'#3f5230', tronco:'#58483a', alto:function(r){ return 1.7*r+2.0; }, forma:[1,0.82], base:0.35},
  olivo:     {nombre:'Olivo',           copa:'#7f8b66', tronco:'#5e5244', alto:function(r){ return 1.3*r+1.8; }, forma:[1,0.7],  base:0.4},
  cipres:    {nombre:'Ciprés',          copa:'#2f482c', tronco:'#4e3f33', alto:function(r){ return 9+r*2; },     forma:[1,5.2],  base:0.05, cipres:true},
  // los de una hilera junto a un muro, más bajos
  cipres_muro: {nombre:'Ciprés',        copa:'#2f482c', tronco:'#4e3f33', alto:function(r){ return 4.6+r*2; },   forma:[1,3.2],  base:0.05, cipres:true},
  frutal:    {nombre:'Frutal',          copa:'#6b8c44', tronco:'#5e4b3a', alto:function(r){ return 2.9; },       forma:[1,0.8],  base:0.35},
  algarrobo: {nombre:'Algarrobo',       copa:'#3b5a2c', tronco:'#4f4034', alto:function(r){ return 1.5*r+2.2; }, forma:[1,0.62], base:0.35},
  nogal:     {nombre:'Nogal',           copa:'#5e7f3c', tronco:'#6a5a4a', alto:function(r){ return 2.3*r+1.0; }, forma:[1,0.78], base:0.4},
  pimentero: {nombre:'Falso pimentero', copa:'#708d4c', tronco:'#5a4a3c', alto:function(r){ return 2.2*r+1.0; }, forma:[1,0.85], base:0.25},
  higuera:   {nombre:'Higuera',         copa:'#6b8e3e', tronco:'#8b8278', alto:function(r){ return 1.8*r+1.2; }, forma:[1,0.72], base:0.3},
  yuca:      {nombre:'Yuca',            copa:'#62794a', tronco:'#7a6a55', alto:function(r){ return 2.6; },       forma:[1,0.9],  base:0.75},
  almez:     {nombre:'Almez',           copa:'#5f8a45', tronco:'#8b8278', alto:function(r){ return 2.4*r+1.2; }, forma:[1,0.95], base:0.35},
  botella:   {nombre:'Árbol de botella', copa:'#4f7a3a', tronco:'#7d8a6a', alto:function(r){ return 2.2*r+2.0; }, forma:[1,0.75], base:0.4, grueso:2.4},
  laurel:    {nombre:'Laurel',          copa:'#46663a', tronco:'#5a4a3c', alto:function(r){ return 2.0*r+1.6; }, forma:[1,1.05], base:0.3},
  granado:   {nombre:'Granado',         copa:'#5b7d38', tronco:'#6e5a48', alto:function(r){ return 1.4*r+1.6; }, forma:[1,0.9],  base:0.25},
  naranjo:   {nombre:'Naranjo',         copa:'#3d6a2f', tronco:'#5e4b3a', alto:function(r){ return 1.2*r+1.5; }, forma:[1,0.95], base:0.3},
  limonero:  {nombre:'Limonero',        copa:'#4e7b36', tronco:'#5e4b3a', alto:function(r){ return 1.2*r+1.5; }, forma:[1,0.9],  base:0.3},
  almendro:  {nombre:'Almendro',        copa:'#809a62', tronco:'#5a4a3c', alto:function(r){ return 1.4*r+1.7; }, forma:[1,0.72], base:0.35},
  morera:    {nombre:'Morera',          copa:'#4f7d34', tronco:'#7a6a58', alto:function(r){ return 1.2*r+2.8; }, forma:[1,0.6],  base:0.4, grueso:1.6},
  lavanda:   {nombre:'Lavanda',         copa:'#8a86b0', tronco:'#6b7a55', alto:function(r){ return 0.65; },      forma:[1,0.65], base:0.0},
  baladre:   {nombre:'Baladre',         copa:'#56763d', tronco:'#56763d', alto:function(r){ return 2.2; },       forma:[1,1.25], base:0.0},
  // matas mediterráneas de poco riego (la mejorada)
  romero:    {nombre:'Romero',          copa:'#5d7458', tronco:'#5d7458', alto:function(r){ return 0.6; },       forma:[1,0.6],  base:0.0},
  santolina: {nombre:'Santolina',       copa:'#a3a878', tronco:'#a3a878', alto:function(r){ return 0.42; },      forma:[1,0.6],  base:0.0},
  lentisco:  {nombre:'Lentisco',        copa:'#3f5a33', tronco:'#3f5a33', alto:function(r){ return 1.1; },       forma:[1,0.85], base:0.0}
};
function geoCopa(det){
  var g = new THREE.IcosahedronGeometry(1, det), p = g.attributes.position;
  for(var i=0;i<p.count;i++){
    var x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    var n = 1 + 0.16*Math.sin(x*5.1+y*3.7) * Math.cos(z*4.3-y*2.9) + 0.08*Math.sin(x*11+z*9);
    p.setXYZ(i, x*n, y*n, z*n);
  }
  g.computeVertexNormals(); return g;
}
var GEO_COPA = geoCopa(2), GEO_TRONCO = new THREE.CylinderGeometry(0.6, 1, 1, 6);
GEO_TRONCO.translate(0, 0.5, 0);
function plantaArboles(arboles, padre, nota){
  var por = {};
  arboles.forEach(function(a){ (por[a[0]] = por[a[0]] || []).push(a); });
  Object.keys(por).forEach(function(sp){
    var E = ESPECIE[sp] || ESPECIE.encina, lista = por[sp], n = lista.length;
    var copas = new THREE.InstancedMesh(GEO_COPA, lam({color:'#ffffff'}), n*(sp === 'pino' ? 2 : 1));
    var troncos = new THREE.InstancedMesh(GEO_TRONCO, lam({color:E.tronco}), n);
    var o = new THREE.Object3D(), col = new THREE.Color(), base = new THREE.Color(E.copa), k = 0, deCopa = [];
    lista.forEach(function(a, i){
      var r = a[3], H = E.alto(r) * (0.9 + azar()*0.2), ry = r*E.forma[1];
      if(E.cipres) ry = H*0.5;
      var yc = H - ry, tr = (E.cipres ? 0.18 : 0.12 + 0.035*r)*(E.grueso || 1);
      var y0 = SUELO + (a[5] || 0);      // a[5]: la cota, para lo que va sobre la terraza
      o.position.set(a[1], y0, a[2]); o.rotation.set((azar()-.5)*0.08, 0, (azar()-.5)*0.08);
      o.scale.set(tr, Math.max(0.3, yc - ry*0.3), tr); o.updateMatrix(); troncos.setMatrixAt(i, o.matrix);
      var partes = sp === 'pino' ? [[0,0,1],[r*0.45*(azar()-.5)*2, -ry*0.9, 0.6]] : [[0,0,1]];
      partes.forEach(function(q){
        o.position.set(a[1]+q[0], y0+yc+q[1], a[2]+q[0]*0.6);
        o.rotation.set(0, azar()*Math.PI*2, 0);
        var s = q[2]*(0.92+azar()*0.16);
        var an = E.cipres ? 0.72 : 1;
        o.scale.set(r*s*an, ry*s, r*s*an*(0.9+azar()*0.2)); o.updateMatrix();
        copas.setMatrixAt(k, o.matrix);
        col.copy(base).offsetHSL((azar()-.5)*0.03, (azar()-.5)*0.08, (azar()-.5)*0.07);
        copas.setColorAt(k, col); deCopa[k] = a; k++;
      });
    });
    copas.count = k;
    copas.instanceMatrix.needsUpdate = true; if(copas.instanceColor) copas.instanceColor.needsUpdate = true;
    copas.userData.copa = true;
    padre.add(troncos); padre.add(copas);
    var info = {tipo:'Árbol', nombre:E.nombre, datos:[['En la finca', n+(n===1?' ejemplar':' ejemplares')],
      ['Copa', (2*Math.min.apply(null, lista.map(function(a){return a[3];}))).toFixed(1).replace('.',',')+' – '+
               (2*Math.max.apply(null, lista.map(function(a){return a[3];}))).toFixed(1).replace('.',',')+' m']],
      nota:nota || F.notaArboles || null};
    copas.userData.arboles = deCopa; troncos.userData.arboles = lista; copas.userData.troncos = troncos;
    copas.userData.altos = troncos.userData.altos = null;
    reg(copas, info); reg(troncos, info);
  });
}
plantaArboles(F.arboles, capas.arboles);
/* Los árboles que planta la mejorada, en su propio grupo y con su propio azar (el de la casa real no cambia) */
if(FM && FM.exterior && FM.exterior.arboles){
  var gArbM = new THREE.Group(); capas.arboles.add(gArbM); GRUPOS_V.mejorada.push(gArbM);
  var sem0 = semilla; semilla = 20260927;
  plantaArboles(FM.exterior.arboles, gArbM, 'Propuesta de la mejorada.');
  semilla = sem0;
}

/* Sombras: todo proyecta y recibe, salvo el suelo lejano, el agua y la malla. */
escena.traverse(function(o){
  if(!o.isMesh) return;
  if(o.userData.soloChoque){ o.castShadow = o.receiveShadow = false; return; }
  // el vidrio deja pasar el sol: si hiciera sombra, las estancias se verían negras desde fuera
  if(o.material === MAT.cristal || o.material === MAT.esmerilado){ o.castShadow = false; return; }
  o.receiveShadow = true;
  // (castShadow nace a false en three.js: la marca para no hacer sombra es userData.sinSombra)
  o.castShadow = o !== fuera && o !== bajoPad && o.material !== MAT.agua && o.material !== MAT.malla && !o.userData.sinSombra;
});
pad.castShadow = false; fuera.castShadow = false;

/* ── Luz: preferencias del navegador. Este bloque va ANTES de que se usen:
   antes estaba mas abajo y `LUC.sombras` se leia antes de declararse,
   lo que tumbaba el visor entero con un TypeError. ── */
var SOLB = {s:0.5, h:0.3};                                    // intensidades crudas de sol y cielo
var PRELUC = {
  natural:   {exp:1.00, rebote:1.00, niebla:1.00},
  suave:     {exp:1.10, rebote:1.55, niebla:0.75},
  dramatico: {exp:1.22, rebote:0.50, niebla:1.30},
  nocturno:  {exp:1.45, rebote:0.30, niebla:0.55}
};
var LUC = {exp:1.00, rebote:1.00, niebla:1.00, sombras:true, pre:'natural'};
function leeLuz(){
  try{ var s = JSON.parse(localStorage.getItem('arsdomus-luz') || 'null');
       if(s) for(var k in LUC) if(s[k] !== undefined) LUC[k] = s[k]; }catch(e){}
}
function guardaLuz(){ try{ localStorage.setItem('arsdomus-luz', JSON.stringify(LUC)); }catch(e){} }
leeLuz();
function aplicaLuz(){
  renderer.toneMappingExposure = LUC.exp;
  sol.intensity = SOLB.s;
  hemi.intensity = SOLB.h * LUC.rebote;                      // el rebote es la luz del cielo y del suelo
  relleno.intensity = 0.07 * LUC.rebote;
  var n = Math.max(40, 220/LUC.niebla);
  escena.fog.near = n; escena.fog.far = Math.max(n+60, 700/LUC.niebla);
  // cambiar las sombras obliga a recompilar los materiales: por eso solo se toca si cambia
  if(renderer.shadowMap.enabled !== LUC.sombras){
    renderer.shadowMap.enabled = LUC.sombras;
    escena.traverse(function(o){ if(o.material) o.material.needsUpdate = true; });
  }
}

/* ===================== capas (UI) ===================== */
var DEF = [
  ['terreno','Terreno y parcela','#c9b18e'],
  ['exterior','Caminos, lindes y placas','#e2c6a4'],
  ['muros','Muros y huecos','#d9c7a2'],
  ['interior','Interior y muebles','#a9b3c3'],
  ['cubierta','Cubiertas','#b0603e'],
  ['piscina','Piscina, pérgola y caseta','#2a93b0'],
  ['arboles','Árboles','#4b6335'],
  ['catastro','Huella del Catastro','#c2504a']
].filter(function(c){ return c[0] !== 'catastro' || F.huellaCatastral; });
var contCapas = document.getElementById('capas');
function checkbox(id, txt, marcado, color, onChange){
  var l = document.createElement('label'); l.className = 'capa';
  l.innerHTML = '<input type="checkbox" id="'+id+'"'+(marcado?' checked':'')+'>'+
    '<span class="marca"><svg viewBox="0 0 12 12"><path d="M2 6.3 4.7 9 10 3.2"/></svg></span>'+
    '<span>'+txt+'</span>'+(color?'<span class="swatch" style="background:'+color+'"></span>':'');
  l.querySelector('input').addEventListener('change', onChange);
  contCapas.appendChild(l);
}
DEF.forEach(function(c){
  checkbox('capa-'+c[0], c[1], c[0] !== 'catastro', c[2], function(e){
    capas[c[0]].visible = e.target.checked;
  });
});
capas.catastro.visible = false;
/* ?ocultar=muros,arboles apaga capas al cargar */
(QS.get('ocultar') || '').split(',').forEach(function(k){
  if(capas[k]){ capas[k].visible = false; var c = document.getElementById('capa-'+k); if(c) c.checked = false; }
});
checkbox('opt-sombras','Proyectar sombras', LUC.sombras, null, function(e){
  LUC.sombras = e.target.checked; guardaLuz();
  renderer.shadowMap.enabled = e.target.checked;
  TOLDOS.forEach(function(t){ ponToldo(t, e.target.checked); });      // con sombras, el toldo de la pérgola se extiende
  escena.traverse(function(o){ if(o.isMesh){ [].concat(o.material).forEach(function(m){ m.needsUpdate = true; }); } });
});
var verEtq = false;                     // las etiquetas salen apagadas; se encienden en el panel
checkbox('opt-etiquetas','Etiquetas', false, null, function(e){
  verEtq = e.target.checked; if(!verEtq) capaEtq.innerHTML = '';
});
/* IDs de lo que está cerca, para pedir cambios por su nombre (?ids también los enciende) */
checkbox('opt-ids','IDs', QS.has('ids'), null, function(e){
  verIds = e.target.checked; if(!verIds) capaIds.innerHTML = '';
});

/* ===================== sol ===================== */
function ultDomingo(a,m){ var d=new Date(Date.UTC(a,m+1,0)); d.setUTCDate(d.getUTCDate()-d.getUTCDay()); return d; }
/* Hora local: meta.huso (horas sobre UTC, 1 por defecto) y, si meta.verano no es false, el horario de
   verano europeo (del último domingo de marzo al último de octubre) */
function offLocal(a,m,d){
  var t = Date.UTC(a,m,d), h = F.meta.huso !== undefined ? F.meta.huso : 1;
  return h + ((F.meta.verano !== false && t >= ultDomingo(a,2).getTime() && t < ultDomingo(a,9).getTime()) ? 1 : 0);
}
function posSol(a,m,d,min,lat,lon){
  var ms = Date.UTC(a,m,d,0, min - offLocal(a,m,d)*60);
  var n = ms/86400000 + 2440587.5 - 2451545.0;
  var L = (280.460 + 0.9856474*n) % 360;
  var g = d2r((357.528 + 0.9856003*n) % 360);
  var lam = d2r(L + 1.915*Math.sin(g) + 0.020*Math.sin(2*g));
  var eps = d2r(23.439 - 0.0000004*n);
  var ra = Math.atan2(Math.cos(eps)*Math.sin(lam), Math.cos(lam));
  var dec = Math.asin(Math.sin(eps)*Math.sin(lam));
  var gmst = (18.697374558 + 24.06570982441908*n) % 24;
  var Hh = d2r((gmst*15 + lon) % 360) - ra;
  var la = d2r(lat);
  var alt = Math.asin(Math.sin(la)*Math.sin(dec) + Math.cos(la)*Math.cos(dec)*Math.cos(Hh));
  var az = Math.atan2(-Math.sin(Hh), Math.tan(dec)*Math.cos(la) - Math.sin(la)*Math.cos(Hh));
  return {altura: alt*180/Math.PI, azimut: ((az*180/Math.PI)+360)%360};
}
var hoy = new Date();
var FECHAS = [
  {txt:'Hoy', a:hoy.getFullYear(), m:hoy.getMonth(), d:hoy.getDate()},
  {txt:'21 jun', a:hoy.getFullYear(), m:5, d:21},
  {txt:'21 sep', a:hoy.getFullYear(), m:8, d:21},
  {txt:'21 dic', a:hoy.getFullYear(), m:11, d:21}
];
var fechaSel = FECHAS.filter(function(f){ return f.txt.replace(' ', '') === QS.get('fecha'); })[0] || FECHAS[0];   // ?fecha=21jun
var contF = document.getElementById('fechas');
FECHAS.forEach(function(f){
  var b = document.createElement('button');
  b.type='button'; b.className='chip'; b.textContent=f.txt;
  b.setAttribute('aria-pressed', String(f===fechaSel));
  b.addEventListener('click', function(){
    fechaSel = f;
    contF.querySelectorAll('.chip').forEach(function(o){ o.setAttribute('aria-pressed','false'); });
    b.setAttribute('aria-pressed','true'); actualizarSol();
  });
  contF.appendChild(b);
});
var slider = document.getElementById('slider-hora');
// siempre abre a mediodía (13:00), con buena luz; la hora se cambia en el panel o con ?hora=
slider.value = String(QS.get('hora') ? parseInt(QS.get('hora'),10) : 780);
slider.addEventListener('input', actualizarSol);

function actualizarSol(){
  var min = parseInt(slider.value,10);
  document.getElementById('hora').textContent =
    String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');
  var s = posSol(fechaSel.a, fechaSel.m, fechaSel.d, min, F.meta.lat, F.meta.lon);
  document.getElementById('altura-sol').textContent = s.altura.toFixed(1).replace('.',',')+'°';
  document.getElementById('azimut-sol').textContent = s.azimut.toFixed(0)+'°';
  var bajo = s.altura <= 0;
  document.getElementById('estado-sol').textContent =
    bajo ? 'bajo el horizonte' : (s.azimut < 180 ? 'por el este' : 'por el oeste');
  var alt = Math.max(s.altura,-4)*Math.PI/180, az = s.azimut*Math.PI/180, D = 250;
  sol.position.set(D*Math.cos(alt)*Math.sin(az), D*Math.sin(alt), -D*Math.cos(alt)*Math.cos(az));
  sol.target.position.set(0,0,0); sol.target.updateMatrixWorld();
  var t = Math.max(0, Math.min(1, s.altura/28));
  // intensidades «crudas» según la hora; el bloque de luz y ambiente las modula después
  SOLB.s = bajo ? 0.02 : 0.22 + 0.55*t;
  SOLB.h = bajo ? 0.10 : 0.20 + 0.13*t;
  sol.color.setHSL(0.09 - 0.02*t, 0.55 - 0.42*t, 0.55 + 0.42*t);
  // de noche, la luz de relleno de dentro casi se apaga y se encienden los puntos de luz
  var dia = Math.max(0.12, Math.min(1, (s.altura + 2)/10));
  RELLENO.forEach(function(l){ l.intensity = 0.45*dia; });
  LZ.noche = s.altura < 3; LZ.sucio = true; pintaNoche();
  var u = cielo.material.uniforms;
  u.cenit.value.setHSL(0.58, bajo?0.32:0.30+0.16*t, bajo?0.16:0.32+0.30*t);
  u.horizonte.value.setHSL(bajo?0.62:0.10-0.02*t, bajo?0.25:0.42-0.20*t, bajo?0.20:0.55+0.28*t);
  escena.fog.color.copy(u.horizonte.value);
  aplicaLuz();
}

/* ===================== luz y ambiente =====================
   Lo que la posición del sol no decide: cuánto se ve quemado lo claro, cuánto rebota la luz
   del cielo y del suelo, y cuánta bruma hay. Se guarda en el navegador, así que la elección
   se mantiene al cerrar y al volver. */
/* Interruptores de luz: los cuatro ambientes y los tres deslizadores. Mover un deslizador
   desmarca el ambiente (ya no encaja con ninguno), pero la elección se guarda igual. */
(function(){
  var cont = document.getElementById('pres-luz'); if(!cont) return;
  var TXT = {natural:'Natural', suave:'Suave', dramatico:'Dramático', nocturno:'Nocturno'};
  var CLAVES = ['exp','rebote','niebla'];
  var sl = {exp:document.getElementById('luz-exp'), rebote:document.getElementById('luz-rebote'),
            niebla:document.getElementById('luz-niebla')};
  Object.keys(PRELUC).forEach(function(k){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = TXT[k];
    b.setAttribute('aria-pressed', String(LUC.pre === k));
    b.addEventListener('click', function(){
      LUC.pre = k;
      LUC.exp = PRELUC[k].exp; LUC.rebote = PRELUC[k].rebote; LUC.niebla = PRELUC[k].niebla;
      cont.querySelectorAll('.chip').forEach(function(o){ o.setAttribute('aria-pressed','false'); });
      b.setAttribute('aria-pressed','true');
      pintaLuz(); aplicaLuz(); guardaLuz();
    });
    cont.appendChild(b);
  });
  function pintaLuz(){
    CLAVES.forEach(function(c){
      sl[c].value = LUC[c];
      document.getElementById('luz-'+c+'-v').textContent = LUC[c].toFixed(2);
    });
  }
  CLAVES.forEach(function(c){
    sl[c].addEventListener('input', function(){
      LUC[c] = parseFloat(sl[c].value);
      document.getElementById('luz-'+c+'-v').textContent = LUC[c].toFixed(2);
      LUC.pre = '';                                   // ya no es ninguno de los cuatro
      cont.querySelectorAll('.chip').forEach(function(o){ o.setAttribute('aria-pressed','false'); });
      aplicaLuz(); guardaLuz();
    });
  });
  pintaLuz();
})();

/* ===================== luces de noche ===================== */
/* Un reparto fijo de LUCES_N luces: siempre en la escena (encender o apagar una luz de three.js
   recompila los materiales), con intensidad 0 si no hacen falta. Si hay más puntos encendidos que
   luces, se agrupan los cercanos y cada grupo alumbra desde su centro. */
// ?luces=N cambia cuántas alumbran de verdad (para probar cuánto aguanta el equipo)
var LUCES_N = Math.max(1, Math.min(64, parseInt(QS.get('luces'), 10) || 8)), REPARTO = [];
for(var il = 0; il < LUCES_N; il++){ var pl = new THREE.PointLight('#ffffff', 0, 5, 1.6); escena.add(pl); REPARTO.push(pl); }
var LZ = {noche:false, todo:false, grupos:{}, sucio:true, clave:'', cuadro:0};
function uvDe(x, z){
  var dx = x - C0.origen[0], dz = z - C0.origen[1];
  return [dx*Math.cos(GIRO) - dz*Math.sin(GIRO), dx*Math.sin(GIRO) + dz*Math.cos(GIRO)];
}
function estanciaMundo(x, z){
  var q = uvDe(x, z);
  return casaDe(VERSION).interior.estancias.filter(function(e){ var k = e.caja; return q[0] >= k[0] && q[0] <= k[2] && q[1] >= k[1] && q[1] <= k[3]; })[0] || null;
}
/* La estancia donde estás: la de los pies en el paseo; en la órbita, la del punto al que mira si
   está cerca (las vistas de «Dentro» miran al centro de la suya) */
function estanciaActiva(){
  var e = pie.activo ? estanciaMundo(pie.x, pie.z) : dist < 40 ? estanciaMundo(objetivo.x, objetivo.z) : null;
  return e && !e.fuera ? e : null;
}
var vP = new THREE.Vector3();
function posPunto(p, v){
  p.mallas[0].getWorldPosition(v);
  if(p.mallas.length > 1){ var w = new THREE.Vector3(); p.mallas.forEach(function(m, i){ if(i){ m.getWorldPosition(w); v.add(w); } }); v.divideScalar(p.mallas.length); }
  v.y -= p.baja;
  if(p.frente){ var d = p.mallas[0].getWorldDirection(new THREE.Vector3()); v.addScaledVector(d, p.frente); }
  return v;
}
function repartirLuces(){
  var e = estanciaActiva(), cod = e && e.codigo, enc = [];
  PUNTOS.forEach(function(p){
    var on = (!p.version || p.version === VERSION) && p.mallas[0].visible &&
             (LZ.todo || (p.fuera ? !!LZ.grupos[p.grupo] : LZ.noche && p.cod === cod));
    if(on !== p.on){ p.on = on; p.mat.emissiveIntensity = on ? 1 : 0; if(p.halo) p.halo.visible = on; if(p.cb) p.cb(); }
    if(on) enc.push(p);
  });
  // cada 20 cuadros se recoloca aunque no cambie nada, por si algo se ha movido en el modo edición
  var clave = enc.map(function(p){ return PUNTOS.indexOf(p); }).join(',');
  if(clave === LZ.clave && !LZ.sucio && (++LZ.cuadro % 20)) return;
  LZ.clave = clave; LZ.sucio = false;
  var pos = enc.map(function(p){ return posPunto(p, new THREE.Vector3()); });
  var grupos = enc.map(function(p, i){ return [i]; });
  if(enc.length > LUCES_N){
    // k-medias: centros de partida lo más separados posible, desde el primero (así no bailan)
    var cs = [pos[0].clone()];
    while(cs.length < LUCES_N){
      var mejor = -1, dm = -1;
      pos.forEach(function(q, i){ var d = Math.min.apply(null, cs.map(function(c){ return c.distanceToSquared(q); })); if(d > dm){ dm = d; mejor = i; } });
      cs.push(pos[mejor].clone());
    }
    for(var it = 0; it < 6; it++){
      grupos = cs.map(function(){ return []; });
      pos.forEach(function(q, i){
        var k = 0; cs.forEach(function(c, j){ if(c.distanceToSquared(q) < cs[k].distanceToSquared(q)) k = j; }); grupos[k].push(i);
      });
      cs.forEach(function(c, j){ if(grupos[j].length){ c.set(0, 0, 0); grupos[j].forEach(function(i){ c.add(pos[i]); }); c.divideScalar(grupos[j].length); } });
    }
  }
  grupos = grupos.filter(function(g){ return g.length; });
  REPARTO.forEach(function(l, j){
    var g = grupos[j];
    if(!g){ l.intensity = 0; return; }
    var c = new THREE.Vector3(), r = 0, f = 0, a = 0;
    g.forEach(function(i){ c.add(pos[i]); }); c.divideScalar(g.length);
    g.forEach(function(i){ r = Math.max(r, c.distanceTo(pos[i])); f += enc[i].fuerza; a = Math.max(a, enc[i].alcance); });
    l.position.copy(c); l.color.copy(enc[g[0]].tono);
    l.intensity = f/Math.sqrt(g.length); l.distance = a + r;
  });
}
/* Panel: los grupos de fuera (apagados al cargar) y un atajo a la noche */
var contLuces = document.getElementById('luces-fuera'), GRUPOS_LUZ = [];
PUNTOS.forEach(function(p){ if(p.fuera && GRUPOS_LUZ.indexOf(p.grupo) < 0) GRUPOS_LUZ.push(p.grupo); });
function pintaGruposLuz(){
  [].forEach.call(contLuces.querySelectorAll('.chip'), function(b){
    b.setAttribute('aria-pressed', String(b.dataset.grupo ? !!LZ.grupos[b.dataset.grupo] : GRUPOS_LUZ.every(function(g){ return LZ.grupos[g]; })));
  });
  LZ.sucio = true;
}
function botonLuz(txt, grupo, fn){
  var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = txt;
  if(grupo) b.dataset.grupo = grupo;
  b.addEventListener('click', function(){ fn(); pintaGruposLuz(); });
  contLuces.appendChild(b);
}
function botonGrupo(g){ botonLuz(g, g, function(){ LZ.grupos[g] = !LZ.grupos[g]; }); }
GRUPOS_LUZ.forEach(botonGrupo);
botonLuz('Todas', null, function(){ var t = !GRUPOS_LUZ.every(function(g){ return LZ.grupos[g]; }); GRUPOS_LUZ.forEach(function(g){ LZ.grupos[g] = t; }); });
pintaGruposLuz();
/* Un grupo que aparece con una luz añadida en el visor: su botón, antes de «Todas» */
function asegurarGrupo(g){
  if(GRUPOS_LUZ.indexOf(g) >= 0) return;
  GRUPOS_LUZ.push(g); var todas = contLuces.lastChild; botonGrupo(g); contLuces.insertBefore(contLuces.lastChild, todas); pintaGruposLuz();
}
/* Encender todo: todas las luces de las dos plantas de la casa y de fuera a la vez, para ver si el
   equipo aguanta; al lado, los fotogramas por segundo */
var btnTodo = document.getElementById('luces-todo'), txtFps = document.getElementById('fps');
var btnTodoPie = document.getElementById('todo-pie');
function alternaTodo(){
  LZ.todo = !LZ.todo; LZ.sucio = true;
  btnTodo.setAttribute('aria-pressed', String(LZ.todo)); btnTodoPie.setAttribute('aria-pressed', String(LZ.todo));
  btnTodoPie.textContent = LZ.todo ? 'Apagar todo' : 'Encender todo';
  if(LZ.todo && !LZ.noche) alternaNoche();
}
btnTodo.addEventListener('click', alternaTodo);
// en el paseo, que el toque no llegue al lienzo
btnTodoPie.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
btnTodoPie.addEventListener('click', function(e){ e.stopPropagation(); alternaTodo(); btnTodoPie.blur(); });
var FPS = {n:0, t:performance.now()};
function cuentaFps(){
  FPS.n++; var t = performance.now();
  if(t - FPS.t < 1000) return;
  txtFps.textContent = Math.round(FPS.n*1000/(t - FPS.t)) + ' fps · ' + PUNTOS.filter(function(p){ return p.on; }).length + ' encendidas · ' + LUCES_N + ' alumbran';
  FPS.n = 0; FPS.t = t;
}
/* N (o el botón) salta a las 22:00 y vuelve a la hora de antes */
var horaDia = null, btnNoche = document.getElementById('noche'), btnNochePie = document.getElementById('noche-pie');
function pintaNoche(){
  btnNoche.setAttribute('aria-pressed', String(LZ.noche));
  btnNochePie.setAttribute('aria-pressed', String(LZ.noche)); btnNochePie.textContent = LZ.noche ? 'Ver de día' : 'Ver de noche';
}
function alternaNoche(){
  if(LZ.noche){ slider.value = String(horaDia || 780); horaDia = null; }
  else { horaDia = +slider.value; slider.value = '1320'; }
  actualizarSol();
}
btnNoche.addEventListener('click', alternaNoche);
// en el paseo, que el toque no llegue al lienzo (mirar o abrir fichas)
btnNochePie.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
btnNochePie.addEventListener('click', function(e){ e.stopPropagation(); alternaNoche(); btnNochePie.blur(); });
addEventListener('keydown', function(e){
  if(e.code !== 'KeyN' || e.repeat || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  alternaNoche();
});

/* ===================== cámara ===================== */
var objetivo = new THREE.Vector3(0,1,0);
var dist = 120, theta = d2r(200), phi = d2r(40);
/* Vistas: órbita (d, t, p) alrededor de un punto, o `desde` → `hacia`. Fuera, las zonas del
   jardín; dentro, cada estancia (o varias juntas) sin cubiertas y desde arriba. */
function vistaDe(ids, d, p){
  var ks = C0.interior.estancias.filter(function(e){ return ids.indexOf(e.id) >= 0; }).map(function(e){ return e.caja; });
  var u0 = Math.min.apply(null, ks.map(function(k){ return k[0]; })), u1 = Math.max.apply(null, ks.map(function(k){ return k[2]; }));
  var v0 = Math.min.apply(null, ks.map(function(k){ return k[1]; })), v1 = Math.max.apply(null, ks.map(function(k){ return k[3]; }));
  return {d:d || Math.max(u1-u0, v1-v0)*1.5 + 7, t:15, p:p || 20, c:aMundo((u0+u1)/2, (v0+v1)/2), sinTejado:true};
}
/* Las vistas vienen en los datos (F.vistas): [grupo, id, nombre, vista], y la vista es una órbita
   {d, t, p, c} (c: [x, z] del mundo, 'parcela' o {uv:[u, v]} en el plano de la casa), {desde, hacia} o
   {estancias:[ids]}, que encuadra esas estancias sin cubiertas. Sin F.vistas: la parcela, la casa, la
   piscina y una por estancia. */
function vistaDeDatos(v){
  if(v.estancias) return vistaDe(v.estancias, v.d, v.p);
  var o = Object.assign({}, v);
  if(o.c && o.c.uv) o.c = aMundo(o.c.uv[0], o.c.uv[1]);
  return o;
}
var VISTAS = F.vistas ? F.vistas.map(function(v){ return [v[0], v[1], v[2], vistaDeDatos(v[3])]; }) : [
  ['fuera', 'finca', 'Toda la parcela', {d:170, t:200, p:34, c:'parcela', sinTejado:false}],
  ['fuera', 'casa', 'La casa', {d:48, t:200, p:52, c:aMundo(0, 0), sinTejado:false}],
  ['fuera', 'piscina', 'Piscina', {d:30, t:150, p:55, c:P.centro, sinTejado:false}]
].concat(C0.interior.estancias.filter(function(e){ return !e.junta; }).map(function(e){
  return ['dentro', e.id, e.nombre, vistaDe([e.id].concat(C0.interior.estancias.filter(function(o){ return o.junta === e.id; }).map(function(o){ return o.id; })))];
}));
var vistaActual = null;
function aplicaVista(v){
  camara.fov = v.fov || 42; camara.updateProjectionMatrix();
  // la vista del interior quita las cubiertas (y la de la casa las vuelve a poner)
  if(v.sinTejado !== undefined){
    // dentro, sin cubiertas ni árboles, que tapan desde arriba
    capas.cubierta.visible = !v.sinTejado; document.getElementById('capa-cubierta').checked = !v.sinTejado;
    capas.arboles.visible = !v.sinTejado; document.getElementById('capa-arboles').checked = !v.sinTejado;
  }
  if(v.desde){
    var dx = v.desde[0]-v.hacia[0], dy = v.desde[1]-v.hacia[1], dz = v.desde[2]-v.hacia[2];
    dist = Math.hypot(dx,dy,dz); phi = Math.acos(dy/dist); theta = Math.atan2(dx, dz);
    objetivo.set(v.hacia[0], v.hacia[1], v.hacia[2]);
  } else {
    dist=v.d; theta=d2r(v.t); phi=d2r(v.p);
    var c = v.c === 'parcela' ? centroPoly(F.parcela) : v.c;
    objetivo.set(c[0], 1, c[1]);
  }
}
function eligeVista(id){
  var v = VISTAS.filter(function(x){ return x[1] === id; })[0] || VISTAS[0];
  vistaActual = v[1]; aplicaVista(v[3]);
  [].forEach.call(document.querySelectorAll('.vistas .chip'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.vista === vistaActual)); });
  pintaPropuesta();
}
VISTAS.forEach(function(v){
  var b = document.createElement('button');
  b.type='button'; b.className='chip'; b.textContent=v[2]; b.dataset.vista = v[1];
  b.addEventListener('click', function(){ eligeVista(v[1]); });
  document.getElementById('vistas-'+v[0]).appendChild(b);
});

/* ===================== versión: la actual o la mejorada ===================== */
var VERSION = 'actual', txtPropuesta = document.getElementById('propuesta');
function pintaPropuesta(){
  var p = FM && FM.propuestas || {}, t = VERSION === 'mejorada' ? (p[vistaActual] || p.general) : null;
  txtPropuesta.hidden = !t; if(t) txtPropuesta.textContent = t;
}
function ponVersion(v){
  if(!FM) v = 'actual';
  VERSION = v;
  VERSIONES.forEach(function(k){ GRUPOS_V[k].forEach(function(g){ g.visible = k === v; }); });
  SOLO_ACTUAL.forEach(function(o){ o.visible = v === 'actual'; });
  piedrasDeVersion(v);
  (IDS || []).forEach(function(e){ if(e.quita) quitaEnVersion(e, v !== 'actual'); });
  ocultar();
  document.body.classList.toggle('mejorada', v === 'mejorada');
  ['actual', 'mejorada'].forEach(function(k){ document.getElementById('v-'+k).setAttribute('aria-pressed', String(k === v)); });
  document.getElementById('version-pie').textContent = v === 'actual' ? 'Ver la mejorada' : 'Ver la actual';
  pintaPropuesta();
  try{ var q = new URLSearchParams(location.search); q.set('version', v); history.replaceState(null, '', '?'+q.toString()); }catch(e){}
}
['actual', 'mejorada'].forEach(function(k){
  var b = document.getElementById('v-'+k);
  b.disabled = !FM && k === 'mejorada';
  b.addEventListener('click', function(){ ponVersion(k); });
});
document.getElementById('version-pie').addEventListener('pointerdown', function(e){ e.stopPropagation(); });
document.getElementById('version-pie').addEventListener('click', function(e){ e.stopPropagation(); ponVersion(VERSION === 'actual' ? 'mejorada' : 'actual'); });
/* V cambia de versión, en la órbita y en el paseo */
addEventListener('keydown', function(e){
  if(e.code !== 'KeyV' || e.repeat || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  ponVersion(VERSION === 'actual' ? 'mejorada' : 'actual');
});
/* El centro de la órbita no sale de la finca (con 15 m de margen): si se va lejos, girar lanza la
   casa de un lado a otro de la pantalla */
var CAJA_ORB = (function(){
  var ps = F.lindeReal || F.parcela, xs = ps.map(function(p){ return p[0]; }), zs = ps.map(function(p){ return p[1]; });
  return [Math.min.apply(null, xs) - 15, Math.min.apply(null, zs) - 15, Math.max.apply(null, xs) + 15, Math.max.apply(null, zs) + 15];
})();
function colocar(){
  objetivo.x = Math.max(CAJA_ORB[0], Math.min(CAJA_ORB[2], objetivo.x));
  objetivo.z = Math.max(CAJA_ORB[1], Math.min(CAJA_ORB[3], objetivo.z));
  objetivo.y = Math.max(0, Math.min(12, objetivo.y));
  phi = Math.max(0.08, Math.min(Math.PI/2+0.25, phi));
  dist = Math.max(2, Math.min(500, dist));
  camara.position.set(
    objetivo.x + dist*Math.sin(phi)*Math.sin(theta),
    objetivo.y + dist*Math.cos(phi),
    objetivo.z + dist*Math.sin(phi)*Math.cos(theta));
  if(camara.position.y < 0.4) camara.position.y = 0.4;
  camara.lookAt(objetivo);
}

var lienzoGL = renderer.domElement;
var pt = {act:{}, modo:null, x:0, y:0, pinza:0, mov:0};
lienzoGL.addEventListener('pointerdown', function(e){
  if(pie.activo) return;
  try{ lienzoGL.setPointerCapture(e.pointerId); }catch(err){}
  if(edDown(e)){ pt.modo = 'editar'; return; }
  pt.act[e.pointerId] = {x:e.clientX, y:e.clientY};
  var n = Object.keys(pt.act).length;
  pt.modo = (n>=2 || e.button===2 || e.shiftKey) ? 'pan' : 'girar';
  pt.x=e.clientX; pt.y=e.clientY; pt.mov=0;
  if(n===2) pt.pinza = dPunteros();
  panel.classList.remove('abierto');
});
lienzoGL.addEventListener('pointermove', function(e){
  if(pie.activo) return;
  if(pt.modo === 'editar'){ edMove(e); return; }
  if(!pt.act[e.pointerId]) return;
  pt.act[e.pointerId] = {x:e.clientX, y:e.clientY};
  var n = Object.keys(pt.act).length;
  if(n>=2){
    var d = dPunteros();
    if(pt.pinza) dist *= pt.pinza/d;
    pt.pinza = d;
    mover((e.clientX-pt.x)*0.5, (e.clientY-pt.y)*0.5);
  } else if(pt.modo==='pan'){ mover(e.clientX-pt.x, e.clientY-pt.y); }
  else { theta -= (e.clientX-pt.x)*0.006; phi -= (e.clientY-pt.y)*0.006; }
  pt.mov += Math.abs(e.clientX-pt.x) + Math.abs(e.clientY-pt.y);
  pt.x=e.clientX; pt.y=e.clientY;
});
lienzoGL.addEventListener('pointerup', function(e){
  if(pie.activo) return;
  if(pt.modo === 'editar'){ edUp(e); pt.modo = null; return; }
  if(pt.mov < 5 && (pt.modo === 'girar' || (ED.activo && pt.modo === 'pan'))){
    if(ED.activo && ED.poner) ponLuz(e);
    else { seleccionar(e); if(ED.activo) edClic(e); }
  }
  delete pt.act[e.pointerId];
  if(Object.keys(pt.act).length < 2) pt.pinza = 0;
});
lienzoGL.addEventListener('pointercancel', function(e){ delete pt.act[e.pointerId]; });
lienzoGL.addEventListener('contextmenu', function(e){ e.preventDefault(); });
/* Rueda: acerca o aleja hacia el punto que hay bajo el ratón, no hacia el centro de la órbita */
function puntoBajo(e){
  var r = lienzoGL.getBoundingClientRect();
  rayo.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1), camara);
  var h = rayo.intersectObjects(pick.filter(visible).concat([pad, fuera].filter(visible)), false)[0];
  return h ? h.point : null;
}
lienzoGL.addEventListener('wheel', function(e){
  e.preventDefault(); if(pie.activo) return;
  var f = Math.pow(1.0013, e.deltaY), d0 = dist;
  dist = Math.max(2, Math.min(500, dist*f));
  // solo al acercar se va hacia el ratón; al alejar, el centro se queda (si no, se escapa lejos)
  var p = f < 1 ? puntoBajo(e) : null;
  if(p){ var k = 1 - dist/d0; objetivo.x += (p.x-objetivo.x)*k; objetivo.z += (p.z-objetivo.z)*k; objetivo.y += (Math.max(p.y, 0.5)-objetivo.y)*k; }
}, {passive:false});
/* Doble clic: la órbita pasa a girar alrededor de ese punto, y se acerca si estaba muy lejos */
var vuelo = null;
lienzoGL.addEventListener('dblclick', function(e){
  if(pie.activo) return;
  var p = puntoBajo(e); if(!p) return;
  vuelo = {de:objetivo.clone(), a:new THREE.Vector3(p.x, Math.max(p.y, 0.5), p.z), d0:dist, d1:Math.min(dist, 30), t:0};
});
/* WASD desplazan la órbita por el suelo (las flechas la giran y +/- acercan) */
var orbTeclas = {};
addEventListener('keydown', function(e){
  if(pie.activo || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if({KeyW:1, KeyA:1, KeyS:1, KeyD:1}[e.code]){ orbTeclas[e.code] = true; e.preventDefault(); }
});
addEventListener('keyup', function(e){ delete orbTeclas[e.code]; });
addEventListener('blur', function(){ orbTeclas = {}; });
function mueveOrbita(dt){
  if(vuelo){
    vuelo.t = Math.min(1, vuelo.t + dt/0.45); var s = vuelo.t*vuelo.t*(3-2*vuelo.t);
    objetivo.lerpVectors(vuelo.de, vuelo.a, s); dist = vuelo.d0 + (vuelo.d1-vuelo.d0)*s;
    if(vuelo.t >= 1) vuelo = null;
  }
  var fw = (orbTeclas.KeyW ? 1 : 0) - (orbTeclas.KeyS ? 1 : 0), st = (orbTeclas.KeyD ? 1 : 0) - (orbTeclas.KeyA ? 1 : 0);
  if(!fw && !st) return;
  var v = Math.max(3, dist*0.8)*dt;
  objetivo.x += (-Math.sin(theta)*fw + Math.cos(theta)*st)*v;
  objetivo.z += (-Math.cos(theta)*fw - Math.sin(theta)*st)*v;
}
function dPunteros(){
  var k = Object.keys(pt.act), a = pt.act[k[0]], b = pt.act[k[1]];
  return Math.hypot(a.x-b.x, a.y-b.y);
}
function mover(dx,dy){
  var k = dist*0.0016;
  objetivo.x -= (dx*Math.cos(theta) - dy*Math.sin(theta))*k;
  objetivo.z += (dx*Math.sin(theta) + dy*Math.cos(theta))*k;
}
addEventListener('keydown', function(e){
  if(e.target.tagName === 'INPUT' || pie.activo) return;
  var p = 0.09;
  if(e.key==='ArrowLeft') theta += p;
  else if(e.key==='ArrowRight') theta -= p;
  else if(e.key==='ArrowUp') phi -= p;
  else if(e.key==='ArrowDown') phi += p;
  else if(e.key==='+'||e.key==='=') dist /= 1.12;
  else if(e.key==='-') dist *= 1.12;
  else if(e.key==='Escape') ocultar();
  else return;
  e.preventDefault();
});

/* ===================== selección ===================== */
var rayo = new THREE.Raycaster();
var hud = document.getElementById('hud');
var sel = [];
var MAT_SEL = lam({color:'#ffd9a3', emissive:'#7a4a10', emissiveIntensity:0.3});
function seleccionar(e){
  var r = lienzoGL.getBoundingClientRect();
  rayo.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1), camara);
  // el terreno no tiene ficha, pero también se puede tocar: da la coordenada
  var hits = rayo.intersectObjects(pick.filter(visible).concat([pad, fuera].filter(visible)), false);
  if(!hits.length){ ocultar(); return; }
  var h = hits[0];
  if(h.object.userData.info) mostrar(h.object, h.instanceId, null, h.point);
  else mostrar(null, null, {tipo:'Punto', nombre:'Terreno', datos:[]}, h.point);
}
/* Coordenada del punto tocado, en metros del mundo (x al E, z al S, 0 en el centro de la parcela):
   sale en la ficha, se copia al pulsarla y deja una chincheta donde se tocó. */
var hudPunto = document.getElementById('hud-punto'), txtPunto = '';
var chincheta = new THREE.Group(); chincheta.visible = false; escena.add(chincheta);
malla(new THREE.ConeGeometry(0.12, 0.5, 12), lam({color:'#d6452f', emissive:'#6b1a10'}), chincheta, 0, 0.25, 0).rotation.x = Math.PI;
malla(new THREE.SphereGeometry(0.14, 12, 8), lam({color:'#d6452f', emissive:'#6b1a10'}), chincheta, 0, 0.55, 0);
/* La coordenada del punto tocado ya no se muestra. Antes, al tocar cualquier muro
   salia una chincheta roja y un «x · z · altura» en la ficha: era ruido para
   quien solo quiere ver la casa. La ficha del objeto sigue diciendo que es y
   donde esta; la chincheta y el copiador quedan apagados. */
function ponPunto(p){
  chincheta.visible = false; hudPunto.hidden = true;
  if(!p) return;
  chincheta.position.copy(p);
  var f = function(v){ return v.toFixed(1); };
  var h = Math.max(0, p.y - SUELO);
  txtPunto = '(' + f(p.x) + ', ' + f(p.z) + ', ' + f(h) + ')';
}
hudPunto.addEventListener('click', function(){
  try{ navigator.clipboard.writeText(txtPunto).then(function(){
    var t = hudPunto.textContent; hudPunto.textContent = 'copiada ' + txtPunto;
    setTimeout(function(){ hudPunto.textContent = t; }, 1200); }); }catch(e){}
});
function visible(m){
  var o = m;
  while(o){ if(o.visible === false) return false; o = o.parent; }
  return true;
}
/* La ficha de un árbol concreto: la de su especie, con su ID y su copa. */
var fichaArbol = {};
function infoArbol(i, a){
  return fichaArbol[a[4]] = fichaArbol[a[4]] || {tipo:'Árbol', id:a[4], nombre:i.nombre, arbol:a,
    datos:[['Copa', (2*a[3]).toFixed(1).replace('.',',')+' m']].concat(i.datos.slice(0, 1)), nota:i.nota};
}
function mostrar(m, inst, info, punto){
  quitar(); ponPunto(punto || null);
  var i = info || m.userData.info;
  if(!info && m && m.userData.arboles && inst != null && m.userData.arboles[inst]) i = infoArbol(i, m.userData.arboles[inst]);
  pick.forEach(function(o){
    if(o.userData.info !== i || o.isInstancedMesh) return;
    sel.push([o, o.material]); o.material = MAT_SEL;
  });
  document.getElementById('hud-tipo').textContent = i.tipo;
  hudId.hidden = !i.id; hudId.textContent = i.id || ''; hudId.title = 'Copiar el ID';
  document.getElementById('hud-nombre').textContent = i.nombre;
  document.getElementById('hud-datos').innerHTML = i.datos.map(function(d){
    return '<span>'+d[0]+'</span><span>'+d[1]+'</span>'; }).join('');
  var n = document.getElementById('hud-nota');
  n.hidden = !i.nota; if(i.nota) n.textContent = i.nota;
  fichaPuerta = i.puerta || null; rotuloPuertas();
  hud.hidden = false;
}
function quitar(){ sel.forEach(function(s){ s[0].material = s[1]; }); sel = []; }
function ocultar(){ quitar(); ponPunto(null); hud.hidden = true; }
document.getElementById('cerrar-hud').addEventListener('click', ocultar);
/* El ID de la ficha se copia al pulsarlo, para pegarlo en un mensaje («mueve SAL-04 medio metro») */
var hudId = document.getElementById('hud-id');
hudId.addEventListener('click', function(){
  var t = hudId.textContent;
  try{ navigator.clipboard.writeText(t).then(function(){ hudId.textContent = t+' · copiado'; setTimeout(function(){ if(hudId.textContent === t+' · copiado') hudId.textContent = t; }, 1200); }); }catch(e){}
});

/* ===================== IDs ===================== */
/* Todo lo que se puede tocar lleva ID. Los de la casa, los muebles y los árboles vienen de
   los datos y no cambian (SAL-04, H-12, W-031, A-145); a lo demás del exterior se le da uno
   por su tipo y su nombre (EXT-pergola, CAM-pasos-de-losa-2). */
var PREFIJO = {'Edificación':'CASA', 'Cubierta':'CUB', 'Camino':'CAM', 'Linde':'LIN', 'Estancia':'EST'};
function slug(t){
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 26).replace(/-$/, '');
}
var IDS = [];                       // {id, info, malla, pos}: dónde está cada ID, para rotularlo y buscarlo
(function(){
  var usados = {}, vistos = [];
  pick.forEach(function(m){ var i = m.userData.info; if(i.id) usados[i.id] = 1; });
  escena.updateMatrixWorld(true);
  var caja3 = new THREE.Box3(), c = new THREE.Vector3(), por = new Map();
  pick.forEach(function(m){
    var i = m.userData.info;
    if(m.userData.arboles) return;
    if(!i.id){
      var base = i === INFO_CASA ? 'CASA' : (PREFIJO[i.tipo] || 'EXT') + '-' + slug(i.nombre), id = base, k = 2;
      while(usados[id]) id = base + '-' + (k++);
      i.id = id; usados[id] = 1;
    }
    // una entrada por ficha y por versión (la mejorada repite IDs con otros objetos)
    var clave = i.id + '|' + versionDe(m), e = por.get(clave);
    caja3.setFromObject(m);
    if(!e){ e = {id:i.id, info:i, malla:m, mallas:[m], caja:caja3.clone(), version:versionDe(m)}; por.set(clave, e); IDS.push(e); }
    else { e.caja.union(caja3); e.mallas.push(m); }
  });
  IDS.forEach(function(e){
    e.pos = e.caja.getCenter(new THREE.Vector3()); e.pos.y = Math.min(e.caja.max.y, e.pos.y + 0.3);
    // la casa entera, los caminos largos o el terreno no se rotulan: su centro no dice nada
    e.grande = e.info === INFO_CASA || e.caja.getSize(c).length() > 25;
  });
  pick.forEach(function(m){
    if(!m.userData.arboles || !m.userData.copa) return;
    m.userData.arboles.forEach(function(a){
      if(vistos[a[4]]) return; vistos[a[4]] = 1;
      IDS.push({id:a[4], info:infoArbol(m.userData.info, a), malla:m, arbol:a, version:versionDe(m), pos:new THREE.Vector3(a[1], SUELO + 1.6, a[2])});
    });
  });
})();
/* Lo de fuera que la mejorada quita (FM.quita, por ID): es de la actual y se esconde en la otra */
IDS.forEach(function(e){ if(!e.version && QUITA.indexOf(e.id) >= 0){ e.quita = true; e.version = 'actual'; } });
function quitaEnVersion(e, q){
  if(!!e.quitada === q) return;
  e.quitada = q;
  var cero = new THREE.Matrix4().makeScale(0, 0, 0), guarda = function(im, k){
    e.matsQ = e.matsQ || {}; var c = im.uuid + k;
    if(q){ if(!e.matsQ[c]){ e.matsQ[c] = new THREE.Matrix4(); im.getMatrixAt(k, e.matsQ[c]); } im.setMatrixAt(k, cero); }
    else if(e.matsQ[c]) im.setMatrixAt(k, e.matsQ[c]);
    im.instanceMatrix.needsUpdate = true;
  };
  if(e.arbol){
    var cp = e.malla, tr = cp.userData.troncos;
    cp.userData.arboles.forEach(function(a, k){ if(a === e.arbol) guarda(cp, k); });
    tr.userData.arboles.forEach(function(a, k){ if(a === e.arbol) guarda(tr, k); });
  } else e.mallas.forEach(function(m){ m.visible = !q; });
  // y las piedras sueltas que eran suyas (círculos de piedras, montones)
  piedras.forEach(function(p, k){ if(p[4] && p[4] === e.info) guarda(PIEDRAS_IM, k); });
}
function versionDe(m){
  for(var o = m; o; o = o.parent) for(var k in GRUPOS_V) if(GRUPOS_V[k].indexOf(o) >= 0) return k;
  return '';
}
/* ?id=SAL-04 (o varios, separados por comas) busca el objeto, lo enfoca y abre su ficha */
function buscaId(id){
  var es = IDS.filter(function(e){ return e.id.toUpperCase() === id.toUpperCase(); });
  return es.filter(function(e){ return !e.version || e.version === VERSION; })[0] || es[0] || null;
}
function irAId(id){
  var e = buscaId(id); if(!e) return false;
  if(e.version && e.version !== VERSION) ponVersion(e.version);
  var dentro = /^(Mueble|Propuesta|Estancia|Hueco|Muro)$/.test(e.info.tipo);
  var r = e.caja ? e.caja.getSize(new THREE.Vector3()).length() : 6;
  aplicaVista({d:Math.max(7, Math.min(60, r*2.2 + 5)), t:theta*180/Math.PI, p:dentro ? 32 : 40, c:[e.pos.x, e.pos.z], sinTejado:dentro});
  objetivo.y = Math.max(1, e.pos.y - 0.3);
  mostrar(e.malla, null, e.info);
  return true;
}
var capaIds = document.getElementById('ids'), verIds = false;
function pintarIds(){
  if(!verIds) return;
  var r = lienzoGL.getBoundingClientRect(), cp = camara.position, lim = pie.activo ? 14 : Math.min(45, dist + 6);
  var cand = [];
  IDS.forEach(function(e){
    var d = e.pos.distanceTo(cp);
    if(d > lim || e.grande || e.oculto || e.quitada || !visible(e.malla)) return;
    cand.push([d, e]);
  });
  cand.sort(function(a, b){ return a[0] - b[0]; });
  var html = '';
  cand.slice(0, 160).forEach(function(c){
    var e = c[1];
    vec.copy(e.pos).project(camara);
    if(vec.z > 1 || Math.abs(vec.x) > 1.05 || Math.abs(vec.y) > 1.05) return;
    html += '<div class="etq-id t-'+slug(e.info.tipo)+'" style="left:'+((vec.x*0.5+0.5)*r.width).toFixed(1)+
            'px;top:'+((-vec.y*0.5+0.5)*r.height).toFixed(1)+'px">'+e.id+'</div>';
  });
  capaIds.innerHTML = html;
}

/* ===================== mover objetos ===================== */
/* Modo edición: se eligen uno o varios objetos (clic; Mayús+clic o «Grupo» añade; Ctrl+arrastrar
   hace un recuadro), se arrastran por el suelo, se mueven con las flechas y se giran con Q/E.
   Cada cambio se guarda en cambios.json (el servidor de Vite lo escribe en la carpeta del
   la casa) para que Claude lo pase a sus datos; sin servidor, en el navegador y a copiar. */
var ED = {activo:false, sel:[], grupo:false, hist:[], cambios:{}, arr:null, rect:null};
var NO_MOVIBLE = /^(Estancia|Edificación|Muro|Hueco|Cubierta|Camino|Linde|Lámina de agua|Zona exterior|Punto)$/;
var edEstado = document.getElementById('ed-estado'), edSel = document.getElementById('ed-sel');
var mT = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4();
function movible(e){ return e && !e.grande && !e.oculto && !NO_MOVIBLE.test(e.info.tipo); }
function entradaDe(m, inst){
  if(!m) return null;
  if(m.userData.arboles && inst != null){
    var a = m.userData.arboles[inst];
    return a ? IDS.filter(function(e){ return e.arbol === a; })[0] : null;
  }
  var v = versionDe(m);
  return IDS.filter(function(e){ return e.info === m.userData.info && e.version === v; })[0] || null;
}
/* Aplica la matriz T (en el mundo) a todo lo de la entrada */
function transforma(e, T){
  if(e.arbol){
    var cp = e.malla, tr = cp.userData.troncos, M = new THREE.Matrix4(), Mi = new THREE.Matrix4();
    [[cp, cp.userData.arboles], [tr, tr.userData.arboles]].forEach(function(q){
      var im = q[0]; im.updateMatrixWorld(); M.copy(im.matrixWorld); Mi.copy(M).invert();
      q[1].forEach(function(a, k){
        if(a !== e.arbol) return;
        im.getMatrixAt(k, mA); mB.multiplyMatrices(T, mA.premultiply(M)).premultiply(Mi);
        im.setMatrixAt(k, mB);
      });
      im.instanceMatrix.needsUpdate = true;
    });
  } else e.mallas.forEach(function(m){
    m.updateMatrixWorld(); mA.multiplyMatrices(T, m.matrixWorld);
    mB.copy(m.parent.matrixWorld).invert().multiply(mA);
    mB.decompose(m.position, m.quaternion, m.scale); m.updateMatrixWorld();
  });
  e.pos.applyMatrix4(T);
  if(e.caja){ e.caja.makeEmpty(); e.mallas.forEach(function(m){ e.caja.expandByObject(m); }); }
}
/* Eliminar: se oculta (y un árbol, se encoge a nada guardando su matriz), para poder volver atrás */
function ocultaEntrada(e, oculto){
  if(!!e.oculto === !!oculto) return;
  e.oculto = !!oculto;
  if(e.arbol){
    var cp = e.malla, tr = cp.userData.troncos; e.mats = e.mats || {};
    [['c', cp, cp.userData.arboles], ['t', tr, tr.userData.arboles]].forEach(function(q){
      q[2].forEach(function(a, k){
        if(a !== e.arbol) return;
        if(oculto){ var m = new THREE.Matrix4(); q[1].getMatrixAt(k, m); e.mats[q[0]+k] = m; q[1].setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0)); }
        else if(e.mats[q[0]+k]) q[1].setMatrixAt(k, e.mats[q[0]+k]);
      });
      q[1].instanceMatrix.needsUpdate = true;
    });
  } else e.mallas.forEach(function(m){ m.visible = !oculto; });
}
function elimina(){
  if(!ED.sel.length) return;
  instantanea();
  ED.sel.forEach(function(e){ apunta(e); e.cambio.eliminado = true; if(!e.cambio.hasta) e.cambio.hasta = e.cambio.desde.slice(); ocultaEntrada(e, true); });
  ED.sel = []; marcaSel(); ocultar(); guarda();
}
function giroEn(cx, cz, ang){
  return mT.makeTranslation(cx, 0, cz).multiply(mA.makeRotationY(ang)).multiply(mB.makeTranslation(-cx, 0, -cz)).clone();
}
/* Un paso: mueve (dx, dz), sube dy y gira `ang` alrededor del centro del grupo; lo apunta para deshacer */
function paso(es, dx, dz, ang, dy){
  if(!es.length) return;
  instantanea();
  dy = dy || 0;
  var cx = 0, cz = 0; es.forEach(function(e){ cx += e.pos.x; cz += e.pos.z; }); cx /= es.length; cz /= es.length;
  var T = new THREE.Matrix4().makeTranslation(dx, dy, dz);
  if(ang) T.multiply(giroEn(cx, cz, ang));
  es.forEach(function(e){ apunta(e); transforma(e, T); e.cambio.giro += ang*180/Math.PI; e.cambio.alto = +((e.cambio.alto || 0) + dy).toFixed(3); actualiza(e); });
  marcaSel(); guarda();
}
function apunta(e){
  var k = e.id + '|' + (e.version || '');
  e.cambio = ED.cambios[k] = ED.cambios[k] || {id:e.id, version:e.version || '', tipo:e.info.tipo, nombre:e.info.nombre,
    desde:[+e.pos.x.toFixed(3), +e.pos.z.toFixed(3)], giro:0};
}
function actualiza(e){
  var c = e.cambio; c.hasta = [+e.pos.x.toFixed(3), +e.pos.z.toFixed(3)];
  c.giro = +(((c.giro % 360) + 540) % 360 - 180).toFixed(1);
  if(!c.alto) delete c.alto;
  if(!c.eliminado && !c.nuevo && Math.abs(c.hasta[0]-c.desde[0]) < 0.005 && Math.abs(c.hasta[1]-c.desde[1]) < 0.005 && Math.abs(c.giro) < 0.05 && !c.alto)
    delete ED.cambios[c.id + '|' + c.version];
}
/* Volver atrás: antes de cada paso se guarda cómo estaba todo (también en cambios.json, así
   se puede volver atrás después de recargar) */
function instantanea(){ ED.hist.push(JSON.stringify(ED.cambios)); if(ED.hist.length > 200) ED.hist.shift(); }
function matrizDe(c){                    // lo que el cambio c le hace al objeto desde su sitio original
  var T = new THREE.Matrix4();
  if(!c || !c.hasta) return T;
  return T.makeTranslation(c.hasta[0]-c.desde[0], c.alto || 0, c.hasta[1]-c.desde[1]).multiply(giroEn(c.desde[0], c.desde[1], c.giro*Math.PI/180));
}
function entradaPorClave(k){
  var id = k.split('|')[0], v = k.split('|')[1] || '';
  return IDS.filter(function(x){ return x.id === id && (x.version || '') === v; })[0];
}
function irAEstado(objetivo){
  var claves = {}; Object.keys(ED.cambios).concat(Object.keys(objetivo)).forEach(function(k){ claves[k] = 1; });
  Object.keys(claves).forEach(function(k){
    var e = entradaPorClave(k);
    if(!e && objetivo[k] && objetivo[k].nuevo) e = creaLuz(objetivo[k]);
    if(!e) return;
    transforma(e, matrizDe(objetivo[k]).multiply(matrizDe(ED.cambios[k]).invert()));
    // lo añadido en el visor desaparece al volver a antes de ponerlo
    ocultaEntrada(e, objetivo[k] ? objetivo[k].eliminado : !!e.nuevo);
    e.cambio = objetivo[k];
  });
  ED.cambios = objetivo;
}
function deshaz(){
  if(!ED.hist.length) return;
  irAEstado(JSON.parse(ED.hist.pop()));
  marcaSel(); guarda();
}
/* Cajas amarillas alrededor de lo elegido */
var gSel = new THREE.Group(); escena.add(gSel);
function marcaSel(){
  while(gSel.children.length) gSel.remove(gSel.children[0]);
  ED.sel.forEach(function(e){
    var b = e.caja ? e.caja.clone() : new THREE.Box3().setFromCenterAndSize(e.pos, new THREE.Vector3(1.2, 3.2, 1.2));
    if(e.arbol){ var r = e.arbol[3]; b.setFromCenterAndSize(new THREE.Vector3(e.pos.x, SUELO + 1.5, e.pos.z), new THREE.Vector3(2*r, 3, 2*r)); }
    gSel.add(new THREE.Box3Helper(b.expandByScalar(0.03), 0xffc400));
  });
  var n = ED.sel.length;
  var alt = function(e){ return e.caja ? ' · a ' + Math.max(0, e.caja.min.y - SUELO).toFixed(2).replace('.', ',') + ' m' : ''; };
  edSel.textContent = n ? (n === 1 ? ED.sel[0].id + ' · ' + ED.sel[0].info.nombre + alt(ED.sel[0]) : n + ' objetos: ' + ED.sel.slice(0, 6).map(function(e){ return e.id; }).join(', ') + (n > 6 ? '…' : ''))
                        : 'Nada elegido';
}
function elige(e, anade){
  if(!movible(e)){ if(!anade){ ED.sel = []; marcaSel(); } return; }
  var i = ED.sel.indexOf(e);
  if(anade){ if(i >= 0) ED.sel.splice(i, 1); else ED.sel.push(e); }
  else ED.sel = [e];
  marcaSel();
}
/* Guardado: al servidor de Vite (cambios.json), y copia en el navegador */
var tGuarda = null, conServidor = null;
function listaCambios(){ return Object.keys(ED.cambios).map(function(k){ return ED.cambios[k]; }); }
function guarda(){
  var n = listaCambios().length;
  try{ localStorage.setItem(CLAVE + '-cambios', JSON.stringify(ED.cambios)); localStorage.setItem(CLAVE + '-historial', JSON.stringify(ED.hist.slice(-50))); }catch(err){}
  clearTimeout(tGuarda);
  tGuarda = setTimeout(function(){
    fetch('__cambios', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({guardado:new Date().toISOString(), cambios:listaCambios(), historial:ED.hist}, null, 1)})
      .then(function(r){ if(!r.ok) throw 0; conServidor = true; edEstado.textContent = (n ? n + (n === 1 ? ' objeto cambiado' : ' objetos cambiados') + ' · guardado para Claude' : 'Sin cambios') + (ED.hist.length ? ' · ' + ED.hist.length + ' pasos para volver atrás' : ''); })
      .catch(function(){ conServidor = false; edEstado.textContent = n + ' cambios en este navegador · usa «Copiar cambios»'; });
  }, 400);
}
function aplicaGuardados(lista){
  (lista || []).forEach(function(c){
    var e = IDS.filter(function(x){ return x.id === c.id && (x.version || '') === (c.version || ''); })[0];
    if(!e && c.nuevo) e = creaLuz(c);
    if(!e || !c.hasta) return;
    transforma(e, matrizDe(c)); if(c.eliminado) ocultaEntrada(e, true); ED.cambios[c.id + '|' + (c.version || '')] = c; e.cambio = c;
  });
}
fetch('__cambios').then(function(r){ if(!r.ok) throw 0; return r.json(); })
  .then(function(j){ conServidor = true; aplicaGuardados(j.cambios); ED.hist = j.historial || []; })
  .catch(function(err){
    if(err) console.error('cambios.json:', err);     // un fallo al aplicarlos no es «sin servidor»
    if(conServidor) return;
    conServidor = false;
    try{ var g = JSON.parse(localStorage.getItem(CLAVE + '-cambios') || '{}'); aplicaGuardados(Object.keys(g).map(function(k){ return g[k]; }));
         ED.hist = JSON.parse(localStorage.getItem(CLAVE + '-historial') || '[]'); }catch(err){}
  });
/* Ratón y dedo */
var planoArr = new THREE.Plane(), pArr = new THREE.Vector3(), v2 = new THREE.Vector2();
function rayoEn(e){
  var r = lienzoGL.getBoundingClientRect();
  v2.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1); rayo.setFromCamera(v2, camara);
}
function tocado(e){
  rayoEn(e);
  var h = rayo.intersectObjects(pick.filter(visible), false)[0];
  return h ? {e:entradaDe(h.object, h.instanceId), p:h.point} : null;
}
function edDown(e){                       // true si el modo edición se queda el gesto
  if(!ED.activo || e.button === 2) return false;
  if(ED.poner && !(e.ctrlKey || e.metaKey || e.altKey)) return false;     // poniendo luces, el clic es para eso
  if(e.ctrlKey || e.metaKey || e.altKey){
    ED.rect = {x0:e.clientX, y0:e.clientY, anade:e.shiftKey || ED.grupo, div:document.createElement('div')};
    ED.rect.div.className = 'ed-rect'; document.body.appendChild(ED.rect.div); return true;
  }
  var t = tocado(e);
  // se arrastra si se pulsa sobre algo elegido o dentro de su huella en planta (el suelo de debajo)
  var dentro = t && ED.sel.some(function(x){
    if(x === t.e) return true;
    var b = x.caja, r = x.arbol ? x.arbol[3] : 0;
    return b ? t.p.x > b.min.x-0.1 && t.p.x < b.max.x+0.1 && t.p.z > b.min.z-0.1 && t.p.z < b.max.z+0.1
             : Math.hypot(t.p.x - x.pos.x, t.p.z - x.pos.z) < Math.max(r, 0.6);
  });
  if(dentro){
    planoArr.set(new THREE.Vector3(0, 1, 0), -t.p.y); ED.arr = {p:t.p.clone(), mov:0, antes:JSON.stringify(ED.cambios)}; return true;
  }
  return false;
}
function edMove(e){
  if(ED.rect){
    var R = ED.rect, x = Math.min(R.x0, e.clientX), y = Math.min(R.y0, e.clientY);
    R.x1 = e.clientX; R.y1 = e.clientY;
    Object.assign(R.div.style, {left:x+'px', top:y+'px', width:Math.abs(e.clientX-R.x0)+'px', height:Math.abs(e.clientY-R.y0)+'px'});
    return true;
  }
  if(!ED.arr) return false;
  rayoEn(e); if(!rayo.ray.intersectPlane(planoArr, pArr)) return true;
  var dx = pArr.x - ED.arr.p.x, dz = pArr.z - ED.arr.p.z;
  if(e.altKey){ dx = Math.round(dx*10)/10; dz = Math.round(dz*10)/10; }
  if(!dx && !dz) return true;
  var T = new THREE.Matrix4().makeTranslation(dx, 0, dz);
  ED.sel.forEach(function(x){ apunta(x); transforma(x, T); actualiza(x); });
  ED.arr.p.x += dx; ED.arr.p.z += dz; ED.arr.mov++;
  marcaSel();
  return true;
}
function edUp(e){
  if(ED.rect){
    var R = ED.rect, r = lienzoGL.getBoundingClientRect(); R.div.remove(); ED.rect = null;
    if(R.x1 === undefined) return true;
    var x0 = Math.min(R.x0, R.x1), x1 = Math.max(R.x0, R.x1), y0 = Math.min(R.y0, R.y1), y1 = Math.max(R.y0, R.y1);
    if(!R.anade) ED.sel = [];
    IDS.forEach(function(x){
      if(!movible(x) || !visible(x.malla) || x.pos.distanceTo(camara.position) > 200) return;
      vec.copy(x.pos).project(camara); if(vec.z > 1) return;
      var sx = r.left + (vec.x*0.5+0.5)*r.width, sy = r.top + (-vec.y*0.5+0.5)*r.height;
      if(sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && ED.sel.indexOf(x) < 0) ED.sel.push(x);
    });
    marcaSel(); return true;
  }
  if(!ED.arr) return false;
  if(ED.arr.mov){ ED.hist.push(ED.arr.antes); if(ED.hist.length > 200) ED.hist.shift(); guarda(); }
  else { var t = tocado(e); elige(t && t.e, e.shiftKey || ED.grupo); }
  ED.arr = null; return true;
}
function edClic(e){                       // clic corto sin arrastrar, en modo edición
  var t = tocado(e); elige(t && t.e, e.shiftKey || ED.grupo);
}
/* Teclado: flechas mueven 10 cm (Mayús, 1 cm) según hacia dónde mira la cámara; Q/E giran 15° (Mayús, 1°) */
addEventListener('keydown', function(e){
  if(!ED.activo || pie.activo || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if((e.ctrlKey || e.metaKey) && e.code === 'KeyZ'){ deshaz(); e.preventDefault(); e.stopImmediatePropagation(); return; }
  if(e.code === 'Escape'){ ED.sel = []; marcaSel(); ponerLuz(null); return; }
  if(!ED.sel.length) return;
  if(e.code === 'Delete' || e.code === 'Backspace'){ elimina(); e.preventDefault(); e.stopImmediatePropagation(); return; }
  var st = e.shiftKey ? 0.01 : 0.1, f = [Math.sin(theta), Math.cos(theta)], dx = 0, dz = 0, ang = 0;
  if(e.key === 'ArrowUp'){ dx = -f[0]*st; dz = -f[1]*st; }
  else if(e.key === 'ArrowDown'){ dx = f[0]*st; dz = f[1]*st; }
  else if(e.key === 'ArrowLeft'){ dx = -f[1]*st; dz = f[0]*st; }
  else if(e.key === 'ArrowRight'){ dx = f[1]*st; dz = -f[0]*st; }
  else if(e.code === 'KeyR' || e.code === 'PageUp'){ paso(ED.sel, 0, 0, 0, st); e.preventDefault(); e.stopImmediatePropagation(); return; }
  else if(e.code === 'KeyF' || e.code === 'PageDown'){ paso(ED.sel, 0, 0, 0, -st); e.preventDefault(); e.stopImmediatePropagation(); return; }
  else if(e.code === 'KeyQ') ang = (e.shiftKey ? 1 : 15)*Math.PI/180;
  else if(e.code === 'KeyE') ang = -(e.shiftKey ? 1 : 15)*Math.PI/180;
  else return;
  // las flechas van en ejes de la cámara redondeados al eje del mundo más cercano, para no torcer
  if(dx || dz){ if(Math.abs(dx) > Math.abs(dz)){ dx = Math.sign(dx)*st; dz = 0; } else { dz = Math.sign(dz)*st; dx = 0; } }
  paso(ED.sel, dx, dz, ang); e.preventDefault(); e.stopImmediatePropagation();
}, true);
/* Panel */
var btnEd = document.getElementById('ed-activo');
btnEd.addEventListener('click', function(){
  ED.activo = !ED.activo; btnEd.setAttribute('aria-pressed', String(ED.activo));
  document.body.classList.toggle('editando', ED.activo);
  document.getElementById('ed-panel').hidden = !ED.activo;
  if(!ED.activo){ ED.sel = []; marcaSel(); ponerLuz(null); }
  else guarda();
});
var btnGrupo = document.getElementById('ed-grupo');
btnGrupo.addEventListener('click', function(){ ED.grupo = !ED.grupo; btnGrupo.setAttribute('aria-pressed', String(ED.grupo)); });
document.getElementById('ed-estancia').addEventListener('click', function(){
  var e0 = ED.sel[0]; if(!e0) return;
  var est = (e0.info.datos.filter(function(d){ return d[0] === 'Estancia'; })[0] || [])[1];
  if(!est) return;
  IDS.forEach(function(x){
    if(movible(x) && visible(x.malla) && ED.sel.indexOf(x) < 0 &&
       x.info.datos.some(function(d){ return d[0] === 'Estancia' && d[1] === est; })) ED.sel.push(x);
  });
  marcaSel();
});
document.getElementById('ed-deshacer').addEventListener('click', deshaz);
document.getElementById('ed-eliminar').addEventListener('click', elimina);
document.getElementById('ed-soltar').addEventListener('click', function(){ ED.sel = []; marcaSel(); });
[['ed-subir', 0.1], ['ed-bajar', -0.1]].forEach(function(q){
  document.getElementById(q[0]).addEventListener('click', function(){ paso(ED.sel, 0, 0, 0, q[1]); });
});
[['ed-izq', 15], ['ed-der', -15]].forEach(function(q){
  document.getElementById(q[0]).addEventListener('click', function(){ paso(ED.sel, 0, 0, q[1]*Math.PI/180); });
});
/* Añadir luces: se elige el tipo y cada clic pone una donde se pincha. Los del techo van al techo
   de encima (vale pinchar el suelo), el aplique en la cara de la pared y la farola y la baliza en
   el suelo. Cada una lleva el siguiente ID libre de su estancia (SAL-L03) y se guarda en
   cambios.json con `nuevo` (tipo y posición en el plano), para pasarla a las luces de los datos. */
var TIPOS_LUZ = [['foco','Foco'], ['colgante','Colgante'], ['plafon','Plafón'], ['aplique','Aplique'], ['tira','Tira LED'],
                 ['farola','Farola'], ['farolillo','Baliza']];
var contPoner = document.getElementById('ed-luces');
TIPOS_LUZ.forEach(function(t){
  var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t[1]; b.dataset.tipo = t[0];
  b.addEventListener('click', function(){ ponerLuz(ED.poner === t[0] ? null : t[0]); });
  contPoner.appendChild(b);
});
function ponerLuz(tipo){
  ED.poner = tipo;
  [].forEach.call(contPoner.querySelectorAll('.chip'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.tipo === tipo)); });
  if(tipo){ ED.sel = []; marcaSel(); ocultar(); }
}
function idLibre(cod){
  var n = 0, re = new RegExp('^' + cod + '-L(\\d+)$');
  IDS.map(function(x){ return x.id; }).concat(Object.keys(ED.cambios).map(function(k){ return k.split('|')[0]; }))
    .forEach(function(id){ var r = re.exec(id); if(r) n = Math.max(n, +r[1]); });
  return cod + '-L' + String(n + 1).padStart(2, '0');
}
/* Levanta la luz de un cambio con `nuevo` en su versión, con su ficha y su entrada de IDs */
function creaLuz(c){
  var v = c.version || 'actual', bC = C, bI = INT;
  C = casaDe(v); INT = C.interior; V_CONS = v;
  var n0 = PUNTOS.length, r = construyeMueble(Object.assign({id:c.id, nuevo:true}, c.nuevo), G_INT[v]);
  PUNTOS.slice(n0).forEach(function(p){ if(p.fuera) asegurarGrupo(p.grupo); });
  C = bC; INT = bI; V_CONS = '';
  var mallas = [];
  r.grupo.traverse(function(o){ if(o.isMesh){ o.castShadow = o.receiveShadow = true; mallas.push(o); } });
  r.grupo.updateMatrixWorld(true);
  var caja3 = new THREE.Box3(); mallas.forEach(function(m){ caja3.expandByObject(m); });
  var e = {id:c.id, info:r.info, malla:mallas[0], mallas:mallas, caja:caja3, version:v, nuevo:true};
  e.pos = caja3.getCenter(new THREE.Vector3()); e.pos.y = Math.min(caja3.max.y, e.pos.y + 0.3);
  IDS.push(e); LZ.sucio = true;
  return e;
}
function ponLuz(ev){
  rayoEn(ev);
  var h = rayo.intersectObjects(pick.filter(visible).concat([pad, fuera].filter(visible)), false)[0];
  if(!h) return;
  var tipo = ED.poner, v = VERSION, gI = G_INT[v]; gI.updateMatrixWorld();
  var inv = gI.matrixWorld.clone().invert(), q = h.point.clone().applyMatrix4(inv);   // marco de la casa: x = u, z = v
  var nuevo = {tipo:tipo, uv:[+q.x.toFixed(3), +q.z.toFixed(3)]};
  if(tipo === 'aplique'){
    var n = h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(inv);
    if(!n || Math.abs(n.y) > 0.5){ edEstado.textContent = 'El aplique va en una pared: pincha en su cara'; return; }
    nuevo.giro = +(Math.atan2(n.x, n.z)*180/Math.PI).toFixed(1);
  }
  if(tipo === 'farola' || tipo === 'farolillo') nuevo.cota = +q.y.toFixed(3);   // sobre lo que se pinche
  var est = estanciaMundo(h.point.x, h.point.z);
  instantanea();
  var c = {id:idLibre(est && est.codigo || 'EXT'), version:v, tipo:'Iluminación', nombre:NOMBRE_MUEBLE[tipo], nuevo:nuevo, giro:0};
  var e = creaLuz(c);
  c.desde = [+e.pos.x.toFixed(3), +e.pos.z.toFixed(3)]; c.hasta = c.desde.slice();
  ED.cambios[c.id + '|' + v] = c; e.cambio = c;
  guarda();
}
document.getElementById('ed-copiar').addEventListener('click', function(){
  var t = JSON.stringify({cambios:listaCambios()}, null, 1), b = this;
  try{ navigator.clipboard.writeText(t).then(function(){ b.textContent = 'Copiado'; setTimeout(function(){ b.textContent = 'Copiar cambios'; }, 1500); }); }catch(err){}
});
/* ===================== etiquetas, brújula, escala ===================== */
var capaEtq = document.getElementById('etiquetas');
var conEtq = [], vistas = {};
pick.forEach(function(m){
  var i = m.userData.info;
  if(i.etiqueta && i.centro && !vistas[i.etiqueta]){ vistas[i.etiqueta] = 1; conEtq.push(m); }
});
var vec = new THREE.Vector3();
function pintarEtq(){
  if(!verEtq) return;
  var html = '', r = lienzoGL.getBoundingClientRect();
  conEtq.forEach(function(m){
    if(!visible(m)) return;
    var i = m.userData.info;
    vec.set(i.centro[0], i.alturaEtq != null ? i.alturaEtq : SUELO+0.6, i.centro[1]);
    if(vec.distanceTo(camara.position) > 260) return;
    vec.project(camara);
    if(vec.z > 1 || Math.abs(vec.x) > 1.1 || Math.abs(vec.y) > 1.1) return;
    html += '<div class="etq" style="left:'+((vec.x*0.5+0.5)*r.width).toFixed(1)+
            'px;top:'+((-vec.y*0.5+0.5)*r.height).toFixed(1)+'px">'+i.etiqueta+'</div>';
  });
  capaEtq.innerHTML = html;
}
var aguja = document.getElementById('aguja');
var escTxt = document.getElementById('escala-txt'), escBar = document.getElementById('escala-barra');
function pintarHud(){
  if(pie.activo){ aguja.setAttribute('transform','rotate('+(pie.yaw*180/Math.PI).toFixed(1)+' 24 24)'); return; }
  aguja.setAttribute('transform','rotate('+(theta*180/Math.PI).toFixed(1)+' 24 24)');
  var altoVis = 2*Math.tan(d2r(camara.fov/2))*dist;
  var pxm = lienzoGL.clientHeight/altoVis, cand = [1,2,5,10,20,50,100], m = 1;
  cand.forEach(function(c){ if(c*pxm < 150) m = c; });
  escTxt.textContent = m+' m'; escBar.style.width = (m*pxm).toFixed(0)+'px';
}

/* ===================== a pie ===================== */
/* Paseo en primera persona. Los pies van sobre lo que haya debajo (terreno, losas, peldaños),
   se sube lo que no pase de un escalón alto y los muros, troncos y lindes paran el paso. */
var pie = {activo:false, x:0, z:0, y:SUELO, yaw:0, pitch:0, teclas:{}, bloqueo:false,
           anda:null, mira:null, fase:0, bamb:0};
var OJOS = 1.65, PASO = 0.45, RADIO = 0.3, ANDA = 1.4, CORRE = 4.2;
/* Palanca táctil: `muerta` es el margen en el que un dedo quieto no mueve nada, `radio` el
   recorrido en píxeles hasta el tope, `correA` la fuerza a partir de la cual ya se corre,
   `sens` los píxeles de dedo por radián al mirar y `desde` la fuerza desde la que se acelera. */
var TAC = {muerta:0.13, radio:58, correA:0.85, sens:0.0046, desde:0.35};
/* Ajustes del paseo: `sens` multiplica lo rápido que gira la vista, `invY` la da vuelta,
   `bamboleo` añade el vaivén de la cabeza al andar y `fov` el campo de visión. Se guardan
   en el navegador, así que cada uno deja la casa a su gusto y no se repite. */
var AJ = {sens:1.0, invY:false, bamboleo:true, fov:72};
(function leeAjustes(){
  try{ var s = JSON.parse(localStorage.getItem('arsdomus-pie') || 'null');
       if(s) for(var k in AJ) if(s[k] !== undefined) AJ[k] = s[k]; }catch(e){}
})();
function guardaAjustes(){ try{ localStorage.setItem('arsdomus-pie', JSON.stringify(AJ)); }catch(e){} }
var solidos = null;
function listaSolidos(){
  var l = [];
  escena.traverse(function(o){
    if(!o.isMesh || o === cielo || o.userData.copa || o.material === MAT.malla) return;
    o.userData.noPisable = !!(o.userData.soloChoque || o.geometry.userData.muro);
    l.push(o);
  });
  return l;
}
var vN = new THREE.Vector3(), rayoPie = new THREE.Raycaster(), ABAJO = new THREE.Vector3(0,-1,0), vO = new THREE.Vector3(), vD = new THREE.Vector3();
function visibles(){ return solidos.filter(visible); }
function pisables(l){ return l.filter(function(o){ return !o.userData.noPisable; }); }
function soloMuros(l){ return l.filter(function(o){ return o.geometry.userData.muro; }); }
/* Altura del suelo en (x, z) buscando desde `desde` hacia abajo. */
function sueloEn(x, z, desde, lista){
  rayoPie.set(vO.set(x, desde, z), ABAJO); rayoPie.far = 60;
  var h = rayoPie.intersectObjects(lista, false)[0];
  if(!h) return {y:-99, agua:false, empinado:false};
  // un tejado no se pisa: si la superficie cae más de ~14° no vale como suelo
  var ny = h.face && !h.object.isInstancedMesh ? vN.copy(h.face.normal).transformDirection(h.object.matrixWorld).y : 1;
  return {y:h.point.y, agua:h.object.material === MAT.agua, empinado:Math.abs(ny) < 0.97};
}
/* ¿Hay algo entre (x, z) y (x+dx, z+dz) a la altura de las rodillas o del pecho? */
function choca(x, z, dx, dz, lista){
  var L = Math.hypot(dx, dz); if(L < 1e-6) return false;
  vD.set(dx/L, 0, dz/L);
  // a 25 cm solo cuentan los muros (un peto no se salta); más arriba, todo
  var alturas = [[0.25, lista.muros], [PASO+0.1, lista.todo], [1.1, lista.todo], [1.6, lista.todo]];
  for(var i=0;i<alturas.length;i++){
    rayoPie.set(vO.set(x, pie.y+alturas[i][0], z), vD); rayoPie.far = L + RADIO;
    if(rayoPie.intersectObjects(alturas[i][1], false).length) return true;
  }
  return false;
}
function intenta(dx, dz, lista){
  if(choca(pie.x, pie.z, dx, dz, lista)) return false;
  var s = sueloEn(pie.x+dx, pie.z+dz, pie.y+PASO, lista.suelo);
  if(s.agua || s.empinado || s.y > pie.y+PASO) return false;
  pie.x += dx; pie.z += dz;
  return true;
}
function andar(dt){
  var t = pie.teclas, v0 = visibles(), lista = {todo:v0, suelo:pisables(v0), muros:soloMuros(v0)};
  var x0 = pie.x, z0 = pie.z;
  var fw = (t.w||t.arriba ? 1 : 0) - (t.s||t.abajo ? 1 : 0), st = (t.d ? 1 : 0) - (t.a ? 1 : 0);
  if(t.izq) pie.yaw += 1.8*dt;
  if(t.der) pie.yaw -= 1.8*dt;
  var empuje = 0;                                                // fuerza con que empuja la palanca (0..1)
  if(pie.anda){ fw += -pie.anda.dy; st += pie.anda.dx; empuje = Math.hypot(pie.anda.dx, pie.anda.dy); }
  var n = Math.hypot(fw, st);
  if(n > 0.05){
    if(n > 1){ fw /= n; st /= n; }
    // con el teclado va de o se anda o se corre; con la palanca, cuanto más se empuja más rápido
    var rapido = (t.mayus || pie.corre) ? 1 : Math.max(0, Math.min(1, (empuje - TAC.desde)/(TAC.correA - TAC.desde)));
    var v = (ANDA + (CORRE - ANDA)*rapido)*dt, sy = Math.sin(pie.yaw), cy = Math.cos(pie.yaw);
    var dx = (-sy*fw + cy*st)*v, dz = (-cy*fw - sy*st)*v;
    // si de frente no se puede, se desliza por la pared
    if(!intenta(dx, dz, lista)){ if(!intenta(dx, 0, lista)) intenta(0, dz, lista); }
  }
  var s = sueloEn(pie.x, pie.z, pie.y+PASO, lista.suelo);
  if(s.y > -90) pie.y += (s.y - pie.y)*Math.min(1, dt*(s.y > pie.y ? 14 : 8));
  /* Bamboleo: el vaivén de la cabeza al andar, dos zancadas por metro. Se suaviza hacia el
     objetivo en vez de aparecer de golpe, para que al arrancar y al parar no dé un tirón. */
  varjedida = Math.hypot(pie.x-x0, pie.z-z0);
  if(jedida > 0.0004) pie.fase += jedida*Math.PI*3.0;
  var b = (jedida > 0.0004 && AJ.bamboleo) ? Math.sin(pie.fase)*0.032 : 0;
  pie.bamb += (b - pie.bamb)*Math.min(1, dt*10);
  camara.position.set(pie.x, pie.y+OJOS + pie.bamb, pie.z);
  camara.rotation.set(pie.pitch, pie.yaw, pie.bamb*0.25, 'YXZ');
}
var botonPie = document.getElementById('a-pie'), pieHud = document.getElementById('pie-hud');
var pieEstado = document.getElementById('pie-estado');
var orbitaGuardada = null, etqAntes = true, capasAntes = null;
/* En el paseo siempre hay techos y árboles, aunque se entre desde una vista de «Dentro», que los quita;
   al salir se dejan como estaban */
function ponCapa(k, v){ capas[k].visible = v; var c = document.getElementById('capa-' + k); if(c) c.checked = v; }   // la capa «catastro» no tiene casilla si la casa no la trae
function entrarPie(x, z, yaw){
  if(!solidos) solidos = listaSolidos();
  capasAntes = {cubierta:capas.cubierta.visible, arboles:capas.arboles.visible};
  ponCapa('cubierta', true); ponCapa('arboles', true);
  orbitaGuardada = {o:objetivo.clone(), d:dist, t:theta, p:phi, f:camara.fov};
  pie.activo = true; pie.x = x; pie.z = z; pie.yaw = yaw; pie.pitch = 0; pie.teclas = {};
  pie.anda = null; pie.mira = null; pintaPalanca(null);
  // el suelo se busca primero a la altura de una persona: bajo un porche, no en su tejado
  var l = pisables(visibles()), s0 = sueloEn(x, z, SUELO + 1.8, l);
  pie.y = s0.y > -90 ? s0.y : sueloEn(x, z, 50, l).y;
  camara.fov = AJ.fov; camara.updateProjectionMatrix();
  etqAntes = verEtq; verEtq = false; capaEtq.innerHTML = '';
  ocultar(); document.body.classList.add('a-pie'); pieHud.hidden = false;
  botonPie.setAttribute('aria-pressed','true');
  pieEstado.textContent = 'Haz clic o arrastra para mirar';
}
function salirPie(){
  if(!pie.activo) return;
  salirTour(true);                                 // si venía de un tour, que no se quede colgado
  soltar(false);
  pie.activo = false; ponCorrer(false);
  pie.anda = null; pie.mira = null; pintaPalanca(null);        // no dejar la palanca en pantalla
  if(document.pointerLockElement) document.exitPointerLock();
  var g = orbitaGuardada;
  objetivo.copy(g.o); dist = g.d; theta = g.t; phi = g.p; camara.fov = g.f; camara.updateProjectionMatrix();
  camara.rotation.set(0,0,0);
  verEtq = etqAntes; document.body.classList.remove('a-pie'); pieHud.hidden = true;
  if(capasAntes){ ponCapa('cubierta', capasAntes.cubierta); ponCapa('arboles', capasAntes.arboles); capasAntes = null; }
  cercana = null; rotuloPuertas();
  botonPie.setAttribute('aria-pressed','false');
}
botonPie.addEventListener('click', function(){
  // se empieza delante de la casa, mirando a la fachada
  entrarPie(1.0, 23.0, d2r(8));
});
document.getElementById('salir-pie').addEventListener('click', salirPie);
/* Atajos del paseo: cada sitio lleva a su centro, a la altura de los ojos y mirando hacia donde
   se miraba, para girar sobre uno mismo. Si en el centro hay un mueble, el agua o un muro,
   se busca en espiral el hueco libre más cercano. */
function sitiosPie(){
  var est = C0.interior.estancias, l = [], junta = {};
  est.forEach(function(e){ if(e.junta) junta[e.id] = e.junta; });      // `junta`: la estancia es un trozo de otra
  est.forEach(function(e){
    if(junta[e.id]) return;
    var ks = est.filter(function(o){ return o.id === e.id || junta[o.id] === e.id; }).map(function(o){ return o.caja; });
    var u = 0, v = 0, a = 0;
    ks.forEach(function(k){ var s = (k[2]-k[0])*(k[3]-k[1]); u += (k[0]+k[2])/2*s; v += (k[1]+k[3])/2*s; a += s; });
    // el hueco libre se busca solo dentro de la estancia (si no, se escapa a la de al lado si tiene el suelo más bajo)
    var polys = ks.map(function(k){ return [aMundo(k[0]+0.2, k[1]+0.2), aMundo(k[2]-0.2, k[1]+0.2), aMundo(k[2]-0.2, k[3]-0.2), aMundo(k[0]+0.2, k[3]-0.2)]; });
    l.push(['Dentro', e.nombre, aMundo(u/a, v/a), function(x, z){ return polys.some(function(p){ return enPoligono(p, x, z); }); }]);
  });
  // fuera: F.sitios, [nombre, punto], y el punto es [x, z], {zona:id}, {construccion:id}, {uv:[u, v]},
  // 'piscina' o 'porton'; sin F.sitios, las zonas con nombre, las construcciones y la piscina
  var zona = function(id){ var z = X.zonas.filter(function(o){ return o.id === id; })[0]; return z && (z.poly ? centroPoly(z.poly) : z.circulo && z.circulo.slice(0, 2)); };
  var cons = function(id){ var c = X.construcciones.filter(function(o){ return o.id === id; })[0]; return c && c.centro; };
  var pt = X.porton;
  var punto = function(q){
    if(q === 'piscina') return P.centro;
    if(q === 'porton') return pt && [(pt.a[0]+pt.b[0])/2, (pt.a[1]+pt.b[1])/2 - 2.0];
    if(q.zona) return zona(q.zona);
    if(q.construccion) return cons(q.construccion);
    if(q.uv) return aMundo(q.uv[0], q.uv[1]);
    return q;
  };
  var fuera = F.sitios ? F.sitios.map(function(s){ return [s[0], punto(s[1])]; }) :
    X.zonas.filter(function(z){ return z.id && z.nombre; }).map(function(z){ return [z.nombre, zona(z.id)]; })
      .concat(X.construcciones.map(function(c){ return [c.nombre, c.centro]; }), [['Borde de la piscina', P.centro]]);
  fuera.forEach(function(f){ if(f[1]) l.push(['Fuera', f[0], f[1]]); });
  return l;
}
function huecoLibre(x, z, dentro){
  var v0 = visibles(), lista = {todo:v0, suelo:pisables(v0), muros:soloMuros(v0)}, cands = [];
  for(var r = 0; r <= 4.01; r += 0.4){
    var n = r ? Math.round(2*Math.PI*r/0.5) : 1;
    for(var i = 0; i < n; i++){
      var a = i/n*2*Math.PI, cx = x + r*Math.cos(a), cz = z + r*Math.sin(a);
      if(dentro && !dentro(cx, cz)) continue;
      var s = sueloEn(cx, cz, SUELO + 1.8, lista.suelo);
      if(s.y < -90) s = sueloEn(cx, cz, 50, lista.suelo);
      if(s.y < -90 || s.agua || s.empinado) continue;
      cands.push({x:cx, z:cz, y:s.y, r:r});
    }
  }
  if(!cands.length) return null;
  // el suelo de referencia es el más bajo de cerca del centro: así una cama o una mesa no cuentan
  var cerca = cands.filter(function(c){ return c.r <= 2.0; }), yRef = Math.min.apply(null, (cerca.length ? cerca : cands).map(function(c){ return c.y; }));
  var guarda = pie.y;
  for(var k = 0; k < cands.length; k++){
    var c = cands[k]; if(c.y > yRef + 0.15) continue;
    pie.y = c.y;
    var d = RADIO + 0.15, libre = !choca(c.x, c.z, d, 0, lista) && !choca(c.x, c.z, -d, 0, lista) &&
      !choca(c.x, c.z, 0, d, lista) && !choca(c.x, c.z, 0, -d, lista);
    pie.y = guarda;
    if(libre) return c;
  }
  return cands[0];
}
function irAPie(x, z, dentro){
  if(!pie.activo) return;
  var c = huecoLibre(x, z, dentro); if(!c) return;
  pie.x = c.x; pie.z = c.z; pie.y = c.y; pie.teclas = {};
  pie.anda = null; pie.mira = null; pintaPalanca(null);        // si se iba a medias, se suelta
}
var SITIOS_PIE = sitiosPie(), listaIr = document.getElementById('ir-pie-lista');
(function(){
  var o = document.createElement('option'); o.value = ''; o.textContent = 'Elige un sitio…'; listaIr.appendChild(o);
  ['Dentro', 'Fuera'].forEach(function(g){
    var og = document.createElement('optgroup'); og.label = g === 'Dentro' ? 'Dentro de la casa' : 'Fuera';
    SITIOS_PIE.forEach(function(s, i){
      if(s[0] !== g) return;
      var op = document.createElement('option'); op.value = String(i); op.textContent = s[1]; og.appendChild(op);
    });
    listaIr.appendChild(og);
  });
})();
['pointerdown', 'mousedown', 'touchstart'].forEach(function(t){
  document.getElementById('ir-pie').addEventListener(t, function(e){ e.stopPropagation(); }, {passive:true});
});
listaIr.addEventListener('keydown', function(e){ e.stopPropagation(); });
listaIr.addEventListener('change', function(){
  var s = SITIOS_PIE[+listaIr.value]; listaIr.value = '';
  if(s){ irAPie(s[2][0], s[2][1], s[3]); pieEstado.textContent = s[1]; }
  listaIr.blur();
});
/* Correr, para el móvil: se queda puesto hasta volver a pulsarlo o salir del paseo */
var btnCorrer = document.getElementById('correr-pie');
function ponCorrer(v){ pie.corre = v; btnCorrer.setAttribute('aria-pressed', String(v)); }
btnCorrer.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
btnCorrer.addEventListener('click', function(e){ e.stopPropagation(); ponCorrer(!pie.corre); });
var TECLA = {KeyW:'w', KeyA:'a', KeyS:'s', KeyD:'d', ArrowUp:'arriba', ArrowDown:'abajo',
             ArrowLeft:'izq', ArrowRight:'der', ShiftLeft:'mayus', ShiftRight:'mayus'};
addEventListener('keydown', function(e){
  if(!pie.activo) return;
  if(LL && teclaLlevar(e)) return;
  if(e.code === 'KeyM' && !e.repeat){ coger(); e.preventDefault(); return; }
  if(e.code === 'Escape'){ if(!document.pointerLockElement) salirPie(); return; }
  if(e.code === 'KeyE' && !e.repeat){ if(cercana) mueve(cercana); e.preventDefault(); return; }
  var k = TECLA[e.code]; if(!k) return;
  pie.teclas[k] = true; e.preventDefault();
});
addEventListener('keyup', function(e){ var k = TECLA[e.code]; if(k) pie.teclas[k] = false; });
addEventListener('blur', function(){ pie.teclas = {}; });
function mirar(dx, dy, k){
  pie.yaw -= dx*k;
  pie.pitch = Math.max(-1.35, Math.min(1.35, pie.pitch + (AJ.invY ? dy : -dy)*k));
}
/* Ratón: clic para capturar el puntero; con él capturado, clic señala lo que hay en la mira. */
lienzoGL.addEventListener('click', function(e){
  if(!pie.activo || e.pointerType === 'touch') return;
  if(LL && document.pointerLockElement === lienzoGL){ soltar(false); return; }       // llevando algo, el clic lo deja
  if(document.pointerLockElement === lienzoGL){
    var r = lienzoGL.getBoundingClientRect();
    seleccionar({clientX:r.left+r.width/2, clientY:r.top+r.height/2});
  } else if(lienzoGL.requestPointerLock && !pie.arrastrado){
    // si el navegador o el marco no dejan capturar el ratón, se sigue mirando arrastrando
    try { var pr = lienzoGL.requestPointerLock(); if(pr && pr.catch) pr.catch(function(){}); } catch(err){}
  }
  pie.arrastrado = false;
});
document.addEventListener('pointerlockchange', function(){
  pie.bloqueo = document.pointerLockElement === lienzoGL;
  pieEstado.textContent = pie.bloqueo ? 'Paseando' : 'Haz clic o arrastra para mirar';
});
document.addEventListener('mousemove', function(e){
  if(pie.activo && pie.bloqueo) mirar(e.movementX, e.movementY, 0.0022*AJ.sens);
});
/* ===================== controles táctiles =====================
   En el móvil la mitad izquierda es la palanca de andar y la derecha, mirar. La palanca es
   flotante: la base nace bajo el dedo en vez de estar clavada en un punto, que es lo que hace
   falta en un teléfono (el pulgar no cae siempre en el mismo sitio). Lleva zona muerta, para
   que restingar el pulgar no mueva la cámara, y su fuerza va de andar a correr sin botones.
   Un toque corto y quieto abre la ficha de lo que hay bajo el dedo. */
var palanca = document.getElementById('palanca'), pomo = palanca.querySelector('.pomo');
function pintaPalanca(d){
  if(!d){ palanca.classList.remove('on','mueve','corre');
          palanca.style.left = palanca.style.top = '-999px'; return; }
  palanca.style.left = d.cx+'px'; palanca.style.top = d.cy+'px';
  pomo.style.transform = 'translate('+(d.kx*TAC.radio)+'px,'+(d.ky*TAC.radio)+'px)';
  var n = Math.hypot(d.kx, d.ky);
  palanca.classList.toggle('mueve', n > 0.01);
  palanca.classList.toggle('corre', n >= TAC.correA);
}
/* Del desplazamiento del dedo al vector de andar. Por dentro de la zona muerta no hay vector;
   fuera se estira hasta 1 en el tope, para que el recorrido sea el mismo dé donde dé el dedo. */
function vectorPalanca(d, x, y){
  var dx = x - d.cx, dy = y - d.cy, n = Math.hypot(dx, dy);
  d.kx = d.ky = 0;
  if(n <= 1) return;
  var t = Math.min(1, n/TAC.radio);
  t = (t - TAC.muerta)/(1 - TAC.muerta);
  if(t <= 0) return;
  d.kx = dx/n*t; d.ky = dy/n*t;
}
/* En el tour la cámara va sola: cualquier toque es para mirar, y la palanca se aparta. */
lienzoGL.addEventListener('pointerdown', function(e){
  if(!pie.activo || pie.bloqueo) return;
  var r = lienzoGL.getBoundingClientRect();
  var izq = !TOUR.activo && e.pointerType === 'touch' && e.clientX < r.left + r.width/2;
  var d = {id:e.pointerId, x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY,
           cx:e.clientX, cy:e.clientY, kx:0, ky:0, dx:0, dy:0, t0:performance.now()};
  if(izq){ d.cx = e.clientX; d.cy = e.clientY; pie.anda = d; pintaPalanca(d); }  // la base, bajo el dedo
  else pie.mira = d;                        // con el ratón sin capturar, arrastrar también mira
});
lienzoGL.addEventListener('pointermove', function(e){
  if(!pie.activo) return;
  var a = pie.anda, m = pie.mira;
  if(a && a.id === e.pointerId){
    vectorPalanca(a, e.clientX, e.clientY); a.dx = a.kx; a.dy = a.ky;
    pintaPalanca(a);
  }
  if(m && m.id === e.pointerId){
    mirar(e.clientX-m.x, e.clientY-m.y, TAC.sens*AJ.sens); m.x = e.clientX; m.y = e.clientY;
    if(Math.abs(e.clientX-m.x0) + Math.abs(e.clientY-m.y0) > 6) pie.arrastrado = true;
  }
});
function suelta(e){
  var d = pie.anda && pie.anda.id === e.pointerId ? pie.anda : pie.mira && pie.mira.id === e.pointerId ? pie.mira : null;
  if(!d) return;
  if(pie.anda === d){ pie.anda = null; pintaPalanca(null); }
  if(pie.mira === d) pie.mira = null;
  // un toque corto y quieto (en el móvil) abre la ficha de lo que hay bajo el dedo
  if(e.type === 'pointerup' && e.pointerType === 'touch' && pie.activo &&
     Math.abs(e.clientX-d.x0) + Math.abs(e.clientY-d.y0) < 10 && performance.now() - d.t0 < 350) seleccionar(e);
}
lienzoGL.addEventListener('pointerup', suelta);
lienzoGL.addEventListener('pointercancel', suelta);
/* Un dispositivo con pantalla táctil: se marca en <body> para la ayuda y para insinuar la
   zona de la palanca al entrar en el paseo. Un teclado delante también cuenta. */
if(TACTIL) document.body.classList.add('tactil');

/* Ajustes del paseo: los dos deslizadores y las dos casillas, sobre `AJ`. */
(function(){
  var btn = document.getElementById('ajustes-pie'), caja = document.getElementById('ajustes-caja');
  if(!btn || !caja) return;
  var sens = document.getElementById('pie-sens'), fov = document.getElementById('pie-fov');
  var invy = document.getElementById('pie-invy'), bamb = document.getElementById('pie-bamb');
  btn.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    var abierto = caja.hidden;
    caja.hidden = !abierto;
    btn.setAttribute('aria-expanded', String(abierto));
  });
  sens.value = AJ.sens; fov.value = AJ.fov; invy.checked = AJ.invY; bamb.checked = AJ.bamboleo;
  document.getElementById('pie-sens-v').textContent = AJ.sens.toFixed(2);
  document.getElementById('pie-fov-v').textContent = AJ.fov+'°';
  sens.addEventListener('input', function(){
    AJ.sens = parseFloat(sens.value);
    document.getElementById('pie-sens-v').textContent = AJ.sens.toFixed(2); guardaAjustes();
  });
  fov.addEventListener('input', function(){
    AJ.fov = parseInt(fov.value, 10);
    document.getElementById('pie-fov-v').textContent = AJ.fov+'°'; guardaAjustes();
    if(pie.activo){ camara.fov = AJ.fov; camara.updateProjectionMatrix(); }   // en pleno paseo, al momento
  });
  invy.addEventListener('change', function(){ AJ.invY = invy.checked; guardaAjustes(); });
  bamb.addEventListener('change', function(){ AJ.bamboleo = bamb.checked; guardaAjustes(); });
})();

/* ===================== tour de calles =====================
   Recorrido guiado por el eje de un camino: la cámara avanza sola a la altura de una persona
   y mira por dónde va. Es el «street view» de la maqueta. Se puede arrastrar para mirar a otro
   lado; al soltar, la vista vuelve sola hacia delante. */
function construyeTours(){
  var l = [];
  X.caminos.forEach(function(c){
    if(!c.eje || c.eje.length < 2) return;
    var pts = [], s = 0;
    for(var i = 0; i < c.eje.length; i++){
      if(i) s += Math.hypot(c.eje[i][0]-c.eje[i-1][0], c.eje[i][1]-c.eje[i-1][1]);
      pts.push({x:c.eje[i][0], z:c.eje[i][1], s:s});
    }
    if(s >= 1) l.push({id:c.id, nombre:c.nombre || c.id, pts:pts, largo:s});
  });
  return l;
}
/* Punto del eje a distancia `s`. Con la cámara en YXZ y mirando a -Z, avanzar significa
   yaw = atan2(-dx, -dz). */
function posEnTour(t, s){
  var p = t.pts, i = 0;
  while(i < p.length-2 && p[i+1].s < s) i++;
  var a = p[i], b = p[Math.min(i+1, p.length-1)], d = b.s - a.s;
  var k = d > 1e-6 ? Math.max(0, Math.min(1, (s - a.s)/d)) : 0;
  return {x:a.x + (b.x - a.x)*k, z:a.z + (b.z - a.z)*k};
}
/* El rumbo se saca mirando un poco por delante y otro poco por detrás, no con el tramo justo:
   si no, en cada curva la cámara da un latigazo de golpe. Con esta ventana, la curva se
   redondea sola. */
function enTour(t, s){
  var a = posEnTour(t, Math.max(0, s - 1.0)), b = posEnTour(t, Math.min(t.largo, s + 2.2));
  var p = posEnTour(t, s), dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1;
  return {x:p.x, z:p.z, yaw:Math.atan2(-dx/n, -dz/n)};
}
var TOURS = construyeTours();
var TOUR = {activo:false, i:0, s:0, y:0, base:0, play:true, ritmo:2, quieto:0};
var tourHud = document.getElementById('tour-hud'), btnTourPlay = document.getElementById('tour-play');
var avance = document.getElementById('tour-avance'), listaTour = document.getElementById('tour-lista');

function pintaTour(){
  if(!TOURS.length){
    listaTour.innerHTML = '';
    var o = document.createElement('option');
    o.textContent = 'Esta casa no tiene caminos'; listaTour.appendChild(o);
    return;
  }
  listaTour.innerHTML = '';
  TOURS.forEach(function(t, i){
    var o = document.createElement('option');
    o.value = String(i); o.textContent = t.nombre; listaTour.appendChild(o);
  });
  listaTour.value = String(TOUR.i);
}
function ponPlay(v){
  TOUR.play = v;
  btnTourPlay.textContent = v ? 'Pausa' : 'Seguir';
  btnTourPlay.setAttribute('aria-pressed', String(v));
  btnTourPlay.setAttribute('aria-label', v ? 'Pausa el recorrido' : 'Seguir el recorrido');
}
function entraTour(i){
  if(!TOURS.length) return;
  TOUR.i = Math.max(0, Math.min(TOURS.length-1, i|0));
  var t = TOURS[TOUR.i], q = enTour(t, 0);
  salirTour(true);                                  // por si ya venía de otro
  entrarPie(q.x, q.z, q.yaw);                       // deja el paseo listo: suelo, capas, HUD y mira
  TOUR.activo = true; TOUR.s = 0; TOUR.y = pie.y; TOUR.base = q.yaw; TOUR.quieto = 0;
  ponPlay(true);
  listaTour.value = String(TOUR.i);
  document.body.classList.add('tourando');
  tourHud.hidden = false;
  pieEstado.textContent = 'Tour: arrastra para mirar, y vuelve solo a mirar al frente';
}
function salirTour(silencioso){
  if(!TOUR.activo) return;
  TOUR.activo = false;
  document.body.classList.remove('tourando');
  tourHud.hidden = true;
  if(!silencioso) salirPie();
}
function andaTour(dt){
  var t = TOURS[TOUR.i]; if(!t){ TOUR.activo = false; return; }
  if(TOUR.play) TOUR.s += TOUR.ritmo*dt;
  if(TOUR.s >= t.largo) TOUR.s = 0;                // al final del camino, otra vez desde el principio
  var q = enTour(t, TOUR.s);
  var l = pisables(visibles()), s0 = sueloEn(q.x, q.z, SUELO + 1.8, l);
  var y = s0.y > -90 ? s0.y : sueloEn(q.x, q.z, 50, l).y;
  if(y > -90) TOUR.y += (y - TOUR.y)*Math.min(1, dt*6);
  TOUR.base = q.yaw;
  /* Arrastrando se mira a donde se quiera; al soltar, tras un segundo, la vista vuelve sola
     hacia delante. Es `mirar()` quien mueve yaw y pitch, así que funciona igual con el dedo
     que con el ratón. */
  if(pie.mira || pie.bloqueo){ TOUR.quieto = 0; }
  else if(TOUR.quieto += dt, TOUR.quieto > 1.0){
    var k = Math.min(1, dt*1.6), d = ((q.yaw - pie.yaw + Math.PI*3) % (Math.PI*2)) - Math.PI;
    pie.yaw += d*k; pie.pitch += (0 - pie.pitch)*k;
  }
  pie.x = q.x; pie.z = q.z; pie.y = TOUR.y;
  camara.position.set(q.x, TOUR.y + OJOS, q.z);
  camara.rotation.set(pie.pitch, pie.yaw, 0, 'YXZ');
  avance.style.width = (TOUR.s/t.largo*100).toFixed(1)+'%';
}
pintaTour();
['pointerdown'].forEach(function(ev){
  btnTourPlay.addEventListener(ev, function(e){ e.stopPropagation(); });
  document.getElementById('tour-out').addEventListener(ev, function(e){ e.stopPropagation(); });
  document.getElementById('tour-inicio').addEventListener(ev, function(e){ e.stopPropagation(); });
  listaTour.addEventListener(ev, function(e){ e.stopPropagation(); });
  document.getElementById('tour-ritmo').addEventListener(ev, function(e){ e.stopPropagation(); });
});
btnTourPlay.addEventListener('click', function(e){ e.stopPropagation(); ponPlay(!TOUR.play); });
document.getElementById('tour-inicio').addEventListener('click', function(e){
  e.stopPropagation(); TOUR.s = 0; TOUR.quieto = 9;                    // 9 s quieto: que mire al frente ya
});
document.getElementById('tour-out').addEventListener('click', function(e){ e.stopPropagation(); salirTour(); marcaTour(); });
listaTour.addEventListener('change', function(){ entraTour(parseInt(listaTour.value, 10)); listaTour.blur(); });
document.getElementById('tour-ritmo').addEventListener('input', function(e){ TOUR.ritmo = parseFloat(e.target.value); });
/* El botón del panel alterna el tour: si ya está en marcha, lo corta. `?tour=N` arranca
   directo con el camino número N, para las capturas y para abrir un enlace concreto. */
var btnTour = document.getElementById('tour-ir');
function marcaTour(){
  btnTour.setAttribute('aria-pressed', String(TOUR.activo));
  btnTour.textContent = TOUR.activo ? 'Parar el tour' : 'Tour guiado por los caminos';
}
(function(){
  btnTour.addEventListener('click', function(){
    if(TOUR.activo) salirTour(); else entraTour(TOUR.i);
    marcaTour();
  });
  document.getElementById('a-pie').addEventListener('click', function(){ if(TOUR.activo){ salirTour(true); marcaTour(); } });
  if(QS.has('tour')) entraTour(parseInt(QS.get('tour'), 10) || 0);
  marcaTour();
})();

/* ===================== mover desde el paseo =====================
   M (o el botón) coge lo que hay en la mira; lo que se lleva va al punto del suelo (o de la pared)
   al que se mira, sin cambiar de altura. La rueda gira (15°; Mayús, 1°), R/F suben y bajan (10 cm;
   Mayús, 1 cm), M o un clic lo dejan, Esc lo devuelve a su sitio y Supr lo elimina. Se guarda
   igual que en el modo «Mover objetos» (cambios.json, y Ctrl+Z en ese modo lo deshace). */
var LL = null, btnLlevar = document.getElementById('llevar-pie'), MIRA = new THREE.Vector2(0, 0);
function pintaLlevar(){
  btnLlevar.setAttribute('aria-pressed', String(!!LL));
  btnLlevar.textContent = LL ? 'Dejar ' + LL.e.id : 'Mover lo que miras';
  pieEstado.textContent = LL ? 'Llevando ' + LL.e.id + ': rueda gira · R/F altura · M o clic deja · Esc lo devuelve · Supr elimina'
                             : (pie.bloqueo ? 'Paseando' : 'Haz clic o arrastra para mirar');
}
function coger(){
  if(LL){ soltar(false); return; }
  rayo.setFromCamera(MIRA, camara);
  var h = rayo.intersectObjects(pick.filter(visible), false)[0], e = h && entradaDe(h.object, h.instanceId);
  // los árboles no: la copa se cruzaría con la mira todo el rato (se mueven en «Mover objetos»)
  if(!h || h.distance > 10 || !movible(e) || e.arbol){ pieEstado.textContent = 'En la mira no hay nada que se pueda mover'; return; }
  LL = {e:e, antes:JSON.stringify(ED.cambios), movido:false};
  ocultar(); ED.sel = [e]; marcaSel(); pintaLlevar();
}
function soltar(cancelar){
  if(!LL) return;
  if(cancelar) irAEstado(JSON.parse(LL.antes));
  else if(LL.movido){ ED.hist.push(LL.antes); if(ED.hist.length > 200) ED.hist.shift(); guarda(); }
  LL = null; ED.sel = []; marcaSel(); pintaLlevar();
}
function pasoLlevar(T, giro, alto){
  var e = LL.e; apunta(e); transforma(e, T);
  e.cambio.giro += giro || 0; if(alto) e.cambio.alto = +((e.cambio.alto || 0) + alto).toFixed(3);
  actualiza(e); LL.movido = true; marcaSel(); LZ.sucio = true;
}
function llevar(){
  if(!LL) return;
  rayo.setFromCamera(MIRA, camara);
  var fuera = LL.e.mallas || [];
  var h = rayo.intersectObjects(pick.filter(function(m){ return visible(m) && fuera.indexOf(m) < 0; }).concat([pad]), false)[0];
  if(!h || h.distance > 15) return;
  var dx = h.point.x - LL.e.pos.x, dz = h.point.z - LL.e.pos.z;
  if(Math.abs(dx) + Math.abs(dz) > 0.005) pasoLlevar(new THREE.Matrix4().makeTranslation(dx, 0, dz));
}
function teclaLlevar(e){
  var st = e.shiftKey ? 0.01 : 0.1;
  if(e.code === 'KeyM' && !e.repeat) soltar(false);
  else if(e.code === 'Escape') soltar(true);
  else if(e.code === 'Delete' || e.code === 'Backspace'){
    var x = LL.e; soltar(false); ED.sel = [x]; elimina(); pintaLlevar();
  }
  else if(e.code === 'KeyR') pasoLlevar(new THREE.Matrix4().makeTranslation(0, st, 0), 0, st);
  else if(e.code === 'KeyF') pasoLlevar(new THREE.Matrix4().makeTranslation(0, -st, 0), 0, -st);
  else return false;
  e.preventDefault(); e.stopImmediatePropagation(); return true;
}
lienzoGL.addEventListener('wheel', function(e){
  if(!pie.activo || !LL) return;
  var a = (e.shiftKey ? 1 : 15)*(e.deltaY > 0 ? -1 : 1);
  pasoLlevar(giroEn(LL.e.pos.x, LL.e.pos.z, a*Math.PI/180), a);
}, {passive:true});
btnLlevar.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
btnLlevar.addEventListener('click', function(e){ e.stopPropagation(); coger(); btnLlevar.blur(); });

var panel = document.getElementById('panel');
document.getElementById('abrir-panel').addEventListener('click', function(){ panel.classList.add('abierto'); });
/* ?anonimo: sin el nombre de la casa ni su subtítulo en el panel, para capturas que se comparten */
if(QS.has('anonimo')){ document.title = 'Maqueta de la casa'; document.querySelector('#panel .cabecera h1').textContent = 'Nuestra casa'; document.querySelector('#panel .cabecera .sub').textContent = 'Maqueta 3D'; }
/* ?limpio: sin panel ni etiquetas, para las capturas de comparación */
if(QS.has('limpio')){ panel.style.display = 'none'; verEtq = false; document.getElementById('abrir-panel').style.display = 'none'; }

function redim(){
  var w = cont.clientWidth, h = cont.clientHeight;
  renderer.setSize(w,h,false); camara.aspect = w/h; camara.updateProjectionMatrix();
}
addEventListener('resize', redim);
var reloj = new THREE.Clock();
/* Los relojes de pared marcan la hora de verdad, con el segundero a saltos */
function ponHora(){
  var d = new Date(), sg = d.getSeconds(), mn = d.getMinutes() + sg/60, h = d.getHours()%12 + mn/60;
  RELOJES.forEach(function(r){ r.h.rotation.z = -h/12*2*Math.PI; r.m.rotation.z = -mn/60*2*Math.PI; if(r.s) r.s.rotation.z = -sg/60*2*Math.PI; });
}
/* ===================== puertas ===================== */
var cercana = null, fichaPuerta = null, VEL_PUERTA = 1.4;          // una puerta tarda ~0,7 s
var btnPuerta = document.getElementById('puerta-pie'), btnFicha = document.getElementById('hud-puerta');
function mueve(p){ p.obj = p.obj > 0.5 ? 0 : 1; rotuloPuertas(); }
function rotulo(p){ return (p.obj > 0.5 ? 'Cerrar ' : 'Abrir ') + p.nombre; }
function rotuloPuertas(){
  btnPuerta.hidden = !cercana; if(cercana) btnPuerta.textContent = rotulo(cercana) + ' (E)';
  btnFicha.hidden = !fichaPuerta; if(fichaPuerta) btnFicha.textContent = rotulo(fichaPuerta);
}
function animaPuertas(dt){
  PUERTAS.forEach(function(p){
    if(p.t === p.obj) return;
    p.t = p.obj > p.t ? Math.min(p.obj, p.t + dt*VEL_PUERTA) : Math.max(p.obj, p.t - dt*VEL_PUERTA);
    var s = p.t*p.t*(3 - 2*p.t);                                       // arranca y frena suave
    p.aplica(s);
  });
}
/* La puerta más cercana a menos de 1,8 m del paseante, a su altura. */
var vP = new THREE.Vector3();
function buscaPuerta(){
  var mejor = null, dm = 1.8;
  PUERTAS.forEach(function(p){
    if(!p.w) p.w = p.g.localToWorld(vP.set(p.local[0], p.local[1], p.local[2])).clone();
    if(!visible(p.g) || Math.abs(p.w.y - (pie.y + 1.0)) > 1.6) return;
    var d = Math.hypot(p.w.x - pie.x, p.w.z - pie.z);
    if(d < dm){ dm = d; mejor = p; }
  });
  if(mejor !== cercana){ cercana = mejor; rotuloPuertas(); }
}
btnPuerta.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
btnPuerta.addEventListener('click', function(e){ e.stopPropagation(); if(cercana) mueve(cercana); });
btnFicha.addEventListener('click', function(){ if(fichaPuerta) mueve(fichaPuerta); });

function bucle(){
  requestAnimationFrame(bucle);
  var dt = Math.min(0.3, reloj.getDelta());
  for(var h = 0; h < AD.hooks.length; h++){ try{ AD.hooks[h](dt); }catch(e){ console.warn('AD hook', e); } }
  if(TOUR.activo) andaTour(dt);
  else if(pie.activo){ var n = Math.ceil(dt/0.05); for(var i=0;i<n;i++) andar(dt/n); }
  else { mueveOrbita(dt); colocar(); }
  animaPuertas(dt);
  ponHora();
  repartirLuces(); cuentaFps();
  if(pie.activo){ buscaPuerta(); llevar(); }
  renderer.render(escena, camara);
  if(!pie.activo) pintarEtq();
  pintarIds();
  pintarHud();
}
/* ?vista=N abre directamente una de las vistas */
var v0 = QS.get('vista');
/* ?desde=x,y,z&hacia=x,y,z&fov=n coloca la cámara a mano */
var num = function(k){ return QS.get(k).split(',').map(Number); };
if(QS.has('desde')) aplicaVista({desde:num('desde'), hacia:QS.has('hacia') ? num('hacia') : [0,1,0], fov:QS.has('fov') ? +QS.get('fov') : 42});
else eligeVista(v0 == null ? 'finca' : /^\d+$/.test(v0) ? (VISTAS[+v0] || VISTAS[0])[1] : v0);
ponVersion(QS.get('version') === 'mejorada' ? 'mejorada' : 'actual');
redim(); actualizarSol();
/* ?pie=x,z,rumbo entra directamente en el paseo (rumbo en grados, 0 = norte, 90 = este) */
if(QS.has('pie')){ var qp = num('pie'); entrarPie(qp[0], qp[1], -d2r(qp[2] || 0)); }
verIds = QS.has('ids');
if(QS.has('id')) irAId(QS.get('id'));
/* Al recargar, se vuelve a donde se estaba: la cámara (o el paseo), la versión, las capas y las
   luces de fuera. Se guarda en el navegador cada segundo y al cerrar; la hora no (siempre abre a
   mediodía). Una URL con ?vista, ?desde, ?pie o ?id manda; ?limpio empieza de cero. */
var CLAVE_VISTA = CLAVE + '-vista';
function guardaVista(){
  var o = pie.activo ? orbitaGuardada : {o:objetivo, d:dist, t:theta, p:phi, f:camara.fov};
  var cs = {}; Object.keys(capas).forEach(function(k){ cs[k] = capas[k].visible; });
  if(pie.activo && capasAntes){ cs.cubierta = capasAntes.cubierta; cs.arboles = capasAntes.arboles; }
  var s = {orbita:{o:[o.o.x, o.o.y, o.o.z], d:o.d, t:o.t, p:o.p, f:o.f}, vista:vistaActual, version:VERSION,
           capas:cs, grupos:LZ.grupos, todo:LZ.todo,
           pie:pie.activo ? {x:pie.x, z:pie.z, y:pie.y, yaw:pie.yaw, pitch:pie.pitch} : null};
  try{ localStorage.setItem(CLAVE_VISTA, JSON.stringify(s)); }catch(e){}
}
function recuperaVista(){
  var s; try{ s = JSON.parse(localStorage.getItem(CLAVE_VISTA) || 'null'); }catch(e){}
  if(!s || !s.orbita) return;
  var o = s.orbita;
  objetivo.set(o.o[0], o.o[1], o.o[2]); dist = o.d; theta = o.t; phi = o.p;
  camara.fov = o.f || 42; camara.updateProjectionMatrix();
  vistaActual = s.vista || null;
  [].forEach.call(document.querySelectorAll('.vistas .chip'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.vista === vistaActual)); });
  if(!QS.has('version') && s.version) ponVersion(s.version);
  Object.keys(s.capas || {}).forEach(function(k){ if(capas[k]) ponCapa(k, !!s.capas[k]); });
  Object.keys(s.grupos || {}).forEach(function(g){ LZ.grupos[g] = s.grupos[g]; });
  pintaGruposLuz();
  if(s.todo) btnTodo.click();
  if(s.pie){
    entrarPie(s.pie.x, s.pie.z, s.pie.yaw);
    pie.pitch = s.pie.pitch || 0; if(s.pie.y != null) pie.y = s.pie.y;
  }
}
if(!['vista', 'desde', 'pie', 'id', 'limpio'].some(function(k){ return QS.has(k); })) recuperaVista();
setInterval(guardaVista, 1000);
addEventListener('pagehide', guardaVista);
bucle();
document.getElementById('cargando').hidden = true;
window.__visor = {escena:escena, camara:camara, aplicaVista:aplicaVista, VISTAS:VISTAS, pie:pie,
                  entrarPie:entrarPie, salirPie:salirPie, IDS:IDS, irAId:irAId, ED:ED, PUNTOS:PUNTOS, LZ:LZ, REPARTO:REPARTO, estanciaActiva:estanciaActiva};

/* ── Contrato para los modulos de modulo/ ── */
AD.api = {escena:escena, camara:camara, renderer:renderer, capas:capas, pie:pie,
          TOUR:TOUR, TOURS:TOURS, PUERTAS:PUERTAS, PUNTOS:PUNTOS, pick:pick,
          VISTAS:VISTAS, VERSIONES:VERSIONES,
          GRUPOS_V:GRUPOS_V, LZ:LZ, GIRO:GIRO, SUELO:SUELO, aMundo:aMundo, d2r:d2r,
          entraPie:entrarPie, salirPie:salirPie, aplicaVista:aplicaVista, eligeVista:eligeVista,
          mueve:mueve, visible:visible, estanciaActiva:estanciaActiva, reloj:reloj,
          poneCapa:poneCapa, MUEBLE:MUEBLE, MAT:MAT, C0:C0};
/* C, INT y VERSION cambian al cambiar de version de casa: son getters, no copias.
   Un modulo que leyera una foto de C se quedaria con la planta equivocada. */
Object.defineProperty(AD.api, 'C', {get:function(){ return C; }});
Object.defineProperty(AD.api, 'INT', {get:function(){ return INT; }});
Object.defineProperty(AD.api, 'VERSION', {get:function(){ return VERSION; }});
AD.listo = true;
var pendientes = AD.pendientes.splice(0);
pendientes.forEach(function(fn){ try{ fn(); }catch(e){ console.warn('AD', e); } });
})();
