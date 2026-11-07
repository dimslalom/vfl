# Cutscene renderer with MPFB humans, BVH poses, toon shading and ink outlines.
# Run from vfl/:
#   BLENDER_USER_RESOURCES=tools/blender/.bluser Blender -b --factory-startup -P tools/blender/human.py -- out.png
import os, sys, math, bpy, addon_utils
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'assets')
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/frame.png'

addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

def hexc(h):
    h = h.lstrip('#')
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)) + (1,)

def toon(name, lit, shade, pants=None, shoes=None):
    """Two-tone cel material. Body variant paints pants/shoes from undeformed coords."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    d = n.new('ShaderNodeBsdfDiffuse'); s = n.new('ShaderNodeShaderToRGB')
    r = n.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'CONSTANT'
    r.color_ramp.elements[1].position = 0.3
    r.color_ramp.elements[0].color = (0.55, 0.55, 0.55, 1); r.color_ramp.elements[1].color = (1, 1, 1, 1)
    mul = n.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
    e = n.new('ShaderNodeEmission'); o = n.new('ShaderNodeOutputMaterial')
    l.new(d.outputs[0], s.inputs[0]); l.new(s.outputs[0], r.inputs[0])
    l.new(r.outputs[0], mul.inputs[6]); l.new(mul.outputs[2], e.inputs[0]); l.new(e.outputs[0], o.inputs[0])
    base = hexc(lit)
    if pants:
        tc = n.new('ShaderNodeTexCoord'); sep = n.new('ShaderNodeSeparateXYZ'); l.new(tc.outputs['Generated'], sep.inputs[0])
        def lt(a, b):  # a < b
            m_ = n.new('ShaderNodeMath'); m_.operation = 'LESS_THAN'; l.new(a, m_.inputs[0]); m_.inputs[1].default_value = b; return m_.outputs[0]
        cx = n.new('ShaderNodeMath'); cx.operation = 'SUBTRACT'; l.new(sep.outputs[0], cx.inputs[0]); cx.inputs[1].default_value = 0.5
        ax = n.new('ShaderNodeMath'); ax.operation = 'ABSOLUTE'; l.new(cx.outputs[0], ax.inputs[0])
        leg = n.new('ShaderNodeMath'); leg.operation = 'MULTIPLY'; l.new(lt(sep.outputs[2], 0.6), leg.inputs[0]); l.new(lt(ax.outputs[0], 0.3), leg.inputs[1])
        foot = n.new('ShaderNodeMath'); foot.operation = 'MULTIPLY'; l.new(lt(sep.outputs[2], 0.045), foot.inputs[0]); l.new(leg.outputs[0], foot.inputs[1])
        a = n.new('ShaderNodeMix'); a.data_type = 'RGBA'; l.new(leg.outputs[0], a.inputs[0])
        a.inputs[6].default_value = base; a.inputs[7].default_value = hexc(pants)
        b = n.new('ShaderNodeMix'); b.data_type = 'RGBA'; l.new(foot.outputs[0], b.inputs[0])
        l.new(a.outputs[2], b.inputs[6]); b.inputs[7].default_value = hexc(shoes)
        l.new(b.outputs[2], mul.inputs[7])
    else:
        mul.inputs[7].default_value = base
    return m

def silhouette(name, rim):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    lw = n.new('ShaderNodeLayerWeight'); lw.inputs[0].default_value = 0.5
    r = n.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'CONSTANT'
    r.color_ramp.elements[0].color = hexc('#05090d'); r.color_ramp.elements[1].position = 0.82
    r.color_ramp.elements[1].color = hexc(rim)
    e = n.new('ShaderNodeEmission'); o = n.new('ShaderNodeOutputMaterial')
    l.new(lw.outputs['Facing'], r.inputs[0]); l.new(r.outputs[0], e.inputs[0]); l.new(e.outputs[0], o.inputs[0])
    return m

def paint(objs, mat):
    for o in objs:
        if o.type in ('MESH', 'CURVES'):
            o.data.materials.clear(); o.data.materials.append(mat)

def apply_bvh(rig, pose_name):
    """Retarget a MakeHuman BVH pose onto an MPFB default rig (bone names match)."""
    path = os.path.join(ASSETS, 'poses', pose_name, pose_name + '.bvh')
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, global_scale=0.1, frame_start=1, use_fps_scale=False, axis_forward='-Z', axis_up='Y')
    src = (set(bpy.data.objects) - before).pop()
    bpy.context.scene.frame_set(1)
    order = []
    def walk(b):
        order.append(b)
        for c in b.children: walk(c)
    for b in rig.pose.bones:
        if b.parent is None: walk(b)
    for pb in order:
        sb = src.pose.bones.get(pb.name)
        if not sb: continue
        # world-space delta of the source bone, applied to the target's rest orientation
        src_rest = (src.matrix_world @ sb.bone.matrix_local).to_3x3()
        src_pose = (src.matrix_world @ sb.matrix).to_3x3()
        delta = src_pose @ src_rest.inverted()
        tgt_rest = (rig.matrix_world @ pb.bone.matrix_local).to_3x3()
        cur = rig.matrix_world @ pb.matrix
        want = (delta @ tgt_rest).to_4x4(); want.translation = cur.translation
        pb.matrix = rig.matrix_world.inverted() @ want
        bpy.context.view_layer.update()
    bpy.data.objects.remove(src)

def human(tag, shirt, pose, at, facing_deg, kit, gender=1.0, hair=None):
    macro = TargetService.get_default_macro_info_dict()
    macro['gender'] = gender; macro['muscle'] = 0.6; macro['height'] = 0.55
    body = HumanService.create_human(macro_detail_dict=macro)
    rig = HumanService.add_builtin_rig(body, 'default')
    for c in shirt:  # clothes, shoes and hair are all mhclo assets fitted to the body
        kind = 'hair' if os.path.isdir(os.path.join(ASSETS, 'hair', c)) else 'clothes'
        HumanService.add_mhclo_asset(os.path.join(ASSETS, kind, c, c + '.mhclo'), body, asset_type=kind.capitalize(), subdiv_levels=0)
    rig.name = tag
    apply_bvh(rig, pose)
    rig.location = (at[0], at[1], 0); rig.rotation_euler = (0, 0, math.radians(facing_deg))
    for o in [o for o in bpy.data.objects if o.parent in (rig, body)] + [body]:
        nm = o.name.lower()
        key = 'skin' if o is body else next((k for k, w in (('hair', 'hair'), ('shoes', 'shoe'), ('shoes', 'boot'), ('pants', 'pant')) if w in nm), 'shirt')
        paint([o], flat(tag + o.name, kit[key]))
    return rig

def flat(name, base, glow=None, strength=1.0):
    """Posterised set material: three hard light bands of one palette colour, or a flat glow."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    o = n.new('ShaderNodeOutputMaterial'); e = n.new('ShaderNodeEmission')
    if glow:
        e.inputs[0].default_value = hexc(glow); e.inputs[1].default_value = strength
    else:
        d = n.new('ShaderNodeBsdfDiffuse'); d.inputs[0].default_value = hexc(base)
        s_ = n.new('ShaderNodeShaderToRGB'); r = n.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'CONSTANT'
        c = hexc(base)
        r.color_ramp.elements[0].color = tuple(v * 0.35 for v in c[:3]) + (1,)
        r.color_ramp.elements[1].position = 0.04; r.color_ramp.elements[1].color = tuple(v * 0.7 for v in c[:3]) + (1,)
        el = r.color_ramp.elements.new(0.18); el.color = c
        tint = n.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'; tint.inputs[0].default_value = 0.5
        l.new(d.outputs[0], s_.inputs[0]); l.new(s_.outputs[0], r.inputs[0])
        l.new(r.outputs[0], tint.inputs[6]); l.new(s_.outputs[0], tint.inputs[7])
        mx = n.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs[0].default_value = 0.25
        l.new(r.outputs[0], mx.inputs[6]); l.new(s_.outputs[0], mx.inputs[7])
        l.new(mx.outputs[2], e.inputs[0])
    l.new(e.outputs[0], o.inputs[0])
    return m

