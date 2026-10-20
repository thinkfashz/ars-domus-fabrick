"""La propuesta de reforma de la casa de ejemplo: sale en casa.js como window.CASA_MEJORA.

Parte de la casa actual (casa.py) y le aplica unos cambios. El visor levanta las dos versiones y
enseña una u otra (botones Actual / Mejorada, tecla V), con la cámara en el mismo sitio.

Lo que puede traer la mejorada:
- casa: muros, huecos e interior propios (aquí: la cocina se abre al salón y cambian suelos y
  pinturas). Los muebles nuevos llevan `idea`, que sale en su ficha.
- quita: los IDs del visor (A-…, EXT-…) de lo de fuera que desaparece; 'lena' quita la leña.
- exterior: zonas del suelo, caminos, placas y árboles nuevos, en el marco del mundo.
- propuestas: el texto del panel para cada vista ('general' si la vista no tiene el suyo).
"""
import copy
import math


def aplica(casa):
    c = copy.deepcopy(casa['casa'])
    # La cocina se abre al salón: fuera el tabique entre los dos (u = 8, de v = 0 a v = 4,5) y su paso
    c['muros'] = [w for w in c['muros'] if not (w[0] == w[2] == 8 and max(w[1], w[3]) <= 4.5)]
    c['huecos'] = [h for h in c['huecos'] if not (h[0] == h[2] == 8 and max(h[1], h[3]) <= 4.5)]
    # Suelos y pinturas nuevos
    nuevos = dict(
        salon=dict(suelo='parquet', pared='#f4f1ea', idea='Roble en lamas anchas en todo el salón y la cocina abierta.'),
        cocina=dict(suelo='parquet', pared='#f4f1ea', idea='Sin el tabique: la cocina mira al salón y a la chimenea.'),
        recibidor=dict(suelo='hidraulica', idea='Baldosa hidráulica en la entrada.'),
        estudio=dict(pared='#c9d3c0', idea='Estudio en verde salvia.'),
    )
    for e in c['interior']['estancias']:
        e.update(nuevos.get(e['id'], {}))
    # Muebles: la isla crece y se pone de cara al salón; un banco de obra bajo la ventana del estudio
    ms = [m for m in c['interior']['muebles'] if m['tipo'] not in ('isla', 'banqueta')]
    ms += [
        dict(id='COC-M01', tipo='isla', uv=[9.2, 2.4], giro=-90, largo=2.4, fondo=1.0, frente='#55665a', tapa='#b98b5e',
             idea='Isla de 2,4 m de cara al salón, donde estaba el tabique.'),
        *[dict(id='COC-M%02d' % (i + 2), tipo='banqueta', uv=[8.35, 1.6 + 0.6 * i], giro=-90, color='#55665a') for i in range(3)],
        # fuera: barbacoa junto a la pérgola, bancales en el huerto y hamaca entre dos olivos
        dict(id='EXT-M01', tipo='barbacoa_obra', mundo=[16.2, 21.5], giro=180, idea='Barbacoa de obra al lado de la pérgola.'),
        *[dict(id='EXT-M%02d' % (i + 2), tipo='bancal', mundo=[20.0 + 2.2 * i, -17.0], ancho=1.2, largo=6.0,
               idea='Bancales elevados de madera.') for i in range(5)],
        dict(id='EXT-M07', tipo='hamaca', mundo=[-24.75, -13.5], giro=0, largo=3.6, idea='Hamaca entre dos olivos.'),
        dict(id='EXT-M08', tipo='emparrado', mundo=[3.0, 25.6], giro=0, ancho=8.0, fondo=3.0, alto=2.5,
             idea='Emparrado al S de la piscina, para la sombra de la tarde.'),
    ]
    # Soñar es gratis: el lujo, todo fuera y en el marco del mundo
    ms += lujo()
    c['interior']['muebles'] = ms
    return dict(
        casa=dict(muros=c['muros'], huecos=c['huecos'], interior=c['interior']),
        # la leña, los olivos de la era (la fuente) y los árboles que caen en la pista de pádel
        quita=['lena'] + [a[4] for a in casa['arboles'] if math.hypot(a[1] + 18.0, a[2]) < 4.5 or en_padel(a)],
        exterior=dict(
            zonas=[dict(nombre='Green de golf', mat='cesped', ref='EXT-M-green', circulo=[14.0, -14.0, 3.6],
                        idea='Un green para practicar el putt antes de coger el helicóptero.'),
                   dict(nombre='Huerto con bancales', mat='grava', ref='EXT-M-huerto', poly=[[18.0, -22.0], [30.0, -22.0], [30.0, -12.0], [18.0, -12.0]],
                        idea='Grava entre bancales: sin barro ni malas hierbas.')],
            caminos=[dict(nombre='Camino de losas a la era', mat='losa', ancho=1.0, ref='EXT-M-camino',
                          eje=[[-10.0, 4.0], [-14.0, 2.0], [-15.0, 1.0]], idea='Losas de la fachada O a la era.')],
            placas=dict(filas=[dict(desde=[24.0, -8.0], hasta=[33.0, -8.0], n=8)], panel=[1.13, 2.28],
                        inclinacion=30, cota=0.45, ref='EXT-M-placas', idea='Ocho paneles en el suelo, mirando al S.'),
            arboles=[['naranjo', 16.0, 15.5, 1.2, 'A-M01'], ['limonero', 18.0, 15.0, 1.1, 'A-M02'],
                     ['lavanda', 1.0, 12.4, 0.4, 'A-M03'], ['lavanda', 5.0, 12.4, 0.4, 'A-M04'],
                     ['romero', -1.5, 12.4, 0.5, 'A-M05'], ['romero', 7.5, 12.4, 0.5, 'A-M06']],
        ),
        propuestas=dict(
            general='Soñar es gratis: pérgola bioclimática con un Lambo y un Ferrari, helipuerto, pádel, jacuzzi, '
                    'chiringuito, cine al aire libre, fuente con estatua dorada, sauna y green. Y, ya puestos, la cocina '
                    'abierta al salón, suelos nuevos, huerto con bancales y placas solares.',
            casa='Palmeras en el camino de entrada y la pérgola de los deportivos en el aparcamiento.',
            finca='Helipuerto al N, pista de pádel al SO, cine al aire libre al SE y un green junto al huerto.',
            salon='Sin el tabique de la cocina: un solo espacio con la chimenea al fondo y suelo de roble.',
            cocina='Isla de 2,4 m de cara al salón y baldosa hidráulica en el recibidor.',
            huerto='Cinco bancales elevados con grava entre ellos y ocho paneles solares al lado.',
            piscina='Emparrado al S de la piscina y barbacoa junto a la pérgola.',
        ),
    )


