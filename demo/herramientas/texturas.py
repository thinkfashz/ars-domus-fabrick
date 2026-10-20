"""Genera las texturas de la casa de ejemplo → demo/texturas/*.jpg

    python3 demo/herramientas/texturas.py

Todas salen de ruido y de celdas de Voronoi, sin fotos: son de dominio público (CC0). Todas se
repiten sin costuras. El visor las pide por su nombre: campo y grava (el suelo), cesped,
paret (pared seca) y piedra (muros de mampostería).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

D = Path(__file__).resolve().parent.parent / 'texturas'
D.mkdir(exist_ok=True)
rng = np.random.default_rng(11)


def ruido(n, escalas=(4, 8, 16, 32, 64), pesos=None):
    """Ruido de valor periódico (se repite sin costuras) en [0, 1]."""
    pesos = pesos or [1 / (i + 1) for i in range(len(escalas))]
    t = np.zeros((n, n))
    for e, p in zip(escalas, pesos):
        g = rng.random((e, e))
        g = np.kron(g, np.ones((n // e, n // e)))
        img = Image.fromarray((g * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(n / e / 2))
        # el desenfoque no envuelve: se hace con la imagen repetida y se recorta el centro
        big = np.tile(np.asarray(img, float), (3, 3))
        big = np.asarray(Image.fromarray(big.astype(np.uint8)).filter(ImageFilter.GaussianBlur(n / e / 2)), float)
        t += p * big[n:2 * n, n:2 * n] / 255
    t -= t.min()
    return t / t.max()


def voronoi(w, h, n, jitter=1.0):
    """Distancia al centro más cercano y al segundo (periódico), e índice de la celda."""
    pts = rng.random((n, 2)) * [w, h]
    ys, xs = np.mgrid[0:h, 0:w]
    d1 = np.full((h, w), 1e9); d2 = np.full((h, w), 1e9); idx = np.zeros((h, w), int)
    for k, (px, py) in enumerate(pts):
        for ox in (-w, 0, w):
            for oy in (-h, 0, h):
                d = np.hypot(xs - px - ox, (ys - py - oy) * jitter)
                m = d < d1
                d2 = np.where(m, d1, np.minimum(d2, d)); idx = np.where(m, k, idx); d1 = np.where(m, d, d1)
    return d1, d2, idx


def guarda(nombre, rgb):
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(D / f'{nombre}.jpg', quality=88)


def mezcla(t, c0, c1):
    t = t[..., None]
    return np.array(c0) * (1 - t) + np.array(c1) * t


N = 512
# campo: tierra seca con hierba rala
r = ruido(N); f = ruido(N, (32, 64, 128))
campo = mezcla(r, (150, 128, 92), (196, 176, 132)) * (0.85 + 0.3 * f[..., None])
hierba = (ruido(N, (64, 128)) > 0.62)[..., None]
campo = np.where(hierba, campo * 0.75 + np.array((90, 100, 50)) * 0.25, campo)
guarda('campo', campo)
# césped
r = ruido(N, (16, 32, 64, 128))
guarda('cesped', mezcla(r, (74, 110, 52), (128, 160, 82)))
# grava: piedrecitas claras sobre fondo terroso
d1, d2, idx = voronoi(N // 2, N // 2, 900)
tono = rng.random(900)[idx]
borde = np.clip((d2 - d1) / 3, 0, 1)
g = mezcla(tono, (170, 160, 145), (225, 218, 205)) * (0.55 + 0.45 * borde[..., None])
guarda('grava', np.kron(g, np.ones((2, 2, 1))))
# piedra: mampostería de piedras irregulares con junta clara (1,45 × 1,1 m en el visor)
W, H = 512, 384
d1, d2, idx = voronoi(W, H, 70, jitter=1.4)
tono = rng.random(70)[idx]
junta = np.clip((d2 - d1 - 2) / 6, 0, 1)
r = ruido(512)[:H, :W]
pie = mezcla(tono, (150, 132, 108), (205, 188, 158)) * (0.8 + 0.3 * r[..., None])
pie = pie * (0.75 + 0.25 * np.clip((d2 - d1) / 25, 0, 1))[..., None]
guarda('piedra', mezcla(junta, (215, 205, 188), (0, 0, 0)) + pie * junta[..., None])
# paret: pared seca, piedras sin junta y sombra entre ellas (8 × 1 m en el visor)
W, H = 1024, 128
d1, d2, idx = voronoi(W, H, 110, jitter=1.0)
tono = rng.random(110)[idx]
hueco = np.clip((d2 - d1 - 1) / 5, 0, 1)
pie = mezcla(tono, (140, 128, 110), (196, 184, 160)) * (0.7 + 0.3 * np.clip((d2 - d1) / 18, 0, 1))[..., None]
guarda('paret', pie * (0.35 + 0.65 * hueco[..., None]))
print('texturas:', sorted(p.name for p in D.glob('*.jpg')))
