/* Ars Domus FABRICK — modulo/fabrick.js
   La barra de acciones: pega los modulos entre si y los expone en un solo sitio.
   Este archivo es del coordinator: no lo toca ningun agente.

   Cada modulo de modulo/ puede registrar un boton con:
     AD.boton({id, etiqueta, icono, alPulsar, activo})
   y se dibuja en la barra #fabrick (arriba a la derecha en escritorio, abajo en movil).
*/
var AD = window.AD || (window.AD = {});

AD.botones = AD.botones || [];
AD.boton = function(b){
  b.activo = b.activo || function(){ return false; };
  AD.botones.push(b);
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
  cine: '<path d="M2.5 4.5h13v9h-13z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 13.5v2M13 13.5v2" fill="none" stroke="currentColor" stroke-width="1.4"/>'
};

AD.svg = function(nombre, clase){
  return '<svg class="' + (clase || 'fab-ico') + '" viewBox="0 0 18 18" aria-hidden="true">' +
         (AD.iconos[nombre] || '') + '</svg>';
};

AD.pintaBarra = function(){
  var barra = document.getElementById('fabrick');
  if(!barra) return;
  barra.innerHTML = '';
  barra.hidden = false;
  AD.botones.forEach(function(b){
    var el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', b.etiqueta);
    el.title = b.etiqueta;
    el.innerHTML = AD.svg(b.icono) + '<span>' + b.etiqueta + '</span>';
    el.addEventListener('click', function(e){
      e.stopPropagation();
      try{ b.alPulsar(); }catch(e){ console.warn('Fabrick', e); }
      AD.refrescaBarra();
    });
    b.el = el;
    barra.appendChild(el);
  });
  AD.refrescaBarra();
};

AD.refrescaBarra = function(){
  AD.botones.forEach(function(b){
    if(!b.el) return;
    var on = false;
    try{ on = !!b.activo(); }catch(e){ on = false; }
    b.el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
};

/* ── Botones de la barra ── */
AD.alListo(function(){
  if(AD.plano)   AD.boton({id:'plano',  etiqueta:'Plano',  icono:'plano',
    alPulsar:function(){ AD.plano.alterna(); },  activo:function(){ return AD.plano.esPlan3D(); }});
  if(AD.camaras) AD.boton({id:'cine',   etiqueta:'Cine',   icono:'cine',
    alPulsar:function(){ AD.camaras.alterna(); }, activo:function(){ return AD.camaras.modoCine && AD.camaras.modoCine(); }});
  if(AD.hub)     AD.boton({id:'hub',    etiqueta:'Control', icono:'hub',
    alPulsar:function(){ AD.hub.alterna(); },    activo:function(){ return AD.hub.abierto && AD.hub.abierto(); }});
  if(AD.paleta)  AD.boton({id:'paleta', etiqueta:'Color',  icono:'paleta',
    alPulsar:function(){ AD.paleta.alterna(); },  activo:function(){ return AD.paleta.tema() === 'limon'; }});
  if(AD.audio)   AD.boton({id:'sonido', etiqueta:'Sonido', icono:'sonido',
    alPulsar:function(){ AD.audio.alterna(); },   activo:function(){ return AD.audio.suena(); }});
  AD.pintaBarra();
  setInterval(AD.refrescaBarra, 600);
});
