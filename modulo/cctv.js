/* Ars Domus FABRICK · modulo/cctv.js
   -------------------------------------------------------------------------------
   Cámaras de vigilancia, en modo cine.

   Lo que se quiere: un muro de cámaras, como el de un centro de control, pero
   de cine. Se abre el modo, se ve una toma, y se **cambia de cámara** con dos
   botones (o sola, cada 8 s, como un monitor de seguridad en rotación).

   De dónde salen las cámaras: de los DATOS. Se recorre `INT.estancias` y se
   pone una cámara en la esquina de cada ambiente, mirando al centro, a 2,60 m
   (altura de una cámara de seguridad) y con 68° de apertura (la de una dome).
   Afuera, en el porche, la entrada y el garaje. **No se inventan posiciones**:
   se calculan con la caja de cada estancia y se comprueban contra los muros.

   El encuadre se pone con `AD.api.aplicaVista`, que es la misma puerta que usa
   el resto del visor: asi el modo CCTV no se pelea con el paseo ni con la planta.

   Mientras el CCTV esta abierto, el modo cine se apaga (y al revés).
*/
var AD = window.AD || (window.AD = {});
(function(){
'use strict';

var EST = {abierto:false, i:0, cams:[], auto:false, relojAuto:null, overlay:null, raiz:null,
           guardado:null, cuenta:null, reloj:0};

function api(){ return AD.api || null; }
function T(){ return window.THREE || null; }

/* ── La lista de cámaras, sacada de los datos ────────────────────────────── */
/* La esquina de una estancia: la más alejada de su centro, contra el muro. */
function camaraDe(e){
  var k = e.caja;
  var cx = (k[0]+k[2])/2, cz = (k[1]+k[3])/2;
  var w = k[2]-k[0], d = k[3]-k[1];
  var alto = (e.techo && (e.techo.alto || e.techo.alto0)) || 2.7;
  /* esquina: el punto del rectangulo mas alejado del centro */
  var ex = cx + (cx < (k[0]+k[2])/2 ? w/2 - 0.25 : -(w/2 - 0.25));
  var ex2 = k[0] + (cx - k[0] < w/2 ? w - 0.25 : 0.25);
  var ez = k[1] + (cz - k[1] < d/2 ? d - 0.25 : 0.25);
  return {
    id: 'CAM-' + (e.codigo || e.id),
    nombre: e.nombre,
    sitio: 'Interior',
    pos: [ex2, Math.min(2.6, alto - 0.1), ez],
    mira: [cx, 1.45, cz],
    fov: 68
  };
}

/* Las de fuera: en la fachada, mirando a la casa. */
function camarasExteriores(){
  var a = api();
  if(!a || !a.C) return [];
  var c = a.C, org = c.origen || [0,0];
  var contorno = c.contorno || [];
  if(!contorno.length) return [];
  var xs = contorno.map(function(p){ return p[0]; });
  var zs = contorno.map(function(p){ return p[1]; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
  var cx = (x0+x1)/2, cz = (z0+z1)/2;
  return [
    {id:'CAM-P01', nombre:'Fachada principal', sitio:'Exterior',
     pos:[cx - 6, 3.1, z1 + 7], mira:[cx, 1.6, cz], fov:55},
    {id:'CAM-P02', nombre:'Porche', sitio:'Exterior',
     pos:[cx - 2.4, 2.9, z1 + 4.2], mira:[cx, 1.4, z1 - 1.5], fov:62},
    {id:'CAM-P03', nombre:'Acceso y garaje', sitio:'Exterior',
     pos:[x1 + 6.5, 3.2, cz + 2.5], mira:[x1, 1.5, cz], fov:58},
    {id:'CAM-P04', nombre:'Jardín delantero', sitio:'Exterior',
     pos:[cx - 4, 3.0, z0 - 6.5], mira:[cx, 1.4, z0], fov:60}
  ];
}

function construyeLista(){
  var a = api();
  if(!a || !a.INT) return;
  var cams = [];
  (a.INT.estancias || []).forEach(function(e){
    if(e.fuera) return;                          // el porche va como camara de fuera
    cams.push(camaraDe(e));
  });
  cams = cams.concat(camarasExteriores());
  EST.cams = cams;
}

/* ── El HUD: el muro de cámaras ──────────────────────────────────────────── */
function css(){
  if(document.getElementById('cctv-css')) return;
  var s = document.createElement('style');
  s.id = 'cctv-css';
  s.textContent =
   '#cctv{position:fixed;inset:0;z-index:70;pointer-events:none;font-family:"IBM Plex Sans Condensed",sans-serif}'+
   '#cctv .barra{position:absolute;left:0;right:0;height:8vh;background:#04070a}'+
   '#cctv .barra.ab{top:0}#cctv .barra.ar{bottom:0}'+
   '#cctv .info{position:absolute;left:14px;top:calc(8vh + 14px);color:#d9e6ea;letter-spacing:.14em;'+
   'font-size:11px;text-transform:uppercase;text-shadow:0 1px 3px #000}'+
   '#cctv .info b{color:#f0c46a;letter-spacing:.2em}'+
   '#cctv .rec{position:absolute;right:14px;top:calc(8vh + 14px);color:#ff6b5a;letter-spacing:.18em;'+
   'font-size:11px;font-weight:700;display:flex;align-items:center;gap:6px}'+
   '#cctv .rec i{width:9px;height:9px;border-radius:50%;background:#ff6b5a;display:block;'+
   'animation:cctvparpadeo 1.6s infinite}'+
   '@keyframes cctvparpadeo{0%,45%{opacity:1}55%,100%{opacity:.15}}'+
   '#cctv .ctrl{position:absolute;right:12px;bottom:calc(8vh + 12px);display:flex;gap:8px;pointer-events:auto}'+
   '#cctv button{min-height:44px;min-width:44px;padding:0 14px;background:rgba(10,15,12,.82);color:#d9e6ea;'+
   'border:1px solid rgba(217,230,234,.28);border-radius:4px;cursor:pointer;'+
   'font:600 11px/1 "IBM Plex Sans Condensed",sans-serif;letter-spacing:.12em;text-transform:uppercase}'+
   '#cctv button[aria-pressed="true"]{background:#f0c46a;color:#12160f;border-color:#f0c46a}'+
   '#cctv .lista{position:absolute;left:12px;bottom:calc(8vh + 12px);max-height:34vh;overflow-y:auto;'+
   'pointer-events:auto;display:flex;flex-direction:column;gap:4px;width:172px}'+
   '#cctv .lista button{justify-content:flex-start;text-align:left;font-size:10px;padding:8px 10px;min-height:38px}'+
   '#cctv .cuadricula{position:absolute;inset:0;background-image:linear-gradient(rgba(217,230,234,.07) 1px,transparent 1px),'+
   'linear-gradient(90deg,rgba(217,230,234,.07) 1px,transparent 1px);background-size:33.33% 33.33%}'+
   '@media (max-width:860px){#cctv .lista{width:132px}#cctv .lista button{font-size:9px;padding:6px 8px}}';
  document.head.appendChild(s);
}

function crea(){
  if(EST.raiz) return EST.raiz;
  css();
  var d = document.createElement('div');
  d.id = 'cctv';
  d.hidden = true;
  d.innerHTML =
   '<div class="cuadricula"></div>'+
   '<div class="barra ab"></div><div class="barra ar"></div>'+
   '<div class="info"><b class="id"></b><span class="nombre"></span> · <span class="sitio"></span></div>'+
   '<div class="rec"><i></i>REC · <span class="hora">--:--:--</span></div>'+
   '<div class="lista"></div>'+
   '<div class="ctrl">'+
     '<button type="button" data-acc="ant">◀</button>'+
     '<button type="button" data-acc="auto" aria-pressed="false">Auto</button>'+
     '<button type="button" data-acc="sig">▶</button>'+
     '<button type="button" data-acc="salir">Salir</button>'+
   '</div>';
  document.body.appendChild(d);
  EST.raiz = d;
  EST.id = d.querySelector('.info .id');
  EST.nombre = d.querySelector('.info .nombre');
  EST.sitio = d.querySelector('.info .sitio');
  EST.hora = d.querySelector('.rec .hora');
  EST.lista = d.querySelector('.lista');
  d.querySelector('[data-acc="ant"]').addEventListener('click', function(){ ir(EST.i-1); });
  d.querySelector('[data-acc="sig"]').addEventListener('click', function(){ ir(EST.i+1); });
  d.querySelector('[data-acc="salir"]').addEventListener('click', function(){ cierra(); });
  var auto = d.querySelector('[data-acc="auto"]');
  auto.addEventListener('click', function(){
    EST.auto = !EST.auto;
    auto.setAttribute('aria-pressed', EST.auto ? 'true' : 'false');
    if(EST.auto){ EST.relojAuto = setInterval(function(){ ir(EST.i+1); }, 8000); }
    else { clearInterval(EST.relojAuto); EST.relojAuto = null; }
  });
  return d;
}

function pintaLista(){
  if(!EST.lista) return;
  EST.lista.innerHTML = '';
  EST.cams.forEach(function(c, i){
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.id + ' · ' + c.nombre;
    b.setAttribute('aria-pressed', i === EST.i ? 'true' : 'false');
    b.addEventListener('click', function(){ ir(i); });
    EST.lista.appendChild(b);
  });
}

function pintaInfo(){
  var c = EST.cams[EST.i];
  if(!c || !EST.id) return;
  EST.id.textContent = c.id;
  EST.nombre.textContent = c.nombre;
  EST.sitio.textContent = c.sitio;
  Array.prototype.forEach.call(EST.lista.children, function(b, i){
    b.setAttribute('aria-pressed', i === EST.i ? 'true' : 'false');
  });
}

/* ── Cambio de cámara ────────────────────────────────────────────────────── */
function ir(i){
  if(!EST.cams.length) return;
  var n = EST.cams.length;
  EST.i = ((i % n) + n) % n;
  var c = EST.cams[EST.i];
  var a = api();
  if(a && a.aplicaVista){
    /* La cámara mira desde arriba a la esquina: se pone el objetivo donde mira y
       la distancia es la que hay. Sin esto, la toma sale desde el otro lado. */
    var p = a.aMundo ? a.aMundo(c.pos[0], c.pos[2]) : c.pos;
    var m = a.aMundo ? a.aMundo(c.mira[0], c.mira[2]) : c.mira;
    var dx = m[0]-p[0], dz = m[1]-p[1], dy = c.mira[1] - c.pos[1];
    var dist = Math.hypot(dx, dz, dy);
    var theta = Math.atan2(dx, dz);              // rumbo hacia el objetivo
    var phi = Math.acos(Math.max(-1, Math.min(1, dy/dist)));
    a.aplicaVista({d:dist, t:theta*180/Math.PI, p:phi*180/Math.PI, c:[m[0], c.mira[1], m[1]], fov:c.fov});
  }
  pintaInfo();
}

/* ── Abrir y cerrar ───────────────────────────────────────────────────────── */
function abre(){
  var a = api();
  if(!a) return;
  if(!EST.cams.length) construyeLista();
  if(!EST.cams.length) return;
  /* El modo cine y el CCTV son excluyentes: si el cine esta abierto, se cierra. */
  if(AD.camaras && AD.camaras.cierra) { try{ AD.camaras.cierra(); }catch(e){} }
  if(a.pie && a.pie.activo && a.salirPie) { try{ a.salirPie(); }catch(e){} }
  crea();
  EST.raiz.hidden = false;
  EST.abierto = true;
  ir(EST.i);
  pintaLista();
  if(AD.onFrame) AD.onFrame(function(dt){
    if(!EST.abierto) return;
    EST.reloj += dt;
    if(EST.hora){
      var t = Math.floor(EST.reloj) % 86400;
      var h = Math.floor(t/3600), m = Math.floor(t/60)%60, s = t%60;
      EST.hora.textContent = (h<10?'0':'')+h+':'+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
    }
  });
}

function cierra(){
  if(!EST.abierto) return;
  EST.abierto = false;
  if(EST.raiz) EST.raiz.hidden = true;
  if(EST.relojAuto){ clearInterval(EST.relojAuto); EST.relojAuto = null; }
  var auto = EST.raiz && EST.raiz.querySelector('[data-acc="auto"]');
  if(auto) auto.setAttribute('aria-pressed','false');
  EST.auto = false;
  if(AD.refrescaBarra) AD.refrescaBarra();
}

/* ── El botón de la barra ─────────────────────────────────────────────────── */
/* Se registra por la API publica (AD.boton), sin tocar el archivo de la barra:
   asi los dos modulos no se pisan. Si la barra no existe, el boton se dibuja
   suelto en su propia esquina. */
function boton(){
  if(EST.boton) return;
  if(AD.iconos) AD.iconos.cctv = AD.iconos.cctv ||
    '<rect x="2" y="6" width="8.5" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/>'+
    '<path d="M10.5 12 15 15.5v-9L10.5 10z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'+
    '<circle cx="5" cy="4" r="1.3" fill="currentColor"/>';
  if(AD.boton){
    AD.boton({id:'cctv', etiqueta:'CCTV', icono:'cctv',
      alPulsar:function(){
        /* CCTV y cine son excluyentes: al abrir uno se cierra el otro. */
        if(EST.abierto && AD.camaras && AD.camaras.cierra){ try{ AD.camaras.cierra(); }catch(e){} }
        EST.abierto ? cierra() : abre();
      },
      activo:function(){ return EST.abierto; }});
    if(AD.pintaBarra) AD.pintaBarra();
    EST.boton = true;
    return;
  }
  var barra = document.getElementById('fabrick');
  if(!barra) return;
  var b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', 'CCTV');
  b.title = 'CCTV';
  b.innerHTML = (AD.svg ? AD.svg('cctv') : '') + '<span>CCTV</span>';
  b.addEventListener('click', function(){ EST.abierto ? cierra() : abre(); });
  barra.appendChild(b);
  EST.boton = b;
}

/* ── API ───────────────────────────────────────────────────────────────────── */
AD.cctv = {
  abrir: abre,
  cerrar: cierra,
  alterna: function(){ EST.abierto ? cierra() : abre(); return EST.abierto; },
  abierto: function(){ return EST.abierto; },
  irA: function(i){ if(!EST.abierto) abre(); ir(i); },
  camaras: function(){ return EST.cams; },
  siguiente: function(){ ir(EST.i+1); },
  anterior: function(){ ir(EST.i-1); }
};

/* ── Arranque ─────────────────────────────────────────────────────────────── */
function monta(){
  var a = api();
  if(!a || !a.INT) return false;
  construyeLista();
  boton();
  if(AD.onFrame) AD.onFrame(function(){
    if(EST.boton && EST.boton.setAttribute)
      EST.boton.setAttribute('aria-pressed', EST.abierto ? 'true' : 'false');
  });
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
