# 999

An immersive, scroll-driven 3D brand site for **999** — a fictional house whose
name is the hallmark for fine gold: 999 parts in a thousand, the assay mark for
metal that has given up everything it was carrying.

The whole page is a single continuous camera flight. Scrolling flies you from
above a volumetric cloud deck, down *through* it, under the weather into a
storm sea, into a vault chamber, and back up into dawn light — with the colour
grade, the fog, the UI text colour and the nav scrim all interpolating along the
same timeline.

## The build

| | |
|---|---|
| **Rendering** | Three.js — everything procedural, no texture or model assets |
| **Motion** | GSAP + ScrollTrigger |
| **Scroll** | Lenis (drives GSAP's ticker so scrub never desyncs) |
| **Tooling** | Vite |
| **Type** | Jost + Azeret Mono, self-hosted (latin variable subsets) |

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview  # http://localhost:4173
```

## Chapters

| # | Chapter | What happens |
|---|---|---|
| 01 | **Ascent** | Wordmark over a cloud sea, one massif breaking the deck |
| 02 | **The Standard** | The camera sinks into the deck; headline wipes in line by line |
| 03 | **The Mark** | Interactive assay dial — hover the elements to drive the fineness read |
| 04 | **Divisions** | Below the weather: four houses over a storm sea |
| 05 | **The Vault** | A drag-to-rotate gold ingot in its own WebGL stage |
| 06 | **Horizon** | The camera climbs back above the deck into warm dawn light |

## How the 3D works

**`src/three/world.js`** owns the flight. `FLIGHT` is seven camera beats keyed to
global scroll progress; positions and look-targets are interpolated with
Catmull-Rom so velocity stays continuous across beats rather than stopping dead
at each one. `GRADE` and `UI_THEME` are parallel keyframe tables for the colour
journey — fog, cloud tint, bloom, vignette, and the CSS custom properties that
recolour the HTML layer.

Scroll progress is damped per-frame rather than applied directly, which is what
gives the camera its weight; pointer position adds a small parallax offset in
camera space on top.

**`terrain.js`** — a plane displaced by a ridged multifractal in the vertex
shader. The base field is deliberately kept low so the cloud deck drowns it, and
three art-directed summits are planted on top so the silhouette is composed
rather than random. Normals come from finite differences against the same height
function, sampled at roughly the grid spacing.

**`clouds.js`** — the deck is a slab of camera-facing billboards shaded by
world-space fbm, so neighbouring puffs stay coherent instead of looking tiled.
Each puff uses a gaussian envelope with no hard rim, and near/far alpha ramps let
the camera fly through the deck without any popping. The slab wraps around the
camera in the vertex shader, so it never runs out.

**`ocean.js`** — four summed Gerstner waves with fbm chop; foam is driven by
crest height so it appears where the water is actually steepest.

**`postfx.js`** — bloom, then a grade pass doing radial chromatic aberration, a
filmic shoulder, the per-chapter colour cast and a vignette.

**`vault.js`** — a separate small renderer. The ingot is an extruded rounded
rect, bevelled and tapered so it reads as cast rather than boxy, lit against a
procedural room environment. Drag carries momentum before settling back to idle.

## Notes

- `src/ui/split.js` measures word offsets to find *rendered* line breaks, then
  rebuilds each line inside an overflow-hidden mask. It re-splits on resize and
  after `document.fonts.ready`, since font swap changes wrapping.
- `prefers-reduced-motion` is honoured throughout: the preloader is skipped,
  smooth scroll and parallax are disabled, and reveals resolve to their end state.
- Quality scales down on small viewports (fewer cloud instances, lower terrain
  tessellation, no MSAA).
