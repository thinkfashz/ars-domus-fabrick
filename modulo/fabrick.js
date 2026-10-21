/* Ars Domus FABRICK — modulo/fabrick.js
   La barra de acciones: pega los modulos entre si y los expone en un solo sitio.
   Este archivo es del coordinator: no lo toca ningun agente.

   Cada modulo de modulo/ puede registrar un boton con:
     AD.boton({id, etiqueta, icono, alPulsar, activo})
   y se dibuja en la barra #fabrick (arriba a la derecha en escritorio, abajo en movil).

   Reglas que se respetan aqui:
   · Un boton solo aparece si su modulo existe Y expone el metodo que la barra
     necesita. Un modulo a medias (o que no cargo) no deja un boton muerto.
   · Los modulos no llaman todos al metodo igual: el plano y las camaras exponen
     `alternar`, el hub `alterna`. La barra no lo supone: busca el primero que
     exista (ver AD.metodoAlterna).
   · El estado (aria-pressed) sale del propio modulo, no de una copia: la barra
     lo relee cada poco y lo refresca tambien al pulsar.
   · En el movil la barra se aparta de los botones del paseo: el pulgar derecho
     es de la puerta y de salir, no de la barra.
*/
var AD = window.AD || (window.AD = {});

AD.botones = AD.botones || [];
AD.barraFirma = AD.barraFirma || '';
AD.barraPintada = AD.barraPintada || false;

/* ── Utilidades ──────────────────────────────────────────────────────────── */
/* Vacia un contenedor: sirve con el DOM de verdad y con el del banco de
   pruebas (que no tiene firstChild). */
function vacia(el){
  if(!el) return;
  if(el.firstChild){ while(el.firstChild) el.removeChild(el.firstChild); return; }
  if(el.children && el.children.length){ while(el.children.length) el.removeChild(el.children[0]); }
}

/* Busca el primer metodo que exista en el objeto. Se devuelve «ligado» al
   objeto para que `this` siga siendo el modulo (no AD). */
function metodo(obj, nombres){
  if(!obj) return null;
  for(var i = 0; i < nombres.length; i++){
    if(typeof obj[nombres[i]] === 'function'){
      var f = obj[nombres[i]];
      return function(){ return f.apply(obj, arguments); };
    }
  }
  return null;
}
/* El metodo de alternar de un modulo: `alterna` (hub), `alternar` (plano,
   camaras) o `toggle`. Si no hay ninguno, el boton no se registra. */
AD.metodoAlterna = function(obj){ return metodo(obj, ['alterna', 'alternar', 'toggle']); };

AD.boton = function(b){
  if(!b || !b.id) return null;
  b.activo = (typeof b.activo === 'function') ? b.activo : function(){ return false; };
  /* Si el modulo se registra dos veces (o se recarga), el boton se reemplaza:
     la barra no puede tener dos botones con el mismo id. */
  var i, yaEsta = false;
  for(i = 0; i < AD.botones.length; i++){
    if(AD.botones[i].id === b.id){ AD.botones[i] = b; yaEsta = true; break; }
  }
  if(!yaEsta) AD.botones.push(b);
  /* Si el boton ya existia, el que hay en pantalla es el viejo: hay que
     repintar para que use el handler nuevo. */
  if(yaEsta) AD.barraFirma = '';
  /* Si la barra ya esta en pantalla, el boton nuevo se ve enseguida. */
  if(AD.barraPintada) AD.pintaBarra();
  return b;
};

