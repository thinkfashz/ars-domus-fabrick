"""Genera demo/casa.js: la casa de ejemplo de Ars Domus, inventada de arriba abajo.

    python3 demo/herramientas/casa.py

Una casa de campo mediterránea de una planta: un cuerpo largo de piedra con cubierta de teja a dos
aguas, un ala encalada en L y un porche entre los dos, con piscina, pérgola, olivos y un huerto. No
existe: ni el plano, ni la parcela, ni los muebles salen de ningún sitio real. Sirve de ejemplo de
cómo se describe una casa para el visor y de punto de partida para describir la tuya.

Sale en casa.js como window.CASA (la casa actual) y window.CASA_MEJORA (la propuesta de reforma,
en mejora.py).

Marcos de referencia
  · plano (u, v): metros, u hacia la derecha del plano y v hacia abajo. La casa se describe aquí.
  · mundo (x, z): metros, x al este y z al sur. El exterior y los árboles se describen aquí.
  Con rumbo 90 la casa no va girada: x = origen.x + u, z = origen.z + v.
"""
import json
import math
import random
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
RUMBO = 90.0                 # el eje u del plano apunta al este
ORIGEN = [-10.0, -8.0]       # dónde cae (u, v) = (0, 0) en el mundo


def r2(x):
    return round(x, 2)


def mundo(u, v):
    return [r2(ORIGEN[0] + u), r2(ORIGEN[1] + v)]


# ---------------------------------------------------------------- volúmenes y cubiertas
# Cuerpo principal: u 0-20, v 0-9, piedra, dos aguas con la cumbrera a lo largo (al E-O).
# Ala en L al SO: u 0-6, v 9-15, encalada, una agua que cae al S.
# Porche al S del cuerpo principal: u 6-20, v 9-11,5, una agua apoyada en la fachada.
ALERO, CUMBRERA = 3.00, 4.70             # cuerpo principal
ALA_ALTO, ALA_BAJO = 2.95, 2.55          # ala en L, de v = 9 a v = 15
CUBIERTAS = [
    dict(id='principal', nombre='Cubierta principal', tipo='dos_aguas', caja=[0, 0, 20, 9], eje='u',
         alero=ALERO, cumbrera=CUMBRERA),
    dict(id='ala', nombre='Ala del estudio', tipo='una_agua', caja=[0, 9, 6, 15], cae='S',
         alto=ALA_ALTO, bajo=ALA_BAJO),
    dict(id='porche', nombre='Porche', tipo='una_agua', caja=[6, 9, 20, 11.5], cae='S', pegada='O',
         alto=2.85, bajo=2.45, vuelo=0.4),
]
CONTORNO = [[0, 0], [20, 0], [20, 11.5], [6, 11.5], [6, 15], [0, 15]]


def alto_ala(u, v=None):
    """Altura del muro del ala en L bajo su cubierta, que cae al S (en v; vale también alto_ala(v))."""
    v = u if v is None else v
    return ALA_ALTO + (ALA_BAJO - ALA_ALTO) * (v - 9) / 6


# ---------------------------------------------------------------- muros y huecos
# Cada muro es una recta con sus huecos; muro() lo trocea entre ellos. Un hueco es (desde, hasta, tipo,
# opciones), medido a lo largo del muro desde su inicio. `cara`: hacia dónde queda el exterior (N, S,
# E, O); en los tabiques, hacia dónde abren las puertas. `alto`: un número o una función de la
# posición en el plano (u, v), para los muros bajo una cubierta inclinada.
EXT, TAB = 0.45, 0.12
muros, huecos = [], []
_n_muro, _n_hueco = [0], [0]


def muro(a, b, esp, alto, mat, cara, aberturas=()):
    _n_muro[0] += 1
    wid = 'W-%02d' % _n_muro[0]
    L = math.dist(a, b)
    ux, uv = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    pt = lambda s: (r2(a[0] + ux * s), r2(a[1] + uv * s))
    h = alto if callable(alto) else (lambda u, v: alto)
    s = 0.0
    for s0, s1, tipo, op in sorted(aberturas) + [(L, L, None, None)]:
        if s0 > s + 0.01:
            p, q = pt(s), pt(s0)
            muros.append([*p, *q, esp, r2(h(*p)), r2(h(*q)), mat, wid])
        if tipo:
            _n_hueco[0] += 1
            p, q = pt(s0), pt(s1)
            huecos.append([*p, *q, tipo, cara, esp, r2(h(*p)), r2(h(*q)), mat,
                           dict(id='H-%02d' % _n_hueco[0], **(op or {}))])
        s = s1


