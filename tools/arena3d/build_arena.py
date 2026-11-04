"""Builds a map's arena: the 3D set the board's lanes float over.

Run from the vfl folder:
  npm run arena:model -- ascent

The board camera looks almost straight down (74°) at three lanes about 11 units
wide. On a 16:9 screen it sees only a few units past each lane edge, the thin
gaps between lanes, and a strip past the far end, so that is all this models:
a plaza floor under the lanes, what stands at the flanks, and the island edge
falling away to clouds. Nothing is hidden under the lanes but floor.

Coordinates below are the game's (three.js): x across, y up, z toward the
player (the far end of the lanes is -z). The exporter turns Blender's Z-up
into Y-up, so add() converts on the way in.

Output: public/assets/arena3d/<map>.glb with
  Static    one mesh per material, so the whole set is a handful of draw calls
  Cloud_*   cloud clusters, separate so the game can drift them
No normals are stored: the game shades every face flat, so vertices can be
shared and the file stays small. Materials are flat colours named by role (Stone, Paving, Plaster, Roof, Wood,
Metal, Foliage, Rock, Cloud). The game recolours them by name, so a palette
change never needs Blender.
"""

import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

FLOOR = -2.4                 # plaza level: well below the lanes, so they float over a courtyard
CEIL = -0.35                 # nothing at the flanks rises above this: the board stays on top
random.seed(11)

# ── one bmesh per material ───────────────────────────────────────────────────

MESHES = {}


def bm_for(material):
    if material not in MESHES:
        MESHES[material] = bmesh.new()
    return MESHES[material]


def to_blender(x, y, z):
    return Vector((x, -z, y))


def place(bm, verts, at, rot_y=0.0):
    """Turn verts about the up axis by rot_y (game radians) and move them to at (game coords)."""
    m = Matrix.Translation(to_blender(*at)) @ Matrix.Rotation(rot_y, 4, 'Z')
    bmesh.ops.transform(bm, matrix=m, verts=verts)


def box(material, at, size, rot_y=0.0):
    """A box whose bottom centre sits at `at`. size is (across, up, depth) in game units."""
    bm = bm_for(material)
    w, h, d = size
    made = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=made)
    bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=made)
    place(bm, made, at, rot_y)


def roof(material, at, size, rot_y=0.0, overhang=0.12):
    """A pitched roof: a triangular prism along the depth, sitting on top of a wall at `at`."""
    bm = bm_for(material)
    w, h, d = size
    w += overhang * 2
    d += overhang * 2
    hw, hd = w / 2, d / 2
    # Blender axes: x across, y = -depth, z up.
    pts = [(-hw, -hd, 0), (hw, -hd, 0), (0, -hd, h), (-hw, hd, 0), (hw, hd, 0), (0, hd, h)]
    v = [bm.verts.new(p) for p in pts]
    for face in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([v[i] for i in face])
    place(bm, v, at, rot_y)


def cone(material, at, radius, height, segments=7, rot_y=0.0, top=0.0):
    bm = bm_for(material)
    made = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=top, depth=height)['verts']
    bmesh.ops.translate(bm, vec=Vector((0, 0, height / 2)), verts=made)
    place(bm, made, at, rot_y)


def cylinder(material, at, radius, height, segments=10):
    bm = bm_for(material)
    made = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=height)['verts']
    bmesh.ops.translate(bm, vec=Vector((0, 0, height / 2)), verts=made)
    place(bm, made, at)


def blob(material, at, radius, squash=1.0, bm=None):
    bm = bm or bm_for(material)
    made = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)['verts']
    bmesh.ops.scale(bm, vec=Vector((1, 1, squash)), verts=made)
    place(bm, made, at, random.random() * 6.28)


