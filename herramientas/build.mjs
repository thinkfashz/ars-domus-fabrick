// Versión estática del visor → dist/, lista para GitHub Pages (o cualquier hosting de ficheros).
//   npm run build                 la casa de ejemplo (demo/)
//   CASA=ruta npm run build       otra casa: su casa.js y sus texturas/
// Sin servidor no hay cambios.json: lo que se mueve en «Mover objetos» se queda en el navegador y se
// copia con «Copiar cambios». DOMINIO=… escribe el CNAME (sin él, no hay dominio propio).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
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
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  .replace('/node_modules/three/build/three.min.js', 'three.min.js');
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
// El index.html los carga todos: si falta alguno, avisamos en vez de subir un visor roto.
const MODULOS = ['paleta', 'cocina', 'plano', 'camaras', 'hub', 'audio', 'carga', 'fabrick'];
const faltan = MODULOS.filter(m => !existsSync(join(RAIZ, 'modulo', m + '.js')));
if (faltan.length) console.warn('Faltan modulos: ' + faltan.join(', ') + ' (el visor arranca igual)');
if (existsSync(join(RAIZ, 'iconos'))) cpSync(join(RAIZ, 'iconos'), join(DIST, 'iconos'), { recursive: true });
cpSync(join(CASA, 'casa.js'), join(DIST, 'casa.js'));
if (existsSync(join(CASA, 'texturas'))) cpSync(join(CASA, 'texturas'), join(DIST, 'texturas'), { recursive: true });
writeFileSync(join(DIST, '.nojekyll'), '');
if (process.env.DOMINIO) writeFileSync(join(DIST, 'CNAME'), process.env.DOMINIO + '\n');
console.log('dist/ listo' + (process.env.DOMINIO ? ' para ' + process.env.DOMINIO : ''));