def V(s0, ancho=1.2):                    # ventana
    return (s0, s0 + ancho, 'ventana', {})


def P(s0, ancho=0.8, **op):              # puerta (giro=180: abierta del todo, plegada contra la pared)
    return (s0, s0 + ancho, 'puerta', op)


# Fachadas del cuerpo principal (piedra)
muro((0, 0), (20, 0), EXT, ALERO, 'piedra', 'N',
     [V(2.4), V(5.0), V(9.6), V(14.0), (18.0, 18.7, 'ventanuco', {})])
muro((0, 0), (0, 9), EXT, ALERO, 'piedra', 'O', [V(1.6), V(6.4)])
muro((20, 0), (20, 9), EXT, ALERO, 'piedra', 'E', [(4.6, 5.2, 'ventanuco', {}), V(6.6)])
muro((6, 9), (20, 9), EXT, ALERO, 'piedra', 'S',
     [(0.4, 1.8, 'vidriera', dict(giros=[180, 90])), P(3.6, 1.1, hoja='azul', bisagra='fin', giro=180), V(7.8), V(11.6)])
# Ala en L (encalada), bajo su cubierta de una agua
muro((0, 9), (0, 15), EXT, alto_ala, 'blanco', 'O', [V(1.0), (4.2, 4.9, 'ventanuco', {})])
muro((0, 15), (6, 15), EXT, ALA_BAJO, 'blanco', 'S', [P(3.6, 0.9, hoja='verde', giro=180)])
muro((6, 9), (6, 15), EXT, alto_ala, 'blanco', 'E', [V(0.8), (4.3, 5.0, 'ventanuco', {})])


# Tabiques. El del salón con la cocina y el recibidor sube hasta la cumbrera: el salón no tiene
# falso techo, se ve la cubierta con sus vigas.
def bajo_cubierta(u, v):
    return ALERO + (CUMBRERA - ALERO) * (1 - abs(v - 4.5) / 4.5) - 0.05


muro((8, 0), (8, 4.5), TAB, bajo_cubierta, 'interior', 'E', [(1.2, 2.6, 'paso', {})])
muro((8, 4.5), (8, 9), TAB, bajo_cubierta, 'interior', 'E', [(1.7, 3.1, 'vidriera', dict(giros=[180, 180]))])
muro((8, 4.3), (12.5, 4.3), TAB, 2.7, 'interior', 'S', [P(2.9, giro=180)])
muro((12.5, 0), (12.5, 4.3), TAB, 2.7, 'interior', 'E')
muro((12.5, 5.5), (12.5, 9), TAB, 2.7, 'interior', 'E')
muro((12.5, 4.3), (20, 4.3), TAB, 2.7, 'interior', 'N', [P(0.5, giro=180), P(4.9, giro=180)])
muro((16.8, 0), (16.8, 4.3), TAB, 2.7, 'interior', 'E')
muro((12.5, 5.5), (20, 5.5), TAB, 2.7, 'interior', 'S', [P(2.7, giro=180), P(4.1, bisagra='fin', giro=180)])
muro((16.3, 5.5), (16.3, 9), TAB, 2.7, 'interior', 'E')
muro((0, 9), (6, 9), TAB, ALERO - 0.05, 'interior', 'S', [P(4.6, giro=180)])
muro((0, 12.3), (6, 12.3), TAB, alto_ala, 'interior', 'S', [P(4.8, giro=180)])

# Porche: pilares de piedra y viga de madera en la boca
PILARES = [[u, 11.45, 0.35, 2.3, 'piedra'] for u in (9.5, 13.0, 16.5, 19.8)]
VIGAS = [[6.0, 11.45, 20.0, 11.45, 2.2, 'madera']]
CHIMENEAS = [dict(uv=[0.25, 4.5], lado=0.6, alto=5.6)]