def arch(material, at, width, height, depth, rot_y=0.0, thick=0.28):
    """A wall slab with a round-topped opening, as an extruded outline."""
    bm = bm_for(material)
    hw = width / 2
    inner = hw - thick
    spring = height - thick - inner          # where the curve starts
    outline = [(-hw, 0), (-inner, 0), (-inner, spring)]
    steps = 8
    for i in range(1, steps):
        a = math.pi - math.pi * i / steps
        outline.append((math.cos(a) * inner, spring + math.sin(a) * inner))
    outline += [(inner, spring), (inner, 0), (hw, 0), (hw, height), (-hw, height)]
    front = [bm.verts.new((x, -depth / 2, y)) for x, y in outline]
    back = [bm.verts.new((x, depth / 2, y)) for x, y in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    # Caps: split into the two piers and the crown, all convex enough for ngons.
    top_start = 3 + steps - 1                # index of (inner, spring)
    bm.faces.new([front[i] for i in (0, 1, 2, n - 1)])
    bm.faces.new([front[i] for i in (top_start, top_start + 1, top_start + 2, top_start + 3)])
    bm.faces.new([front[i] for i in list(range(2, top_start + 1)) + [n - 2, n - 1]])
    bm.faces.new([back[i] for i in reversed((0, 1, 2, n - 1))])
    bm.faces.new([back[i] for i in reversed((top_start, top_start + 1, top_start + 2, top_start + 3))])
    bm.faces.new([back[i] for i in reversed(list(range(2, top_start + 1)) + [n - 2, n - 1])])
    place(bm, front + back, at, rot_y)


# ── the island ───────────────────────────────────────────────────────────────

def island(a=10.6, b=19.0, power=4.0, rings=6, depth=7.5, slab=0.35, top_mat='Stone', rock=True):
    """Plaza top (Stone) on a tapering rock underside (Rock) that ends in a point."""
    n = 56
    outline = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        r = 1.0 / ((abs(c) ** power + abs(s) ** power) ** (1 / power))
        wob = 1 + (random.random() - 0.5) * 0.05
        outline.append((a * c * r * wob, b * s * r * wob))

    stone = bm_for(top_mat)
    top = [stone.verts.new(to_blender(x, FLOOR, z)) for x, z in outline]
    lip = [stone.verts.new(to_blender(x, FLOOR - slab, z)) for x, z in outline]
    stone.faces.new(list(reversed(top)))
    for i in range(n):
        j = (i + 1) % n
        stone.faces.new((top[i], top[j], lip[j], lip[i]))

    if not rock:
        return outline
    rock = bm_for('Rock')
    prev = [rock.verts.new(to_blender(x, FLOOR - slab, z)) for x, z in outline]
    for k in range(1, rings + 1):
        f = k / rings
        shrink = (1 - f) ** 1.3 * 0.92 + 0.04
        y = FLOOR - slab - depth * f
        ring = []
        for x, z in outline:
            jag = 1 + (random.random() - 0.5) * 0.28
            ring.append(rock.verts.new(to_blender(x * shrink * jag, y + (random.random() - 0.5) * 0.6, z * shrink * jag)))
        for i in range(n):
            j = (i + 1) % n
            rock.faces.new((prev[i], prev[j], ring[j], ring[i]))
        prev = ring
    tip = rock.verts.new(to_blender(0, FLOOR - slab - depth - 1.5, 0))
    for i in range(n):
        rock.faces.new((prev[i], prev[(i + 1) % n], tip))
    return outline


def paving(step=1.6, ring=True):
    """Thin raised bands in a grid: the only thing seen in the lane gaps, and the floor's sense of scale."""
    for i in range(-6, 7):
        box('Paving', (i * step, FLOOR, 0), (0.07, 0.025, 36))
    for k in range(-11, 12):
        box('Paving', (0, FLOOR, k * step), (19.6, 0.025, 0.07))
    if not ring:
        return
    # A ring inlay at the plaza's centre, under mid; it shows through the gaps.
    bm = bm_for('Paving')
    for radius in (3.2, 3.5):
        made = bmesh.ops.create_circle(bm, segments=40, radius=radius)['verts']
        edges = list({e for v in made for e in v.link_edges})
        ext = bmesh.ops.extrude_edge_only(bm, edges=edges)['geom']
        top = [g for g in ext if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.scale(bm, vec=Vector((1.04, 1.04, 1)), verts=top)
        bmesh.ops.translate(bm, vec=Vector((0, 0, FLOOR + 0.03)), verts=made + top)


# ── floors: each map its own, never a plain grid ─────────────────────────────
# All of these sit flush on the plaza in Paving (or Marking for painted lines),
# a shade off the floor colour, so they read as surface and never as a pattern
# that competes with the lanes.

XH, ZH = 10.4, 18.0          # the plaza area worth covering


def line(x0, z0, x1, z1, width=0.05, mat='Paving', lift=0.012):
    """A flat painted strip: one quad just above the floor, two triangles."""
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz) or 1.0
    nx, nz = -dz / length * width / 2, dx / length * width / 2
    ex, ez = dx / length * width / 2, dz / length * width / 2
    y = FLOOR + lift
    bm = bm_for(mat)
    corners = [(x0 - ex + nx, z0 - ez + nz), (x1 + ex + nx, z1 + ez + nz), (x1 + ex - nx, z1 + ez - nz), (x0 - ex - nx, z0 - ez - nz)]
    bm.faces.new([bm.verts.new(to_blender(x, y, z)) for x, z in corners])


def flagstones(row=(0.9, 1.5), stone=(0.8, 1.8), width=0.05):
    """Courses of stones: a joint across each row, staggered joints inside it."""
    z = -ZH
    while z < ZH:
        h = random.uniform(*row)
        line(-XH, z, XH, z, width)
        x = -XH + random.uniform(0, stone[1])
        while x < XH:
            line(x, z, x, z + h, width)
            x += random.uniform(*stone)
        z += h


def slabs(count, size=(0.8, 1.6), tilt=0.15, mat='Paving', area=(XH, ZH)):
    """Loose slabs laid at slight angles: broken paving, stepping stones."""
    for _ in range(count):
        w, d = random.uniform(*size), random.uniform(*size)
        box(mat, (random.uniform(-area[0], area[0]), FLOOR, random.uniform(-area[1], area[1])), (w, 0.02, d), random.uniform(-tilt, tilt))


def discs(count, radius=(0.3, 0.6), mat='Paving'):
    for _ in range(count):
        cylinder(mat, (random.uniform(-XH, XH), FLOOR, random.uniform(-ZH, ZH)), random.uniform(*radius), 0.02, segments=9)


def patches(count, material, radius=(1.0, 2.0)):
    """Flat drifts of another surface (sand, grass) over the plaza."""
    for _ in range(count):
        blob(material, (random.uniform(-XH, XH), FLOOR - 0.02, random.uniform(-ZH, ZH)), random.uniform(*radius), squash=0.03)


def seams(step, along='z', width=0.05):
    """Panel seams one way only, like a deck or poured concrete."""
    k = -int(XH / step)
    if along == 'z':
        for i in range(-int(XH / step), int(XH / step) + 1):
            line(i * step, -ZH, i * step, ZH, width)
    else:
        for i in range(-int(ZH / step), int(ZH / step) + 1):
            line(-XH, i * step, XH, i * step, width)


def dashes(x, step=1.2, length=0.6, width=0.08, mat='Marking'):
    z = -ZH
    while z < ZH:
        line(x, z, x, z + length, width, mat)
        z += step


def waves(gap=1.1, amp=0.3, freq=1.1, width=0.22):
    """Lisbon-style pavement: wavy dark bands across the plaza."""
    for k in range(-int(ZH / gap), int(ZH / gap) + 1):
        z0 = k * gap
        pts = [(x / 2, z0 + amp * math.sin(x / 2 * freq)) for x in range(int(-XH * 2), int(XH * 2) + 1)]
        for (xa, za), (xb, zb) in zip(pts, pts[1:]):
            line(xa, za, xb, zb, width)


def rings(radii, spokes=0, width=0.06, inner=2.0):
    for r in radii:
        n = max(24, int(r * 9))
        pts = [(math.cos(2 * math.pi * i / n) * r, math.sin(2 * math.pi * i / n) * r) for i in range(n + 1)]
        for (xa, za), (xb, zb) in zip(pts, pts[1:]):
            line(xa, za, xb, zb, width)
    for i in range(spokes):
        a = 2 * math.pi * i / spokes
        line(math.cos(a) * inner, math.sin(a) * inner, math.cos(a) * radii[-1], math.sin(a) * radii[-1], width)


def cobbles(patch_count=14, per=26):
    for _ in range(patch_count):
        cx, cz = random.uniform(-XH, XH), random.uniform(-ZH, ZH)
        for _ in range(per):
            box('Paving', (cx + random.gauss(0, 0.9), FLOOR, cz + random.gauss(0, 0.9)), (0.26, 0.025, 0.26), random.uniform(0, 1.5))


# ── Ascent: a hilltop city on a floating island ──────────────────────────────
# Left flank: a row of plaster houses with terracotta roofs, the street side
# facing the lanes. Right flank: an open terrace edge with a balustrade, market
# awnings and the drop to the clouds. Far end: a raised terrace with an arched
# gate and a bell tower, so the top of the screen has a skyline.

def house(x, z, w, d, h, roof_h=0.7, rot_y=0.0):
    box('Plaster', (x, FLOOR, z), (w, h, d), rot_y)
    roof('Roof', (x, FLOOR + h, z), (w, roof_h, d), rot_y)


def left_street():
    z = -16.0
    while z < 17:
        d = random.uniform(2.0, 3.2)
        roof_h = random.uniform(0.35, 0.5)
        h = random.uniform(0.9, (CEIL - FLOOR) - roof_h)
        w = random.uniform(2.0, 2.8)
        x = -7.4 - w / 2 - random.uniform(0, 0.3)
        house(x, z + d / 2, w, d, h, roof_h=roof_h, rot_y=0)
        # Doors and shutters on the street face: thin dark slabs.
        box('Wood', (x + w / 2 + 0.01, FLOOR, z + d / 2), (0.04, 0.7, 0.45))
        if h > 1.4:
            for dz in (-0.55, 0.55):
                box('Wood', (x + w / 2 + 0.01, FLOOR + h - 0.55, z + d / 2 + dz), (0.04, 0.32, 0.24))
        z += d + random.uniform(0.0, 0.35)
    # Planters and cypresses along the street, between houses and lanes.
    for z in range(-15, 17, 4):
        zz = z + random.uniform(-0.6, 0.6)
        box('Stone', (-6.5, FLOOR, zz), (0.6, 0.35, 0.6))
        blob('Foliage', (-6.5, FLOOR + 0.42, zz), 0.36, squash=0.7)
    for z in (-12.5, -4.5, 3.5, 11.5):
        cone('Foliage', (-6.3, FLOOR, z), 0.3, 1.8)


def right_terrace():
    # Balustrade along the island edge: a rail on posts.
    x = 9.6
    box('Metal', (x, FLOOR + 0.55, 0), (0.12, 0.08, 36))
    for z in [i * 0.9 for i in range(-19, 20)]:
        box('Metal', (x, FLOOR, z), (0.08, 0.55, 0.08))
    # Market stalls: counter plus a striped awning slope.
    for z, rot in ((-11.5, 0.0), (5.2, 0.08), (12.5, -0.06)):   # clear of the enemy bench beside lane C
        box('Wood', (7.6, FLOOR, z), (0.9, 0.55, 1.8), rot)
        for k in range(4):
            mat = 'Roof' if k % 2 == 0 else 'Plaster'
            box(mat, (7.3, FLOOR + 1.15, z - 0.675 + k * 0.45), (1.4, 0.05, 0.45), rot)
        for dz in (-0.85, 0.85):
            box('Wood', (6.75, FLOOR, z + dz), (0.06, 1.15, 0.06), rot)
    # Crates and a bench so the edge isn't bare.
    for z in (-7.5, 8.6, 15.5):
        box('Wood', (8.6, FLOOR, z), (0.5, 0.45, 0.5), random.random())
        box('Wood', (8.75, FLOOR, z + 0.6), (0.4, 0.35, 0.4), random.random())
    for z in (-13.5, 13.5):
        cone('Foliage', (8.6, FLOOR, z), 0.34, 1.9)


def far_end():
    # Past the lanes' far points on every layout (phones stretch the lanes to
    # about z -10), and kept under CEIL, so the headers never sit on a wall.
    for k in range(3):
        box('Stone', (0, FLOOR, -9.0 - k * 0.6 - 4), (15.0, 0.18 * (k + 1), 8.0))
    top = FLOOR + 0.54
    room = CEIL - top
    # Arched gate in the middle, low walls either side.
    arch('Plaster', (0, top, -12.2), 2.6, room - 0.1, 0.5)
    box('Plaster', (-4.4, top, -12.2), (6.2, room * 0.6, 0.45))
    box('Plaster', (4.4, top, -12.2), (6.2, room * 0.6, 0.45))
    # Bell tower: the one thing allowed past CEIL, far enough back to read as skyline.
    box('Plaster', (6.0, top, -15.0), (1.5, 2.6, 1.5))
    box('Stone', (6.0, top + 2.6, -15.0), (1.8, 0.16, 1.8))
    for dx, dz in ((-0.58, -0.58), (0.58, -0.58), (-0.58, 0.58), (0.58, 0.58)):
        box('Plaster', (6.0 + dx, top + 2.76, -15.0 + dz), (0.3, 0.8, 0.3))
    cone('Roof', (6.0, top + 3.56, -15.0), 1.25, 1.0, segments=4)
    # Houses behind the wall, roofs filling the strip past the far end.
    for x in (-6.0, -2.8, 1.8):
        house(x, -14.6 + random.uniform(-0.4, 0.4), 2.6, 2.4, room - 0.45, roof_h=0.4)
    # The orb on its plinth, the city's centrepiece, seen through the gate.
    cylinder('Stone', (0, top, -14.2), 0.6, 0.35)
    blob('Metal', (0, top + 0.95, -14.2), 0.6, squash=1.0)


def near_end():
    # Mostly under the hand, but the corners show on wide screens.
    for x in (-5.8, 5.8):
        box('Stone', (x, FLOOR, 9.5), (0.7, 0.4, 0.7))
        blob('Foliage', (x, FLOOR + 0.48, 9.5), 0.42, squash=0.7)



# ── shared pieces for the other maps ─────────────────────────────────────────

# Every set stays within |x| <= SET_HALF, so on a map change it can slide fully
# off screen beside the lanes (the game moves it by ARENA_SHIFT in TableStage).
SET_HALF = 26.0


def ground(material, y=FLOOR - 0.12, depth=48):
    """A flat outer ground that runs past the top and bottom of every screen."""
    box(material, (0, y - 0.2, 0), (SET_HALF * 2, 0.2, depth * 2))


def water(y=FLOOR - 0.7, depth=46, segments=(32, 56)):
    """A subdivided sheet: the game lifts it into waves (material Water)."""
    bm = bm_for('Water')
    made = bmesh.ops.create_grid(bm, x_segments=segments[0], y_segments=segments[1], size=1.0)['verts']
    bmesh.ops.scale(bm, vec=Vector((SET_HALF, depth, 1)), verts=made)
    bmesh.ops.translate(bm, vec=Vector((0, 0, y)), verts=made)


def sea_wall(a=10.6, b=19.0, drop=1.6, mat='Stone'):
    """A plaza on a straight-sided pier, for maps with sea around them."""
    island(a=a, b=b, slab=drop, top_mat=mat, rock=False)


def flat_house(x, z, w, d, h, wall='Plaster', trim='Stone', rot_y=0.0, parapet=0.12):
    box(wall, (x, FLOOR, z), (w, h, d), rot_y)
    if parapet:
        box(trim, (x, FLOOR + h, z), (w + 0.08, parapet, d + 0.08), rot_y)
        box(wall, (x, FLOOR + h, z), (w - 0.3, parapet + 0.01, d - 0.3), rot_y)


def street(x_in, side, z0=-16.0, z1=17.0, make=None, gap=(0.0, 0.35), width=(2.0, 2.8), depth=(2.0, 3.2)):
    """A row of buildings along one flank, front faces toward the lanes. side is -1 left, 1 right."""
    z = z0
    while z < z1:
        d = random.uniform(*depth)
        w = random.uniform(*width)
        x = side * (x_in + w / 2 + random.uniform(0, 0.3))
        make(x, z + d / 2, w, d)
        z += d + random.uniform(*gap)


def tree(x, z, h=1.2, r=0.6, crown='Foliage', trunk='Wood', squash=0.8):
    cylinder(trunk, (x, FLOOR, z), 0.07, h, segments=6)
    blob(crown, (x, FLOOR + h, z), r, squash=squash)


def palm(x, z, h=1.5, r=0.75):
    lean = random.uniform(-0.25, 0.25)
    for k in range(4):
        cylinder('Wood', (x + lean * k / 4, FLOOR + h * k / 4, z), 0.07 - k * 0.008, h / 4 + 0.02, segments=5)
    for k in range(6):
        a = k * math.pi / 3 + random.random() * 0.3
        blob('Foliage', (x + lean + math.cos(a) * r * 0.5, FLOOR + h - 0.05, z + math.sin(a) * r * 0.5), r * 0.45, squash=0.25)


def crystals(x, z, n=4, h=(0.5, 1.2), mat='Glow', spread=0.45):
    for _ in range(n):
        cone(mat, (x + random.uniform(-spread, spread), FLOOR - 0.1, z + random.uniform(-spread, spread)),
             random.uniform(0.1, 0.2), random.uniform(*h), segments=5, rot_y=random.random())


def pad(x, z, r=0.75):
    """A teleporter-style pad: glowing rim, metal plate."""
    cylinder('Glow', (x, FLOOR, z), r, 0.05, segments=16)
    cylinder('Metal', (x, FLOOR, z), r * 0.82, 0.08, segments=16)


def crack(points, width=0.09, mat='Glow'):
    """A glowing zigzag along the floor through the given (x, z) points."""
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        dx, dz = x1 - x0, z1 - z0
        length = math.hypot(dx, dz)
        box(mat, ((x0 + x1) / 2, FLOOR - 0.005, (z0 + z1) / 2), (width, 0.035, length + width), math.atan2(dx, dz))


def zigzag(x0, z0, x1, z1, steps=6, jag=0.5):
    pts = []
    for k in range(steps + 1):
        t = k / steps
        off = 0 if k in (0, steps) else random.uniform(-jag, jag)
        pts.append((x0 + (x1 - x0) * t + off, z0 + (z1 - z0) * t + off * 0.5))
    return pts


def tiered_roof(x, y, z, w, tiers=2, mat='Roof', rise=0.32):
    for k in range(tiers):
        size = w * (1 - k * 0.3)
        cone(mat, (x, y + k * rise * 0.9, z), size * 0.75, rise, segments=4, rot_y=math.pi / 4, top=size * 0.2 if k < tiers - 1 else 0.0)


def container(x, z, level=0, mat='Accent', rot_y=0.0, snow=True):
    h = 0.62
    box(mat, (x, FLOOR + level * h, z), (0.82, h - 0.02, 2.0), rot_y)
    box('Metal', (x, FLOOR + level * h, z + 1.0), (0.8, h - 0.06, 0.04), rot_y)
    if snow:
        box('Snow', (x, FLOOR + (level + 1) * h - 0.02, z), (0.86, 0.05, 2.04), rot_y)


def deep_block(x, z, w, d, top, bottom=-16.0, mat='Concrete', roof_mat='Stone'):
    """A tall building rising from far below, its roof under the plaza's edge level."""
    box(mat, (x, bottom, z), (w, top - bottom, d))
    box(roof_mat, (x, top, z), (w + 0.06, 0.08, d + 0.06))


def lamp(x, z, h=1.3):
    box('Metal', (x, FLOOR, z), (0.06, h, 0.06))
    blob('Glow', (x, FLOOR + h, z), 0.13)


# ── Bind: a desert trading town with teleporters ─────────────────────────────

def build_bind():
    random.seed(21)
    ground('Sand')
    island(a=10.8, b=19.0, slab=0.25, rock=False)
    slabs(70, size=(1.3, 2.4), tilt=0.0)
    patches(10, 'Sand', radius=(1.2, 2.4))
    def block(x, z, w, d):
        h = random.uniform(0.9, CEIL - FLOOR - 0.15)
        flat_house(x, z, w, d, h, wall=random.choice(['Plaster', 'Plaster', 'Stone']))
        if random.random() < 0.3:
            blob('Plaster', (x, FLOOR + h + 0.05, z), min(w, d) * 0.32, squash=0.8)
        box('Wood', (x - math.copysign(w / 2 + 0.01, x), FLOOR, z), (0.04, 0.7, 0.5))
    street(7.3, -1, make=block)
    # Right: market stalls, palms and the teleporter, away from the enemy bench.
    for z in (-12.0, 6.0, 13.0):
        box('Wood', (7.4, FLOOR, z), (0.9, 0.5, 1.7))
        for k in range(4):
            box('Accent' if k % 2 == 0 else 'Plaster', (7.2, FLOOR + 1.05, z - 0.67 + k * 0.45), (1.3, 0.05, 0.45))
    pad(8.2, -7.5, 0.9)
    pad(-6.6, 9.5, 0.6)
    for z in (-15.0, -9.5, 2.5, 9.0, 16.0):
        palm(9.6, z + random.uniform(-0.5, 0.5))
    for z in (-14.0, 4.0):
        palm(-6.4, z, h=1.3)
    # Dunes past the plaza.
    for _ in range(14):
        side = random.choice((-1, 1))
        blob('Sand', (side * random.uniform(12, 20), FLOOR - 0.4, random.uniform(-20, 20)), random.uniform(2.0, 3.5), squash=0.3)
    # Far end: the twin towers of the town gate.
    top = FLOOR + 0.5
    box('Stone', (0, FLOOR, -15.0), (15.0, 0.5, 6.0))
    for x in (-2.2, 2.2):
        box('Plaster', (x, top, -12.6), (1.6, 3.2, 1.6))
        box('Stone', (x, top + 3.2, -12.6), (1.8, 0.14, 1.8))
    box('Plaster', (0, top + 1.8, -12.6), (2.8, 0.5, 0.8))
    for x in (-6.2, 6.0):
        flat_house(x, -13.8, 3.0, 2.6, CEIL - top - 0.2)


# ── Breeze: a white sea fort on a tropical beach ─────────────────────────────

def build_breeze():
    random.seed(31)
    water(y=FLOOR - 0.9)
    sea_wall(a=9.8, b=19.0, drop=2.4)
    flagstones(row=(1.2, 1.2), stone=(2.2, 2.9), width=0.07)
    # A sand bank under the right edge, sloping into the sea.
    for z in range(-18, 19, 3):
        blob('Sand', (11.0 + random.uniform(-0.4, 0.4), FLOOR - 1.1, z), random.uniform(1.6, 2.2), squash=0.35)
    # Left: fort walls with arches and a few palms on top.
    for z in range(-16, 18, 4):
        arch('Stone', (-7.6, FLOOR, z), 3.8, 1.6, 0.6, rot_y=math.pi / 2)
    box('Stone', (-9.2, FLOOR, 0), (2.4, 1.9, 36))
    for z in (-14.0, -7.0, 1.5, 8.0, 15.0):
        palm(-9.0, z, h=1.0)
    # Right: rocks, palms and a pier out into the water.
    for z in (-15.0, -9.0, 4.5, 11.0, 17.0):
        palm(8.4 + random.uniform(-0.3, 0.6), z, h=1.4)
    for z in (-12.0, 7.5, 14.0):
        blob('Rock', (9.4, FLOOR - 0.3, z), random.uniform(0.6, 0.9), squash=0.7)
    box('Wood', (12.5, FLOOR - 0.5, 8.0), (5.0, 0.12, 1.1))
    for x in (10.6, 12.0, 13.4, 14.8):
        for dz in (-0.5, 0.5):
            box('Wood', (x, FLOOR - 1.6, 8.0 + dz), (0.12, 1.1, 0.12))
    # Far end: the fort's gate tower and a flag.
    top = FLOOR + 0.4
    box('Stone', (0, FLOOR, -14.5), (16.0, 0.4, 7.0))
    arch('Stone', (0, top, -12.4), 3.0, CEIL - top, 0.7)
    box('Stone', (-5.0, top, -12.4), (7.0, (CEIL - top) * 0.7, 0.6))
    box('Stone', (5.0, top, -12.4), (7.0, (CEIL - top) * 0.7, 0.6))
    box('Stone', (6.0, top, -15.0), (1.8, 2.4, 1.8))
    box('Metal', (6.0, top + 2.4, -15.0), (0.05, 1.2, 0.05))
    box('Accent', (6.35, top + 3.25, -15.0), (0.65, 0.35, 0.03))


# ── Haven: a mountain monastery in the forest ────────────────────────────────

def build_haven():
    random.seed(41)
    ground('Grass')
    island(a=10.6, b=19.0, slab=0.25, rock=False)
    patches(12, 'Grass', radius=(1.0, 2.2))
    discs(90)
    def temple(x, z, w, d):
        h = random.uniform(0.8, 1.3)
        box('Plaster', (x, FLOOR, z), (w, h, d))
        box('Wood', (x, FLOOR + h - 0.25, z), (w + 0.04, 0.22, d + 0.04))
        tiered_roof(x, FLOOR + h, z, max(w, d) * 0.95, tiers=2, rise=min(0.4, (CEIL - FLOOR - h) / 1.8))
    street(7.2, -1, make=temple, gap=(0.4, 1.0))
    # Right: garden terraces, trees and prayer flags strung on poles.
    for z in (-15.5, -10.0, 5.0, 10.5, 16.0):
        tree(8.0 + random.uniform(-0.3, 0.8), z, h=random.uniform(0.9, 1.4), r=random.uniform(0.6, 0.9))
    for z in (-6.5, 2.5):
        box('Stone', (8.6, FLOOR, z), (2.4, 0.3, 2.6))
        blob('Foliage', (8.6, FLOOR + 0.35, z), 0.7, squash=0.5)
    for z0 in (-13.0, 7.5):
        box('Wood', (6.8, FLOOR, z0), (0.05, 1.5, 0.05))
        box('Wood', (6.8, FLOOR, z0 + 4.0), (0.05, 1.5, 0.05))
        for k in range(9):
            box(('Accent', 'Accent2', 'Plaster')[k % 3], (6.8, FLOOR + 1.35 - math.sin(k / 8 * math.pi) * 0.25, z0 + 0.25 + k * 0.44), (0.02, 0.22, 0.3))
    # Forest past the plaza.
    for _ in range(40):
        side = random.choice((-1, 1))
        tree(side * random.uniform(11.2, 19), random.uniform(-20, 20), h=random.uniform(0.6, 1.4), r=random.uniform(0.8, 1.4))
    # Far end: the great hall with a three-tier roof.
    top = FLOOR + 0.5
    box('Stone', (0, FLOOR, -15.0), (15.0, 0.5, 6.0))
    box('Plaster', (0, top, -13.6), (4.4, 1.3, 2.6))
    box('Wood', (0, top + 1.05, -13.6), (4.5, 0.25, 2.7))
    tiered_roof(0, top + 1.3, -13.6, 4.6, tiers=3, rise=0.5)
    for x in (-5.6, 5.6):
        box('Plaster', (x, top, -13.0), (2.4, 0.9, 2.0))
        tiered_roof(x, top + 0.9, -13.0, 2.6, tiers=2, rise=0.35)
    clouds(10, x=(11.5, 18), y=(-0.8, 0.4), size=(1.0, 1.8))


# ── Icebox: a frozen shipping yard on the sea ────────────────────────────────

def build_icebox():
    random.seed(51)
    water(y=FLOOR - 0.9)
    sea_wall(a=10.2, b=19.0, drop=2.4, mat='Snow')
    seams(3.3, 'z')
    for x in (-6.1, 6.1):
        line(x, -ZH, x, ZH, 0.1, 'Marking')
    for z in (-9.0, 4.0, 12.0):
        for k in range(6):
            line(5.6, z + k * 0.35, 6.6, z + k * 0.35 + 0.5, 0.09, 'Marking')
    # Left: stacked containers, two and three high, in a few colours.
    z = -16.5
    while z < 17:
        for col, x in enumerate((-7.0, -8.0, -9.0)):
            levels = random.choice((1, 2, 2, 3)) if col else random.choice((1, 2))
            for level in range(levels):
                container(x, z, level, mat=random.choice(('Accent', 'Accent2', 'Metal', 'Accent')))
        z += 2.5
    # Right: the dock edge, bollards, crates and a crane on rails.
    for z in range(-18, 19, 3):
        cylinder('Metal', (9.6, FLOOR, z), 0.12, 0.3, segments=8)
    for z in (-12.0, 6.5, 12.5):
        box('Wood', (7.8, FLOOR, z), (0.6, 0.5, 0.6), random.random())
        box('Snow', (7.8, FLOOR + 0.5, z), (0.62, 0.05, 0.62))
    for x in (8.2, 10.2):
        box('Metal', (x, FLOOR, 0), (0.12, 0.05, 36))
    for z in (-9.0, 9.0):
        for x in (8.2, 10.2):
            box('Accent', (x, FLOOR, z), (0.22, 1.7, 0.22))
        box('Accent', (9.2, FLOOR + 1.7, z), (2.4, 0.22, 0.3))
    box('Accent', (9.2, FLOOR + 1.92, 0), (0.3, 0.2, 18.3))
    # Ice floes on the water.
    for _ in range(16):
        side = random.choice((-1, 1))
        box('Snow', (side * random.uniform(12, 20), FLOOR - 0.85, random.uniform(-20, 20)), (random.uniform(1, 2.6), 0.12, random.uniform(0.8, 2.2)), random.random())
    # Far end: a ship's hull moored behind the yard.
    top = FLOOR + 0.4
    box('Snow', (0, FLOOR, -14.5), (16.0, 0.4, 7.0))
    box('Accent', (1.0, FLOOR - 0.6, -14.2), (12.0, 1.4, 3.0))
    box('Plaster', (4.0, FLOOR + 0.8, -14.2), (2.4, 0.9, 2.2))
    box('Snow', (4.0, FLOOR + 1.7, -14.2), (2.5, 0.05, 2.3))
    for x in (-3.5, -1.0):
        container(x, -14.2, 2.2, mat='Accent2', rot_y=math.pi / 2)


# ── Split: a Tokyo high-rise district ────────────────────────────────────────

def build_split():
    random.seed(61)
    island(a=10.0, b=19.0, slab=0.4, top_mat='Concrete', rock=False)
    seams(2.6, 'x')
    for x in (-6.0, 6.0):
        dashes(x, step=0.35, length=0.18, width=0.18)
    # Left: mid-rise blocks with awnings, AC units and neon signs.
    def block(x, z, w, d):
        h = random.uniform(1.0, CEIL - FLOOR - 0.1)
        flat_house(x, z, w, d, h, wall=random.choice(['Plaster', 'Concrete', 'Accent']), trim='Concrete')
        face = x + w / 2 + 0.02
        box('Accent2', (face + 0.2, FLOOR + 0.75, z), (0.4, 0.05, d * 0.7))
        if random.random() < 0.6:
            box('Glow', (face, FLOOR + h * 0.6, z + random.uniform(-0.6, 0.6)), (0.05, 0.5, 0.18))
        box('Metal', (x, FLOOR + h + 0.12, z + random.uniform(-0.5, 0.5)), (0.4, 0.25, 0.4))
    street(6.9, -1, make=block, z0=-16.5, depth=(1.6, 2.6))
    # Right: the plaza stops at a rail, and the city drops away below it.
    box('Metal', (9.9, FLOOR + 0.5, 0), (0.08, 0.06, 36))
    for z in [i * 1.2 for i in range(-15, 16)]:
        box('Metal', (9.9, FLOOR, z), (0.05, 0.5, 0.05))
    for z in (-12.0, 6.5, 13.0):
        tree(8.6, z, h=0.9, r=0.55, crown='Accent')
    z = -20.0
    while z < 20:
        d = random.uniform(2.0, 3.6)
        deep_block(random.uniform(12.5, 16.5), z + d / 2, random.uniform(2.0, 3.2), d, FLOOR - random.uniform(1.5, 6.0))
        z += d + random.uniform(0.3, 1.2)
    z = -20.0
    while z < 20:
        d = random.uniform(2.0, 3.6)
        deep_block(-random.uniform(13.5, 17.5), z + d / 2, random.uniform(2.0, 3.2), d, FLOOR - random.uniform(1.0, 5.0))
        z += d + random.uniform(0.3, 1.2)
    # Ropes to climb, from the plaza down to the next roof.
    for z in (-8.0, 10.0):
        box('Wood', (11.2, FLOOR - 1.5, z), (2.6, 0.04, 0.04))
    # Far end: a tall tower block and the elevated walkway.
    top = FLOOR + 0.4
    box('Concrete', (0, FLOOR, -14.5), (15.0, 0.4, 7.0))
    box('Concrete', (0, top + 1.2, -12.4), (12.0, 0.25, 1.2))
    for x in (-5.0, 0.0, 5.0):
        box('Concrete', (x, top, -12.4), (0.3, 1.2, 0.3))
    box('Accent', (-4.5, top, -15.0), (3.0, 3.6, 2.6))
    box('Glow', (-3.0, top + 2.4, -13.68), (0.05, 0.9, 0.3))
    box('Plaster', (4.5, top, -15.2), (3.4, 2.4, 2.4))


# ── Fracture: a research site split by a glowing chasm ───────────────────────

def build_fracture():
    random.seed(71)
    ground('Grass', y=FLOOR - 0.12)
    island(a=10.4, b=19.0, slab=0.3, top_mat='Concrete', rock=False)
    seams(3.4, 'z', width=0.07)
    for _ in range(6):
        x0, z0 = random.uniform(-XH, XH), random.uniform(-ZH, ZH)
        crack(zigzag(x0, z0, x0 + random.uniform(-2, 2), z0 + random.uniform(2, 4), steps=5, jag=0.3), width=0.05, mat='Paving')
    # Left: the facility, concrete blocks under orange steel frames, and a dish.
    def lab(x, z, w, d):
        h = random.uniform(0.8, CEIL - FLOOR - 0.3)
        flat_house(x, z, w, d, h, wall='Concrete', trim='Accent')
        if random.random() < 0.5:
            for dz in (-d / 2 + 0.1, d / 2 - 0.1):
                box('Accent', (x + w / 2 + 0.15, FLOOR, z + dz), (0.1, h + 0.25, 0.1))
            box('Accent', (x + w / 2 + 0.15, FLOOR + h + 0.25, z), (0.1, 0.1, d))
    street(7.1, -1, make=lab, gap=(0.2, 0.8))
    cylinder('Metal', (-8.4, FLOOR + 1.6, -2.0), 0.08, 0.5)
    cone('Plaster', (-8.4, FLOOR + 2.1, -2.0), 0.7, 0.25, segments=12, top=0.68)
    # Right: the floor breaks off into the chasm, energy glowing far below.
    for z in range(-18, 19, 2):
        blob('Rock', (10.6 + random.uniform(-0.4, 0.4), FLOOR - 0.6, z), random.uniform(0.6, 1.0), squash=0.8)
    box('Glow', (16.0, FLOOR - 9.0, 0), (6.0, 0.2, 44.0))
    for z in range(-20, 21, 3):
        blob('Rock', (12.6 + random.uniform(0, 1.5), FLOOR - random.uniform(2, 6), z), random.uniform(1.0, 1.8), squash=1.4)
    floaters(8, [(14.0, FLOOR - 2.2, z) for z in (-15, -10, -4, 2, 7, 12, 16, -18)])
    for z in (-12.5, 6.0, 13.5):
        tree(8.3, z, h=1.0, r=0.8)
    for _ in range(18):
        tree(-random.uniform(11.5, 18), random.uniform(-20, 20), h=random.uniform(0.6, 1.2), r=random.uniform(0.8, 1.3))
    # A glowing crack runs across the plaza past the far end.
    crack(zigzag(-9.5, -10.5, 9.5, -10.0, steps=10, jag=0.4), width=0.14)
    # Far end: the broken tower.
    top = FLOOR + 0.4
    box('Concrete', (0, FLOOR, -15.0), (15.0, 0.4, 6.0))
    box('Concrete', (3.8, top, -14.6), (2.4, 3.0, 2.4))
    box('Accent', (3.8, top + 3.0, -14.6), (2.6, 0.2, 2.6))
    box('Concrete', (-4.0, top, -13.8), (5.0, 1.0, 2.0))
    box('Accent', (-4.0, top + 1.0, -13.8), (5.2, 0.12, 2.2))


# ── Pearl: a city under the sea ──────────────────────────────────────────────

def build_pearl():
    random.seed(81)
    ground('Sand', y=FLOOR - 0.1)
    island(a=10.6, b=19.0, slab=0.25, rock=False)
    waves()
    # Left: tall narrow houses with tiled roofs, in mixed plaster colours.
    def house_tall(x, z, w, d):
        roof_h = 0.35
        h = random.uniform(1.0, CEIL - FLOOR - roof_h)
        box(random.choice(('Plaster', 'Accent', 'Accent2', 'Plaster')), (x, FLOOR, z), (w, h, d))
        roof('Roof', (x, FLOOR + h, z), (w, roof_h, d))
        for dz in (-d / 4, d / 4):
            box('Wood', (x + w / 2 + 0.01, FLOOR + h * 0.55, z + dz), (0.03, 0.35, 0.22))
    street(7.2, -1, make=house_tall, width=(1.6, 2.2), depth=(1.6, 2.2), gap=(0.0, 0.1))
    # Right: a fountain plaza, lamps and kelp swaying past the edge.
    cylinder('Stone', (8.2, FLOOR, 8.5), 1.2, 0.3, segments=16)
    cylinder('Water', (8.2, FLOOR + 0.05, 8.5), 1.05, 0.3, segments=16)
    cylinder('Stone', (8.2, FLOOR, 8.5), 0.15, 0.9, segments=8)
    for z in (-14.0, -8.0, 4.0, 13.0):
        lamp(7.2, z)
    for _ in range(26):
        side = random.choice((-1, 1))
        x = side * random.uniform(11.3, 17)
        zz = random.uniform(-20, 20)
        for k in range(random.randint(2, 4)):
            cone('Foliage', (x + random.uniform(-0.4, 0.4), FLOOR - 0.1, zz + random.uniform(-0.4, 0.4)), 0.12, random.uniform(1.0, 2.2), segments=4)
    for _ in range(10):
        blob('Rock', (random.choice((-1, 1)) * random.uniform(11, 18), FLOOR - 0.2, random.uniform(-20, 20)), random.uniform(0.6, 1.4), squash=0.6)
    # Far end: the great glass dome over the city hall.
    top = FLOOR + 0.4
    box('Stone', (0, FLOOR, -15.0), (15.0, 0.4, 6.0))
    box('Plaster', (0, top, -14.0), (5.0, 1.2, 3.2))
    blob('Metal', (0, top + 1.2, -14.0), 1.5, squash=0.75)
    for x in (-5.6, 5.6):
        box('Accent2', (x, top, -13.4), (2.6, 1.0, 2.2))
        roof('Roof', (x, top + 1.0, -13.4), (2.6, 0.35, 2.2))


# ── Lotus: temple ruins in the jungle ────────────────────────────────────────

def build_lotus():
    random.seed(91)
    ground('Grass')
    island(a=10.6, b=19.0, slab=0.3, rock=False)
    rings((2.0, 2.6, 3.6, 5.0, 6.8, 8.8), spokes=16)
    # Left: stepped stone shrines, overgrown.
    def shrine(x, z, w, d):
        h = random.uniform(0.5, 0.9)
        for k in range(3):
            box('Stone', (x, FLOOR + k * h / 3 * 1.0, z), (w - k * 0.45, h / 3, d - k * 0.45))
        if random.random() < 0.6:
            blob('Foliage', (x + random.uniform(-0.4, 0.4), FLOOR + h, z), 0.5, squash=0.6)
        if random.random() < 0.4:
            cone('Stone', (x, FLOOR + h, z), 0.35, CEIL - FLOOR - h - 0.1, segments=6)
    street(7.2, -1, make=shrine, gap=(0.3, 0.9))
    # Right: a lotus pool, pink blossoms, a red-leaf tree.
    box('Stone', (8.4, FLOOR, 8.5), (3.0, 0.15, 6.0))
    box('Water', (8.4, FLOOR + 0.02, 8.5), (2.6, 0.15, 5.6))
    for _ in range(9):
        cylinder('Foliage', (8.4 + random.uniform(-1.0, 1.0), FLOOR + 0.18, 8.5 + random.uniform(-2.4, 2.4)), random.uniform(0.15, 0.28), 0.02, segments=8)
    for _ in range(5):
        cone('Accent', (8.4 + random.uniform(-1.0, 1.0), FLOOR + 0.18, 8.5 + random.uniform(-2.4, 2.4)), 0.13, 0.16, segments=6)
    box('Stone', (8.4, FLOOR, -11.0), (3.0, 0.15, 5.0))
    box('Water', (8.4, FLOOR + 0.02, -11.0), (2.6, 0.15, 4.6))
    tree(9.2, -6.5, h=1.2, r=0.9, crown='Accent2')
    tree(9.5, 15.0, h=1.0, r=0.8, crown='Accent2')
    for _ in range(36):
        side = random.choice((-1, 1))
        tree(side * random.uniform(11.2, 19), random.uniform(-20, 20), h=random.uniform(0.6, 1.4), r=random.uniform(0.8, 1.4),
             crown=random.choice(('Foliage', 'Foliage', 'Foliage', 'Accent2')))
    # Far end: the round stone door and a waterfall pouring past it.
    top = FLOOR + 0.5
    box('Stone', (0, FLOOR, -15.0), (15.0, 0.5, 6.0))
    box('Stone', (0, top, -13.2), (11.0, CEIL - top - 0.2, 0.8))
    bm = bm_for('Plaster')
    made = bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=1.3, radius2=1.3, depth=0.4)['verts']
    bmesh.ops.rotate(bm, verts=made, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=to_blender(0, top + 1.3, -12.7), verts=made)
    box('Water', (-6.2, FLOOR - 0.6, -13.6), (1.2, 2.2, 0.2))
    box('Water', (-6.2, FLOOR, -12.6), (2.4, 0.1, 2.2))


