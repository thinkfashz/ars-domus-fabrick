/* Service worker del visor Build House.
   La app NUNCA se sirve vieja: para el esqueleto (index.html, visor.js, casa.js,
   los módulos y three.js) va **red primero** y solo se cae a la cache si no hay
   red. Las texturas y las imagenes si van cache primero, porque no cambian.

   Por que: con la cache primero, un service worker instalado con una version
   antigua seguía sirviendo un visor.js roto aunque la pagina nueva se hubiera
   descargado. En el telefono era exactamente eso: la pestana decia "Maqueta de
   El Olivar" y el visor tiraba un ReferenceError de un build que ya no existe.
   Un service worker es una cache con permisos: si guarda lo equivocado, esconde
   el arreglo hasta que se limpia a mano. */
var VERSION = 'build-house-v6';
var CAPA = VERSION + '-estatico';

/* Lo que se guarda al instalar: solo el esqueleto minimo. El resto entra por el
   fetch, red primero. */
var BASE = ['./', './index.html', './manifest.webmanifest', './icono.svg',
            './iconos/icono-192.png', './iconos/icono-512.png', './iconos/icono-maskable-512.png'];

/* El esqueleto de la app: va SIEMPRE a la red primero. */
function esApp(url){
  return /\/index\.html$/.test(url.pathname) || /\/visor\.js$/.test(url.pathname) ||
         /\/casa\.js$/.test(url.pathname) || /\/sw\.js$/.test(url.pathname) ||
         /\/three\.min\.js$/.test(url.pathname) ||
         url.pathname.indexOf('/modulo/') >= 0;
}

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CAPA).then(function(c){
    return Promise.all(BASE.map(function(u){ return c.add(new Request(u, {cache:'reload'})); }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k !== CAPA; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;                 // nada de otras webs

  if(esApp(url)){
    /* Red primero: lo que hay en la red es la verdad. La cache es el plan B. */
    e.respondWith(fetch(req).then(function(res){
      if(res && res.status === 200 && res.type === 'basic'){
        var copia = res.clone();
        caches.open(CAPA).then(function(c){ c.put(req, copia); });
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){ return hit || Response.error(); });
    }));
    return;
  }

  /* Texturas e imagenes: cache primero, que no cambian. */
  e.respondWith(caches.match(req).then(function(hit){
    if(hit) return hit;
    return fetch(req).then(function(res){
      if(res && res.status === 200 && res.type === 'basic'){
        var copia = res.clone();
        caches.open(CAPA).then(function(c){ c.put(req, copia); });
      }
      return res;
    }).catch(function(){
      if(req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    });
  }));
});