# ---------------------------------------------------------------- interior
# Estancias: caja por los ejes de los muros, cota del suelo, acabados y techo (alto, o alto0/alto1
# en v0/v1, o a dos aguas con cumbrera en v = vc). `junta`: trozo de otra estancia.
BLANCO_ROTO = '#f2efe8'
ESTANCIAS = [
    dict(id='salon', nombre='Salón comedor', codigo='SAL', caja=[0, 0, 8, 9], cota=0.12, suelo='barro', pared=BLANCO_ROTO,
         paredes=dict(O='piedra'), techo=dict(alto=ALERO - 0.05, cumbrera=CUMBRERA - 0.2, vc=4.5, mat='blanco', vigas=0.9)),
    dict(id='cocina', nombre='Cocina', codigo='COC', caja=[8, 0, 12.5, 4.3], cota=0.12, suelo='gres', pared='#f4f4f2',
         techo=dict(alto=2.7, mat='blanco')),
    dict(id='recibidor', nombre='Recibidor', codigo='REC', caja=[8, 4.3, 12.5, 9], cota=0.12, suelo='barro', pared=BLANCO_ROTO,
         techo=dict(alto=2.7, mat='blanco')),
    dict(id='pasillo', nombre='Pasillo', codigo='PAS', caja=[12.5, 4.3, 20, 5.5], cota=0.12, suelo='laminado', pared=BLANCO_ROTO,
         techo=dict(alto=2.7, mat='blanco')),
    dict(id='dormitorio', nombre='Dormitorio principal', codigo='DOR', caja=[12.5, 0, 16.8, 4.3], cota=0.12, suelo='laminado',
         pared='#e9e4da', techo=dict(alto=2.7, mat='blanco')),
    dict(id='bano', nombre='Baño', codigo='BAN', caja=[16.8, 0, 20, 4.3], cota=0.12, suelo='gres', pared='azulejo',
         techo=dict(alto=2.6, mat='blanco')),
    dict(id='dormitorio_2', nombre='Dormitorio de invitados', codigo='DO2', caja=[12.5, 5.5, 16.3, 9], cota=0.12,
         suelo='laminado', pared='#dfe6e3', techo=dict(alto=2.7, mat='blanco')),
    dict(id='dormitorio_3', nombre='Dormitorio pequeño', codigo='DO3', caja=[16.3, 5.5, 20, 9], cota=0.12, suelo='laminado',
         pared='#efe3cf', techo=dict(alto=2.7, mat='blanco')),
    dict(id='estudio', nombre='Estudio', codigo='EST', caja=[0, 9, 6, 12.3], cota=0.12, suelo='tarima', pared='#a9b3c3',
         techo=dict(alto0=r2(alto_ala(9) - 0.1), alto1=r2(alto_ala(12.3) - 0.1), mat='blanco', vigas=0.8)),
    dict(id='lavadero', nombre='Lavadero', codigo='LAV', caja=[0, 12.3, 6, 15], cota=0.12, suelo='gres', pared='#f4f4f2',
         techo=dict(alto0=r2(alto_ala(12.3) - 0.1), alto1=r2(alto_ala(15) - 0.1), mat='blanco')),
    # `fuera`: sus luces van con las de fuera, por grupos en el panel
    dict(id='porche', nombre='Porche', codigo='POR', caja=[6, 9, 20, 11.5], cota=0.12, fuera=True, suelo='barro',
         techo=dict(alto0=2.8, alto1=2.4, mat='tablero', vigas=0.6)),
]

# Muebles: ID <estancia>-NN, tipo, posición en el plano y giro (0: el frente mira a +v, 90: a +u).
_ids = {}


def M(tipo, u, v, giro=0, **kw):
    cod = next(e['codigo'] for e in ESTANCIAS
               if e['caja'][0] <= u <= e['caja'][2] and e['caja'][1] <= v <= e['caja'][3])
    _ids[cod] = _ids.get(cod, 0) + 1
    return dict(id='%s-%02d' % (cod, _ids[cod]), tipo=tipo, uv=[r2(u), r2(v)], giro=giro, **kw)