# ── Sunset: an LA street at golden hour ──────────────────────────────────────

def build_sunset():
    random.seed(101)
    ground('Concrete', y=FLOOR - 0.06)
    island(a=10.6, b=19.0, slab=0.2, top_mat='Stone', rock=False)
    for x in (-6.0, 6.0):
        dashes(x, step=1.6, length=0.9, width=0.09)
    for k in range(-5, 6):
        line(k * 0.9, -8.6, k * 0.9, -7.4, 0.35, 'Marking')
    slabs(14, size=(1.2, 2.4), tilt=0.4)
    # Left: stucco shops with awnings and signs.
    def shop(x, z, w, d):
        h = random.uniform(0.9, CEIL - FLOOR - 0.15)
        flat_house(x, z, w, d, h, wall=random.choice(('Plaster', 'Plaster', 'Accent2')), trim='Plaster')
        face = x + w / 2
        box(random.choice(('Accent', 'Roof')), (face + 0.25, FLOOR + 0.8, z), (0.5, 0.05, d * 0.8))
        box('Glow', (face + 0.02, FLOOR + h - 0.3, z), (0.04, 0.2, d * 0.5))
    street(7.2, -1, make=shop)
    # Right: a food truck, palms, street lamps and the glowing cracks.
    box('Accent', (8.4, FLOOR + 0.2, 8.5), (1.2, 1.0, 2.8))
    box('Plaster', (8.4, FLOOR + 1.2, 8.5), (1.22, 0.06, 2.82))
    for dz in (-0.9, 0.9):
        for dx in (-0.6, 0.6):
            cylinder('Metal', (8.4 + dx, FLOOR, 8.5 + dz), 0.2, 0.2, segments=8)
    for z in (-15.0, -9.0, 4.0, 14.0):
        palm(9.6, z, h=1.6)
    for z in (-12.0, 12.0):
        lamp(7.0, z)
    for k in range(5):
        x0 = random.uniform(6.0, 9.5) * random.choice((-1, 1))
        z0 = random.uniform(-16, 16)
        crack(zigzag(x0, z0, x0 + random.uniform(-2, 2), z0 + random.uniform(2.5, 4.5), steps=5, jag=0.35))
    crack(zigzag(-8.0, -10.5, 8.0, -10.2, steps=9, jag=0.45))
    # Far end: the mall front with a glowing beam.
    top = FLOOR + 0.3
    box('Stone', (0, FLOOR, -15.0), (15.0, 0.3, 6.0))
    box('Plaster', (0, top, -13.4), (13.0, CEIL - top - 0.1, 1.2))
    box('Concrete', (0, top, -13.4), (2.6, 2.6, 1.6))
    box('Glow', (0, top + 0.3, -12.58), (0.12, 2.1, 0.05))
    for x in (-4.0, 4.0):
        box('Glow', (x, top + 0.6, -12.79), (2.4, 0.06, 0.05))


