"""Builds the skill tape model: an ordinary audio cassette, stood upright.

Run from the vfl folder (needs Blender):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/tape3d/build_tape.py -- public/assets/tape3d/tape.glb

The cassette is turned 90 degrees so the two reels sit one above the other and the
trapezoid tab runs down the right edge. It is portrait at player card proportions
(400 by 580), but keeps a normal cassette outline: rounded corners, no card cut.

Kept deliberately plain so it reads when small: shell, label, window with two reels,
the tab and four screws. No textures; "SKILL TAPE" is real geometry, so the model
needs nothing else to load.

Output: public/assets/tape3d/tape.glb, one root node "Tape" with these meshes, each
with its own material so the game can restyle any part:
  Shell    smoke plastic body, with the window recess cut into the front
  Tab      raised trapezoid plate on the right edge
  Label    cream label with a hole for the window
  Ink      the "SKILL TAPE" lettering
  ReelTop, ReelBottom   brown tape packs (the top one fuller)
  HubTop, HubBottom     cream sprocket rings in the middle of each reel
  Window   the clear pane over the reels
  Screws   four screw heads in the corners
Units: the shell is 1.0 wide and 1.45 tall; glTF is Y-up and the front faces +Z.
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix

# ── shape ────────────────────────────────────────────────────────────────────

WIDTH = 1.0
HEIGHT = 1.45               # 400 by 580, the player card proportion
DEPTH = 0.16                # a real cassette is a little thicker; slimmer reads cleaner
CORNER = 0.07
EDGE_BEVEL = 0.014          # the soft rounding round the front and back faces

HALF_W = WIDTH / 2
HALF_H = HEIGHT / 2
FRONT = -DEPTH / 2          # Blender is Z-up; the front faces -Y, which becomes +Z in glTF

# Window: a tall rounded slot a little left of centre, opposite the tab.
WIN_X = (-0.12, 0.22)
WIN_Z = (-0.50, 0.50)
WIN_R = 0.10
RECESS = 0.055              # how deep the window cavity goes into the shell

LABEL_X = (-0.43, 0.32)
LABEL_Z = (-0.615, 0.615)
LABEL_R = 0.035
LABEL_HOLE = 0.025          # the label stops short of the window, showing a rim of shell
LABEL_T = 0.004

# The trapezoid tab, long side on the right edge.
TAB_OUTER_X = 0.49
TAB_INNER_X = 0.36
TAB_OUTER_Z = 0.50
TAB_INNER_Z = 0.38
TAB_T = 0.012

REEL_X = (WIN_X[0] + WIN_X[1]) / 2
REEL_Z = 0.27
REEL_TOP_R = 0.155          # most of the tape is wound on the top reel
REEL_BOTTOM_R = 0.115
HUB_R = 0.068
HUB_HOLE = 0.036
TEETH = 6

SCREWS = [(-0.40, 0.668), (0.40, 0.668), (-0.40, -0.668), (0.40, -0.668)]
SCREW_R = 0.022

TEXT = 'SKILL TAPE'
TEXT_CAP = 0.15             # letter height across the strip
TEXT_MAX_LEN = 1.0          # longest the word may run along the strip
FONTS = [
    '/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf',
]

# sRGB hex colours, converted to Blender's linear values below.
COLOURS = {
    'TapeShell': '#23252e',
    'TapeCavity': '#121318',
    'TapeLabel': '#e8e4dc',
    'TapeInk': '#23252e',
    'TapeReel': '#5b3a24',
    'TapeHub': '#ddd8cc',
    'TapeWindow': '#9aa0b0',
    'TapeScrew': '#8a8d96',
}


# ── helpers ──────────────────────────────────────────────────────────────────

def linear(hex_colour):
    out = []
    for i in (1, 3, 5):
        c = int(hex_colour[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def material(name, roughness=0.4, metallic=0.0, coat=0.0, alpha=1.0):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = linear(COLOURS[name])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.12
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.surface_render_method = 'BLENDED'
    return mat


def rounded_rect(x0, x1, z0, z1, r, seg=8):
    """Outline of a rounded rectangle in the XZ plane, anticlockwise seen from the front."""
    r = min(r, (x1 - x0) / 2, (z1 - z0) / 2)
    corners = [(x1 - r, z1 - r, 0), (x0 + r, z1 - r, 90), (x0 + r, z0 + r, 180), (x1 - r, z0 + r, 270)]
    pts = []
    for cx, cz, start in corners:
        for k in range(seg + 1):
            a = math.radians(start + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def circle(cx, cz, r, seg=48):
    return [(cx + r * math.cos(2 * math.pi * k / seg), cz + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]


def link(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def prism(name, outline, y_front, y_back, mat):
    """Extrudes a closed XZ outline from y_front back to y_back (front is the smaller y)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, y_front, z)) for x, z in outline]
    back = [bm.verts.new((x, y_back, z)) for x, z in outline]
    n = len(outline)
    # An outline anticlockwise in XZ seen from -Y gives a face whose normal points to -Y.
    bm.faces.new(list(reversed(front)))
    bm.faces.new(back)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([front[i], front[j], back[j], back[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, mat)


def ring(name, cx, cz, r_out, r_in, y_front, y_back, mat, seg=48):
    """A flat washer: outer and inner walls plus front and back faces."""
    bm = bmesh.new()
    rings = []
    for r in (r_out, r_in):
        rings.append([
            (bm.verts.new((x, y_front, z)), bm.verts.new((x, y_back, z)))
            for x, z in circle(cx, cz, r, seg)
        ])
    outer, inner = rings
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new([outer[i][0], outer[j][0], outer[j][1], outer[i][1]])   # outer wall
        bm.faces.new([inner[j][0], inner[i][0], inner[i][1], inner[j][1]])   # inner wall
        bm.faces.new([outer[j][0], outer[i][0], inner[i][0], inner[j][0]])   # front
        bm.faces.new([outer[i][1], outer[j][1], inner[j][1], inner[i][1]])   # back
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, mat)


def bevel(obj, width, segments=3):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(40)
    return mod


def cut(obj, cutter, transfer=True):
    mod = obj.modifiers.new('Cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    if transfer:
        mod.material_mode = 'TRANSFER'
    return mod


def bake(obj):
    """Applies the modifiers into the mesh, then shades smooth with sharp creases."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    bpy.data.meshes.remove(old)
    mesh.name = obj.name
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(35))
    return obj


def drop(obj):
    mesh = obj.data
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)


def lettering(mat):
    font = None
    for path in FONTS:
        if os.path.exists(path):
            font = bpy.data.fonts.load(path)
            break
    curve = bpy.data.curves.new('Ink', 'FONT')
    curve.body = TEXT
    if font:
        curve.font = font
    curve.size = 1.0
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.extrude = 0.0
    curve.resolution_u = 6
    tmp = bpy.data.objects.new('InkCurve', curve)
    bpy.context.collection.objects.link(tmp)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(depsgraph))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(curve)

    # Size from the real glyph bounds: letters TEXT_CAP tall, never longer than the strip.
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    length, cap = max(xs) - min(xs), max(ys) - min(ys)
    scale = min(TEXT_CAP / cap, TEXT_MAX_LEN / length)
    mid_x, mid_y = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2

    # Reading bottom to top along the strip left of the window, letter tops toward the left edge.
    strip_x = (LABEL_X[0] + WIN_X[0] - LABEL_HOLE) / 2
    turn = Matrix((
        (0, -1, 0, 0),
        (0, 0, -1, 0),
        (1, 0, 0, 0),
        (0, 0, 0, 1),
    ))
    place = Matrix.Translation((strip_x, FRONT - LABEL_T - 0.0006, 0)) @ turn @ Matrix.Scale(scale, 4) @ Matrix.Translation((-mid_x, -mid_y, 0))
    mesh.transform(place)
    mesh.name = 'Ink'
    obj = bpy.data.objects.new('Ink', mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    # Flat glyphs: make sure they face the viewer (-Y).
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for face in bm.faces:
        if face.normal.y > 0:
            face.normal_flip()
    bm.to_mesh(mesh)
    bm.free()
    return obj


# ── build ────────────────────────────────────────────────────────────────────

def main():
    out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'public/assets/tape3d/tape.glb'
    bpy.ops.wm.read_factory_settings(use_empty=True)

    shell_mat = material('TapeShell', roughness=0.34, coat=0.5)
    cavity_mat = material('TapeCavity', roughness=0.6)
    label_mat = material('TapeLabel', roughness=0.75)
    ink_mat = material('TapeInk', roughness=0.6)
    reel_mat = material('TapeReel', roughness=0.32)
    hub_mat = material('TapeHub', roughness=0.45)
    window_mat = material('TapeWindow', roughness=0.04, alpha=0.16)
    screw_mat = material('TapeScrew', roughness=0.3, metallic=1.0)

    parts = []

    # Shell: a rounded slab, soft edged, with the window cavity cut into the front.
    shell = prism('Shell', rounded_rect(-HALF_W, HALF_W, -HALF_H, HALF_H, CORNER), FRONT, -FRONT, shell_mat)
    bevel(shell, EDGE_BEVEL)
    bake(shell)
    cavity = prism('Cavity', rounded_rect(WIN_X[0], WIN_X[1], WIN_Z[0], WIN_Z[1], WIN_R), FRONT - 0.1, FRONT + RECESS, cavity_mat)
    cut(shell, cavity)
    bake(shell)
    drop(cavity)
    parts.append(shell)

    # The trapezoid tab, raised a touch off the front along the right edge.
    tab_outline = [(TAB_OUTER_X, -TAB_OUTER_Z), (TAB_OUTER_X, TAB_OUTER_Z), (TAB_INNER_X, TAB_INNER_Z), (TAB_INNER_X, -TAB_INNER_Z)]
    tab = prism('Tab', tab_outline, FRONT - TAB_T, FRONT + 0.004, shell_mat)
    bevel(tab, 0.004, 2)
    bake(tab)
    parts.append(tab)

    # Label: cream sheet with a hole a little bigger than the window.
    label = prism('Label', rounded_rect(LABEL_X[0], LABEL_X[1], LABEL_Z[0], LABEL_Z[1], LABEL_R), FRONT - LABEL_T, FRONT + 0.001, label_mat)
    bevel(label, 0.0015, 1)
    bake(label)
    hole = prism('Hole', rounded_rect(WIN_X[0] - LABEL_HOLE, WIN_X[1] + LABEL_HOLE, WIN_Z[0] - LABEL_HOLE, WIN_Z[1] + LABEL_HOLE, WIN_R + LABEL_HOLE), FRONT - 0.05, FRONT + 0.05, label_mat)
    cut(label, hole, transfer=False)
    bake(label)
    drop(hole)
    parts.append(label)

    parts.append(lettering(ink_mat))

    # Reels sit inside the cavity: a brown tape pack with a cream sprocket hub on top.
    floor = FRONT + RECESS
    for name, z, r in (('Top', REEL_Z, REEL_TOP_R), ('Bottom', -REEL_Z, REEL_BOTTOM_R)):
        reel = ring('Reel' + name, REEL_X, z, r, HUB_R - 0.004, floor - 0.032, floor - 0.004, reel_mat)
        bevel(reel, 0.003, 1)
        bake(reel)
        parts.append(reel)
        hub = ring('Hub' + name, REEL_X, z, HUB_R, HUB_HOLE, floor - 0.038, floor - 0.004, hub_mat, seg=40)
        # Six teeth pointing into the hole, so it reads as a cassette spool.
        bm = bmesh.new()
        bm.from_mesh(hub.data)
        for k in range(TEETH):
            a = 2 * math.pi * k / TEETH + math.pi / 2
            ca, sa = math.cos(a), math.sin(a)
            r0, r1, half = HUB_HOLE - 0.014, HUB_HOLE + 0.002, 0.0075
            quad = [(r0, -half), (r1, -half), (r1, half), (r0, half)]
            pts = [(REEL_X + u * ca - v * sa, z + u * sa + v * ca) for u, v in quad]
            front = [bm.verts.new((x, floor - 0.036, zz)) for x, zz in pts]
            back = [bm.verts.new((x, floor - 0.006, zz)) for x, zz in pts]
            bm.faces.new(list(reversed(front)))
            bm.faces.new(back)
            for i in range(4):
                j = (i + 1) % 4
                bm.faces.new([front[i], front[j], back[j], back[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(hub.data)
        bm.free()
        bake(hub)
        parts.append(hub)

    # Clear pane, flush with the front of the shell.
    bm = bmesh.new()
    verts = [bm.verts.new((x, FRONT + 0.002, z)) for x, z in rounded_rect(WIN_X[0], WIN_X[1], WIN_Z[0], WIN_Z[1], WIN_R)]
    bm.faces.new(list(reversed(verts)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        if face.normal.y > 0:
            face.normal_flip()
    parts.append(link('Window', bm, window_mat))

    # Four low domed screw heads in the corners.
    bm = bmesh.new()
    for sx, sz in SCREWS:
        rim = [bm.verts.new((x, FRONT - 0.002, z)) for x, z in circle(sx, sz, SCREW_R, 20)]
        tip = bm.verts.new((sx, FRONT - 0.008, sz))
        base = [bm.verts.new((x, FRONT + 0.003, z)) for x, z in circle(sx, sz, SCREW_R, 20)]
        n = len(rim)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([rim[j], rim[i], tip])
            bm.faces.new([base[i], base[j], rim[j], rim[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    screws = link('Screws', bm, screw_mat)
    bake(screws)
    parts.append(screws)

    root = bpy.data.objects.new('Tape', None)
    bpy.context.collection.objects.link(root)
    for part in parts:
        part.parent = root

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out),
        export_format='GLB',
        export_yup=True,
        export_normals=True,
        export_texcoords=False,
        export_materials='EXPORT',
        export_apply=True,
    )
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts)
    print('Wrote', os.path.abspath(out), 'triangles', tris)


main()