def box(name, loc, size, mat, rot=(0, 0, 0), bevel=0.0):
    me = bpy.data.meshes.new(name); bm = __import__('bmesh').new()
    __import__('bmesh').ops.create_cube(bm, size=1); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    ob.location = loc; ob.scale = size; ob.rotation_euler = [math.radians(a) for a in rot]
    ob.data.materials.append(mat)
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 2
    return ob

def cyl(name, loc, r, h, mat, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = __import__('bmesh').new()
    __import__('bmesh').ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=r, depth=h); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    ob.location = loc; ob.rotation_euler = [math.radians(a) for a in rot]; ob.data.materials.append(mat)
    return ob

def label(text, loc, size, mat, rot=(90, 0, 0)):
    cu = bpy.data.curves.new(text, 'FONT'); cu.body = text; cu.size = size; cu.align_x = 'CENTER'; cu.extrude = 0.005
    ob = bpy.data.objects.new(text, cu); bpy.context.collection.objects.link(ob)
    ob.location = loc; ob.rotation_euler = [math.radians(a) for a in rot]; ob.data.materials.append(mat)
    return ob

def corridor():
    """Backstage corridor of an esports arena, lit from the open stage door."""
    wall = flat('wall', '#2b3a4a'); floor = flat('floor', '#1f2b38'); trim = flat('trim', '#3a4b5c')
    dark = flat('dark', '#141c25'); case = flat('case', '#262f38'); metal = flat('metal', '#7d8a97')
    red = flat('red', '#ff4655'); seam = flat('seam', '#0f1923')
    W, Y0, Y1, H = 1.6, -7.0, 3.0, 3.0
    L = Y1 - Y0; cy = (Y0 + Y1) / 2
    box('floor', (0, cy, -0.05), (2 * W, L, 0.1), floor)
    for i in range(int(L / 0.6)):  # floor tile joints
        box(f'tile{i}', (0, Y0 + i * 0.6, 0.001), (2 * W, 0.012, 0.002), seam)
    box('lane', (0, cy, 0.002), (0.06, L, 0.002), flat('lane', '#e8c26a', glow='#e8c26a', strength=0.35))
    for sx in (-1, 1):
        box(f'wall{sx}', (sx * (W + 0.05), cy, H / 2), (0.1, L, H), wall)
        box(f'base{sx}', (sx * (W - 0.01), cy, 0.06), (0.03, L, 0.12), dark)
        box(f'rail{sx}', (sx * (W - 0.03), cy, 1.0), (0.05, L, 0.07), trim, bevel=0.01)
        for i in range(int(L / 1.2)):  # wall panel seams
            box(f'seam{sx}{i}', (sx * (W - 0.002), Y0 + i * 1.2, H / 2), (0.01, 0.015, H), seam)
        cyl(f'pipe{sx}', (sx * (W - 0.12), cy, 2.75), 0.045, L, metal, rot=(90, 0, 0))
    box('ceil', (0, cy, H + 0.05), (2 * W, L, 0.1), dark)
    tube = flat('tube', None, glow='#dfe9f2', strength=2.5)
    for y in (-5.5, -3.0, -0.5, 1.8):
        box(f'fix{y}', (0, y, H - 0.03), (0.22, 1.3, 0.06), trim)
        box(f'tube{y}', (0, y, H - 0.07), (0.12, 1.2, 0.02), tube)
    # cable tray with drooping cables along the left
    box('tray', (-W + 0.35, cy, 2.55), (0.4, L, 0.04), metal)
    for k, c in enumerate(('#ff4655', '#17e5c0', '#141c25')):
        cyl(f'cable{k}', (-W + 0.25 + k * 0.08, cy, 2.6), 0.018, L, flat(f'cab{k}', c), rot=(90, 0, 0))
    # end wall with the stage door
    dw, dh = 1.5, 2.5
    for sx in (-1, 1):
        box(f'end{sx}', (sx * (dw / 2 + (W - dw / 2) / 2), Y1, H / 2), (W - dw / 2, 0.15, H), wall)
        box(f'jamb{sx}', (sx * (dw / 2 + 0.04), Y1 - 0.08, dh / 2), (0.08, 0.06, dh), trim, bevel=0.01)
    box('lintel', (0, Y1, dh + (H - dh) / 2), (dw, 0.15, H - dh), wall)
    box('head', (0, Y1 - 0.08, dh + 0.04), (dw + 0.16, 0.06, 0.08), trim)
    box('leaf', (dw / 2 - 0.05, Y1 - 0.42, dh / 2), (0.05, 0.72, dh - 0.05), case, rot=(0, 0, 18), bevel=0.01)
    box('bar', (dw / 2 - 0.1, Y1 - 0.42, 1.05), (0.04, 0.55, 0.05), metal, rot=(0, 0, 18))
    box('stage', (0, Y1 + 2.5, H), (8, 0.1, 8), flat('stage', None, glow='#6fc3ec', strength=1.6), rot=(0, 0, 0))
    box('exitbox', (0, Y1 - 0.09, dh + 0.3), (0.5, 0.06, 0.2), dark)
    label('EXIT', (0, Y1 - 0.13, dh + 0.25), 0.13, flat('exit', None, glow='#ff4655', strength=3))
    # posters on the left wall: team sheets in home gold
    for i, y in enumerate((-3.2, -1.4)):
        box(f'frame{i}', (-W + 0.02, y, 1.75), (0.03, 1.0, 1.35), dark)
        box(f'poster{i}', (-W + 0.04, y, 1.75), (0.01, 0.9, 1.25), flat(f'pst{i}', '#1f2b38'))
        box(f'pband{i}', (-W + 0.05, y, 2.15), (0.01, 0.9, 0.12), flat(f'pb{i}', None, glow='#e8c26a', strength=0.6))
        box(f'pfig{i}', (-W + 0.05, y, 1.6), (0.01, 0.38, 0.62), flat(f'pf{i}', '#0f1923'))
    # Stallions banner on the right, they own this hallway tonight
    box('banner', (W - 0.03, -2.4, 1.9), (0.01, 1.2, 1.6), flat('ban', '#123a52'))
    box('bstripe', (W - 0.04, -2.4, 1.9), (0.01, 0.12, 1.6), flat('bs', None, glow='#18b6f0', strength=1.2))
    label('SE', (W - 0.045, -2.4, 2.2), 0.35, flat('se', None, glow='#18b6f0', strength=1.5), rot=(90, 0, -90))
    # flight cases, bench, extinguisher
    box('case1', (W - 0.45, -0.9, 0.3), (0.7, 0.55, 0.6), case, bevel=0.02)
    box('case2', (W - 0.45, -0.9, 0.82), (0.6, 0.5, 0.44), case, rot=(0, 0, 6), bevel=0.02)
    for dz in (0.05, 0.55, 0.62, 1.02):
        box(f'edge{dz}', (W - 0.45, -1.18, dz), (0.66, 0.01, 0.03), metal)
    box('case3', (W - 0.4, 0.8, 0.25), (0.55, 0.9, 0.5), case, bevel=0.02)
    box('bench', (-W + 0.25, -5.0, 0.45), (0.4, 1.8, 0.06), trim, bevel=0.01)
    for y in (-5.75, -4.25): box(f'leg{y}', (-W + 0.25, y, 0.22), (0.35, 0.05, 0.44), dark)
    cyl('ext', (-W + 0.12, 1.9, 0.38), 0.08, 0.55, red)
    box('extsign', (-W + 0.01, 1.9, 1.1), (0.01, 0.2, 0.2), red)
    # light: cold stage glow through the door, faint fill from the tubes
    door = bpy.data.objects.new('door', bpy.data.lights.new('door', 'AREA'))
    door.data.energy = 900; door.data.size = 1.5; door.data.color = hexc('#8fd3f5')[:3]
    door.location = (0, Y1 + 0.6, 1.4); door.rotation_euler = (math.radians(-90), 0, 0)
    bpy.context.collection.objects.link(door)
    for y in (-5.5, -3.0):  # no fill near the door: figures there read as pure silhouettes
        p = bpy.data.objects.new(f'pl{y}', bpy.data.lights.new(f'pl{y}', 'POINT'))
        p.data.energy = 60; p.data.color = hexc('#dfe9f2')[:3]; p.location = (0, y, H - 0.3)
        bpy.context.collection.objects.link(p)
    haze(0.025)