/* Iconos: SVG en linea, sin assets. 18x18, trazo de 1,6. */
AD.iconos = {
  plano: '<path d="M3 6.5 9 3l6 3.5v5L9 15l-6-3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 6.5 9 10l6-3.5M9 10v5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  camara: '<rect x="2.5" y="6" width="9" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11.5 9.5 15.5 7v5l-4-2.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  hub: '<rect x="2.5" y="3.5" width="5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="10.5" y="3.5" width="5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="6.5" y="10.5" width="5" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 8v1.5h8V8M9 9.5v1" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  sonido: '<path d="M4 7h2.5L10 4v10L6.5 11H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12.5 7a3.2 3.2 0 0 1 0 4M14.5 5a6 6 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  sonidoMudo: '<path d="M4 7h2.5L10 4v10L6.5 11H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12.5 7.5 16 11m0-3.5L12.5 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  paleta: '<path d="M9 2.5a6.5 6.5 0 0 0 0 13c1.2 0 1.6-.8 1.6-1.5 0-.8-.7-1.2-.7-1.9 0-.6.5-1.1 1.2-1.1h1.3A3.1 3.1 0 0 0 15.5 7.7C15.5 4.8 12.7 2.5 9 2.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.2" cy="8" r="1" fill="currentColor"/><circle cx="9" cy="5.8" r="1" fill="currentColor"/><circle cx="12.2" cy="7" r="1" fill="currentColor"/>',
  cocina: '<path d="M3 3.5h12v5H3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h12M7 8.5v3.5M11 8.5v3.5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  cine: '<path d="M2.5 4.5h13v9h-13z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 13.5v2M13 13.5v2" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  cctv: '<path d="M2.5 7h9l3 2.5v4.5h-12z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 14v2.5h5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  cam: '<circle cx="10" cy="4.4" r="1.7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8.4 5.8 6 8.5M11.6 5.8 14 8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6 8.5 3 14M14 8.5 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  lampara: '<path d="M6 8a4 4 0 0 1 8 0c0 2-1.4 2.6-1.8 4H7.8C7.4 10.6 6 10 6 8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 14.5h4M10 2v1.5M4.5 4.6 5.6 5.6M15.5 4.6 14.4 5.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
};

AD.svg = function(nombre, clase){
  return '<svg class="' + (clase || 'fab-ico') + '" viewBox="0 0 18 18" aria-hidden="true">' +
         (AD.iconos[nombre] || '') + '</svg>';
};

/* ── Estilo propio de la barra (lo que index.html no resuelve) ───────────── */
/* En el movil los botones van solo con icono: cinco botones con texto no caben
   en una fila y se apilan encima del HUD. Y en el paseo la barra se sube a la
   esquina, porque abajo a la derecha estan «Salir» y la puerta cercana: el
   pulgar derecho es de esos, no de la barra. */
function css(){
  if(document.getElementById('fab-fabrick-css')) return;
  var s = document.createElement('style');
  s.id = 'fab-fabrick-css';
  s.textContent =
   '#fabrick button{touch-action:manipulation; -webkit-user-select:none; user-select:none}'+
   '#fabrick button:focus-visible{outline:2px solid var(--accent); outline-offset:2px}'+
   '@media (max-width:860px){'+
     '#fabrick{gap:6px}'+
     '#fabrick button{width:44px; min-width:44px; padding:0; justify-content:center}'+
     '#fabrick button span{display:none}'+
     '#fabrick .fab-ico{width:22px; height:22px; flex:0 0 22px}'+
     'body.a-pie #fabrick{top:78px; bottom:auto; flex-direction:column; align-items:flex-end}'+
   '}';
  if(document.head && document.head.appendChild) document.head.appendChild(s);
}

AD.pintaBarra = function(){
  var barra = document.getElementById('fabrick');
  if(!barra) return false;
  css();
  /* Solo se repinta si la lista de botones cambio: repintarla cada vez perderia
     el estado (aria-pressed) y el foco del boton que se esta usando. */
  var firma = AD.botones.map(function(b){ return b.id; }).join('|');
  if(firma !== AD.barraFirma){
    AD.barraFirma = firma;
    vacia(barra);
    AD.botones.forEach(function(b){
      var el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', b.etiqueta);
      el.title = b.etiqueta;
      el.setAttribute('aria-pressed', 'false');
      el.innerHTML = AD.svg(b.icono) + '<span>' + b.etiqueta + '</span>';
      el.addEventListener('click', function(e){
        if(e && e.stopPropagation) e.stopPropagation();
        try{ b.alPulsar(); }catch(err){ console.warn('Fabrick', b.id, err); }
        AD.refrescaBarra();
      });
      b.el = el;
      b.iconoVisto = (typeof b.icono === 'function') ? null : b.icono;
      barra.appendChild(el);
    });
  }
  barra.hidden = false;
  AD.barraPintada = true;
  AD.refrescaBarra();
  return true;
};

AD.refrescaBarra = function(){
  AD.botones.forEach(function(b){
    if(!b.el) return;
    var on = false;
    try{ on = !!b.activo(); }catch(e){ on = false; }
    b.el.setAttribute('aria-pressed', on ? 'true' : 'false');
    /* El icono puede depender del estado (el sonido cambia de icono). */
    if(typeof b.icono === 'function'){
      var ic = null;
      try{ ic = b.icono(); }catch(e){ ic = null; }
      if(ic && ic !== b.iconoVisto){
        b.iconoVisto = ic;
        b.el.innerHTML = AD.svg(ic) + '<span>' + b.etiqueta + '</span>';
      }
    }
  });
};

