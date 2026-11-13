"""Génère les icônes de l'app (les strates colorées de l'accueil). Usage : python3 tools/make_icons.py"""
import json, math, pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
pack = json.loads((ROOT / "packs/es-419/pack.json").read_text(encoding="utf-8"))
colors = [m["color"] for m in pack["modules"]]
SKY = "#EAF0FA"

def draw(size, maskable=False):
    S = size * 4
    img = Image.new("RGB", (S, S), SKY)
    d = ImageDraw.Draw(img)
    pad = 0.14 if maskable else 0.0
    top = S * (0.30 + pad * 0.5)
    band = (S - top) / len(colors)
    for i, c in enumerate(colors):
        y0 = top + i * band
        pts = []
        for k in range(0, 61):
            x = S * k / 60
            if i == 0:  # crête de montagne
                ridge = [(0, .55), (.18, .2), (.32, .45), (.52, -.35), (.7, .25), (.84, .05), (1, .5)]
                for (xa, ya), (xb, yb) in zip(ridge, ridge[1:]):
                    if xa <= k / 60 <= xb:
                        t = (k / 60 - xa) / (xb - xa)
                        y = y0 + (ya + (yb - ya) * t) * band
            else:
                y = y0 + math.sin(k / 60 * math.pi * (1.3 + i * .25) + i) * band * 0.18
            pts.append((x, y))
        d.polygon(pts + [(S, S), (0, S)], fill=c)
    return img.resize((size, size), Image.LANCZOS)

out = ROOT / "assets/icons"
out.mkdir(parents=True, exist_ok=True)
draw(180).save(out / "apple-touch-icon.png")
draw(192).save(out / "icon-192.png")
draw(512).save(out / "icon-512.png")
draw(512, maskable=True).save(out / "icon-maskable-512.png")
print("icônes générées")