# ── Abyss: a fortress on rocks over a bottomless drop ────────────────────────

def build_abyss():
    random.seed(111)
    island(a=10.4, b=19.0, depth=10.0, rings=7)
    slabs(150, size=(0.7, 1.5), tilt=0.35)
    # Left: dark stone keep walls with slate roofs and timber scaffolds.
    def keep(x, z, w, d):
        roof_h = 0.45
        h = random.uniform(0.9, CEIL - FLOOR - roof_h)
        box('Stone', (x, FLOOR, z), (w, h, d))
        roof('Roof', (x, FLOOR + h, z), (w, roof_h, d))
        if random.random() < 0.4:
            for dz in (-d / 2 + 0.1, d / 2 - 0.1):
                box('Wood', (x + w / 2 + 0.3, FLOOR, z + dz), (0.07, h * 0.8, 0.07))
            box('Wood', (x + w / 2 + 0.3, FLOOR + h * 0.8, z), (0.5, 0.05, d))
    street(7.3, -1, make=keep, gap=(0.1, 0.5))
    # Right: no wall at the edge, only glowing crystals growing out of the cliff.
    for z in (-15.0, -9.0, 4.5, 10.0, 16.0):
        crystals(9.4 + random.uniform(-0.3, 0.6), z, n=random.randint(3, 5))
    for z in (-12.0, 7.0):
        box('Wood', (7.6, FLOOR, z), (0.7, 0.45, 0.7), random.random())
    floaters(10, [(random.choice((-1, 1)) * random.uniform(12.5, 16), FLOOR - random.uniform(1.0, 3.0), z) for z in range(-18, 19, 4)])
    clouds(16, x=(10.5, 16), y=(-9.0, -5.5), size=(1.0, 2.0), prefix='Mist')
    # Far end: a stone arch bridge out to another rock.
    top = FLOOR + 0.3
    box('Stone', (0, FLOOR, -14.0), (13.0, 0.3, 4.0))
    arch('Stone', (0, top, -12.3), 3.4, CEIL - top, 0.8)
    for x in (-4.5, 4.5):
        box('Stone', (x, top, -12.3), (5.6, (CEIL - top) * 0.7, 0.8))
    box('Stone', (0, FLOOR - 0.2, -18.0), (2.0, 0.3, 6.0))
    blob('Rock', (0, FLOOR - 3.0, -22.0), 3.0, squash=1.2)


