"""Builds the 3D metal for all Apex evo cards: bezels, motifs, crests, and gems.

Run from the vfl folder:
  npm run evo:model

Outputs:
  public/assets/evo3d/apex.glb (Apex Predator)
  public/assets/evo3d/valkyrie.glb (Valkyrie Ascent)
  public/assets/evo3d/sovereign.glb (Sovereign Crown)
  public/assets/evo3d/singularity.glb (Singularity Core)

One unit is 100 card pixels, the card is centred on the origin in the XY plane
and depth runs along +Z toward the viewer (exported Z-up, so three.js reads the
same axes).

Objects come in two sets, one per evo stage:
  L1_* (Evo I)
  L2_* (Evo II)

The outlines match the numbers in shared/src/components/evoArt.js.
"""

import math
import os
import sys

import bpy

U = 100.0

# ── Outlines matching evoArt.js ──────────────────────────────────────────────

APEX_R = [(200, 0), (213, 15), (238, 7), (247, 23), (370, 34), (390, 22), (400, 46), (392, 62), (400, 76),
          (400, 398), (391, 410), (400, 422), (400, 524), (384, 546), (226, 567), (200, 580)]
APEX_PTS = APEX_R + [(400 - x, y) for x, y in reversed(APEX_R[1:-1])]
APEX_GEMS = [(392.5, 240), (7.5, 240), (392.5, 480), (7.5, 480)]

VALKYRIE_R = [(200, 0), (218, 14), (236, 6), (252, 20), (360, 26), (392, 14), (400, 38), (393, 56), (400, 74),
              (393, 230), (400, 246), (400, 396), (391, 412), (400, 426), (400, 520), (386, 544), (228, 566), (200, 580)]
VALKYRIE_PTS = VALKYRIE_R + [(400 - x, y) for x, y in reversed(VALKYRIE_R[1:-1])]
VALKYRIE_GEMS = [(392.5, 230), (7.5, 230), (392.5, 470), (7.5, 470)]

SOVEREIGN_R = [(200, 0), (216, 18), (240, 8), (262, 22), (296, 10), (324, 24), (374, 18), (400, 36), (392, 66), (400, 82),
               (400, 275), (390, 292), (400, 308), (400, 400), (391, 414), (400, 428), (400, 522), (384, 542), (232, 565), (200, 580)]
SOVEREIGN_PTS = SOVEREIGN_R + [(400 - x, y) for x, y in reversed(SOVEREIGN_R[1:-1])]
SOVEREIGN_GEMS = [(392.5, 292), (7.5, 292), (392.5, 480), (7.5, 480)]

SINGULARITY_R = [(200, 0), (222, 22), (246, 12), (270, 26), (368, 30), (396, 16), (400, 42), (390, 70), (400, 88),
                 (400, 260), (388, 282), (400, 304), (400, 398), (390, 412), (400, 426), (400, 526), (386, 548), (224, 568), (200, 580)]
SINGULARITY_PTS = SINGULARITY_R + [(400 - x, y) for x, y in reversed(SINGULARITY_R[1:-1])]
SINGULARITY_GEMS = [(392.5, 282), (7.5, 282), (392.5, 485), (7.5, 485)]

BASE = 0.16      # front of the card plate
BEZEL = 0.38     # how far the Evo II bezel stands off the plate


def inset(d):
    return [(d, 40 + d * .82), (200, d * 1.02), (400 - d, 40 + d * .82), (400 - d, 540 - d * .82), (200, 580 - d * 1.02), (d, 540 - d * .82)]


def to3(p):
    return ((p[0] - 200) / U, (290 - p[1]) / U)


def quad(a, c, b, t):
    return ((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1])


def diamond(x, y, w, h):
    return [(x, y - h), (x + w, y), (x, y + h), (x - w, y)]


