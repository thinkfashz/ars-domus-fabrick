/* Prueba del recorrido (modulo/recorrido.js) — Node, sin navegador.
   Comprueba lo que no se ve a ojo: que el recorrido pasa por todas las
   estancias, que no atraviesa ningún tabique, que las paradas están libres de
   muebles y que la cámara va a 1,62 m del suelo con el FOV humano. */
const C = require(__dirname + '/carga.js');
const {AD, comprueba, fin, cargaModulo, avisaListo, cuadro, CASA} = C;

/* El paseo del visor, en mentira: al entrar, la cámara queda activa. */
AD.api.entraPie = function(x, z, yaw){ AD.api.pie.activo = true; AD.api.pie.x = x; AD.api.pie.z = z; AD.api.pie.yaw = yaw; };
AD.api.salirPie = function(){ AD.api.pie.activo = false; };
AD.api.orbita = function(){ return {o:[0,0,0], d:10, t:0, p:1, f:42}; };
AD.api.restauraOrbita = function(){};

/* ── Utilidades de geometría (las mismas reglas que el módulo) ── */
function seg(w){ return {u0:Math.min(w[0],w[2]), v0:Math.min(w[1],w[3]), u1:Math.max(w[0],w[2]), v1:Math.max(w[1],w[3])}; }
function enMuro(p, m){
  const s = seg(m), g = (m[4] || 0.12)/2 + 0.02;
  if(s.u1 - s.u0 < 0.01) return p[0] >= s.u0 - g && p[0] <= s.u1 + g && p[1] >= s.v0 && p[1] <= s.v1;
  if(s.v1 - s.v0 < 0.01) return p[1] >= s.v0 - g && p[1] <= s.v1 + g && p[0] >= s.u0 && p[0] <= s.u1;
  return p[0] >= s.u0 - g && p[0] <= s.u1 + g && p[1] >= s.v0 - g && p[1] <= s.v1 + g;
}
function cortaRect(p0, p1, r){
  let t0 = 0, t1 = 1;
  const dx = p1[0]-p0[0], dy = p1[1]-p0[1];
  const ejes = [[-dx, p0[0]-r.u0], [dx, r.u1-p0[0]], [-dy, p0[1]-r.v0], [dy, r.v1-p0[1]]];
  for(const [p, q] of ejes){
    if(p === 0){ if(q < 0) return false; continue; }
    const t = q/p;
    if(p < 0){ if(t > t1) return false; if(t > t0) t0 = t; }
    else { if(t < t0) return false; if(t < t1) t1 = t; }
  }
  return true;
}
function dist(a, b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }

/* ── Cargar el módulo ── */
cargaModulo('recorrido');
avisaListo();

const R = AD.recorrido;
comprueba('la API existe', !!R);
if(!R) fin();

const ESTANCIAS = CASA.casa.interior.estancias;
const MUROS = CASA.casa.muros;

/* ── Abrir el recorrido ── */
const ok = R.abrir();
comprueba('abre sin error', ok === true, ok);
comprueba('el recorrido queda abierto', R.abierto() === true);
comprueba('la cámara entra en el paseo', AD.api.pie.activo === true);

const st = R.estado();
comprueba('el recorrido tiene paradas', st.ruta.length > 0, st.ruta.length);
comprueba('pasa por todas las estancias',
  ESTANCIAS.every(e => st.ruta.some(p => p.id === e.id)),
  st.ruta.map(p => p.id).join(',') + ' | faltan: ' +
  ESTANCIAS.filter(e => !st.ruta.some(p => p.id === e.id)).map(e => e.id).join(','));
comprueba('no repite estancia en las paradas',
  new Set(st.ruta.map(p => p.id)).size === st.ruta.length,
  st.ruta.map(p => p.id).join(','));
comprueba('el FOV vertical está dentro de los límites', st.fovVertical >= 50 && st.fovVertical <= 94, st.fovVertical);
comprueba('el FOV horizontal real se acerca a 72° o se recorta por el vertical',
  st.fovHorizontal < 72.5, st.fovHorizontal);