/* ── Botones de la barra ── */
/* Cada boton se registra solo si su modulo existe y trae el metodo. Si el
   modulo no esta (o fallo al cargarlo), no hay boton: una barra con botones
   muertos es peor que una barra sin boton.

   OJO con el cierre: cada boton guarda SU modulo. Si se guardara una variable
   compartida, todos los botones acabarian leyendo el estado del ultimo modulo
   y el aria-pressed no diria nada. */
function botonDe(id, etiqueta, icono, modulo, estado, iconoDe){
  var f = AD.metodoAlterna(modulo);
  if(!f){ console.warn('Fabrick: ' + id + ' no expone alterna/alternar'); return null; }
  return AD.boton({id:id, etiqueta:etiqueta, icono:icono,
    alPulsar:f,
    activo:function(){ try{ return !!(estado ? estado() : false); }catch(e){ return false; } },
    icono:(iconoDe ? function(){ try{ return iconoDe(); }catch(e){ return icono; } } : icono)});
}

function registra(){
  if(AD.plano){
    botonDe('plano', 'Plano', 'plano', AD.plano, function(){
      var m = AD.plano; return !!(m && m.esPlan3D && m.esPlan3D());
    });
  }
  if(AD.camaras){
    botonDe('cine', 'Cine', 'cine', AD.camaras, function(){
      var m = AD.camaras; return !!(m && m.modoCine && m.modoCine());
    });
  }
  if(AD.hub){
    botonDe('hub', 'Control', 'hub', AD.hub, function(){
      var m = AD.hub; return !!(m && m.abierto && m.abierto());
    });
  }
  if(AD.paleta){
    botonDe('paleta', 'Color', 'paleta', AD.paleta, function(){
      var m = AD.paleta; return !!(m && m.tema && m.tema() === 'limon');
    });
  }
  if(AD.audio){
    botonDe('sonido', 'Sonido', 'sonido', AD.audio, function(){
      var m = AD.audio; return !!(m && m.suena && m.suena());
    }, function(){
      var m = AD.audio;
      return (m && m.suena && m.suena()) ? 'sonido' : 'sonidoMudo';
    });
  }
  /* El módulo de videovigilancia (modulo/cctv.js) expone la misma forma que
     el hub: `alterna` y `abierto`. Si no está, no hay botón. */
  if(AD.cctv){
    botonDe('cctv', 'CCTV', 'cctv', AD.cctv, function(){
      var m = AD.cctv; return !!(m && m.abierto && m.abierto());
    });
  }
  /* El recorrido digital por la vivienda. */
  if(AD.recorrido){
    botonDe('recorrido', 'Recorrido', 'cam', AD.recorrido, function(){
      var m = AD.recorrido; return !!(m && m.abierto && m.abierto());
    });
  }
  /* La finca de noche. */
  if(AD.exterior){
    botonDe('exterior', 'Exterior', 'lampara', AD.exterior, function(){
      var m = AD.exterior; return !!(m && m.abierto && m.abierto());
    });
  }
  /* La luz: globos y volumetrico. */
  if(AD.luz){
    botonDe('luz', 'Luz', 'lampara', AD.luz, function(){
      var m = AD.luz; return !!(m && m.encendida && m.encendida());
    });
  }
}

/* La barra se pinta cuando el visor esta listo. Si AD.alListo no existe (el
   visor todavia no ha cargado), se pinta igual: el modulo se ha cargado
   despues, asi que la escena ya esta. */
function arranca(){
  registra();
  AD.pintaBarra();
  /* El estado cambia solo (el plano se abre, la noche cae): se relee cada poco.
     Con la pagina en segundo plano no hace falta ir mirando. */
  if(!AD.relojBarra){
    AD.relojBarra = setInterval(function(){
      if(document.hidden) return;
      AD.refrescaBarra();
    }, 600);
  }
  if(document.addEventListener){
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) AD.refrescaBarra(); });
  }
}

/* La barra se pinta **en el acto**, con los modulos que ya esten cargados, y
   otra vez cuando el visor avisa que esta listo (los modulos que necesitan la
   escena se montan despues). Antes solo se pintaba al final: si el core se
   caia (por ejemplo, sin contexto WebGL), la barra se quedaba vacia y parecia
   que no habia ningun boton. */
registra();
AD.pintaBarra();
if(typeof AD.alListo === 'function') AD.alListo(arranca);
else arranca();