def haze(density, bg='#0a121a'):
    w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True
    wn = w.node_tree.nodes; wn['Background'].inputs[0].default_value = hexc(bg)
    vol = wn.new('ShaderNodeVolumePrincipled'); vol.inputs['Density'].default_value = density
    w.node_tree.links.new(vol.outputs[0], wn['World Output'].inputs['Volume'])

def light(kind, loc, energy, color='#dfe9f2', rot=(0, 0, 0), size=1.0):
    ob = bpy.data.objects.new('L', bpy.data.lights.new('L', kind)); ob.data.energy = energy
    ob.data.color = hexc(color)[:3]; ob.location = loc; ob.rotation_euler = [math.radians(a) for a in rot]
    if kind == 'AREA': ob.data.size = size
    bpy.context.collection.objects.link(ob); return ob

def in_hand(rig, bone, name, size, mat, offset=(0, 0.06, 0)):
    """Prop held in a posed hand, e.g. a phone or a contract."""
    ob = box(name, (0, 0, 0), size, mat); ob.parent = rig; ob.parent_type = 'BONE'; ob.parent_bone = bone
    ob.location = offset; return ob

# outfits: clothes, shoes, hair (mhclo) + flat colours
BRAWK = (['toigo_basic_tucked_t-shirt', 'cortu_cargo_pants', 'toigo_mj_cloth_shoes', 'cortu_short_messy_hair'],
         {'skin': '#8a6a58', 'shirt': '#c9a24e', 'pants': '#2b3a4a', 'shoes': '#ece8e1', 'hair': '#1a1410'})
