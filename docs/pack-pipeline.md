# Card pack pipeline

Every card pack in the game is one 3D model wearing different art and foil.
Adding a pack, such as an event pack, never needs Blender or new image files.

## The pieces

| Piece | File | Change it when |
|---|---|---|
| Shape | `tools/pack3d/build_pack.py` builds `public/assets/pack3d/pack.glb` | The bag itself should look different: puffiness, seals, tear line |
| Pack types | `src/pack3d/packTypes.js` | Adding or changing a pack |
| Art | `src/pack3d/packArt.js` draws front and back on canvases | The layout of every pack should change |
| Covers | `src/pack3d/packCover.js` picks a cover from a seed | Adding cover layouts or changing who can appear |
| Rendering | `src/pack3d/PackScene.js` | Lighting, foil behaviour, special effects, the tear's timing |
| Tear shapes | `src/pack3d/packTear.js` | How the strip curls and the mouth opens |
| Look test | `/lab/pack` (`src/pages/PackLab.jsx`) | Check any change here first |

## Add a new pack

1. Add an entry to `PACK_TYPES` in `src/pack3d/packTypes.js`:
   - `id`, `title`, `subtitle`, `rule` (what it holds, in words), `code` (three letters, printed on the pack)
   - `contains`: which cards may come out (`any`, `gold`, `icon`, or a new rule the engine learns)
   - `palette`: `base` foil colour, `deep` for the back seam, `ink` for print, `accent` for the small bar, `seal` for the crimped ends
   - `foil`: `roughness`, `clearcoat`, `iridescence` (0 plain metal, 1 full rainbow film)
   - `palette.cover`: the tint laid over the map behind the cover star
   - `effects`: `holo` (holographic film in fine lines, 0 or 1) and `glitter` (flakes that flash when tilted, 0 to 1)
2. Open `/lab/pack`, pick the new pack, tilt it, check front and back.
3. The pack shows up everywhere a pack is drawn, because every screen reads the same list.

## Covers

Every pack front shows five real players, matching the five cards inside, picked from
a seed: the same seed always gives the same cover. The squad is centre-focused: the
star stands in front and biggest, the middle pair beside, and the back pair runs off
the left and right edges. A cover only features players the pack can hold, and is
decoration, not a promise of what is inside.

Each pack type picks a front layout with `front`:

- `poster` (Silver, Gold): the squad printed in black halftone straight onto the foil,
  with the pack name set huge behind their heads.
- `fullbleed` (Icons): a tinted map and the squad in colour run to every edge, the name
  centred at the top, and the holo film still shimmers over the art.

The squad's positions are `SQUAD_SPOTS` in `packArt.js` (centre x and height, in art
pixels). A new layout is a new function beside `poster` and `fullBleed`.

## Silhouette

On the front, the art runs through the crimped seals and only the crimp ridges are
laid over it (`crimps()`); the back keeps plain printed seals. The crimped top and bottom are serrated: `serrate()` cuts the teeth out of the art's
alpha, and the material drops anything transparent. The model also pinches the long
sides inwards where the bag puffs out (`PINCH` in `build_pack.py`), so the pack is
never a plain rectangle.

## Rebuild the shape

Only when the bag itself changes. Needs Blender installed.

```bash
npm run pack:model
```

The model is about 126 KB with 5,200 triangles. The strip has 104 columns so it can curl smoothly; the body keeps 26. Crimps and seams are surface detail
in the normal map, not geometry, which keeps the file small.

## The tear

Drag across the top of the pack, from either side. The strip peels along the tear line:
the torn part folds back over itself around a crease that follows your finger, showing the
bare silver inside, and lifts more the harder you pull upwards. Let go mid tear and it
relaxes but stays torn. Once the tear reaches the far edge the strip comes free, hangs
from the pointer, and flies off the way you threw it, springing open and fluttering. Then
the mouth bows open and three card backs rise out of it. A tap, Space or Enter tears it
for you.

- The shapes are plain maths on the model's resting positions (`curlStrip` and
  `openMouth` in `packTear.js`), so any moment can be redrawn from scratch.
- Timing lives in `PackScene.js` (`tearTo`, `detach`, `fling`, `open`), using GSAP for
  the eased parts and a little gravity for the strip in flight.
- The inside of every sheet is a second skin that only shows from behind, cut to the
  same serrated outline.
- `/lab/pack` has Tear, Reset and Slow motion for checking it.
- In the game, `src/pack3d/Pack3DTear.jsx` wraps it with the flat PackTear's props
  (`interactive`, `onTorn`), and PackRip uses it, so every pack opening tears in 3D.
  Its canvas overhangs the pack's footprint so the strip has room to fly.

## Rules that keep it fast

- The art is drawn in the browser, so a new pack adds no download.
- The scene redraws only while something moves. Glitter and holo are part of the
  surface, so nothing animates on its own.
- Cover art is cached for the most recent 24 packs.
- Small pack icons should use still images rendered from the model, not live 3D.
- If 3D cannot start (no WebGL, reduced motion, the 3D code fails or takes over 4 seconds to load), the game falls back to the flat pack.
