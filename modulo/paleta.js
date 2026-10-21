/* Agente G · muros interiores verde limón + recalibrado de la luz diurna.
   ---------------------------------------------------------------------------------------------
   Dos cosas en un módulo, porque van juntas: la paleta de los muros y la luz que la deja leer.

   1 · LA PALETA. Los muros interiores se pintan en verde limón (familia 390-1: #c8db8a y
     parentescos), con un tono por ambiente. El color vive en el DATO (`INT.estancias[].pared`,
     generado por demo/herramientas/casa.py) y aquí se aplica además en runtime, para poder
     comparar con «neutro» sin recargar nada.
     Regla de la casa: el verde va al MURO, nunca al piso ni a la fachada. La piedra vista y el
     azulejo no se tocan: son materiales con textura y no se pintan.

   2 · LA LUZ. Con ACES un material liso se quema: el visor estaba con la exposición a 1,0 y el
     sol a 1,5, y las luces altas se recortaban en blanco. Se recalibran los valores POR DEFECTO
     (exposición, sol, hemisférica y relleno) sin quitarle el mando al usuario: lo que se escala
     es lo que el visor escribe, así que los deslizadores del panel (exposición, rebote, bruma),
     los cuatro ambientes y la hora del día siguen mandando.

   Contrato: `AD.paleta = {aplica(tema), temas:['limon','neutro'], tema(), alterna()}`.
   La barra de Fabrick (modulo/fabrick.js) ya trae el botón «Color»: llama a alterna() y
   pregunta por tema(). */
