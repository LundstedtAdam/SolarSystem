# Roadmap

## Vision

An AAA-quality, mobile-first solar system you can fly through, descend into, and
explore on foot — built on a WebGPU / React Three Fiber stack with real orbital
mechanics and physically grounded worlds. From a cinematic overview of the
planets down to a destructible voxel surface under real gravity, every layer is
the same world, deepened. The long arc reaches beyond our solar system to a
procedurally generated galaxy, and ultimately ships as a standalone native game.

---

## Branches & PRs

**`storyline` is the single active branch** — all work described below as
"done" or "in progress" lives there. `phase-10`, `phase-11`, and
`claude/phase-11-setup-bd8gxr` are earlier, now-stale points along this same
history and are not being developed further.

PRs #1–7 are closed without merging — each was superseded by later work that
was folded directly into `storyline` rather than merged through the PR itself.
**PR #8** (draft, `storyline` → `master`) is the only open PR: a cross-cutting
technical audit + six follow-up rounds (see "Technical audit & hardening"
below) — it is not one of the numbered phases.

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

### Phase 10 — Content & variation
Per-body content spine, procedural real landmarks (Olympus Mons, Valles
Marineris, Sputnik Planitia…), world-anchored particle emitters, modular
ruined POIs with layered narrative-stratigraphy text, and a scan/journal
discovery loop with a cross-body mystery thread — fanned out across all 16
landable bodies. Sub-phases 10.0–10.4 plus the fan-out/LOD pass are complete.

> **Note:** the fan-out/LOD commit (`e3e4d62`) is also labeled "Phase 10.5" in
> its commit message. That is a *different* feature from the Phase 10.5 below
> — a naming collision in the commit history, not two versions of the same
> work.

### Phase 10.5 — Mystery & narrative system (8-act war-lore thread)
A wholly separate narrative thread layered on top of Phase 10's discovery
loop: the full 8-act Junta/Coalition/Exodus war story (one act per body
group — Earth/Moon, Mars, Phobos/Deimos, the Jupiter system, Titan, Miranda,
Triton, Pluto/Charon), a two-tier Xenolinguistic Decoder scanner mechanic,
retroactive journal re-interpretation as translation fragments are found (with
an unread badge + toast), and diegetic compass/audio navigation cues (never
an exact marker) toward undiscovered war-lore content. Coexists independently
alongside the earlier Layer 1 (real-science notes) / Layer 2 (fictional deep
sites) astrobiology content on the same bodies — the two never merge.

Depends on Phase 10's content spine and POI system; independent of Phase 11's
mechanics, aside from a naming coordination (see Phase 11.5 note below).
Implemented (`f58f312`, `66d371b`); its own PR (#7) was closed without
merging — the commits were folded directly into `storyline` instead.

### Phase 11 — Game mechanics
Resource gathering, crafting, base building, survival, and ship upgrades —
turning exploration into progression. Built as a numbered sub-phase sequence,
preceded by an unnumbered flight/input polish pass (`f25caa8`, `0293b3a`:
thumb-reach audit, touch Scan button, gamepad surface support, ship-gravity
removal, world scale-up, quick-nav autopilot) that predates and is unrelated
to the resource/crafting system below despite sharing the "Phase 11" label.

| Sub-phase | Status | What it adds |
|---|---|---|
| 11.0 — Mining, backpack, persistence | **Done** | Touch-hold mining, ore veins per archetype, inventory + overflow drops, localForage persistence. Two post-ship bugs (gamepad clobbering the mine flag; common terrain yielding nothing) fixed same session. |
| 11.1 — Block placement + storage silos | **Done** | Placeable blocks/silos, deposit/withdraw, silo visuals + persistence. Includes the 11.1a UI pass (backpack/build as open/close menus with drop) and a later silo-withdrawal fix. |
| 11.2 — Crafting | **Done** | Radial recipe menu, holographic blueprint, chest-pull from nearby silos. |
| 11.3 — Base building (power) | **Done** | Habitat/solar/wind/thermal/refinery modules, per-body power viability, refinery smelting. |
| 11.4 — Survival | **Done** | Oxygen/tethers/death, opt-in (creative is the default, zero survival mechanics active until switched). |
| 11.5 — Ship upgrades | **Done, since amended** | Hyperdrive/scanner/shielding/cargo tiers, hard shielding gate on hazardous bodies, procedural hull visuals per upgrade. `storyline`'s Phase 10.5 work later renamed Hyperdrive → **Quantum Drive** and removed its distance-band gating (shielding is now the only hard descent gate), to avoid clashing with the story's own FTL beat. |
| 11.6 — Backpack fidelity + offline progression | **Implemented, pending playtest** | PR #8 Round 6 (Minecraft-style grid inventory; extractor/condenser passive production with capped offline catch-up) delivers this sub-phase's actual goals, but was committed as part of the audit PR, not tagged `11.6`. The PR body itself flags that manual in-game playtesting of placing/producing/offline-catch-up has not been done — this is currently being manually playtested. |
| 11.7 — Balance, persistence hardening, perf pass | **Partially covered, unlabeled — not a dedicated pass** | PR #8 Round 1 covers real ground here (persistence bug fixes: cargo capacity, resource duplication, ground-drop loss; perf: telemetry decoupling, capped raycasts, fewer setState calls) but there has been no dedicated economy-balance or full regression pass across all 16 bodies. |

### Phase 12 — Procedural galaxy
Travel beyond the solar system into procedurally generated star systems, each
with its own unique planets to discover and explore. Not started.

### Phase 13 — Visual polish
A comprehensive AAA polish pass across every system, on all platforms and
quality levels. Not started.

### Phase 14 — Standalone game
Package as a native application via Tauri (desktop) and Capacitor (iOS /
Android) for a true standalone release. Not started.

---

## Technical audit & hardening (PR #8 — not a numbered phase)

A cross-cutting audit pass plus six follow-up rounds, spanning bug fixes,
performance, settings/FOV, water physics, localization, scan-range accuracy,
and (per the note above) work that substantively fulfills Phase 11.6/11.7.
This was never assigned a phase number because it isn't new capability along
the roadmap's arc — it's maintenance and correctness work across everything
built so far. Currently open as **PR #8** (draft, `storyline` → `master`,
unmerged). Its status is tracked here rather than by renaming or re-committing
history: the roadmap file is the source of truth for status, git history
stays as-is. Once Round 6 (11.6) and Round 1 (11.7) have been played through
and confirmed, update their status lines above accordingly.
