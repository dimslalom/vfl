"""Builds the Apex Predator evo card's metal: bezel, claw rakes, teeth, crest, gems.

Run from the vfl folder:
  npm run evo:model

Output: public/assets/evo3d/apex.glb. One unit is 100 card pixels, the card is
centred on the origin in the XY plane and depth runs along +Z toward the viewer
(exported Z-up, so three.js reads the same axes). The face art, portrait and
type are not in here: src/evo3d/Apex3D.js puts them on planes between these
parts, because they change per card.

Objects come in two sets, one per evo stage:
  L1_Ring L1_Rakes L1_Fangs
  L2_Bezel L2_InnerRing L2_Rakes L2_Teeth L2_Crest L2_Fangs L2_Gems
Materials: Gold, GoldDark, Crimson, Ruby.

The outlines are the same numbers as shared/src/components/evoArt.js (APEX_PTS,
insetPts, rake, teeth). Change both together.
"""

import math
import os
import sys

import bpy

U = 100.0

APEX_R = [(200, 0), (213, 15), (238, 7), (247, 23), (370, 34), (390, 22), (400, 46), (392, 62), (400, 76),
          (400, 398), (391, 410), (400, 422), (400, 524), (384, 546), (226, 567), (200, 580)]
APEX_PTS = APEX_R + [(400 - x, y) for x, y in reversed(APEX_R[1:-1])]
GEMS = [(392.5, 240), (7.5, 240), (392.5, 480), (7.5, 480)]
BASE = 0.16      # front of the card plate
BEZEL = 0.38     # how far the Evo II bezel stands off the plate


def inset(d):
    return [(d, 40 + d * .82), (200, d * 1.02), (400 - d, 40 + d * .82), (400 - d, 540 - d * .82), (200, 580 - d * 1.02), (d, 540 - d * .82)]


def to3(p):
    return ((p[0] - 200) / U, (290 - p[1]) / U)


def quad(a, c, b, t):
    return ((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1])


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


def diamond(x, y, w, h):
    return [(x, y - h), (x + w, y), (x, y + h), (x - w, y)]


FANGS = [[(192, 15), (197, 15), (199, 33)], [(203, 15), (208, 15), (201, 33)]]
CREST = [(178, 24), (200, -6), (222, 24), (200, 44)]


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
    """Extrude one or more closed outlines (the first is the outside, later ones
    cut holes) into a solid with rounded edges, from z to z + depth."""
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
    for other in bpy.context.selected_objects:
        other.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    gold = material('Gold', (0.85, 0.58, 0.2), 1.0, 0.22)
    gold_dark = material('GoldDark', (0.45, 0.28, 0.08), 1.0, 0.4)
    crimson = material('Crimson', (0.6, 0.01, 0.04), 0.55, 0.3)
    ruby = material('Ruby', (0.45, 0.0, 0.03), 0.1, 0.08, emission=(0.12, 0.0, 0.01))

    # Evo I: a single raised rule, crimson rakes in low relief, a gold fang mark.
    slab('L1_Ring', [inset(6), inset(11)], 0.22, BASE, gold)
    join('L1_Rakes', [slab(f'r{i}', [rake_outline(i)], 0.036, BASE, crimson, 0.01) for i in range(3)])
    join('L1_Fangs', [slab(f'f{i}', [p], 0.05, BASE, gold, 0.01) for i, p in enumerate(FANGS)])

    # Evo II: the card's own outline as a thick bezel, gold rakes with teeth,
    # a crest standing proud of the bezel, ruby inlays down the sides.
    slab('L2_Bezel', [APEX_PTS, inset(15)], BEZEL, BASE, gold, 0.025)
    slab('L2_InnerRing', [inset(19), inset(22)], 0.26, BASE, gold_dark, 0.01)
    join('L2_Rakes', [slab(f'R{i}', [rake_outline(i)], 0.06, BASE, gold, 0.018) for i in range(3)])
    join('L2_Teeth', [slab(f'T{i}', [tri], 0.05, BASE, gold, 0.008) for i, tri in enumerate(teeth())])
    crest_z = BASE + BEZEL + 0.04
    slab('L2_Crest', [CREST], 0.12, crest_z, gold, 0.03)
    join('L2_Fangs', [slab(f'F{i}', [p], 0.04, crest_z + 0.12, crimson, 0.008) for i, p in enumerate(FANGS)])
    join('L2_Gems', [slab(f'G{i}', [diamond(x, y, 4, 9)], 0.03, BASE + BEZEL, ruby, 0.012) for i, (x, y) in enumerate(GEMS)])


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[0] if args else 'public/assets/evo3d/apex.glb'
    build()
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out),
        export_format='GLB',
        export_yup=False,
        export_normals=True,
        export_apply=True,
    )
    print('wrote', out)


main()