var AD = window.AD || (window.AD = {});
(function(){
'use strict';

/* =====================================================================================
   0 · TABLAS
   ===================================================================================== */

/* El verde limón, por CÓDIGO de estancia (el `codigo` de INT.estancias[]). Los tonos siguen la
   familia 390-1: los de estar, más saturados; los de dormir, más suaves; el lavadero, casi
   blanco. El baño no está: se queda en azulejo. */
var LIMON = {
  SAL: '#c8db8a',        // salón comedor
  REC: '#c8db8a',        // recibidor
  PAS: '#c8db8a',        // pasillo
  COC: '#cfe0a0',        // cocina
  DOR: '#d7e3ab',        // dormitorio principal
  DO2: '#d7e3ab',        // dormitorio de invitados
  DO3: '#d7e3ab',        // dormitorio pequeño
  EST: '#c3d49a',        // estudio
  LAV: '#e2eccb'         // lavadero: casi blanco, es un sitio de servicio
};

/* El color neutro de antes (el que tenía cada estancia antes del verde), para el interruptor.
   Si una estancia no está en la tabla, se conserva el color que tuviera su material. */
var NEUTRO = {
  SAL: '#f2efe8', REC: '#f2efe8', PAS: '#f2efe8', COC: '#f4f4f2',
  DOR: '#e9e4da', DO2: '#dfe6e3', DO3: '#efe3cf', EST: '#a9b3c3', LAV: '#f4f4f2'
};

/* La luz: factores sobre lo que el visor escribe. De día, a las 13:00 (la hora con la que
   abre) y con el ambiente «natural», la escena queda en:
       exposición  0,84  (el visor pone 1,00)  →  factor 0,840
       sol         1,33  (el visor pone 0,76)  →  factor 1,753
       hemisférica 0,56  (el visor pone 0,33)  →  factor 1,697
       relleno     0,14  (el visor pone 0,07)  →  factor 2,000
   De noche los factores bajan: a esas horas el interior lo iluminan las luminarias, no el sol,
   y con la luz del cielo igual que de día el verde se ve apagado y la casa no «duerme». */
var LUZ = {
  dia:   {exp:0.840, sol:1.753, hemi:1.697, relleno:2.000},
  noche: {exp:0.840, sol:0.964, hemi:1.222, relleno:1.200}
};

var CLAVE = 'arsdomus-paleta';        // en localStorage, como los ajustes de luz del visor

var EST = {
  tema: 'limon',
  grupos: [],                        // los grupos de material pintados
  version: null,                     // la última versión de casa vista (cambia al conmutar)
  crudaSol: 0.02,                    // el valor CRUDO que el visor ha escrito para el sol
  enganchada: false
};

/* =====================================================================================
   1 · UTILIDADES
   ===================================================================================== */

function hex(c){
  return (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? c.toLowerCase() : null;
}
function colorHex(mat){
  try{ return '#' + mat.color.getHexString().toLowerCase(); }catch(e){ return null; }
}
function esMuro(o){
  /* Un paño de muro: la geometría de pano() lleva userData.muro. Los de fuera y los dinteles
     de las ventanas también, pero se distinguen porque su ficha no es la de una estancia. */
  return !!(o && o.isMesh && o.geometry && o.geometry.userData && o.geometry.userData.muro === true);
}
function esEstancia(o){
  var info = o && o.userData && o.userData.info;
  return !!(info && info.tipo === 'Estancia');
}

/* =====================================================================================
   2 · LOS MUROS: dónde están y de qué color pueden pintarse
   ===================================================================================== */

/* Un «grupo» son las mallas que comparten el mismo material: el paño de la pared y las mochetas
   de sus huecos (jambas, alféizar y dintel), que en el visor se crean con el mismo material.
   Si se pintara solo el paño, el hueco quedaría blanco en medio del muro verde. */
function recogeGrupos(){
  var api = AD.api;
  if(!api || !api.escena) return [];
  var porMaterial = {}, salida = [];
  api.escena.traverse(function(o){
    if(!esMuro(o) || !esEstancia(o)) return;
    var mat = o.material;
    if(!mat || !mat.color) return;
    if(mat.map) return;                                   // piedra, azulejo, vidrio: con textura, no se pintan
    var g = porMaterial[mat.uuid];
    if(!g){
      var orig = (mat.userData && mat.userData.paletaOrig) || colorHex(mat);
      var cod  = (mat.userData && mat.userData.paletaCod) || null;
      g = porMaterial[mat.uuid] = {mat:mat, codigo:cod, orig:orig, mallas:[], clon:null};
      salida.push(g);
    }
    if(!g.codigo && o.userData.info.id) g.codigo = o.userData.info.id;
    g.mallas.push(o);
  });
  if(!salida.length) return [];
  /* las mochetas de las ventanas (jambas, alféizar, dintel) no son paños de muro: se recogen
     aparte, por material compartido, pero solo las que son de una estancia (un muro de fuera
     puede compartir material y no se pinta). */
  api.escena.traverse(function(o){
    if(!o.isMesh || !o.material || !esEstancia(o)) return;
    var g = porMaterial[o.material.uuid];
    if(g && g.mallas.indexOf(o) < 0) g.mallas.push(o);
  });
  return salida;
}

/* El color de pared del dato: la fuente de verdad. `INT` es un getter de la versión activa. */
function colorDato(cod){
  var api = AD.api;
  if(!api || !api.INT || !api.INT.estancias || !cod) return null;
  for(var i = 0; i < api.INT.estancias.length; i++){
    var e = api.INT.estancias[i];
    if(e && e.codigo === cod) return hex(e.pared);
  }
  return null;
}

/* El verde que le toca a una estancia: manda el dato si ya trae el verde; si el dato todavía
   trae el color neutro (casa.js sin regenerar) se usa la tabla de arriba. */
function verdeDe(cod, dato){
  var neutro = hex(NEUTRO[cod]);
  if(dato && dato !== neutro) return dato;         // el dato ya viene en verde
  return hex(LIMON[cod]) || dato || '#c8db8a';
}

/* El color neutro: el que tenía la pared ANTES del verde.
   - Si el dato trae el verde (casa.js ya regenerado), el neutro es el de la tabla NEUTRO.
   - Si el dato trae otro color, ese color ES el original de esa pared: se devuelve tal cual.
   - Si no hay dato (una estancia sin `pared`), se conserva el color del material.
   Nunca se devuelve el verde: por eso la tabla NEUTRO existe. */
function neutroDe(cod, dato, orig){
  var tabla = hex(NEUTRO[cod]);
  if(dato){
    if(tabla && dato !== tabla) return tabla;       // el dato trae el verde → el de antes
    return dato;                                   // el dato trae su propio color → ese es
  }
  return orig || tabla || '#f2efe8';
}

/* Una estancia solo se pinta si su pared es un color liso: el azulejo y la piedra
   llevan textura y se quedan como están. */
function esPintable(pared){
  return typeof pared === 'string' && pared.charAt(0) === '#';
}

/* =====================================================================================
   3 · EL INTERRUPTOR DE PALETA
   ===================================================================================== */

/* aplica('limon' | 'neutro'): repinta los muros interiores. Devuelve el tema aplicado. */
function aplica(t){
  if(t !== 'limon' && t !== 'neutro') return EST.tema;
  EST.tema = t;
  var grupos = recogeGrupos();
  EST.grupos = grupos;
  for(var i = 0; i < grupos.length; i++){
    var g = grupos[i];
    var dato = colorDato(g.codigo);
    var destino = (t === 'limon') ? verdeDe(g.codigo, dato) : neutroDe(g.codigo, dato, g.orig);
    if(!destino) continue;
    if(!g.clon){
      /* se CLONA el material: el original lo comparte el resto de la estancia (y la otra versión
         de la casa) y no se toca. El clon se queda con el color que se le pida.
         Si el material ya es un clon de este módulo (de una vuelta anterior del interruptor),
         se reutiliza: así no se acumulan materiales nuevos en cada cambio de tema. */
      if(g.mat.userData && g.mat.userData.paletaOrig && g.mat.userData.paletaCod === g.codigo){
        g.clon = g.mat;
      } else {
        g.clon = g.mat.clone();
        g.clon.userData = g.clon.userData || {};
        g.clon.userData.paletaOrig = g.orig;            // el color de partida, para volver a neutro
        g.clon.userData.paletaCod  = g.codigo;
      }
    }
    g.clon.color.set(destino);
    for(var j = 0; j < g.mallas.length; j++){
      if(g.mallas[j].material !== g.clon) g.mallas[j].material = g.clon;
    }
  }
  guarda(t);
  return t;
}

function alterna(){ return aplica(EST.tema === 'limon' ? 'neutro' : 'limon'); }
function tema(){ return EST.tema; }

/* Las estancias y su color, por si el hub quiere listarlas.
   Las que no se pintan (el baño es de azulejo, el porche es exterior) se listan igual,
   pero con `pintable:false` y sin color: no tienen muro que pintar. */
function estancias(){
  var api = AD.api, salida = [];
  if(!api || !api.INT || !api.INT.estancias) return salida;
  api.INT.estancias.forEach(function(e){
    if(!e || e.fuera) return;
    var dato = colorDato(e.codigo);
    var pintable = esPintable(e.pared);
    salida.push({codigo:e.codigo || null, nombre:e.nombre || e.id,
                 pintable:pintable, pared:e.pared || null,
                 verde:  pintable ? verdeDe(e.codigo, dato) : null,
                 neutro: pintable ? neutroDe(e.codigo, dato, null) : null,
                 dato:dato});
  });
  return salida;
}

/* =====================================================================================
   4 · LA LUZ
   ===================================================================================== */

/* El factor, interpolado entre noche y día según lo crudo que el visor haya escrito para el
   sol: 0,02 es de noche (el visor lo clava así cuando el sol está bajo el horizonte) y 0,22 o
   más es de día. */
function factor(canal){
  var d = LUZ.dia[canal], n = LUZ.noche[canal];
  var k = Math.max(0, Math.min(1, (EST.crudaSol - 0.02) / 0.20));
  return n + (d - n) * k;
}

/* Intercepta la escritura de una propiedad y multiplica lo que se escribe. Así el visor sigue
   mandando (hora del día, ambiente, deslizadores) y lo que se recalibra es el valor por
   defecto, no un valor fijo. */
function escala(objeto, prop, canal){
  if(!objeto) return;
  var marca = '__paleta_' + prop;
  if(objeto[marca]) return;                       // ya enganchado
  var v = objeto[prop];
  Object.defineProperty(objeto, prop, {
    configurable: true, enumerable: true,
    get: function(){ return v; },
    set: function(x){
      if(canal === 'sol') EST.crudaSol = x;        // el sol dice si es de día o de noche
      v = x * factor(canal);
    }
  });
  objeto[marca] = true;
  objeto[prop] = v;                               // aplica el factor al valor que ya había
}

/* Recalibra la luz diurna: exposición, sol, hemisférica y relleno. */
function calibraLuz(){
  var api = AD.api;
  if(!api || !api.escena || !api.renderer) return;
  var hemi = null, sol = null, relleno = null;
  api.escena.traverse(function(o){
    if(o.isHemisphereLight){ if(!hemi) hemi = o; return; }
    if(!o.isDirectionalLight) return;
    if(o.castShadow){ if(!sol) sol = o; }         // el sol es el único que proyecta sombra
    else if(!relleno) relleno = o;
  });
  if(sol) escala(sol, 'intensity', 'sol');        // el orden importa: el sol va primero
  if(hemi) escala(hemi, 'intensity', 'hemi');
  if(relleno) escala(relleno, 'intensity', 'relleno');
  escala(api.renderer, 'toneMappingExposure', 'exp');
  EST.enganchada = true;
}

/* =====================================================================================
   5 · PERSISTENCIA Y ARRANQUE
   ===================================================================================== */

function lee(){
  try{ var v = localStorage.getItem(CLAVE); return (v === 'limon' || v === 'neutro') ? v : null; }catch(e){ return null; }
}
function guarda(t){
  try{ localStorage.setItem(CLAVE, t); }catch(e){}
}

function arranca(){
  if(!AD.api || !AD.api.escena) return false;      // el visor todavía no está: se espera
  calibraLuz();
  aplica(lee() || 'limon');
  EST.version = AD.api.VERSION;
  return true;
}

/* Si el módulo se cargara antes que el visor, se reintenta un rato. Con el orden de
   index.html (el visor va primero) esto no llega a hacer nada. */
var intentos = 0;
function espera(){
  if(arranca()) return;
  intentos++;
  if(intentos > 200) return;                      // 30 s: se agotó la espera
  setTimeout(espera, 150);
}
if(AD.avisaListo) AD.avisaListo(function(){ espera(); });
else espera();

/* Al conmutar de versión de casa cambian los datos (y con ellos, el color del dato): se repinta.
   `ponVersion` no está expuesto, así que se detecta el cambio de AD.api.VERSION. */
if(AD.onFrame) AD.onFrame(function(){
  var api = AD.api; if(!api) return;
  if(api.VERSION !== EST.version){
    EST.version = api.VERSION;
    aplica(EST.tema);
  }
});

/* La API pública. */
AD.paleta = {
  aplica: aplica,
  alterna: alterna,
  tema: tema,
  temas: ['limon', 'neutro'],
  estancias: estancias,
  calibraLuz: calibraLuz,
  luz: LUZ
};

})();