# Pista de pádel (10 × 20, a lo largo de z) junto a la linde O, lejos de la caseta y de la sauna
PADEL = (-24.6, 18.0)


def en_padel(arbol, margen=0.3):
    """La copa del árbol [tipo, x, z, radio, id] pisa la pista de pádel."""
    x0, x1, z0, z1 = PADEL[0] - 5 - margen, PADEL[0] + 5 + margen, PADEL[1] - 10 - margen, PADEL[1] + 10 + margen
    dx = max(x0 - arbol[1], 0, arbol[1] - x1)
    dz = max(z0 - arbol[2], 0, arbol[2] - z1)
    return math.hypot(dx, dz) < arbol[3]


def lujo():
    """Lo obscenamente pijo de la mejorada: cada pieza con su sitio en el mundo (x al E, z al S)."""
    def L(n, tipo, x, z, giro=0, **kw):
        return dict(id='EXT-X%02d' % n, tipo=tipo, mundo=[x, z], giro=giro, **kw)
    piezas = [
        L(1, 'pergola_bio', 16.5, 3.0, ancho=7.6, fondo=6.0, alto=2.7, suelo='#9a9690', grupo='Garaje',
          idea='Pérgola bioclimática de aluminio con lamas orientables y LED: el garaje de los deportivos.'),
        L(2, 'deportivo', 14.6, 3.0, 0, pintura='#f2c200', estilo='cuna', nombre='Superdeportivo amarillo (estilo Lamborghini)',
          idea='Amarillo, de aristas, y con alerón.'),
        L(3, 'deportivo', 18.4, 3.0, 0, pintura='#c4141c', estilo='curvas', nombre='Superdeportivo rojo (estilo Ferrari)',
          idea='Rojo, por supuesto.'),
        L(4, 'helipuerto', 5.0, -14.0, 0, radio=4.5, grupo='Helipuerto',
          idea='Helipuerto de 9 m con su helicóptero, para no perder tiempo en el camino de entrada.'),
        L(5, 'padel', PADEL[0], PADEL[1], 0, grupo='Pádel',
          idea='Pista de pádel de cristal a lo largo de la linde O, con focos para jugar de noche.'),
        L(6, 'jacuzzi', -4.3, 21.6, 0, cota=0.3, grupo='Piscina', idea='Jacuzzi de madera en el césped de la piscina.'),
        L(7, 'chiringuito', -4.6, 14.9, 0, cota=0.3, idea='Chiringuito con palapa, barra y botellas que nadie paga.'),
        L(8, 'cine', 30.0, 22.5, 0, ancho=5.5, idea='Cine al aire libre con pufs, mirando al S.'),
        L(9, 'fuente_estatua', -18.0, 0.0, 0, radio=2.4, idea='Fuente en la era con una estatua dorada. Sin comentarios.'),
        L(10, 'sauna_barril', -9.5, 22.6, 0, idea='Sauna de barril junto a la caseta, a dos pasos del jacuzzi.'),
        L(11, 'bandera_golf', 14.8, -13.6, 0, idea='El hoyo del green.'),
    ]
    n = len(piezas)
    # palmeras de porte a los dos lados del camino de entrada, y conos de boj delante del porche
    for z in (27.0, 22.0, 17.0):
        for x in (19.0, 25.2):
            n += 1
            piezas.append(L(n, 'palmera_alta', x, z, alto=6.5, idea='Palmeras a los dos lados del camino de entrada.'))
    for x in (-3.0, 1.5, 4.5, 9.5):
        n += 1
        piezas.append(L(n, 'topiario', x, 4.3, forma='cono', idea='Conos de boj delante del porche.'))
    return piezas
