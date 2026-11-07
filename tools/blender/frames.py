# Duotone every raw render and stitch the three choice panels into one frame.
# python3 tools/blender/frames.py docs/cutscene-frames
import sys, os
import numpy as np
from PIL import Image

D = sys.argv[1]
rng = np.random.default_rng(7)
STOPS = [(0, '#0a121a'), (0.35, '#1f2b38'), (0.6, '#ff4655'), (1, '#ece8e1')]

def hx(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255

def duotone(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    cs = np.stack([hx(c) for _, c in STOPS]); xs = [s for s, _ in STOPS]
    out = np.stack([np.interp(lum, xs, cs[:, k]) for k in range(3)], -1)
    out += rng.normal(0, 0.035, lum.shape)[..., None]
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))

for n in ('arena', 'board', 'corridor'):
    duotone(Image.open(f'{D}/raw_{n}.png')).save(f'{D}/{n}.png')

panel = Image.new('RGB', (1600, 900), '#0a121a')
for i, n in enumerate(('sell', 'cut', 'crowd')):
    panel.paste(duotone(Image.open(f'{D}/raw_{n}.png')).crop((0, 0, 533, 900)), (i * 533 + i * 0, 0))
for x in (533, 1066):  # hard gutters between choices
    panel.paste(Image.new('RGB', (4, 900), '#0a121a'), (x - 2, 0))
panel.save(f'{D}/decide.png')
# game assets: each scene on its own, duotoned, as webp
OUT = 'public/assets/story'
os.makedirs(OUT, exist_ok=True)
import sys as _s
for n in (_s.argv[2:] or ('arena', 'board', 'corridor', 'sell', 'cut', 'crowd')):
    # 1920px at q72: about 180 KB a frame, about a quarter of the 2560px export
    duotone(Image.open(f'{D}/raw_{n}.png')).resize((1920, 1080), Image.LANCZOS).save(f'{OUT}/{n}.webp', quality=72)
print('ok')
