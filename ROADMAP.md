# Roadmap

## Vision

An AAA-quality, mobile-first solar system you can fly through, descend into, and
explore on foot — built on a WebGPU / React Three Fiber stack with real orbital
mechanics and physically grounded worlds. From a cinematic overview of the
planets down to a destructible voxel surface under real gravity, every layer is
the same world, deepened. The long arc reaches beyond our solar system to a
procedurally generated galaxy, and ultimately ships as a standalone native game.

---

## Completed phases

### Phase 0 — Foundation
Vite + React + TypeScript + React Three Fiber project scaffold and build
pipeline.

### Phase 1 — AAA rendering
WebGPU renderer, ACES filmic tone mapping, bloom, and a Fresnel sun corona for a
premium look pass.

### Phase 2 — PBR bodies
Physically based planets and moons with atmospheres, Earth day/night/cloud
layers, solar wind particles, and ring shadows.

### Phase 3 — Orbital mechanics
Real J2000 orbital elements, axial tilt, signed rotation periods, and a
simulation clock driving accurate body motion.

### Phase 4 — Cinematic camera
Intro fly-in, framed focus, follow-cam, and an automated tour mode with eased
transitions.

### Phase 5 — Procedural audio
Fully synthesized soundscape: ambient pad bed, proximity drone near massive
bodies, and UI sound effects — no audio assets.

### Phase 6 — UI / UX
Internationalization, body picker, labels, settings panel, and accessibility
(reduced motion, keyboard navigation).

### Phase 7 — Performance
Quality presets (low → ultra) with device auto-detection, instanced asteroid
belt, and level-of-detail scaling.

### Phase 8 — Spaceship & planetary descent
Ship flight model, mobile touch controls, three-phase atmospheric entry, 16
landable bodies, and a Phase 8 procedural surface view.

### Phase 9 — Voxel surface exploration
Destructible 32³ chunk engine with a worker-pool greedy mesher, AAA TSL voxel
material (baked ambient occlusion, fog, emissive lava/ice, sun shadows), and
first-person movement with real NASA surface gravity per body. Six archetypes
(rock, regolith, earth, ice, lava, dune) mapped across all 16 landable bodies,
plus per-body weather, footstep/ambient/cave audio, and instanced surface
scatter — distinct worlds from shared systems.

---

## Planned phases

### Phase 10 — Content & variation
Instanced props, crashed probes, expedition traces, unique landmarks per body,
and narrative context that gives each world a sense of place and history.

### Phase 11 — Game mechanics
A resource system, crafting, base building, and ship upgrades — turning
exploration into progression.

### Phase 12 — Procedural galaxy
Travel beyond the solar system into procedurally generated star systems, each
with its own unique planets to discover and explore.

### Phase 13 — Visual polish
A comprehensive AAA polish pass across every system, on all platforms and
quality levels.

### Phase 14 — Standalone game
Package as a native application via Tauri (desktop) and Capacitor (iOS /
Android) for a true standalone release.