REP = (['namuhekam_male_polo_shirt', 'toigo_wool_pants', 'toigo_ankle_boots_male', 'culturalibre_hair_01'],
       {'skin': '#6e5040', 'shirt': '#1f8fc4', 'pants': '#1a222c', 'shoes': '#141c25', 'hair': '#0f0c0a'})
EXTRAS = [
    (['toigo_fisherman_sweater', 'toigo_wool_pants', 'toigo_ankle_boots_male', 'cortu_straight_bangs'], {'skin': '#9a7a62', 'shirt': '#3a4b5c', 'pants': '#141c25', 'shoes': '#0f1923', 'hair': '#2a2018'}),
    (['elvs_crude_t-shirt_male', 'cortu_cargo_pants', 'toigo_mj_cloth_shoes', 'culturalibre_hair_05'], {'skin': '#7a5848', 'shirt': '#ff4655', 'pants': '#1f2b38', 'shoes': '#ece8e1', 'hair': '#120e0c'}),
    (['namuhekam_male_polo_shirt', 'toigo_wool_pants', 'toigo_ankle_boots_male', 'littleright_bobcut_hair'], {'skin': '#b08a70', 'shirt': '#ece8e1', 'pants': '#2b3a4a', 'shoes': '#141c25', 'hair': '#3a2a1c'}),
    (['toigo_basic_tucked_t-shirt', 'cortu_cargo_pants', 'toigo_mj_cloth_shoes', 'culturalibre_hair_02'], {'skin': '#5e4234', 'shirt': '#17e5c0', 'pants': '#141c25', 'shoes': '#3a4b5c', 'hair': '#0c0a08'}),
]
def person(tag, outfit, pose, at, facing, gender=1.0):
    return human(tag, outfit[0], pose, at, facing, outfit[1], gender=gender)

def camera(loc, look, lens=40):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = lens
    bpy.context.collection.objects.link(cam); bpy.context.scene.camera = cam
    cam.location = loc; cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

# ---------- sets ----------
def scene_corridor():
    corridor()
    person('brawk', BRAWK, 'callharvey3d_standingmodestembarrassed', (-0.36, 2.0), 90)
    person('rep', REP, 'mindfront_standing_holding_wine_glass', (0.36, 2.0), -90)
    camera((0, -5.0, 1.2), (0, 3.0, 1.35))

def scene_arena():
    """02:14, rain, the arena's title-sponsor sign has gone dark. Brawk stares up at it."""
    import random; random.seed(3)
    asphalt = flat('asphalt', '#1a222c'); kerb = flat('kerb', '#3a4b5c'); facade = flat('facade', '#2b3a4a')
    dark = flat('dark', '#0f1923'); metal = flat('metal', '#7d8a97'); glass = flat('glass', None, glow='#6fc3ec', strength=0.9)
    box('road', (0, 0, -0.05), (60, 40, 0.1), asphalt)
    box('walk', (0, 6, 0.06), (60, 6, 0.12), kerb)
    for i in range(-12, 13): box(f'slab{i}', (i * 1.5, 6, 0.121), (0.02, 6, 0.002), dark)
    for i in range(-6, 7): box(f'dash{i}', (i * 4, -2, 0.001), (1.8, 0.12, 0.002), flat('dash', '#c9c3b8'))
    # arena: stepped facade, angled roof fin, glass entrance band
    box('arena', (0, 16, 6), (34, 14, 12), facade, bevel=0.1)
    box('fin', (0, 9.4, 12.6), (36, 1.2, 1.4), dark, rot=(-12, 0, 0))
    for i in range(-8, 9): box(f'rib{i}', (i * 2, 8.9, 6), (0.25, 0.3, 12), dark)
    box('lobby', (0, 8.95, 1.6), (14, 0.1, 3.2), glass)
    for i in range(-7, 8): box(f'mull{i}', (i, 8.88, 1.6), (0.08, 0.1, 3.2), dark)
    box('canopy', (0, 7.6, 3.4), (16, 3, 0.2), dark)
    # the dead sponsor sign
    box('signbox', (0, 8.7, 8.2), (16, 0.6, 3.2), dark, bevel=0.05)
    label('NOVA BANK', (0, 8.38, 7.55), 1.9, flat('deadsign', '#2b3a4a'))
    label('N', (-5.6, 8.33, 7.55), 1.9, flat('lastN', None, glow='#e8c26a', strength=0.6))  # one letter still flickering
    box('crack', (1.2, 8.35, 8.2), (0.12, 0.05, 3.0), dark, rot=(0, 18, 0))
    # street furniture
    for x in (-9, 9):
        cyl(f'pole{x}', (x, 3.4, 3), 0.08, 6, metal)
        box(f'arm{x}', (x - 0.6 * (x > 0) + 0.6 * (x < 0), 3.4, 6), (1.4, 0.15, 0.1), metal)
        box(f'lamp{x}', (x - 1.2 * (x > 0) + 1.2 * (x < 0), 3.4, 5.9), (0.6, 0.3, 0.08), flat('lamp', None, glow='#e8dcc4', strength=4))
        light('SPOT', (x - 1.2 * (x > 0) + 1.2 * (x < 0), 3.4, 5.8), 900, '#e8dcc4', rot=(0, 0, 0)).data.spot_size = math.radians(70)
    for x in range(-6, 7, 2): cyl(f'bol{x}', (x, 3.6, 0.5), 0.12, 0.9, kerb)
    box('van', (13, 0.5, 1.2), (5.2, 2.2, 2.2), flat('van', '#262f38'), bevel=0.2)
    box('vanwin', (10.45, 0.5, 1.7), (0.05, 1.9, 0.8), dark)
    for x in (11.4, 14.6):
        for y in (-0.6, 1.6): cyl(f'wh{x}{y}', (x, y, 0.4), 0.4, 0.3, dark, rot=(90, 0, 0))
    # rain
    rain = flat('rain', None, glow='#9aa3ad', strength=0.5)
    for i in range(500):
        box(f'r{i}', (random.uniform(-14, 14), random.uniform(-6, 9), random.uniform(0, 12)), (0.008, 0.008, random.uniform(0.4, 0.9)), rain, rot=(8, 4, 0))
    person('brawk', BRAWK, 'callharvey3d_standingnatural', (-2.2, 4.5), 180)
    light('SUN', (0, 0, 10), 0.4, '#6fc3ec', rot=(50, 0, 160))
    light('AREA', (0, 8.2, 1.6), 400, '#6fc3ec', rot=(90, 0, 0), size=12)
    haze(0.02)
    camera((-4.5, -9.5, 1.0), (-1.0, 8.5, 6.0), lens=26)