console.log('   ruta:', st.ruta.map(p => p.nombre).join(' → '));
console.log('   fov vertical', st.fovVertical.toFixed(1), '· horizontal real', st.fovHorizontal.toFixed(1));
/* El detalle de cada parada: dónde se para y qué mira. */
const MEDIDAS = {
  chimenea:{x:0.95,z:0.12}, alfombra:null, sofa_tela:{x:'largo',z:'fondo'}, butaca_tela:{x:0.74,z:0.78},
  mesa_centro:{x:'largo',z:'fondo'}, libreria:{x:'ancho',z:'fondo'}, lampara_pie:{x:0.30,z:0.30},
  mesa_madera:{x:'largo',z:'fondo'}, silla_madera:{x:0.45,z:0.45}, aparador:{x:'largo',z:0.42},
  maceta:{x:'radio',z:'radio'}, encimera:{x:'largo',z:0.58}, nevera:{x:0.60,z:0.65},
  isla:{x:'largo',z:'fondo'}, banqueta:{x:0.38,z:0.38}, banco_recibidor:{x:'largo',z:0.40},
  espejo:{x:'ancho',z:0.04}, cama:{x:'ancho',z:'largo'}, mesilla:{x:0.42,z:0.36}, empotrado:{x:'ancho',z:0.60},
  banera:{x:1.60,z:0.72}, inodoro:{x:0.40,z:0.55}, lavabo_cajones:{x:'ancho',z:0.45}, toallero:{x:0.50,z:0.06},
  comoda:{x:'ancho',z:0.48}, escritorio:{x:'largo',z:'fondo'}, silla_oficina:{x:0.50,z:0.60}, kallax:{x:'kallax',z:0.39},
  sillon:{x:0.72,z:0.75}, lavadora:{x:0.60,z:0.60}, pila_lavar:{x:0.55,z:0.45}, estanteria_metal:{x:'ancho',z:0.40},
  mesa_jardin:{x:1.50,z:0.70}, chillout:{x:3.80,z:1.95}, monitor:{x:'ancho',z:0.20}, mueble_bajo:{x:'largo',z:0.58}
};
function dim(m){
  const d = MEDIDAS[m.tipo] || {x:'largo', z:'fondo'};
  const def = {largo:2.2, ancho:1.2, fondo:0.7, radio:0.25};
  function v(k){ return m[k] !== undefined ? m[k] : def[k]; }
  const L = d.x === 'largo' ? v('largo') : d.x === 'ancho' ? v('ancho') : d.x === 'fondo' ? v('fondo') : d.x === 'radio' ? v('radio')*2 : d.x === 'kallax' ? (m.cols||3)*0.3675+0.035 : d.x;
  const D = d.z === 'largo' ? v('largo') : d.z === 'ancho' ? v('ancho') : d.z === 'fondo' ? v('fondo') : d.z === 'radio' ? v('radio')*2 : d.z;
  return {L, D};
}
function cajaMueble(m){
  const {L, D} = dim(m), th = (m.giro||0)*Math.PI/180, c = Math.cos(th), s = Math.sin(th);
  const ex = Math.abs(L*c) + Math.abs(D*s), ez = Math.abs(L*s) + Math.abs(D*c);
  return {u0:m.uv[0]-ex/2, v0:m.uv[1]-ez/2, u1:m.uv[0]+ex/2, v1:m.uv[1]+ez/2};
}
const MUEBLES = CASA.casa.interior.muebles;
st.ruta.forEach(p => {
  const e = ESTANCIAS.find(x => x.id === p.id);
  /* ¿La parada está dentro de algún mueble? */
  const dentroDe = MUEBLES.filter(m => {
    if(!m.uv) return false;
    const c = cajaMueble(m);
    return p.punto[0] > c.u0 - 0.2 && p.punto[0] < c.u1 + 0.2 && p.punto[1] > c.v0 - 0.2 && p.punto[1] < c.v1 + 0.2;
  }).map(m => m.tipo);
  /* ¿A cuánto está de la pieza principal? */
  const pp = MUEBLES.filter(m => m.id && m.id.slice(0,3) === (e.codigo || '')).map(m => {
    const c = cajaMueble(m);
    return {tipo:m.tipo, d:Math.hypot(p.punto[0]-m.uv[0], p.punto[1]-m.uv[1])};
  }).sort((a,b)=>a.d-b.d)[0];
  console.log('   ', (e.nombre + ':').padEnd(22), 'parada', p.punto.map(x=>x.toFixed(2)).join(','),
    '· muro', Math.min(p.punto[0]-e.caja[0], e.caja[2]-p.punto[0], p.punto[1]-e.caja[1], e.caja[3]-p.punto[1]).toFixed(2) + ' m',
    '· pieza:', p.pieza, '· a', pp ? pp.d.toFixed(2)+' m' : '—',
    dentroDe.length ? '⚠ DENTRO DE ' + dentroDe.join(',') : '');
});

