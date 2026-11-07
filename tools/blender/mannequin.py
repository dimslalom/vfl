# Cutscene figure renderer: jointed mannequins posed by FK, toon-shaded, Freestyle outlines.
# Run: Blender -b --factory-startup -P tools/blender/mannequin.py -- out.png
# Pose angles are degrees (X, Y, Z) in the joint's local frame. Figure faces -Y before root turn.
#   limbs hang along -Z: X<0 swings forward, Y<0 swings toward +X side.
#   spine points +Z: X>0 leans forward.
import sys, math, bpy, bmesh
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/frame.png'

def hexc(h):
    h = h.lstrip('#')
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)) + (1,)

def toon(name, lit, shade):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links
    n.clear()
    d = n.new('ShaderNodeBsdfDiffuse'); s = n.new('ShaderNodeShaderToRGB')
    r = n.new('ShaderNodeValToRGB'); e = n.new('ShaderNodeEmission'); o = n.new('ShaderNodeOutputMaterial')
    r.color_ramp.interpolation = 'CONSTANT'
    r.color_ramp.elements[0].color = hexc(shade)
    r.color_ramp.elements[1].position = 0.35
    r.color_ramp.elements[1].color = hexc(lit)
    l.new(d.outputs[0], s.inputs[0]); l.new(s.outputs[0], r.inputs[0])
    l.new(r.outputs[0], e.inputs[0]); l.new(e.outputs[0], o.inputs[0])
    return m

def mesh_obj(name, build, mat, parent):
    bm = bmesh.new(); build(bm)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob); ob.parent = parent
    return ob

def capsule(length, r0, r1, sign=-1, sx=1.0, sy=1.0):
    def b(bm):
        g = bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=r0, radius2=r1, depth=length)
        bmesh.ops.translate(bm, verts=g['verts'], vec=(0, 0, sign * length / 2))
        s = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=r0 * 1.08)
        bmesh.ops.translate(bm, verts=s['verts'], vec=(0, 0, 0))
        if sign < 0:  # cone radius1 sits at -depth/2, flip so r0 is at the joint
            bmesh.ops.scale(bm, verts=g['verts'], vec=(1, 1, -1))
            bmesh.ops.translate(bm, verts=g['verts'], vec=(0, 0, -length))
        bmesh.ops.scale(bm, verts=bm.verts[:], vec=(sx, sy, 1))
    return b

def joint(name, parent, loc):
    e = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(e)
    e.parent = parent; e.location = loc; e.empty_display_size = 0.02
    return e

def figure(tag, at, facing_deg, pose, kit, skin):
    P = lambda k: [math.radians(a) for a in pose.get(k, (0, 0, 0))]
    root = joint(tag, None, (at[0], at[1], 0)); root.rotation_euler = (0, 0, math.radians(facing_deg))
    pelvis = joint(tag + 'pelvis', root, (pose.get('shift', 0), 0, 0.95)); pelvis.rotation_euler = P('pelvis')
    mesh_obj(tag + 'hipm', capsule(0.16, 0.13, 0.15, 1, 1.25, 0.75), kit['dark'], pelvis)
    spine = joint(tag + 'spine', pelvis, (0, 0, 0.12)); spine.rotation_euler = P('spine')
    mesh_obj(tag + 'torso', capsule(0.36, 0.14, 0.17, 1, 1.35, 0.72), kit['shirt'], spine)
    neck = joint(tag + 'neck', spine, (0, 0, 0.40)); neck.rotation_euler = P('head')
    mesh_obj(tag + 'neckm', capsule(0.08, 0.05, 0.05, 1), skin, neck)
    head = joint(tag + 'headj', neck, (0, -0.01, 0.17))
    def hb(bm):
        s = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=0.105)
        bmesh.ops.scale(bm, verts=s['verts'], vec=(0.88, 0.98, 1.15))
    mesh_obj(tag + 'head', hb, skin, head)
    def cap(bm):  # headset band reads as an esports player
        g = bmesh.ops.create_cone(bm, cap_ends=False, segments=20, radius1=0.112, radius2=0.112, depth=0.035)
        bmesh.ops.rotate(bm, verts=g['verts'], cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'Y'))
        bmesh.ops.translate(bm, verts=g['verts'], vec=(0, 0, 0.03))
    if kit.get('headset'): mesh_obj(tag + 'set', cap, kit['dark'], head)
    for side, sx in (('l', 1), ('r', -1)):
        sh = joint(tag + side + 'sh', spine, (sx * 0.22, 0, 0.34)); sh.rotation_euler = P(side + '_arm')
        mesh_obj(tag + side + 'ua', capsule(0.29, 0.062, 0.05), kit['shirt'], sh)
        el = joint(tag + side + 'el', sh, (0, 0, -0.29)); el.rotation_euler = P(side + '_fore')
        mesh_obj(tag + side + 'fa', capsule(0.25, 0.048, 0.038), skin, el)
        wr = joint(tag + side + 'wr', el, (0, 0, -0.25)); wr.rotation_euler = P(side + '_hand')
        mesh_obj(tag + side + 'hd', capsule(0.08, 0.04, 0.03, -1, 0.7, 1.0), skin, wr)
        hp = joint(tag + side + 'hp', pelvis, (sx * 0.1, 0, 0)); hp.rotation_euler = P(side + '_thigh')
        mesh_obj(tag + side + 'th', capsule(0.44, 0.085, 0.06), kit['dark'], hp)
        kn = joint(tag + side + 'kn', hp, (0, 0, -0.44)); kn.rotation_euler = P(side + '_shin')
        mesh_obj(tag + side + 'sn', capsule(0.43, 0.06, 0.045), kit['dark'], kn)
        an = joint(tag + side + 'an', kn, (0, 0, -0.43))
        def ft(bm):
            g = bmesh.ops.create_cube(bm, size=1)
            bmesh.ops.scale(bm, verts=g['verts'], vec=(0.09, 0.22, 0.07))
            bmesh.ops.translate(bm, verts=g['verts'], vec=(0, -0.06, -0.03))
        mesh_obj(tag + side + 'ft', ft, kit['shoe'], an)
    return {o.name: o for o in bpy.data.objects if o.name.startswith(tag)}