ROBLE, LINO = '#b98b5e', '#d9cfbf'
MUEBLES = [
    # salón: estar junto a la chimenea (O) y comedor hacia el porche
    M('chimenea', 0.3, 4.5, 90),
    M('alfombra', 2.6, 3.0, 90, ancho=2.4, largo=3.0, color='#d8cbb3', borde='#8a6f55'),
    M('sofa_tela', 4.15, 3.0, -90, largo=2.6, color=LINO),
    M('butaca_tela', 2.0, 0.95, 160, color='#8a9a7b'),
    M('mesa_centro', 2.6, 3.0, 90, largo=1.1, fondo=0.6, color=ROBLE),
    M('libreria', 4.3, 0.4, 0, ancho=1.3, alto=2.3, color='#efe9df'),          # entre las dos ventanas
    M('lampara_pie', 4.9, 1.2),
    M('mesa_madera', 4.3, 6.9, 90, largo=2.0, fondo=0.95, color=ROBLE),
    *[M('silla_madera', u, v, g, color='#6e5a48') for u in (3.75, 4.85) for v, g in ((6.2, 0), (7.6, 180))],
    M('silla_madera', 3.35, 6.9, 90, color='#6e5a48'), M('silla_madera', 5.25, 6.9, -90, color='#6e5a48'),
    M('aparador', 0.45, 7.2, 90, largo=1.6),
    M('maceta', 0.55, 8.5, radio=0.22, planta=0.9),              # en el rincón: fuera del giro de las vidrieras
    # cocina: encimera corrida en la fachada N e isla con banquetas
    M('encimera', 10.3, 0.55, 0, largo=3.9, fregadero=0.2),
    M('nevera', 12.05, 2.6, -90),
    M('isla', 10.1, 2.6, 0, largo=1.8, fondo=0.9, frente='#8f9e86', tapa=ROBLE),
    *[M('banqueta', 9.5 + 0.6 * i, 3.4, 180) for i in range(3)],
    # recibidor
    M('banco_recibidor', 12.15, 7.4, -90, largo=1.4, color=ROBLE),
    M('espejo', 9.4, 4.38, 0, ancho=0.9, alto=1.2, y=1.5, marco='#3a2d26'),
    M('maceta', 8.5, 4.8, radio=0.25, planta=1.2),
    # dormitorio principal: cama contra la pared E, armario empotrado en la O
    M('cama', 15.7, 2.2, -90, ancho=1.6, largo=2.0, estilo='listones'),
    M('mesilla', 16.5, 1.05, -90, color='#d8c4a0'), M('mesilla', 16.5, 3.35, -90, color='#d8c4a0'),
    M('empotrado', 12.85, 1.6, 90, ancho=2.2),
    # baño
    M('banera', 19.45, 1.6, -90),
    M('inodoro', 17.2, 0.6, 90),
    M('lavabo_cajones', 17.2, 2.6, 90, ancho=0.8),
    M('espejo', 16.9, 2.6, 90, ancho=0.7, alto=0.9, y=1.55),
    M('toallero', 18.6, 4.2, 180),
    # dormitorio de invitados
    M('cama', 13.6, 7.4, 90, ancho=1.4, largo=2.0, estilo='listones'),
    M('mesilla', 12.8, 6.1, 90, color='#d8c4a0'),
    M('comoda', 15.85, 8.6, 180),
    # dormitorio pequeño
    M('cama', 19.0, 7.3, -90, ancho=0.9, largo=1.9),
    M('escritorio', 17.1, 8.55, 180, largo=1.2, fondo=0.6, color='#efe9df'),
    M('silla_oficina', 17.1, 7.9, 0, color='#c9a24a'),
    M('alfombra', 18.1, 7.0, 0, ancho=1.2, largo=1.6, color='#c9d6cf', borde='#7a9a8f'),
    # estudio
    M('escritorio', 2.6, 11.85, 180, largo=2.2, fondo=0.7, color=ROBLE),
    M('monitor', 2.3, 12.05, 180, ancho=0.62), M('monitor', 2.95, 12.05, 180, ancho=0.62),
    M('silla_oficina', 2.6, 11.2, 0, color='#26282b'),
    M('kallax', 2.2, 9.25, 0, cols=3, filas=2),
    M('sillon', 5.2, 10.4, -90),
    # lavadero
    M('lavadora', 0.45, 14.3, 90), M('pila_lavar', 0.4, 13.3, 90),
    M('estanteria_metal', 2.6, 12.6, 0, ancho=1.6),
    # porche: mesa de listones con sillas y chillout
    M('mesa_jardin', 9.0, 10.3, 0),
    *[M('silla_madera', u, v, g) for u in (8.45, 9.55) for v, g in ((9.7, 0), (10.9, 180))],
    M('chillout', 15.5, 10.1, 0),
    M('maceta', 19.6, 9.4, radio=0.3, planta=1.0), M('maceta', 6.4, 11.1, radio=0.25, planta=0.8),
]


