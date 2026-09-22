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
| 01 | Hero | A takeaway cup turned on a lathe, orbited by beans, lit by a sun flare; the framed window opens to full bleed as the camera closes on it |
| 02 | Manifesto | Per-word `rotateX` reveal through a clipping mask; beans loiter in the margins |
| 03 | The Harvest | A WebGL cloud bank you look down onto, with distant peaks behind it and the terraces in front; beans rain through all three |
| 04 | Our Roasts | Five panels that expand on hover/focus over beds of real beans; clicking the open one opens that bean as a specimen, "Roast this lot" opens the drum |
| 05 | Founder quote | Line-by-line mask reveal and a signature that draws itself |
| 06 | Roast Lab | The field forms a ring around one large bean you can drag; the slider re-roasts every bean on the page |
| 07 | The Collection | Pinned horizontal scroll; the shelf holds real 3D cups, and clicking one sends it into a deck of cups while a paper docket falls in with the notes |
| 08 | Bean to Cup | Parallax airport-code slab, closing on the traceability note |
| 09 | Brew Guide | Working calculator — method × servings → dose, water, ratio, grind, temp, time and steps |
| 10 | Subscribe | Parallax field, validated form, footer |

## The interactive pieces

Four, all real rather than decorative:

- **Roast Lab** (`#lab`) — drag the slider from light to dark. Every bean on
  the page is the same lot, so the whole field takes the roast: colour,
  roughness and oil sheen interpolate across four stops, and the acidity /
  body / sweetness / bitterness bars move with it. Drag the big bean to spin
  it. "Open in Roast Lab" on any roast panel jumps the slider to that coffee.

- **The Specimen** (`#roasts` → click the open panel) — the panel's own art
  opens out to full bleed and dissolves off a single bean of that lot, at a
  size where the surface is the point. Lot number, process, altitude, varietal
  and grade, and nothing else. Drag to turn it. Like the cup, it rocks around
  its creased face rather than spinning — left to turn freely a bean spends
  half its time edge-on, which is the one angle where it looks like nothing.

- **The Drum** (`#roasts` → *Roast this lot*) — an immersive takeover. ~150
  instanced beans tumble against the wall of a rotating drum with flights,
  darkening green → yellow → first crack → the chosen roast over about seven
  seconds, while a HUD ticks through bean temperature, elapsed time, moisture
  loss, the five roast phases and a curve that draws itself. Each lot has its
  own drop temperature and time.

- **The Deck** (`#collection` → click a cup) — the cup you clicked is the
  thing that animates, and it stays the same object throughout: no still, no
  clone, no handoff. It comes out of the depth already spinning, unwinds
  through two and a half turns, and settles tipped toward you — the one angle
  from which the coffee in it is visible at all — while a field of blanks
  keeps tumbling past the lens. Drag anywhere on the stage to turn it.

  The copy arrives as **a batch docket**: a piece of stock that falls in from
  the top of the window, swings once on its tape and hangs there. Click
  anywhere off it and the same sheet tips off its tape and drops out of the
  bottom — the gesture that brought it in, run the other way.

- **Brew Guide** (`#brew`) — pick V60, AeroPress, French Press, Espresso or
  Cold Brew, set servings, and get the dose, water, ratio, grind, temperature,
  time and a four-step method.

Both takeovers trap scroll, close on Escape or the backdrop, and restore focus
to whatever opened them.

## Palette

Espresso and oat milk, with coffee cherry as the accent — the red is the actual
colour of a ripe coffee cherry, which is where the accent came from.

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#120B07` | Espresso black — dark sections |
| `--roast` | `#4A2A18` | Mid roast |
| `--cocoa` | `#7A4A2E` | Drawn flourishes |
| `--crema` | `#D9A96C` | Highlights, rules, the crema on a cup |
| `--oat` | `#F2E7D6` | Oat milk — text on dark, footer |
| `--cream` / `--paper` | `#FBF5EC` / `#FFFCF7` | Light sections |
| `--cherry` | `#C33C2B` | Accent: rail tab, eyebrows, CTA |
| `--leaf` | `#5F7A55` | Arabica leaf — the highlands |

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

