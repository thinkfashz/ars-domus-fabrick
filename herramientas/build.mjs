// Versión estática del visor → dist/, lista para GitHub Pages (o cualquier hosting de ficheros).
//   npm run build                 la casa de ejemplo (demo/)
//   CASA=ruta npm run build       otra casa: su casa.js y sus texturas/
// Sin servidor no hay cambios.json: lo que se mueve en «Mover objetos» se queda en el navegador y se
// copia con «Copiar cambios». DOMINIO=… escribe el CNAME (sin él, no hay dominio propio).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CASA = resolve(process.cwd(), process.env.CASA || join(RAIZ, 'demo'));
const DIST = join(RAIZ, 'dist');

// El vinculo con Vercel (.vercel/project.json) NO se borra: si se pierde, el
// siguiente despliegue crea un proyecto nuevo con el nombre de la carpeta.
const VINCULO = join(DIST, '.vercel');
let vinculo = null;
if (existsSync(VINCULO)) {
  vinculo = join(RAIZ, '.vercel-guardado');
  rmSync(vinculo, { recursive: true, force: true });
  cpSync(VINCULO, vinculo, { recursive: true });
}
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);
if (vinculo) {
  cpSync(vinculo, VINCULO, { recursive: true });
  rmSync(vinculo, { recursive: true, force: true });
}
/* La version va en la URL de cada script: si no, un service worker viejo (o el
   cache del navegador) puede servir un visor.js que ya no existe. Con la
   version en la URL, ninguna cache coincide y todo sale de la red. */
const VERSION_BUILD = readFileSync(join(RAIZ, 'herramientas', 'VERSION'), 'utf8').trim();
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  .replace('/node_modules/three/build/three.min.js', 'three.min.js')
  .replace(/\?v=__BUILD__/g, '?v=' + VERSION_BUILD);
if (html.includes('node_modules')) throw new Error('index.html aún apunta a node_modules');
writeFileSync(join(DIST, 'index.html'), html);
cpSync(join(RAIZ, 'visor.js'), join(DIST, 'visor.js'));
cpSync(join(RAIZ, 'node_modules/three/build/three.min.js'), join(DIST, 'three.min.js'));
cpSync(join(RAIZ, 'manifest.webmanifest'), join(DIST, 'manifest.webmanifest'));
cpSync(join(RAIZ, 'sw.js'), join(DIST, 'sw.js'));
// Modulos de Fabrick: se cargan despues del visor. Se copian enteros y en orden.
if (existsSync(join(RAIZ, 'modulo'))) {
  cpSync(join(RAIZ, 'modulo'), join(DIST, 'modulo'), { recursive: true });
}
/* Red de seguridad: un modulo a medias (un agente cortado por un reinicio)
   no puede publicarse. Se parsea cada archivo y, si alguno no compila, se avisa
   con nombre y linea: es el error que mas veces ha tumbado el visor. */
const MODULOS = ['paleta', 'cocina', 'plano', 'camaras', 'hub', 'audio', 'carga',
                 'luz', 'cctv', 'recorrido', 'exterior', 'fabrick'];
const rotos = [];
for (const m of MODULOS) {
  const f = join(RAIZ, 'modulo', m + '.js');
  if (!existsSync(f)) continue;
  try {
    new vm.Script(readFileSync(f, 'utf8'), { filename: m + '.js' });
  } catch (e) {
    rotos.push(m + '.js: ' + (e && e.message ? e.message.split('\n')[0] : e));
  }
}
if (rotos.length) {
  console.error('\n  MODULOS ROTOS (no se publican):');
  rotos.forEach(r => console.error('   x ' + r));
  process.exitCode = 1;
}
// Si falta un modulo, el visor arranca igual (el index.html avisa por consola).
const faltan = MODULOS.filter(m => !existsSync(join(RAIZ, 'modulo', m + '.js')));
if (faltan.length) console.warn('  Faltan modulos (el visor arranca igual): ' + faltan.join(', '));
if (existsSync(join(RAIZ, 'iconos'))) cpSync(join(RAIZ, 'iconos'), join(DIST, 'iconos'), { recursive: true });
if (existsSync(join(RAIZ, 'icono.svg'))) cpSync(join(RAIZ, 'icono.svg'), join(DIST, 'icono.svg'));
/* Las cabeceras de Vercel van con la build: la app no se cachea en el CDN. */
if (existsSync(join(RAIZ, 'herramientas', 'vercel.json'))) cpSync(join(RAIZ, 'herramientas', 'vercel.json'), join(DIST, 'vercel.json'));
cpSync(join(CASA, 'casa.js'), join(DIST, 'casa.js'));
if (existsSync(join(CASA, 'texturas'))) cpSync(join(CASA, 'texturas'), join(DIST, 'texturas'), { recursive: true });
writeFileSync(join(DIST, '.nojekyll'), '');
if (process.env.DOMINIO) writeFileSync(join(DIST, 'CNAME'), process.env.DOMINIO + '\n');
console.log('dist/ listo' + (process.env.DOMINIO ? ' para ' + process.env.DOMINIO : ''));