# ── Corrode: a brick castle town eaten by purple crystal ─────────────────────

def build_corrode():
    random.seed(121)
    island(a=10.6, b=19.0, depth=8.0)
    cobbles()
    # Left: brick houses and round towers with slate cone roofs.
    def brick(x, z, w, d):
        if random.random() < 0.35:
            r = min(w, d) * 0.5
            h = random.uniform(1.0, CEIL - FLOOR - 0.5)
            cylinder('Plaster', (x, FLOOR, z), r, h, segments=10)
            cone('Roof', (x, FLOOR + h, z), r + 0.12, 0.7, segments=10)
        else:
            roof_h = 0.4
            h = random.uniform(0.9, CEIL - FLOOR - roof_h)
            box('Plaster', (x, FLOOR, z), (w, h, d))
            roof('Roof', (x, FLOOR + h, z), (w, roof_h, d))
            box('Wood', (x + w / 2 + 0.01, FLOOR, z), (0.04, 0.7, 0.45))
    street(7.2, -1, make=brick)
    # Right: crystal growths cracking up through the floor, crates, barrels.
    for z in (-14.0, -8.0, 5.0, 11.0, 16.5):
        crystals(8.4 + random.uniform(-0.6, 1.0), z, n=random.randint(3, 6), h=(0.4, 1.4))
        crack(zigzag(7.2, z - 1.0, 9.5, z + 1.2, steps=4, jag=0.3), width=0.07)
    for z in (-11.0, 8.0):
        cylinder('Wood', (7.2, FLOOR, z), 0.25, 0.5, segments=8)
        box('Wood', (7.6, FLOOR, z + 0.7), (0.5, 0.45, 0.5), random.random())
    box('Metal', (9.8, FLOOR + 0.5, 0), (0.1, 0.07, 36))
    for z in [i * 1.0 for i in range(-18, 19)]:
        box('Metal', (9.8, FLOOR, z), (0.07, 0.5, 0.07))
    # Far end: the white castle and its spire.
    top = FLOOR + 0.5
    box('Stone', (0, FLOOR, -15.0), (15.0, 0.5, 6.0))
    box('Concrete', (0, top, -13.0), (12.0, CEIL - top - 0.2, 0.8))
    box('Concrete', (4.6, top, -15.4), (2.0, 3.0, 2.0))
    cone('Roof', (4.6, top + 3.0, -15.4), 1.3, 1.6, segments=4, rot_y=math.pi / 4)
    crystals(-4.0, -13.6, n=6, h=(0.8, 1.8), spread=0.9)
    clouds(14)