# ---------- scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try: sc.render.engine = eng; break
    except TypeError: pass
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
sc.render.film_transparent = True
sc.render.use_freestyle = True
sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = 2.2
fs = bpy.context.view_layer.freestyle_settings
lset = fs.linesets[0] if fs.linesets else fs.linesets.new('lines')
if not lset.linestyle: lset.linestyle = bpy.data.linestyles.new('ink')
ls = lset.linestyle
ls.color = hexc('#0a121a')[:3]; ls.thickness = 2.2
sc.view_settings.view_transform = 'Standard'

skin = toon('skin', '#c9b6a3', '#7a6a60')
home = {'shirt': toon('home', '#e8c26a', '#8a6a2e'), 'dark': toon('homed', '#2b3a4a', '#141c25'),
        'shoe': toon('shoe', '#ece8e1', '#7d8a97'), 'headset': True}
rival = {'shirt': toon('riv', '#18b6f0', '#0d5f86'), 'dark': toon('rivd', '#1f2b38', '#0f1923'),
         'shoe': toon('shoe2', '#0f1923', '#05090d')}

# Brawk: hesitant, weight back, reaching half way, head down.
figure('B_', (-0.42, 0), 90, {
    'shift': -0.02, 'spine': (6, 0, 4), 'head': (26, 0, 8),
    'r_arm': (-28, 6, 0), 'r_fore': (-48, 0, 0), 'r_hand': (-10, 0, 0),
    'l_arm': (8, -4, 0), 'l_fore': (-12, 0, 0),
    'l_thigh': (4, -2, 0), 'r_thigh': (-10, 3, 0), 'r_shin': (8, 0, 0),
}, home, skin)
# Stallions rep: upright, contract held out, other hand in pocket.
riv = figure('S_', (0.5, 0.05), -90, {
    'spine': (-3, 0, 0), 'head': (6, 0, -4),
    'l_arm': (-62, -6, 0), 'l_fore': (-22, 0, 0),
    'r_arm': (14, 8, 0), 'r_fore': (-35, 0, 0),
    'l_thigh': (-14, -2, 0), 'l_shin': (6, 0, 0), 'r_thigh': (6, 4, 0),
}, rival, skin)
paper = toon('paper', '#ece8e1', '#9aa3ad')
def sheet(bm):
    g = bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, verts=g['verts'], vec=(0.006, 0.17, 0.23))
    bmesh.ops.translate(bm, verts=g['verts'], vec=(-0.03, -0.06, -0.1))
mesh_obj('contract', sheet, paper, riv['S_lwr'])

sun = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
sun.data.energy = 4; sun.rotation_euler = (math.radians(55), 0, math.radians(-55))
bpy.context.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.lens = 50; bpy.context.collection.objects.link(cam); sc.camera = cam
cam.location = (0.9, -5.2, 0.75)
d = Vector((0, 0, 1.0)) - cam.location
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('WROTE', OUT)