# Puntos de luz: como los muebles, con ID <estancia>-Lnn. El visor enciende de noche los de la
# estancia donde estás; los de fuera y los del porche, por grupos en el panel.
def rejilla(cod, us, vs, **kw):
    return [dict(id='%s-L%02d' % (cod, i + 1), tipo='foco', uv=[u, v], **kw)
            for i, (u, v) in enumerate((u, v) for u in us for v in vs)]


LUCES = [
    dict(id='SAL-L01', tipo='colgante', uv=[4.3, 6.9]),
    dict(id='SAL-L02', tipo='aplique', uv=[0.07, 3.6], giro=90, y=2.1),          # a los lados de la chimenea
    dict(id='SAL-L03', tipo='aplique', uv=[0.07, 5.4], giro=90, y=2.1),
    dict(id='COC-L01', tipo='colgante', uv=[9.6, 2.6]), dict(id='COC-L02', tipo='colgante', uv=[10.6, 2.6]),
    dict(id='DOR-L01', tipo='plafon', uv=[14.65, 2.15]),
    dict(id='DO2-L01', tipo='plafon', uv=[14.4, 7.25]),
    dict(id='DO3-L01', tipo='plafon', uv=[18.15, 7.25]),
    dict(id='BAN-L01', tipo='plafon', uv=[18.4, 2.15], diametro=0.3),
    dict(id='EST-L01', tipo='plafon', uv=[3.0, 10.65]),
    dict(id='LAV-L01', tipo='plafon', uv=[3.0, 13.65], luz='neutra'),
    dict(id='POR-L01', tipo='farol', uv=[9.0, 10.3], techo=2.6, grupo='Porche'),
    dict(id='POR-L02', tipo='farol', uv=[15.5, 10.3], techo=2.6, grupo='Porche'),
] + rejilla('REC', [10.25], [5.6, 7.7]) + rejilla('PAS', [14.0, 16.0, 18.0], [4.9])

# ---------------------------------------------------------------- parcela y exterior (mundo)
# Parcela de unos 4.000 m², con el portón en la linde S (entre los vértices 3 y 4)
PORTON = dict(a=[20.0, 30.8], b=[24.0, 30.6], alto=1.8, pilar=0.5, pilarAlto=2.2, abierta=True)
PARCELA = [[-32.0, -26.0], [34.0, -29.0], [37.0, 30.0], PORTON['b'], PORTON['a'], [-30.0, 33.0]]
LINDES = [dict(desde=0, hasta=3, tipo='paret'), dict(desde=4, hasta=6, tipo='paret')]

# Piscina al S del porche, larga de E a O
PISCINA_C = [3.0, 18.0]
PIS = dict(centro=PISCINA_C, rumbo=90.0, largo=10.0, ancho=4.5, profundidad=1.5, coronacion=0.35)


def rect(x0, z0, x1, z1):
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]


piscina = dict(
    **PIS,
    plataforma=dict(alto=0.3, cesped=rect(-6.0, 13.0, 15.5, 23.5)),
    losas=[rect(-3.0, 13.6, 9.0, 15.4)],
    # escalones al césped desde el lado de la casa (a: de través, positivo al N; l: a lo largo)
    escalones=[dict(a=5.0, l=0.0, ancho=1.5, hacia=1)],
    nota='Inventada: no está en ningún sitio.',
)