def scene_board():
    """Boardroom: capital chart on the wall screen, the board in silhouette."""
    wall = flat('wall', '#1f2b38'); floor = flat('floor', '#141c25'); wood = flat('wood', '#3a2e28')
    dark = flat('dark', '#0f1923'); chair = flat('chair', '#1a222c'); trim = flat('trim', '#3a4b5c')
    box('floor', (0, 0, -0.05), (10, 14, 0.1), floor)
    box('back', (0, 5, 1.6), (10, 0.1, 3.2), wall); box('ceil', (0, 0, 3.25), (10, 14, 0.1), dark)
    for sx in (-1, 1): box(f'side{sx}', (sx * 4, 0, 1.6), (0.1, 14, 3.2), wall)
    # window wall with city lights on the left
    box('win', (-3.94, 0.5, 1.7), (0.02, 7, 2.2), flat('night', '#0a121a'))
    import random; random.seed(11)
    cityglow = flat('city', None, glow='#e8c26a', strength=0.8)
    for i in range(140):
        box(f'c{i}', (-3.92, random.uniform(-2.9, 3.9), random.uniform(0.7, 2.6)), (0.01, 0.06, 0.04), cityglow)
    for y in range(-3, 5): box(f'wm{y}', (-3.9, y, 1.7), (0.05, 0.06, 2.3), trim)
    # screen with falling capital chart
    box('bezel', (0, 4.92, 1.75), (4.6, 0.06, 2.6), dark)
    box('screen', (0, 4.88, 1.75), (4.4, 0.02, 2.4), flat('scr', None, glow='#9fd8f5', strength=1.6))
    pts = [(-1.5, 2.3), (-1.0, 2.25), (-0.6, 2.3), (-0.2, 2.0), (0.2, 2.05), (0.6, 1.5), (1.0, 1.35), (1.5, 0.95)]
    hot = flat('chart', '#0a121a')
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, z1 - z0); ang = math.degrees(math.atan2(z1 - z0, x1 - x0))
        box('seg', ((x0 + x1) / 2, 4.86, (z0 + z1) / 2), (L, 0.01, 0.05), hot, rot=(0, -ang, 0))
    for z in (1.2, 1.6, 2.0, 2.4): box(f'grid{z}', (0, 4.865, z), (3.2, 0.005, 0.008), flat('grid', None, glow='#3a4b5c', strength=1))
    label('-62%', (1.2, 4.85, 2.4), 0.22, hot)
    # table and chairs
    box('table', (0, 1.0, 0.74), (1.6, 5.0, 0.06), wood, bevel=0.02)
    box('tbase', (0, 1.0, 0.37), (0.6, 4.0, 0.7), dark)
    for side in (-1, 1):
        for y in (-0.8, 0.4, 1.6, 2.8):
            box(f'seat{side}{y}', (side * 1.15, y, 0.48), (0.5, 0.5, 0.08), chair, bevel=0.02)
            box(f'cb{side}{y}', (side * 1.42, y, 0.85), (0.06, 0.48, 0.7), chair, bevel=0.02)
    for y in (-0.2, 1.8): box(f'paper{y}', (0.3, y, 0.775), (0.25, 0.32, 0.005), flat('pp', '#c9c3b8'), rot=(0, 0, 10))
    cyl('glass1', (-0.4, 2.6, 0.84), 0.035, 0.14, flat('gl', '#7d8a97'))
    person('b1', EXTRAS[0], 'jjones_leaning_on_counter_hands_folded', (-0.95, 3.6), 90)
    person('b2', EXTRAS[2], 'drednicolson_arms_akimbo', (1.0, 3.9), 200)
    person('b3', EXTRAS[1], 'callharvey3d_standingatease', (0.1, 4.3), 180)
    light('AREA', (0, 4.6, 1.75), 300, '#ff8a94', rot=(90, 0, 0), size=3)
    light('AREA', (0, 1, 3.1), 40, '#dfe9f2', size=2)
    haze(0.03)
    camera((0.3, -1.2, 1.45), (0, 4.9, 1.6), lens=30)

def scene_sell():
    """Choice 1: brawk walks out through the stage door, packs left on the floor."""
    corridor()
    person('brawk', BRAWK, 'punkduck_train_departure', (0.1, 2.2), 180)
    gold = flat('pack', '#e8c26a')
    for i, (x, y, r) in enumerate(((-0.3, -1.6, 8), (-0.05, -1.7, -6), (0.2, -1.55, 14))):
        box(f'pk{i}', (x, y, 0.02 + i * 0.012), (0.3, 0.42, 0.012), gold, rot=(0, 0, r), bevel=0.005)
    camera((0, -4.0, 1.1), (0, 3.0, 1.2), lens=40)