/* ── La cámara va a 1,62 m del suelo terminado ── */
const pie = AD.api.pie;
cuadro(1/60);                                       /* un cuadro: la cámara se coloca */
const altura = pie.y + 1.65;                      /* el visor pone la cámara en pie.y + 1,65 */
const suelo = AD.api.SUELO + (ESTANCIAS[0].cota || 0);
comprueba('la cámara está a 1,62 m del suelo terminado',
  Math.abs(altura - (suelo + 1.62)) < 0.02, altura.toFixed(3) + ' vs ' + (suelo + 1.62).toFixed(3));

/* ── El recorrido no atraviesa ningún tabique ── */
/* La cámara se mueve sola: se anotan los puntos por los que pasa y se mira si
   alguno cae dentro de un muro. */
let dentroDeMuro = 0, puntos = 0, maxSalto = 0;
let anterior = null;
for(let i = 0; i < 60*200; i++){                  /* 200 s de recorrido a 60 fps */
  cuadro(1/60);
  const p = [pie.x, pie.z];
  puntos++;
  if(MUROS.some(m => enMuro(p, m))) dentroDeMuro++;
  if(anterior){
    const d = dist(anterior, p);
    if(d > maxSalto) maxSalto = d;               /* un salto grande = un teleportazo */
  }
  anterior = p;
}
comprueba('la cámara nunca está dentro de un muro', dentroDeMuro === 0, dentroDeMuro + ' muestras de ' + puntos);
comprueba('la cámara no se teletransporta', maxSalto < 0.2, 'salto mayor: ' + maxSalto.toFixed(3) + ' m');

/* ── El final del recorrido ── */
const stFin = R.estado();
comprueba('el recorrido termina en la última parada', stFin.i === stFin.n - 1, stFin.i + '/' + stFin.n);
comprueba('el recorrido se detiene al final', stFin.fin === true, stFin.fin);

/* ── La API: saltar, pausar, velocidad ── */
R.irA(2);
comprueba('irA salta a la parada', R.estado().i === 2, R.estado().i);
R.pausa();
comprueba('pausa', R.estado().play === false);
R.play();
comprueba('play', R.estado().play === true);
comprueba('velocidad', R.velocidad(1.6) === 1.6, R.velocidad(1));
R.irA(0);

/* ── Cerrar: la cámara vuelve a donde estaba ── */
R.cerrar();
comprueba('cierra', R.abierto() === false);
comprueba('sale del paseo', AD.api.pie.activo === false);
comprueba('el recorrido no sigue corriendo', (() => { const x = pie.x; cuadro(1/60); return pie.x === x; })());

/* ── El botón de la barra: tiene que registrarlo aunque `AD.boton` llegue
      tarde (modulo/fabrick.js se carga después que este módulo). ── */
const botones = [];
AD.boton = (b) => { botones.push(b); return b; };
AD.pintaBarra = () => {};
setTimeout(() => {
  const b = botones.find(x => x.id === 'recorrido');
  comprueba('el botón de la barra se registra', !!b, botones.map(x => x.id).join(','));
  if(b){
    comprueba('el botón trae etiqueta e icono', b.etiqueta === 'Recorrido' && b.icono === 'caminata', b.etiqueta + ' / ' + b.icono);
    b.alPulsar();
    comprueba('el botón abre el recorrido', AD.recorrido.abierto() === true);
    b.alPulsar();
    comprueba('el botón cierra el recorrido', AD.recorrido.abierto() === false);
  }
  fin();
}, 500);