# ── clouds: clusters below the island, each its own object ───────────────────

DRIFTERS = []   # (name, bmesh, location): objects the game moves


def clouds(count=18, material='Cloud', prefix='Cloud', x=(11.5, 16), y=(-6.0, -3.6), size=(0.9, 1.8)):
    made = DRIFTERS
    for i in range(count):
        bm = bmesh.new()
        side = -1 if i % 2 == 0 else 1
        cx = side * random.uniform(*x)
        cz = random.uniform(-18, 18)
        cy = random.uniform(*y)
        for _ in range(random.randint(4, 7)):
            r = random.uniform(*size)
            blob(material, (random.uniform(-2.2, 2.2), random.uniform(-0.3, 0.4), random.uniform(-1.2, 1.2)), r, squash=0.55, bm=bm)
        made.append((f'{prefix}_{len(made):02d}', bm, (cx, cy, cz), material))
    return made


def floaters(count, spots, material='Rock'):
    """Loose rock chunks that bob in place (Float_*)."""
    for i in range(count):
        bm = bmesh.new()
        at = spots[i % len(spots)]
        for _ in range(random.randint(1, 3)):
            blob(material, (random.uniform(-0.4, 0.4), random.uniform(-0.2, 0.2), random.uniform(-0.4, 0.4)), random.uniform(0.3, 0.7), squash=0.7, bm=bm)
        DRIFTERS.append((f'Float_{i:02d}', bm, at, material))