def scene_cut():
    """Choice 2: analyst room after the cuts. Screens off, chairs pushed in, one screen left on."""
    wall = flat('wall', '#4a5d70'); floor = flat('floor', '#2b3a4a'); desk = flat('desk', '#9aa3ad')
    dark = flat('dark', '#0a121a'); chair = flat('chair', '#3a4b5c')
    box('floor', (0, 0, -0.05), (8, 12, 0.1), floor); box('back', (0, 4, 1.5), (8, 0.1, 3), wall)
    for sx in (-1, 1): box(f's{sx}', (sx * 3, 0, 1.5), (0.1, 12, 3), wall)
    box('ceil', (0, 0, 3.05), (8, 12, 0.1), dark)
    for row, y in enumerate((-0.5, 1.5)):
        box(f'desk{row}', (0, y, 0.74), (4.4, 0.8, 0.05), desk, bevel=0.01)
        for x in (-1.5, 0, 1.5):
            on = (row == 1 and x == 1.5)
            box(f'mon{row}{x}', (x, y + 0.25, 1.05), (0.6, 0.04, 0.36), dark, bevel=0.01)
            if on: box('lit', (x, y + 0.22, 1.05), (0.54, 0.01, 0.3), flat('lit', None, glow='#6fc3ec', strength=3))
            box(f'kb{row}{x}', (x, y - 0.1, 0.775), (0.45, 0.15, 0.02), dark)
            box(f'ch{row}{x}', (x, y - 0.55, 0.48), (0.48, 0.48, 0.08), chair, bevel=0.02)
            box(f'cbk{row}{x}', (x, y - 0.78, 0.85), (0.46, 0.06, 0.65), chair, bevel=0.02)
    for i in range(3): box(f'bx{i}', (2.2, -2.2 + i * 0.05, 0.2 + i * 0.36), (0.6, 0.45, 0.35), flat('cardb', '#3a2e28'), rot=(0, 0, i * 7), bevel=0.01)
    box('sheet', (0.9, -0.4, 0.768), (0.22, 0.3, 0.003), flat('memo', '#c9c3b8'), rot=(0, 0, -12))
    light('AREA', (1.5, 1.4, 1.1), 25, '#6fc3ec', rot=(90, 0, 0), size=0.5)
    light('AREA', (-2.9, -1, 2.2), 160, '#dfe9f2', rot=(0, -90, 0), size=3)
    light('AREA', (0, 0.5, 2.9), 120, '#dfe9f2', size=3)
    haze(0.02)
    camera((-0.6, -3.6, 1.6), (0.4, 2.0, 0.9), lens=30)

def scene_crowd():
    """Choice 3: fans with phones up, funding the club themselves."""
    floor = flat('floor', '#141c25')
    box('floor', (0, 0, -0.05), (20, 20, 0.1), floor)
    box('stage', (0, 7, 0.6), (12, 4, 1.2), flat('stg', '#1f2b38'))
    box('screen', (0, 9, 3.4), (10, 0.1, 5), flat('big', None, glow='#9fd8f5', strength=1.8))
    spots = [(-1.6, 0.2, 'gpedroso_peace_and_love'), (-0.4, 0.6, 'callharvey3d_salute'), (0.8, 0.1, 'gpedroso_peace_and_love'),
             (1.9, 0.7, 'callharvey3d_salute'), (-0.9, -1.2, 'callharvey3d_standingnatural'), (0.6, -1.4, 'gpedroso_peace_and_love')]
    for i, (x, y, pose) in enumerate(spots):
        rig = person(f'f{i}', EXTRAS[i % len(EXTRAS)], pose, (x, y), 180)
        for side in ('R', 'L'):
            if 'peace' in pose or 'salute' in pose:
                in_hand(rig, f'wrist.{side}', f'ph{i}{side}', (0.07, 0.14, 0.01), flat(f'phone{i}', None, glow='#ece8e1', strength=5))
                break
    light('AREA', (0, 8.8, 3), 2500, '#6fc3ec', rot=(90, 0, 0), size=8)
    light('AREA', (0, 0, 6), 150, '#dfe9f2', size=6)
    haze(0.035)
    camera((0.2, -4.6, 1.5), (0, 6, 2.0), lens=30)


def room(w, d, h, wall='#1f2b38', floor='#141c25'):
    box('floor', (0, 0, -0.05), (w, d, 0.1), flat('rfloor', floor))
    box('back', (0, d / 2, h / 2), (w, 0.1, h), flat('rback', wall))
    for sx in (-1, 1): box(f'rside{sx}', (sx * w / 2, 0, h / 2), (0.1, d, h), flat('rside', wall))
    box('ceil', (0, 0, h + 0.05), (w, d, 0.1), flat('rceil', '#0a121a'))

def desk_row(y, xs, glow='#9fd8f5', on=True, facing=1):
    desk = flat('dk', '#2b3a4a'); dark = flat('dkd', '#0a121a'); scr = flat('scr', None, glow=glow, strength=2.2) if on else dark
    for x in xs:
        box(f'desk{x}{y}', (x, y, 0.74), (1.1, 0.6, 0.05), desk, bevel=0.01)
        box(f'leg{x}{y}', (x, y, 0.37), (1.0, 0.5, 0.7), dark)
        box(f'mon{x}{y}', (x, y + 0.2 * facing, 1.08), (0.62, 0.04, 0.38), dark, bevel=0.01)
        box(f'scr{x}{y}', (x, y + 0.17 * facing, 1.08), (0.56, 0.01, 0.32), scr)
        box(f'kb{x}{y}', (x, y - 0.08 * facing, 0.775), (0.45, 0.15, 0.02), dark)

def trophy(loc, k=1.0):
    gold = flat('gold', '#e8c26a'); x, y, z = loc
    cyl('tbase', (x, y, z + 0.06 * k), 0.12 * k, 0.12 * k, flat('tb', '#1a222c'))
    cyl('tstem', (x, y, z + 0.22 * k), 0.025 * k, 0.22 * k, gold)
    me = bpy.data.meshes.new('cup'); import bmesh as _b; bm = _b.new()
    _b.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.05 * k, radius2=0.16 * k, depth=0.26 * k); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new('cup', me); bpy.context.collection.objects.link(ob); ob.location = (x, y, z + 0.46 * k); ob.data.materials.append(gold)
    return ob