CONSTRUCCIONES = [
    dict(id='pergola', nombre='Pérgola', centro=[12.6, 18.2], rumbo=90.0, ancho=4.0, largo=5.0, alto=2.5, cota=0.3),
    dict(id='caseta', nombre='Caseta de la depuradora', centro=[-9.5, 18.0], rumbo=90.0, ancho=2.6, largo=3.0,
         alto=2.3, cumbrera=2.9),
]

ZONAS = [
    dict(id='explanada', nombre='Aparcamiento', mat='grava',
         poly=[[12.0, -4.0], [21.0, -4.0], [22.5, 4.0], [21.0, 9.5], [12.0, 9.5]]),
    dict(id='huerto', nombre='Huerto', mat='huerto', poly=rect(18.0, -22.0, 30.0, -12.0)),
    dict(id='era', nombre='Era de piedra', mat='losa', circulo=[-18.0, 0.0, 3.2]),
]
CAMINOS = [
    dict(id='entrada', nombre='Camino de entrada', mat='grava', ancho=3.0,
         eje=[[22.0, 30.5], [22.4, 24.0], [22.0, 17.0], [19.5, 11.5], [17.0, 8.0]]),
    dict(id='huerto', nombre='Camino del huerto', mat='tierra', ancho=1.2, eje=[[17.0, -4.0], [19.5, -9.0], [22.0, -12.0]]),
]
# Pasos de losa del porche a la piscina y de la piscina a la caseta
PASOS = [[[3.0, 3.9], [3.0, 12.6]], [[-6.4, 18.0], [-8.0, 18.0]]]

FAROLAS = [
    *[dict(id='EXT-L%02d' % (i + 1), tipo='farolillo', mundo=p, grupo='Camino')
      for i, p in enumerate([[20.3, 28.0], [20.6, 22.0], [20.3, 16.5], [17.5, 12.0]])],
    dict(id='EXT-L05', tipo='globo', mundo=[-5.4, 13.6], grupo='Piscina'),
    dict(id='EXT-L06', tipo='globo', mundo=[11.0, 13.6], grupo='Piscina'),
    dict(id='EXT-L07', tipo='piscina', mundo=[-1.8, 18.0], hacia=PISCINA_C, grupo='Piscina'),
    dict(id='EXT-L08', tipo='piscina', mundo=[7.8, 18.0], hacia=PISCINA_C, grupo='Piscina'),
]
SUELTOS = [
    dict(tipo='lena', centro=[-12.5, 10.5], rumbo=0, dims=[2.0, 0.8, 1.0]),
    dict(tipo='piedras', centro=[28.0, 20.0], r=1.5),
]

# Árboles: [especie, x, z, radio de copa, ID]. Un olivar en cuadrícula al O, almendros al N, pinos y
# algarrobos por las lindes, cipreses a lo largo de la linde S y frutales junto a la casa.
rnd = random.Random(7)
arboles = []


def arbol(sp, x, z, r):
    arboles.append([sp, r2(x), r2(z), r2(r), 'A-%03d' % (len(arboles) + 1)])


for i in range(4):                                       # olivar
    for j in range(6):
        arbol('olivo', -27 + 4.5 * i + rnd.uniform(-0.6, 0.6), -20 + 6.5 * j + rnd.uniform(-0.6, 0.6), rnd.uniform(1.3, 2.0))
for i in range(5):                                       # almendros
    arbol('almendro', -8 + 5.0 * i + rnd.uniform(-0.8, 0.8), -21 + rnd.uniform(-1, 1), rnd.uniform(1.5, 2.2))
for x, z in [[30, -24], [33, -10], [33.5, 4], [-28, 27], [-14, 29], [30, 14]]:   # pinos y algarrobos de la linde
    arbol('pino' if z < 10 else 'algarrobo', x, z, rnd.uniform(2.6, 3.4))
for k in range(10):                                      # cipreses en la linde S, al O del portón
    arbol('cipres_muro', 16.5 - 3.2 * k, 30.6 + 0.04 * k * 3.2 - 1.0, 0.6)