# ── assemble and export ──────────────────────────────────────────────────────

COLOURS = {   # Blender-side colours, only so a render here reads; the game recolours.
    'Stone': (0.42, 0.40, 0.37), 'Paving': (0.30, 0.29, 0.27), 'Plaster': (0.62, 0.58, 0.52),
    'Roof': (0.45, 0.22, 0.15), 'Wood': (0.22, 0.15, 0.10), 'Metal': (0.25, 0.32, 0.40),
    'Foliage': (0.18, 0.28, 0.17), 'Rock': (0.25, 0.23, 0.22), 'Cloud': (0.9, 0.92, 0.95),
    'Sand': (0.7, 0.6, 0.42), 'Grass': (0.2, 0.3, 0.16), 'Snow': (0.85, 0.88, 0.92), 'Water': (0.1, 0.4, 0.5),
    'Glow': (0.3, 0.8, 1.0), 'Marking': (0.7, 0.6, 0.2), 'Accent': (0.6, 0.2, 0.15), 'Accent2': (0.15, 0.4, 0.45), 'Concrete': (0.45, 0.45, 0.45),
}


def material(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    r, g, b = COLOURS[name]
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
    bsdf.inputs['Roughness'].default_value = 0.95
    return mat


def to_object(name, bm, location=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    obj.location = to_blender(*location)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_ascent():
    random.seed(11)
    island()
    flagstones()
    left_street()
    right_terrace()
    far_end()
    near_end()
    clouds()


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    which = (argv[0] if argv else 'ascent').lower()
    out = argv[1] if len(argv) > 1 else f'public/assets/arena3d/{which}.glb'
    builders = {
        'ascent': build_ascent, 'bind': build_bind, 'breeze': build_breeze, 'haven': build_haven,
        'icebox': build_icebox, 'split': build_split, 'fracture': build_fracture, 'pearl': build_pearl,
        'lotus': build_lotus, 'sunset': build_sunset, 'abyss': build_abyss, 'corrode': build_corrode,
    }
    if which not in builders:
        raise SystemExit(f'No arena for {which}. Known: {", ".join(builders)}')

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    builders[which]()

    # Static: one object holding one mesh per material, joined.
    parts = []
    for name, bm in MESHES.items():
        obj = to_object(f'Static_{name}', bm)
        obj.data.materials.append(material(name))
        parts.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = 'Static'
    parts[0].data.name = 'Static'

    for name, bm, at, mat in DRIFTERS:
        obj = to_object(name, bm, at)
        obj.data.materials.append(material(mat))

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out), export_format='GLB', export_apply=True,
        export_normals=False, export_materials='EXPORT',
        export_cameras=False, export_lights=False, export_yup=True,
    )
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    print(f'ARENA {which}: {os.path.getsize(out) / 1024:.0f} KB, {tris} triangles -> {out}')


main()