def scene_cafe():
    """Act I opens in a net cafe: five chairs, a flickering sign, monitors for light."""
    room(9, 10, 2.8, wall='#1a222c')
    for row, y in enumerate((-1.5, 0.3, 2.1)):
        desk_row(y, (-2.6, -1.3, 1.3, 2.6), on=row != 1)
    label('NET CAFE', (0, 4.92, 2.05), 0.42, flat('neon', None, glow='#ff4655', strength=5))
    box('neonbar', (0, 4.93, 1.85), (2.6, 0.02, 0.03), flat('nb', None, glow='#ff4655', strength=4))
    for i, x in enumerate((-3.5, 3.5)): box(f'poster{i}', (x, 4.93, 1.5), (0.9, 0.02, 1.2), flat(f'po{i}', '#2b3a4a'))
    for i, (x, y) in enumerate(((-2.6, 2.6), (-1.3, 2.6), (1.3, 2.6))):
        person(f'c{i}', EXTRAS[i], 'jjones_leaning_on_counter_hands_folded', (x, y - 0.95), 180)
    person('igl', BRAWK, 'callharvey3d_standingnatural', (0.0, 0.9), 0)
    light('AREA', (0, 4.6, 2.2), 120, '#ff6b78', rot=(90, 0, 0), size=3)
    haze(0.03)
    camera((0.5, -4.6, 1.5), (0, 4.0, 1.3), lens=30)

def scene_locker():
    """Locker room: the IGL at the whiteboard, the squad listening."""
    room(7, 8, 2.8, wall='#22303e')
    lock = flat('lock', '#3a4b5c'); dark = flat('ld', '#0f1923')
    for sx in (-1, 1):
        for i in range(7):
            y = -3 + i * 0.9
            box(f'lk{sx}{i}', (sx * 3.25, y, 1.0), (0.45, 0.85, 2.0), lock, bevel=0.01)
            box(f'ls{sx}{i}', (sx * 3.02, y, 1.6), (0.01, 0.5, 0.03), dark)
            box(f'jy{sx}{i}', (sx * 2.98, y, 1.3), (0.02, 0.55, 0.7), flat(f'jy{i}', '#c9a24e' if i % 2 else '#2b3a4a'))
    box('bench', (0, -0.6, 0.42), (0.45, 3.4, 0.07), flat('bn', '#7d8a97'), bevel=0.01)
    box('board', (0, 3.92, 1.55), (2.6, 0.04, 1.3), flat('wb', None, glow='#dfe9f2', strength=1.4))
    for i in range(6): box(f'mk{i}', (-0.9 + i * 0.35, 3.89, 1.4 + (i % 3) * 0.15), (0.22, 0.01, 0.03), flat('ink', '#ff4655'))
    person('igl', BRAWK, 'drednicolson_arms_akimbo', (0.0, 3.0), 0)
    for i, (x, y, f) in enumerate(((-1.1, 1.2, 170), (1.0, 1.1, 190), (-0.3, 0.6, 175), (0.6, 0.4, 185))):
        person(f'l{i}', EXTRAS[i], 'callharvey3d_standingatease', (x, y), f)
    light('AREA', (0, 3.6, 1.6), 220, '#dfe9f2', rot=(90, 0, 0), size=2.5)
    light('AREA', (0, 0, 2.7), 40, '#dfe9f2', size=3)
    haze(0.02)
    camera((0.3, -3.6, 1.45), (0, 3.9, 1.45), lens=30)

def scene_walk():
    """Five walk the corridor toward the stage door."""
    corridor()
    for i, (x, y) in enumerate(((-0.4, 0.6), (0.35, 0.9), (-0.1, -0.2), (0.55, -0.6), (-0.6, -0.9))):
        person(f'w{i}', BRAWK if i == 0 else EXTRAS[i % 4], 'punkduck_train_departure', (x, y), 180)
    camera((0, -5.0, 1.3), (0, 3.0, 1.3), lens=36)

def scene_stage():
    """Broadcast stage: booths, an LED wall, cameras on the floor."""
    floor = flat('sf', '#141c25'); dark = flat('sd', '#0a121a'); metal = flat('sm', '#7d8a97')
    box('floor', (0, 0, -0.05), (24, 20, 0.1), floor)
    box('riser', (0, 3.5, 0.3), (12, 4, 0.6), flat('rs', '#1f2b38'))
    box('wall', (0, 6.5, 3.5), (14, 0.1, 6), flat('led', None, glow='#9fd8f5', strength=1.2))
    for sx in (-1, 1):
        box(f'booth{sx}', (sx * 3.2, 4.5, 1.0), (4.2, 0.1, 0.8), flat('bt', '#2b3a4a'), bevel=0.02)
        desk_row(3.9, [sx * 3.2 + d for d in (-1.6, -0.8, 0, 0.8, 1.6)], facing=1)
    for i, x in enumerate((-5, 0, 5)):
        cyl(f'tri{i}', (x, -2.5, 0.7), 0.04, 1.4, metal); box(f'cam{i}', (x, -2.5, 1.5), (0.3, 0.5, 0.3), dark, bevel=0.02)
    for i, x in enumerate((-3.2 - 1.6, -3.2, -3.2 + 1.6)):
        person(f's{i}', EXTRAS[i], 'jjones_leaning_on_counter_hands_folded', (x, 3.35), 0)
    for x in (-6, 6): light('SPOT', (x, 0, 7), 2500, '#dfe9f2', rot=(-25 * (1 if x > 0 else -1), 0, 0)).data.spot_size = math.radians(30)
    haze(0.04)
    camera((1.0, -7.5, 2.0), (0, 4.0, 2.0), lens=28)

