# LATTECANO

An immersive, scroll-driven site for a single-origin coffee house. Built as a
static page — no build step, no bundler. Open `index.html` or run a static
server and it works.

```bash
npm start          # http://localhost:4173
# or
python3 -m http.server 4173
```

## What's in it

Ten sections, each with its own motion idea rather than one effect repeated:

| # | Section | Motion |
|---|---------|--------|
| 01 | Hero | The framed window opens to full bleed while the camera flies into the bean field and the wordmark scales past you |
| 02 | Manifesto | Per-word `rotateX` reveal through a clipping mask; beans loiter in the margins |
| 03 | The Harvest | Five highland layers scrubbed at different rates, with beans raining through them |
| 04 | Our Roasts | Five panels that expand on hover/focus, each with its own generated roast gradient |
| 05 | Founder quote | Line-by-line mask reveal and a signature that draws itself |
| 06 | Roast Lab | The field forms a ring around one large bean you can drag; the slider re-roasts every bean on the page |
| 07 | The Collection | Pinned horizontal scroll with beans streaming the other way; cards tilt in 3D |
| 08 | Bean to Cup | Parallax airport-code slab, a CSS globe that turns with scroll, and beans travelling the shipping arc |
| 09 | Brew Guide | Working calculator — method × servings → dose, water, ratio, grind, temp, time and steps |
| 10 | Subscribe | Parallax field, validated form, footer |

## The two useful tools

Both are real, not decorative:

- **Roast Lab** (`#lab`) — drag the slider from light to dark. Every bean on
  the page is the same lot, so the whole field takes the roast: colour,
  roughness and oil sheen interpolate across four stops, and the acidity /
  body / sweetness / bitterness bars move with it. Drag the big bean to spin
  it. "Open in Roast Lab" on any roast panel jumps the slider to that coffee.
- **Brew Guide** (`#brew`) — pick V60, AeroPress, French Press, Espresso or
  Cold Brew, set servings, and get the dose, water, ratio, grind, temperature,
  time and a four-step method.

## Palette

Espresso and oat milk, with coffee cherry as the accent — the red is the actual
colour of a ripe coffee cherry, which is where the accent came from.

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#120B07` | Espresso black — dark sections |
| `--roast` | `#4A2A18` | Mid roast |
| `--cocoa` | `#7A4A2E` | Drawn flourishes |
| `--crema` | `#D9A96C` | Highlights, route, globe light |
| `--oat` | `#F2E7D6` | Oat milk — text on dark, footer |
| `--cream` / `--paper` | `#FBF5EC` / `#FFFCF7` | Light sections |
| `--cherry` | `#C33C2B` | Accent: rail tab, eyebrows, CTA |
| `--leaf` | `#5F7A55` | Arabica leaf — highlands, globe land |

## How the 3D works

`assets/js/scene.js` generates everything in code — there are no image or model
files in this repo.

**One field, not one widget.** A single fixed canvas runs the length of the
page, layered above each section's background and below its copy. A pool of
beans is re-choreographed as you scroll: they swarm the hero, drift past the
manifesto, rain through the harvest, hold a ring in the Roast Lab, stream with
the collection, travel the shipping arc, and halo the closing form. Formations
blend into each other rather than cutting.

**The bean.** Built from a sphere, then:

- the circular profile is swapped for a superellipse, because a stretched
  sphere gives almond points and a real bean is a barrel with blunt ends —
  roughly 1 : 0.65 : 0.40 in length : width : depth;
- one face is flattened into the cut face and the other bulged into a dome,
  eased between rather than stepped;
- a gaussian fissure is *scaled* (not translated) down the cut face so it stays
  seamless at the silhouette, and it wanders with a sine so it doesn't look
  machined;
- the fissure's width tracks the tessellation — a crease narrow enough to look
  right at 96 segments tears a 34-segment bean apart;
- vertex colours darken the groove (it is occluded, not luminous) and leave the
  pale silverskin on its lips, which is what actually reads as the line down
  the bean.

**Surface.** A value-noise canvas supplies the bump map. Roughness gets a
*separate*, high-biased map — a mid-grey one would halve the roughness and turn
a dry roasted bean into polished chocolate. The roast slider drives colour,
roughness and clearcoat together, so dark roasts pick up the oil sheen they
should have.

**Light.** A studio is painted on a canvas and convolved through
`PMREMGenerator` into an environment map, which is what gives the specular its
roll-off. The lighting rig crossfades as the page moves between cream and dark
sections.

**Detail levels.** Three geometries (34 / 54 / 96 segments) are built once and
shared; the feature bean gets the high one, its neighbours the middle, the rest
the low.

All easing is frame-rate independent — a per-frame "move 5% of the way" rate is
converted for the frame actually drawn, so transitions take the same wall-clock
time at 30fps as at 144.

## Structure

```
index.html
assets/
  css/base.css        tokens, resets, type, nav, cursor, loader, grain
  css/sections.css    the ten sections
  js/scene.js         three.js — bean geometry, noise texture, both scenes
  js/app.js           Lenis + GSAP/ScrollTrigger, Roast Lab, Brew Guide
  img/favicon.svg
  vendor/             GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13, three.js r160
                      — vendored so the page runs offline
```

## Notes

- `prefers-reduced-motion` is honoured: transitions collapse, the grain stops,
  and the WebGL scenes hold still instead of drifting.
- Without WebGL the canvas removes itself and the page keeps its gradients.
- Without GSAP the page degrades to plain scrolling with everything visible.
- Fonts come from Google Fonts with local fallbacks; everything else is local.
