# Post filters that give every cutscene render one house look.
# python3 tools/blender/filters.py base.png outdir/
import sys, os
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
img = Image.open(src).convert('RGB')
a = np.asarray(img).astype(np.float32) / 255
H, W = a.shape[:2]
rng = np.random.default_rng(7)
lum = a @ np.array([0.299, 0.587, 0.114], np.float32)

def hx(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
def save(name, arr): Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(f'{out}/{name}.png')
def gradient_map(l, stops):
    xs = [s for s, _ in stops]; cs = np.stack([hx(c) for _, c in stops])
    return np.stack([np.interp(l, xs, cs[:, k]) for k in range(3)], -1)
def grain(arr, amt): return arr + rng.normal(0, amt, arr.shape[:2])[..., None]

# 1 duotone: brand gradient map with film grain
save('1_duotone', grain(gradient_map(lum, [(0, '#0a121a'), (0.35, '#1f2b38'), (0.6, '#ff4655'), (1, '#ece8e1')]), 0.035))

# 1b duotone, mids lifted so figures separate from walls
save('1b_duotone', grain(gradient_map(lum ** 0.8, [(0, '#05090d'), (0.28, '#1f2b38'), (0.42, '#7a2a35'), (0.62, '#ff4655'), (1, '#ece8e1')]), 0.035))

# 2 riso: two ink halftone layers, slightly misregistered, on paper
def halftone(l, cell, angle):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    c, s = np.cos(angle), np.sin(angle)
    u, v = (xx * c + yy * s) / cell, (-xx * s + yy * c) / cell
    d = np.hypot(u - np.round(u), v - np.round(v))
    return (d < np.sqrt(np.clip(l, 0, 1)) * 0.62).astype(np.float32)
paper = hx('#ece8e1'); ink1 = hx('#1b3a5c'); ink2 = hx('#ff4655')
dark = halftone(1 - lum, 6, np.radians(15))
warm = halftone(np.clip(a[..., 0] - a[..., 2], 0, 1) * 1.6 + (1 - lum) * 0.15, 6, np.radians(75))
warm = np.roll(warm, (2, 3), (0, 1))
riso = paper * np.ones_like(a)
riso = riso * (1 - dark[..., None] * (1 - ink1)) * (1 - warm[..., None] * (1 - ink2))
save('2_riso', grain(riso, 0.02))

# 3 graphic novel: smooth to flat shapes, posterize to 5 bands, paper tooth
flat = np.asarray(img.filter(ImageFilter.ModeFilter(9)).filter(ImageFilter.MedianFilter(5))).astype(np.float32) / 255
bands = np.round(flat * 4) / 4
tooth = np.asarray(Image.effect_noise((W, H), 40).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)[..., None] / 255
save('3_graphic_novel', bands * (0.9 + 0.12 * tooth))

# 4 broadcast: teal/orange grade, chromatic split, scanlines, vignette
g = a.copy(); g = g ** 0.9
g = g * np.array([1.05, 0.98, 1.08]) + (1 - lum[..., None]) * hx('#05303a') * 0.35
ca = g.copy(); ca[..., 0] = np.roll(g[..., 0], 3, 1); ca[..., 2] = np.roll(g[..., 2], -3, 1)
yy, xx = np.mgrid[0:H, 0:W]
scan = 1 - 0.18 * ((yy // 2) % 2)
vig = 1 - 0.55 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) ** 1.3
save('4_broadcast', grain(ca * scan[..., None] * vig[..., None], 0.03))

# 5 linocut: three tones only, mid tone carved as diagonal hatching
hatch = (((xx + yy) // 4) % 3 == 0).astype(np.float32)
lino = np.where(lum < 0.16, 0, np.where(lum < 0.38, hatch, 1)).astype(np.float32)
save('5_linocut', gradient_map(lino, [(0, '#0f1923'), (1, '#e8dcc4')]) + (lum > 0.75)[..., None] * (hx('#ff4655') - hx('#e8dcc4')) * 0.0)

# 6 night ops: monochrome blue with one accent kept (reds survive), heavy bloom
bloom = np.asarray(Image.fromarray((np.clip(a - 0.55, 0, 1) * 2 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18))).astype(np.float32) / 255
mono = gradient_map(lum, [(0, '#03070b'), (0.5, '#16405e'), (1, '#bfe6ff')])
redmask = np.clip((a[..., 0] - np.maximum(a[..., 1], a[..., 2])) * 4, 0, 1)[..., None]
save('6_night_ops', grain(mono * (1 - redmask) + a * redmask * 1.2 + bloom * 0.6, 0.025))
print('done')