def material(name, color, metallic, roughness, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return mat


def slab(name, loops, depth, z, mat, bevel=0.015):
    """Extrude one or more closed outlines into a solid with rounded edges, from z to z + depth."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    curve.extrude = max(depth / 2 - bevel, 0.001)
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    for loop in loops:
        spline = curve.splines.new('POLY')
        spline.points.add(len(loop) - 1)
        for point, p in zip(spline.points, loop):
            x, y = to3(p)
            point.co = (x, y, 0, 1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location.z = z + depth / 2
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    for other in bpy.context.selected_objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    return obj


def join(name, objects):
    valid = [o for o in objects if o is not None]
    if not valid:
        return None
    for other in bpy.context.selected_objects:
        other.select_set(False)
    for obj in valid:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = valid[0]
    bpy.ops.object.join()
    valid[0].name = name
    return valid[0]


# ── Apex Predator Builder ───────────────────────────────────────────────────

def rake(i):
    o = i * 40
    s, e = (352 - o * .2, 34 + o), (64 + o * .25, 318 + o * .9)
    c1, c2 = (150 + o * .6, 70 + o), (182 + o * .6, 104 + o)
    return s, e, c1, c2


def rake_outline(i, steps=40):
    s, e, c1, c2 = rake(i)
    outer = [quad(s, c1, e, k / steps) for k in range(steps + 1)]
    inner = [quad(s, c2, e, k / steps) for k in range(steps, 0, -1)]
    return outer + inner[1:]


def teeth():
    out = []
    for i in range(3):
        s, e, c1, c2 = rake(i)
        n = 16
        for j in range(1, n):
            t = j / n
            p, p2, m = quad(s, c1, e, t), quad(s, c1, e, t + .02), quad(s, c2, e, t)
            nx, ny = p[0] - m[0], p[1] - m[1]
            ln = math.hypot(nx, ny) or 1
            nx, ny = nx / ln, ny / ln
            tx, ty = p2[0] - p[0], p2[1] - p[1]
            tl = math.hypot(tx, ty) or 1
            length = (30 if i == 0 and t < .3 else 12) + ((j * 37 + i * 11) % 23)
            half = 6
            b0 = (p[0] - tx / tl * half, p[1] - ty / tl * half)
            b1 = (p[0] + tx / tl * half, p[1] + ty / tl * half)
            tip = (p[0] + nx * length - tx / tl * 4, p[1] + ny * length - ty / tl * 4)
            out.append([b0, tip, b1])
    return out


APEX_FANGS = [[(192, 15), (197, 15), (199, 33)], [(203, 15), (208, 15), (201, 33)]]
APEX_CREST = [(178, 24), (200, -6), (222, 24), (200, 44)]


def build_apex():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    gold = material('Gold', (0.85, 0.58, 0.2), 1.0, 0.22)
    gold_dark = material('GoldDark', (0.45, 0.28, 0.08), 1.0, 0.4)
    crimson = material('Crimson', (0.6, 0.01, 0.04), 0.55, 0.3)
    ruby = material('Ruby', (0.45, 0.0, 0.03), 0.1, 0.08, emission=(0.12, 0.0, 0.01))

    slab('L1_Ring', [inset(6), inset(11)], 0.22, BASE, gold)
    join('L1_Rakes', [slab(f'r{i}', [rake_outline(i)], 0.036, BASE, crimson, 0.01) for i in range(3)])
    join('L1_Fangs', [slab(f'f{i}', [p], 0.05, BASE, gold, 0.01) for i, p in enumerate(APEX_FANGS)])

    slab('L2_Bezel', [APEX_PTS, inset(15)], BEZEL, BASE, gold, 0.025)
    slab('L2_InnerRing', [inset(19), inset(22)], 0.26, BASE, gold_dark, 0.01)
    join('L2_Rakes', [slab(f'R{i}', [rake_outline(i)], 0.06, BASE, gold, 0.018) for i in range(3)])
    join('L2_Teeth', [slab(f'T{i}', [tri], 0.05, BASE, gold, 0.008) for i, tri in enumerate(teeth())])
    crest_z = BASE + BEZEL + 0.04
    slab('L2_Crest', [APEX_CREST], 0.12, crest_z, gold, 0.03)
    join('L2_Fangs', [slab(f'F{i}', [p], 0.04, crest_z + 0.12, crimson, 0.008) for i, p in enumerate(APEX_FANGS)])
    join('L2_Gems', [slab(f'G{i}', [diamond(x, y, 4, 9)], 0.03, BASE + BEZEL, ruby, 0.012) for i, (x, y) in enumerate(APEX_GEMS)])


# ── Valkyrie Ascent Builder ──────────────────────────────────────────────────

VALKYRIE_CHEVRONS = [[(190, 16), (200, 6), (210, 16), (200, 24)], [(186, 28), (200, 18), (214, 28), (200, 36)]]
VALKYRIE_CREST = [(172, 26), (200, -8), (228, 26), (200, 46)]


def wing_blade(i, steps=32):
    o = i * 44
    s = (360 - o * .25, 60 + o)
    e = (110 + o * .4, 340 + o * .8)
    c1 = (280 + o * .1, 140 + o)
    c2 = (220 + o * .2, 190 + o)
    outer = [quad(s, c1, e, k / steps) for k in range(steps + 1)]
    inner = [quad(s, c2, e, k / steps) for k in range(steps, 0, -1)]
    return outer + inner[1:]


def build_valkyrie():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rose_gold = material('RoseGold', (0.94, 0.52, 0.58), 1.0, 0.2)
    rose_dark = material('RoseDark', (0.52, 0.22, 0.28), 1.0, 0.38)
    platinum = material('Platinum', (0.86, 0.88, 0.92), 0.9, 0.18)
    rose_ruby = material('RoseRuby', (0.82, 0.12, 0.28), 0.1, 0.08, emission=(0.2, 0.02, 0.06))

    slab('L1_Ring', [inset(6), inset(11)], 0.22, BASE, rose_gold)
    join('L1_Wings', [slab(f'w{i}', [wing_blade(i)], 0.038, BASE, rose_dark, 0.01) for i in range(2)] +
                     [slab(f'wl{i}', [[(400 - x, y) for x, y in wing_blade(i)]], 0.038, BASE, rose_dark, 0.01) for i in range(2)])
    join('L1_Chevrons', [slab(f'c{i}', [p], 0.05, BASE, platinum, 0.01) for i, p in enumerate(VALKYRIE_CHEVRONS)])

    slab('L2_Bezel', [VALKYRIE_PTS, inset(15)], BEZEL, BASE, rose_gold, 0.025)
    slab('L2_InnerRing', [inset(19), inset(22)], 0.26, BASE, rose_dark, 0.01)
    join('L2_Wings', [slab(f'W{i}', [wing_blade(i)], 0.065, BASE, platinum, 0.016) for i in range(2)] +
                     [slab(f'WL{i}', [[(400 - x, y) for x, y in wing_blade(i)]], 0.065, BASE, platinum, 0.016) for i in range(2)])
    crest_z = BASE + BEZEL + 0.04
    slab('L2_Crest', [VALKYRIE_CREST], 0.13, crest_z, rose_gold, 0.03)
    join('L2_Chevrons', [slab(f'C{i}', [p], 0.04, crest_z + 0.13, platinum, 0.008) for i, p in enumerate(VALKYRIE_CHEVRONS)])
    join('L2_Gems', [slab(f'G{i}', [diamond(x, y, 4.5, 9.5)], 0.032, BASE + BEZEL, rose_ruby, 0.012) for i, (x, y) in enumerate(VALKYRIE_GEMS)])


# ── Sovereign Crown Builder ──────────────────────────────────────────────────

SOVEREIGN_CROWN = [(168, 24), (184, 2), (200, -8), (216, 2), (232, 24), (200, 44)]


def scepter(sign=1):
    return [
        (200 + sign * 12, 120), (200 + sign * 140, 360),
        (200 + sign * 132, 366), (200 + sign * 6, 124)
    ]


def crown_spikes():
    out = []
    spikes = [(200, 40), (240, 52), (280, 70), (160, 52), (120, 70)]
    for x, y in spikes:
        out.append(diamond(x, y, 6, 14))
    return out


def build_sovereign():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sovereign_gold = material('SovereignGold', (0.88, 0.70, 0.22), 1.0, 0.18)
    royal_purple = material('RoyalPurple', (0.32, 0.06, 0.44), 0.9, 0.32)
    amethyst_gem = material('AmethystGem', (0.54, 0.12, 0.78), 0.1, 0.08, emission=(0.16, 0.02, 0.22))

    slab('L1_Ring', [inset(6), inset(11)], 0.22, BASE, sovereign_gold)
    join('L1_Scepters', [slab('s1', [scepter(1)], 0.04, BASE, royal_purple, 0.01),
                         slab('s2', [scepter(-1)], 0.04, BASE, royal_purple, 0.01)])

    slab('L2_Bezel', [SOVEREIGN_PTS, inset(15)], BEZEL, BASE, sovereign_gold, 0.025)
    slab('L2_InnerRing', [inset(19), inset(22)], 0.26, BASE, royal_purple, 0.01)
    join('L2_Scepters', [slab('S1', [scepter(1)], 0.062, BASE, sovereign_gold, 0.015),
                         slab('S2', [scepter(-1)], 0.062, BASE, sovereign_gold, 0.015)])
    join('L2_Spikes', [slab(f'spk{i}', [p], 0.05, BASE, sovereign_gold, 0.01) for i, p in enumerate(crown_spikes())])
    crest_z = BASE + BEZEL + 0.04
    slab('L2_Crest', [SOVEREIGN_CROWN], 0.13, crest_z, sovereign_gold, 0.03)
    join('L2_Gems', [slab(f'G{i}', [diamond(x, y, 5, 10)], 0.035, BASE + BEZEL, amethyst_gem, 0.012) for i, (x, y) in enumerate(SOVEREIGN_GEMS)])


# ── Singularity Core Builder ─────────────────────────────────────────────────

SINGULARITY_CREST = [(174, 22), (200, -10), (226, 22), (200, 46)]


def spiral_arm(angle_deg, steps=28):
    rad = math.radians(angle_deg)
    pts = []
    cx, cy = 200, 240
    for k in range(steps + 1):
        t = k / steps
        r = 25 + t * 140
        th = rad + t * 2.8
        pts.append((cx + math.cos(th) * r, cy + math.sin(th) * r))
    for k in range(steps, -1, -1):
        t = k / steps
        r = 20 + t * 130
        th = rad + t * 2.8 + 0.15
        pts.append((cx + math.cos(th) * r, cy + math.sin(th) * r))
    return pts


def build_singularity():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obsidian = material('Obsidian', (0.08, 0.10, 0.14), 0.95, 0.12)
    cyan_glow = material('SingularityCyan', (0.05, 0.72, 0.88), 0.85, 0.18, emission=(0.04, 0.28, 0.38))
    dark_core = material('DarkCore', (0.02, 0.03, 0.06), 1.0, 0.4)
    sapphire = material('Sapphire', (0.04, 0.42, 0.78), 0.1, 0.08, emission=(0.02, 0.15, 0.28))

    slab('L1_Ring', [inset(6), inset(11)], 0.22, BASE, obsidian)
    join('L1_Spirals', [slab(f'sp{i}', [spiral_arm(i * 90)], 0.038, BASE, cyan_glow, 0.01) for i in range(4)])

    slab('L2_Bezel', [SINGULARITY_PTS, inset(15)], BEZEL, BASE, obsidian, 0.025)
    slab('L2_InnerRing', [inset(19), inset(22)], 0.26, BASE, cyan_glow, 0.01)
    join('L2_Spirals', [slab(f'SP{i}', [spiral_arm(i * 90)], 0.065, BASE, cyan_glow, 0.016) for i in range(4)])
    join('L2_CoreRing', [slab('core', [diamond(200, 240, 28, 28), diamond(200, 240, 20, 20)], 0.05, BASE, dark_core, 0.008)])
    crest_z = BASE + BEZEL + 0.04
    slab('L2_Crest', [SINGULARITY_CREST], 0.13, crest_z, obsidian, 0.03)
    join('L2_Gems', [slab(f'G{i}', [diamond(x, y, 4.5, 9.5)], 0.035, BASE + BEZEL, sapphire, 0.012) for i, (x, y) in enumerate(SINGULARITY_GEMS)])


# ── Main Dispatcher ──────────────────────────────────────────────────────────

BUILDERS = {
    'apex': ('public/assets/evo3d/apex.glb', build_apex),
    'valkyrie': ('public/assets/evo3d/valkyrie.glb', build_valkyrie),
    'sovereign': ('public/assets/evo3d/sovereign.glb', build_sovereign),
    'singularity': ('public/assets/evo3d/singularity.glb', build_singularity),
}


def export_glb(out_path):
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out_path),
        export_format='GLB',
        export_yup=False,
        export_normals=True,
        export_apply=True,
    )
    print('wrote', out_path)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    target = args[0] if args else 'all'

    if target == 'all':
        for name, (path, builder) in BUILDERS.items():
            print(f'Building 3D model for {name} -> {path}...')
            builder()
            export_glb(path)
    else:
        matched = False
        for name, (path, builder) in BUILDERS.items():
            if target == name or target.endswith(os.path.basename(path)):
                print(f'Building 3D model for {name} -> {target}...')
                builder()
                export_glb(target)
                matched = True
                break
        if not matched:
            print(f'Building apex by default -> {target}')
            build_apex()
            export_glb(target)


main()
