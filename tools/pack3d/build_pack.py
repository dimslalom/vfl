"""Builds the card pack model: a puffy foil bag with crimped seals and a tear strip.

Run from the vfl folder:
  npm run pack:model

Every pack type shares this one model. Types differ only in the art and foil
settings in src/pack3d/packTypes.js, so a new pack never needs Blender again.
Re-run this only when the shape itself changes.

Output: public/assets/pack3d/pack.glb with two objects.
  Body   the bag below the tear line, front and back sheets
  Strip  the band above the tear line, which rips away
Both carry two materials, PackFront and PackBack, which the game replaces at
load time, and UVs where (0,0) is the bottom-left of the art and (1,1) the top-right.
"""

import math
import os
import random
import sys

import bpy
import bmesh

# ── shape ────────────────────────────────────────────────────────────────────

WIDTH = 1.0
HEIGHT = 1.415             # the 595 by 842 proportion of the reference art
SEAL = 0.06                # crimped seal height, top and bottom
TEAR_FROM_TOP = 0.088      # where the strip tears off, measured from the top edge
BULGE = 0.045              # how far the middle puffs out on each side
COLS = 26                  # crimp detail lives in the normal map, so the mesh stays light
STRIP_COLS = 104           # the strip curls as it tears, so it needs fine columns to bend smoothly
ROWS = 38
TEAR_JAG = 0.006           # how ragged the tear line is
PINCH = 0.03               # how far the puffed sides pull in, so the pack has a waist

random.seed(7)
HALF_W = WIDTH / 2
HALF_H = HEIGHT / 2
TEAR_Y = HALF_H - TEAR_FROM_TOP


def smooth(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def middle(y):
    """1 in the puffed middle of the pack, easing to 0 at the seals."""
    v = abs(y) / HALF_H
    seal_v = 1 - SEAL / HALF_H
    return 1 - smooth(seal_v - 0.3, seal_v, v)


def puff(x, y):
    """Depth of one sheet at (x, y): flat at the seals, full in the middle."""
    u = abs(x) / HALF_W
    v = abs(y) / HALF_H
    across = 1 - u ** 6                        # the long side folds keep it closed
    seal_v = 1 - SEAL / HALF_H
    along = 1 - smooth(seal_v - 0.16, seal_v, v)  # flattens into the seal
    depth = BULGE * across * along
    # A few soft wrinkles where the bag is squeezed into the seals.
    wrinkle = 0.0025 * math.sin(x * 37 + y * 5) * smooth(seal_v - 0.3, seal_v - 0.05, v)
    return max(0.0, depth + wrinkle * across)


# Ragged tear line, one offset per column, shared by Body and Strip so they meet.
TEAR_OFFSETS = [(random.random() - 0.5) * 2 * TEAR_JAG for _ in range(COLS + 1)]


def column_x(i, cols=COLS):
    return -HALF_W + WIDTH * i / cols


def tear_offset(x):
    """The ragged tear line at x, so a strip with more columns still meets the body exactly."""
    f = (x + HALF_W) / WIDTH * COLS
    i = min(int(f), COLS - 1)
    return TEAR_OFFSETS[i] + (TEAR_OFFSETS[i + 1] - TEAR_OFFSETS[i]) * (f - i)


def build_sheet(bm, uv_layer, y_from, y_to, rows, cols, side, material_index, tear_edge):
    """One sheet between two heights. side is +1 (front) or -1 (back)."""
    grid = []
    uvs = {}
    for j in range(rows + 1):
        row = []
        t = j / rows
        for i in range(cols + 1):
            x = column_x(i, cols)
            y = y_from + (y_to - y_from) * t
            if (tear_edge == 'top' and j == rows) or (tear_edge == 'bottom' and j == 0):
                y = TEAR_Y + tear_offset(x)
            z = side * puff(x, y)
            # The puff pulls the long sides inwards, while the flat seals stay full width.
            pinched = x * (1 - PINCH * middle(y))
            # Blender is Z-up and glTF is Y-up: stand the pack upright, facing the viewer.
            vert = bm.verts.new((pinched, -z, y))
            # UVs follow the unpinched grid, so the art keeps its proportions.
            u = (x + HALF_W) / WIDTH
            uvs[vert] = (1 - u if side < 0 else u, (y + HALF_H) / HEIGHT)   # the back art reads correctly from behind
            row.append(vert)
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
            if side < 0:
                quad.reverse()
            face = bm.faces.new(quad)
            face.material_index = material_index
            face.smooth = True
            for loop in face.loops:
                loop[uv_layer].uv = uvs[loop.vert]


def make_object(name, y_from, y_to, rows, cols, tear_edge):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    build_sheet(bm, uv_layer, y_from, y_to, rows, cols, +1, 0, tear_edge)
    build_sheet(bm, uv_layer, y_from, y_to, rows, cols, -1, 1, tear_edge)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for material_name in ('PackFront', 'PackBack'):
        material = bpy.data.materials.get(material_name) or bpy.data.materials.new(material_name)
        obj.data.materials.append(material)
    return obj


def main():
    out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'public/assets/pack3d/pack.glb'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    strip_rows = 4
    body_rows = ROWS - strip_rows
    make_object('Body', -HALF_H, TEAR_Y, body_rows, COLS, 'top')
    make_object('Strip', TEAR_Y, HALF_H, strip_rows, STRIP_COLS, 'bottom')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out),
        export_format='GLB',
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
        export_apply=True,
    )
    print('Wrote', os.path.abspath(out))


main()