**Surface.** A value-noise canvas supplies the bump map. Two things about it
are easy to get wrong and were both wrong here for a while:

- *Octave scale.* Stacked too high, every feature lands under a pixel once the
  map is repeated over the mesh, the bump derivatives average out, and the
  surface renders dead smooth. The three octaves now sit at roughly 36, 11 and
  4 pixels so they survive on screen.
- *`bumpScale` is not a 0–1 knob.* On a mesh this size anything under about 1
  is invisible. It is 1.6 on the feature bean and 1.1 elsewhere, found by
  sweeping it rather than guessing.

**The fissure** is filled with silverskin — pale, dry, fibrous, and clearly
*lighter* than the body. Rendering it as a dark groove, which is what an
occlusion-only model gives you, is the single thing that stops a bean reading
as a bean. It is now a bright fibrous fill streaked along the bean's length,
with a thin shadow only where the walls turn away from it. Roughness gets a
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

**The cup.** The hero centrepiece is a takeaway cup built the way a real one
is drawn: one profile swept around Y on a lathe for the body, the same profile
pushed out two millimetres for the printed sleeve, and a second for the lid's
skirt and dome, plus a sip hole, a moulded ring and a drinking tab. A lathe of
that profile comes out squat, so the group carries a 1.24 vertical stretch to
reach the 1.6 : 1 a real cup has. Behind it sits a sun flare with an
anamorphic streak and a starfield; above it, three plumes of steam.

The sleeve is LATTECANO's own: a kraft board drawn on a canvas — flecks, fibre,
wordmark, bean mark and strapline — and wrapped by the lathe's UVs, so the
brand is on the cup rather than floating beside it. It is stamped three times
around, and the cup *rocks* around front instead of spinning, because a cup
that turns all the way round shows its brand about a third of the time. Drag
it to spin it fully; it eases back to front when you let go.

Beans orbit it on a near edge-on ring, spaced by golden angle rather than by
index — a projected circle crowds its own turning points, so evenly indexed
beans pile into two clumps at the left and right edges instead of sweeping
round. The ring is a driven formation, so it follows its targets about four
times faster than the static ones; chased at the slow rate it lags and
collapses toward the middle.

**Clouds.** The harvest section's middle distance is a bank of ~360 soft
billboards rather than stacked SVG waves. Volume comes from many small
overlapping puffs — a few large ones only ever read as a grey smear — and the
parallax comes from drifting each one at a speed tied to its depth. Tops are
lit near-white and undersides are a cool blue-grey; that split is what makes a
billboard read as cloud. They are sorted back-to-front once at build (instanced
transparency has no per-instance sort, and the puffs only move sideways, so the
order holds), and they fade at both ends of the section because the canvas is
fixed and would otherwise spill into the next one.

The section also has a real aerial gradient now — warm at the horizon, cool and
deep where the bank sits — because white cloud cannot read against a cream
page. The one remaining distant ridge is tinted blue for the same reason real
far mountains are.

**The roaster.** The drum is perforated sheet with scorch marks painted into
its colour, bump and roughness maps, set inside a housing with legs and a
burner that glows under the shell. Chaff peaks during drying and stops once
there is none left to shed; smoke only arrives with first crack; the burner
eases off afterwards, the way a roaster backs the gas down.

**Section art is rendered, not drawn.** `assets/js/chamber.js` renders a still
bed of ~430 beans at each roast level once at load and hands it back as a JPEG
data URL, which becomes the background of the roast panels and the collection
bags. They are photographs of the actual geometry, so the five roast levels
differ because the beans differ — not because a gradient was tinted.

**The Chamber** shares one renderer across three takeovers. The drum is
force-based: gravity, wall constraints and the drum's tangential drag, plus an
O(n²) separation pass, which is what stops the charge reading as one brown
mass — at 150 beans it costs nothing. The specimen gets its own highest-detail
geometry and material, because it is the only view where the surface is the
whole point. The deck builds its cup through the collection's own module, in the chamber's
renderer, because a texture cannot cross WebGL contexts.

**The docket is stock, not a panel.** The paper is rendered once on canvas —
laid lines, fibres both ways, three tea rings that have soaked in, the foxing
an old sheet picks up, and edges that have seen more light than the middle. A
flat cream fill reads as a modal; this reads as something that came off a
bench. It tears along a perforated bottom edge, and the card it belongs to
carries the same perforation above its name, so the two are visibly the same
document.