def scene_press():
    """Press room: a sponsor wall, a mic'd table, flashes from the floor."""
    room(9, 8, 3.2, wall='#1a222c')
    for i in range(7):
        for j in range(4): box(f'sp{i}{j}', (-2.4 + i * 0.8, 3.94, 0.9 + j * 0.55), (0.5, 0.01, 0.22), flat('spn', '#3a4b5c'))
    box('table', (0, 2.6, 0.75), (2.6, 0.7, 0.06), flat('tbl', '#2b3a4a'))
    box('cloth', (0, 2.27, 0.42), (2.6, 0.02, 0.66), flat('cl', '#ff4655'))
    for x in (-0.25, 0.25): cyl(f'mic{x}', (x, 2.4, 0.95), 0.015, 0.35, flat('mc', '#0a121a'), rot=(20, 0, 0))
    person('p', BRAWK, 'callharvey3d_standingatease', (0, 3.1), 180)
    for i, x in enumerate((-1.6, 1.4)): person(f'j{i}', EXTRAS[i + 1], 'callharvey3d_standingnatural', (x, -0.6), 180)
    flash = flat('flash', None, glow='#ffffff', strength=8)
    for i, (x, z) in enumerate(((-2.4, 1.9), (2.2, 2.1), (-0.6, 2.3))): box(f'fl{i}', (x, -1.2, z), (0.12, 0.05, 0.08), flash)
    light('AREA', (0, 0.5, 2.8), 260, '#dfe9f2', rot=(-30, 0, 0), size=3)
    light('AREA', (0, 3.8, 2.0), 120, '#9fd8f5', rot=(90, 0, 0), size=4)
    haze(0.02)
    camera((0.2, -3.6, 1.55), (0, 3.4, 1.5), lens=32)

def scene_trophy():
    """The trophy alone on its plinth, one spotlight, a dark arena."""
    box('floor', (0, 0, -0.05), (30, 30, 0.1), flat('af', '#0f1923'))
    cyl('plinth', (0, 0, 0.5), 0.45, 1.0, flat('pl', '#2b3a4a'))
    trophy((0, 0, 1.0), k=1.6)
    import random; random.seed(5)
    for i in range(260):
        a = random.uniform(0.5, 2.6); r = random.uniform(9, 14)
        box(f'ph{i}', (math.cos(a) * r, math.sin(a) * r, random.uniform(1, 7)), (0.05, 0.05, 0.08), flat('crowdlight', None, glow='#9fd8f5', strength=3))
    light('SPOT', (0, 0, 7), 4000, '#fff1d6').data.spot_size = math.radians(22)
    haze(0.05)
    camera((0, -4.2, 1.4), (0, 0, 1.6), lens=40)

def scene_lift():
    """Trophy lift: confetti, the squad around the talisman."""
    box('floor', (0, 0, -0.05), (30, 30, 0.1), flat('lf', '#1f2b38'))
    box('wall', (0, 6, 4), (16, 0.1, 8), flat('lw', None, glow='#9fd8f5', strength=1.0))
    rig = person('star', BRAWK, 'gpedroso_peace_and_love', (0, 1.5), 180)
    cup = trophy((0, 0, 0), k=1.0); cup.parent = rig; cup.parent_type = 'BONE'; cup.parent_bone = 'wrist.R'; cup.location = (0, 0.1, 0)
    for i, (x, y, pose) in enumerate(((-1.1, 2.0, 'callharvey3d_salute'), (1.1, 2.1, 'callharvey3d_salute'), (-0.6, 2.6, 'gpedroso_peace_and_love'))):
        person(f'm{i}', EXTRAS[i], pose, (x, y), 180)
    import random; random.seed(9)
    conf = [flat('cf1', '#e8c26a'), flat('cf2', '#ece8e1')]
    for i in range(500):
        box(f'cf{i}', (random.uniform(-4, 4), random.uniform(-1, 5), random.uniform(0.2, 5)), (0.06, 0.03, 0.002), conf[i % 2], rot=(random.uniform(0, 90), random.uniform(0, 90), random.uniform(0, 90)))
    light('SPOT', (0, -2, 7), 3500, '#fff1d6', rot=(-20, 0, 0)).data.spot_size = math.radians(40)
    haze(0.03)
    camera((0.3, -3.8, 1.4), (0, 2.5, 1.9), lens=30)

def scene_empty():
    """After relegation: the stage powered down, one player packing up."""
    box('floor', (0, 0, -0.05), (24, 20, 0.1), flat('ef', '#2b3a4a'))
    box('riser', (0, 3.5, 0.3), (12, 4, 0.6), flat('er', '#1f2b38'))
    box('wall', (0, 6.5, 3.5), (14, 0.1, 6), flat('ew', '#141c25'))
    desk_row(3.9, (-1.6, -0.8, 0, 0.8, 1.6), on=False)
    person('p', BRAWK, 'callharvey3d_standingmodestembarrassed', (0.4, 3.1), 200)
    box('bag', (-0.4, 3.0, 0.75), (0.4, 0.15, 0.3), flat('bag', '#0a121a'), bevel=0.03)
    light('AREA', (0.4, 2.6, 3.2), 400, '#dfe9f2', size=1.2)
    light('AREA', (0, 6.3, 2), 150, '#9fd8f5', rot=(90, 0, 0), size=8)
    haze(0.04)
    camera((0.9, -1.8, 1.5), (0.2, 3.4, 1.2), lens=38)

SCENES = {'corridor': scene_corridor, 'arena': scene_arena, 'board': scene_board,
          'sell': scene_sell, 'cut': scene_cut, 'crowd': scene_crowd,
          'cafe': scene_cafe, 'locker': scene_locker, 'walk': scene_walk, 'stage': scene_stage,
          'press': scene_press, 'trophy': scene_trophy, 'lift': scene_lift, 'empty': scene_empty}

# ---------- scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try: sc.render.engine = eng; break
    except TypeError: pass
sc.render.resolution_x, sc.render.resolution_y = 2560, 1440
sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
sc.render.use_freestyle = False; sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = 2.0
fs = bpy.context.view_layer.freestyle_settings
lset = fs.linesets[0] if fs.linesets else fs.linesets.new('lines')
if not lset.linestyle: lset.linestyle = bpy.data.linestyles.new('ink')
lset.linestyle.color = hexc('#0a121a')[:3]

NAME = sys.argv[sys.argv.index('--') + 2] if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 2 else 'corridor'
SCENES[NAME]()

sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('WROTE', OUT)