for sp, x, z, r in [['naranjo', 13.5, 13.5, 1.3], ['limonero', -4.0, 9.5, 1.2], ['higuera', -14.0, 13.0, 2.4],
                    ['encina', 26.0, 2.0, 3.0], ['granado', 11.0, -6.5, 1.3], ['laurel', -13.5, -5.0, 1.8]]:
    arbol(sp, x, z, r)

# ---------------------------------------------------------------- vistas y sitios del panel
VISTAS = [
    ['fuera', 'finca', 'Toda la parcela', dict(d=150, t=200, p=40, c='parcela', sinTejado=False)],
    ['fuera', 'casa', 'La casa', dict(d=42, t=210, p=45, c=mundo(10, 7.5), sinTejado=False)],
    ['fuera', 'piscina', 'Piscina y pérgola', dict(d=30, t=160, p=50, c=PISCINA_C, sinTejado=False)],
    ['fuera', 'porche', 'Porche', dict(d=22, t=190, p=28, c=mundo(13, 10.5), sinTejado=False)],
    ['fuera', 'huerto', 'Huerto', dict(d=26, t=200, p=40, c=[24.0, -17.0], sinTejado=False)],
] + [['dentro', i, n, dict(estancias=e)] for i, n, e in [
    ('salon', 'Salón comedor', ['salon']), ('cocina', 'Cocina y recibidor', ['cocina', 'recibidor']),
    ('dormitorios', 'Dormitorios y baño', ['dormitorio', 'bano', 'pasillo', 'dormitorio_2', 'dormitorio_3']),
    ('estudio', 'Estudio y lavadero', ['estudio', 'lavadero']), ('porche_d', 'Porche', ['porche'])]]
SITIOS = [['Aparcamiento', dict(zona='explanada')], ['Era de piedra', dict(zona='era')], ['Borde de la piscina', 'piscina'],
          ['Pérgola', dict(construccion='pergola')], ['Huerto', dict(zona='huerto')], ['Portón', 'porton']]

# ---------------------------------------------------------------- casa.js
casa = dict(
    meta=dict(nombre='El Olivar', subtitulo='Casa de ejemplo de Ars Domus<br>Inventada: no existe', clave='ars-domus-demo',
              lat=40.0, lon=0.0, huso=1, rumboCasa=RUMBO,
              notaMueble='Mueble de ejemplo.',
              enlace=dict(texto='¿Cómo se hace? →', url='https://github.com/ars-magna-lab/ars-domus#haz-la-tuya')),
    parcela=PARCELA,
    fichaParcela=[['Uso', 'Residencial y huerto']],
    notaParcela='Parcela inventada para el ejemplo.',
    notaArboles='Árbol de ejemplo.',
    vistas=VISTAS, sitios=SITIOS,
    casa=dict(rumbo=RUMBO, origen=ORIGEN, cotaSuelo=0.12, contorno=CONTORNO, muros=muros, huecos=huecos,
              cubiertas=CUBIERTAS, pilares=PILARES, vigas=VIGAS, chimeneas=CHIMENEAS,
              ficha=[['Plantas', '1'], ['Dormitorios', '3']],
              nota='Casa de ejemplo: un cuerpo de piedra a dos aguas, un ala encalada en L y un porche.',
              interior=dict(estancias=ESTANCIAS, muebles=MUEBLES, luces=LUCES)),
    exterior=dict(piscina=piscina, construcciones=CONSTRUCCIONES, zonas=ZONAS, caminos=CAMINOS, pasos=PASOS,
                  lindes=LINDES, porton=PORTON, farolas=FAROLAS, sueltos=SUELTOS),
    arboles=arboles,
)

if __name__ == '__main__':
    import mejora                                  # la propuesta de reforma, sobre esta casa
    j = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
    (DEMO / 'casa.js').write_text(
        '/* Casa de ejemplo de Ars Domus. GENERADO por demo/herramientas/casa.py: no se edita a mano. */\n'
        'window.CASA = ' + j(casa) + ';\n'
        '/* La propuesta de reforma (demo/herramientas/mejora.py) */\n'
        'window.CASA_MEJORA = ' + j(mejora.aplica(casa)) + ';\n')
    print('casa.js:', len(muros), 'muros,', len(huecos), 'huecos,', len(MUEBLES), 'muebles,', len(arboles), 'árboles')