The fall and the settle are separate tweens. The sheet drops on `expo.out`
while the rotation comes back on `elastic.out` a beat later — one eased tween
doing both reads as a bounce, and paper does not bounce. The tape grows by
width rather than `scaleX`, because it carries a CSS rotation that a transform
tween would write over.

The deck's blanks are cup-shaped and nothing else — outside wall only, no roll,
no interior, a fraction of the segments. Sixteen copies of the real cup is a
lot of triangles to spend on blur. They sit on a ring, and the ring splays as
they come forward.
Behind the card the radius holds, so the depth stays populated; from just
behind it forward they fan out and leave the frame at its edges. On a fixed
radius they would sweep straight across the middle, and the one thing that
view cannot afford is something crossing in front of the card you asked to see.

**The collection's cups are real objects.** Each one is a single-wall paper
cup, turned on a lathe the way a real one is drawn: one continuous path that
climbs the outside, curls over the rolled rim and comes back down the inside to
the base. That is what gives the wall thickness and an interior you can see
into, rather than a cone you look straight through. The map splits along the
same profile — the printed outside below the seam, the shaded interior above it
— because nothing in this scene casts an occlusion and the inside has to go
dark toward the base on its own.

The sleeve's flutes are geometry, not a bump map. A bump would fake them from
straight on and lose them exactly where they matter, on the silhouette, so the
radius itself is modulated: forty-eight flutes at six samples each, below which
the corrugation aliases into a moiré. The print is wrapped twice, so however
far a cup is turned a whole panel faces out, and it carries the roast as five
dots filled to the stop that coffee is taken to — the one thing on a sleeve you
can read at a glance from across a table, which is what a sleeve is for.

**The hero drinks from the same cup**, built by the same module with two
things turned on. It takes a travel lid — a skirt that grips down over the
rolled rim, a moulded step, then a shallow dome, with the sip hole set on the
side the print faces so the cup has a front — and the coffee mesh is dropped,
since with a lid on there is nothing to see. And it is printed with the house
and nothing else: no coffee, no roast, no lot, because a cup you meet before
you have read a word about the coffee should carry the name and stop there.
The board under the sleeve carries a tone-on-tone repeat of the mark, set
barely darker than the stock so it reads as printed on it rather than stuck
to it.

Steam leaves through the sip hole rather than off the whole rim — a plume
spread across the top is what an open cup does, and a lidded one plainly does
not. Flick the cup and it keeps going; friction and a soft pull bring it back
to front, and it leans toward the pointer whether or not you are holding it.

The coffee is lathed too, which puts its map in (angle, radius) space. That is
what makes the surface work: crema is a band along one edge of the canvas and
near-black along the other, so it collects at the wall the way it does in a
cup rather than washing over the whole surface; a radial streak is a vertical
line, which is exactly how tiger striping breaks up as it is poured; and the
darkest ring of all sits at the very edge, where the paper throws a shadow on
the liquid. Without that ring the surface reads as a sticker laid in the cup.
The wall behind it carries a painted waterline for the same reason — nothing
in this scene casts a shadow, so the darkness under the rim has to be drawn. Tipping the rim toward the reader is the only way any of it is
visible — the camera sits at the cup's mid-height and cannot rise, because the
whole screen mapping hangs off it being at zero — so a cup tips as it reaches
the middle of the screen and stands straight again as it leaves. Hovering tips
it further; under `prefers-reduced-motion` the row simply stands still.

All easing is frame-rate independent — a per-frame "move 5% of the way" rate is
converted for the frame actually drawn, so transitions take the same wall-clock
time at 30fps as at 144.

## Structure

```
index.html
assets/
  css/base.css        tokens, resets, type, nav, cursor, loader, grain
  css/sections.css    the ten sections
  css/chamber.css     the takeover, plus the two product sections
  js/scene.js         three.js — bean geometry, textures, the page-wide field
  js/chamber.js       the drum / deck stage, and the still bean-bed renders
  js/shelf.js         the cup — profile, sleeve, crema — and the shelf
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
