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
| 01 | Hero | WebGL bean field; the framed "window" opens to full bleed and the camera flies through the beans as you scroll |
| 02 | Manifesto | Per-word `rotateX` reveal through a clipping mask, over ruled columns |
| 03 | The Harvest | Five highland layers scrubbed at different rates — parallax that reads as real depth — plus counting stats |
| 04 | Our Roasts | Five panels that expand on hover/focus, each with its own generated roast gradient |
| 05 | Founder quote | Line-by-line mask reveal and a signature that draws itself |
| 06 | Roast Lab | A real 3D bean you can drag; the roast slider changes its colour, surface and cup profile live |
| 07 | The Collection | Pinned horizontal scroll over a drifting backdrop; cards tilt in 3D under the pointer |
| 08 | Bean to Cup | Parallax airport-code slab, a CSS globe that turns with scroll, and a shipping route that draws then runs a marker along itself |
| 09 | Brew Guide | Working calculator — method × servings → dose, water, ratio, grind, temp, time and steps |
| 10 | Subscribe | Parallax field, validated form, footer |

## The two useful tools

Both are real, not decorative:

- **Roast Lab** (`#lab`) — drag the slider from light to dark. The bean above is
  a three.js mesh whose colour and roughness interpolate across four roast
  stops, and the acidity / body / sweetness / bitterness bars move with it.
  Drag the bean itself to spin it. "Open in Roast Lab" on any roast panel jumps
  the slider to that coffee.
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

- **The bean** is sculpted from a sphere: elongated on Y, flattened on Z,
  tapered at the tips, then a gaussian valley is scaled (not translated) down
  the centre of each face so the crease stays seamless at the silhouette. The
  crease wanders with a sine so it doesn't read as machined.
- **Surface** uses a value-noise canvas texture as both roughness and bump map.
- **Hero scene** — 38 beans (22 on small screens) around the camera's flight
  path, warm key light, a cherry-coloured pulsing point light, exponential fog,
  and additive "aroma" motes. Scroll drives `camera.z`; the pointer adds
  parallax.
- **Roast Lab scene** — one large bean plus an orbiting ring, with the material
  colour and roughness lerped toward the slider's target every frame.

Both scenes only render while their section is on screen.

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
- Without WebGL the page still works — the scenes simply don't initialise and
  the sections keep their gradients.
- Without GSAP the page degrades to plain scrolling with everything visible.
- Fonts come from Google Fonts with local fallbacks; everything else is local.
