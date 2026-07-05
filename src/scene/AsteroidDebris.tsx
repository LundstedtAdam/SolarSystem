import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, MeshStandardMaterial, Matrix4, Vector3, Color, type Group } from 'three/webgpu';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { updateDebrisBodies } from '../systems/debrisPhysics';
import { debrisRuntime, type DebrisBody } from './debrisRuntime';
import { shipTelemetry } from '../ship/shipTelemetry';
import { rockGeometry } from './rockGeometry';
import { asteroidRuntime } from './asteroidRuntime';
import { getFracturePatterns, extractChunkGeometry } from '../systems/asteroidFracturePatterns';

const _m = new Matrix4();
const _scale = new Vector3();
const _rockColor = new Color(0.4, 0.37, 0.33);
const _oreColor = new Color(0.75, 0.62, 0.25);

/** Fragments with no `shapeKey` (the jitter-only fallback path, and cascade
 *  chips) render as this generic tier-0 rock. */
const GENERIC_BUCKET_KEY = 'generic';

/** Per-shape-bucket instance cap. Generous relative to how many concurrent
 *  fragments typically share one exact extracted-chunk shape; overall debris
 *  population is separately capped by `QUALITY[...].debrisMax` — a bucket
 *  hitting this cap just means a few fragments of that specific shape don't
 *  render this frame (physics/lifetime still runs), never a crash. */
const BUCKET_CAP = 48;

interface Bucket {
  inst: InstancedMesh;
  geometry: ReturnType<typeof rockGeometry>;
  /** Reset to 0 at the start of each frame, incremented as fragments claim a
   *  slot — becomes `inst.count` at the end of the frame. */
  frameCount: number;
}

function shapeBucketKey(d: DebrisBody): string {
  const k = d.shapeKey;
  return k ? `${k.tierIdx}:${k.variantIdx}:${k.patternIdx}:${k.clusterIdx}` : GENERIC_BUCKET_KEY;
}

/** Build the one representative shape for a bucket. Pattern-based buckets
 *  extract their cluster from the belt's shared *pristine* base geometry
 *  (not any single instance's live-dented copy) — required by instancing:
 *  every instance in one InstancedMesh shares one geometry, so per-bucket
 *  shape can't track a specific rock's evolving damage, only which chunk of
 *  which base shape it broke off as. Falls back to the generic rock if no
 *  belt is mounted to source geometry from (graceful degradation, same
 *  convention as the rest of the fracture system). */
function buildBucketGeometry(key: string): ReturnType<typeof rockGeometry> {
  if (key === GENERIC_BUCKET_KEY) return rockGeometry(0, 999);

  const [tierIdx, variantIdx, patternIdx, clusterIdx] = key.split(':').map(Number);
  const base = asteroidRuntime.promotion?.getBaseGeometry(tierIdx, variantIdx) ?? null;
  if (!base) return rockGeometry(0, 999);

  const patterns = getFracturePatterns(tierIdx, variantIdx, base);
  const pattern = patterns[Math.min(patternIdx, patterns.length - 1)];
  return extractChunkGeometry(base, pattern, clusterIdx).geometry;
}

/**
 * Pooled debris/ore-chunk fragments spawned by asteroid fracture (and, later,
 * space mining). One InstancedMesh per distinct fragment *shape* — keyed by
 * (tierIdx, variantIdx, patternIdx, clusterIdx) for pattern-based fragments,
 * or a single shared generic bucket for the jitter-only fallback path and
 * cascade chips — so fragments visually read as the actual chunk they broke
 * off, not a single generic rock repeated everywhere. Buckets are built
 * lazily on first use and kept for the session (the set of distinct shapes
 * is small and finite: at most 6 base geometries × 2 patterns × ≤6 clusters).
 */
export function AsteroidDebris() {
  const q = QUALITY[useStore((s) => s.quality)];
  const sceneModeType = useStore((s) => s.sceneMode.type);
  const group = useRef<Group>(null);
  const bucketsRef = useRef<Map<string, Bucket>>(new Map());

  const material = useMemo(() => {
    if (q.debrisMax === 0) return null;
    return new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  }, [q.debrisMax]);

  // Publish current quality budgets to the runtime singleton and drop any
  // fragments beyond a shrunk cap when quality is lowered mid-flight.
  useEffect(() => {
    debrisRuntime.maxCount = q.debrisMax;
    debrisRuntime.maxLifeSec = q.debrisLifetimeSec;
    debrisRuntime.cullDistance = q.debrisCullDistance;
    if (debrisRuntime.list.length > q.debrisMax) {
      debrisRuntime.list.length = q.debrisMax;
    }
  }, [q.debrisMax, q.debrisLifetimeSec, q.debrisCullDistance]);

  // Free GPU resources for every bucket built so far, and reset the map, any
  // time the material is (re)built (quality change) or the component unmounts.
  useEffect(() => {
    const buckets = bucketsRef.current;
    const g = group.current;
    return () => {
      buckets.forEach((b) => {
        g?.remove(b.inst);
        b.inst.dispose();
        b.geometry.dispose();
      });
      buckets.clear();
      material?.dispose();
    };
  }, [material]);

  useFrame((_, delta) => {
    if (!material || !group.current) return;
    if (sceneModeType !== 'piloting') return;
    const dt = Math.min(delta, 0.05);
    const store = useStore.getState();
    updateDebrisBodies(
      debrisRuntime.list,
      dt,
      store.simTimeDays,
      shipTelemetry.position,
      debrisRuntime.maxLifeSec,
      debrisRuntime.cullDistance,
    );

    const buckets = bucketsRef.current;
    buckets.forEach((b) => {
      b.frameCount = 0;
    });

    const list = debrisRuntime.list;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const key = shapeBucketKey(d);
      let bucket = buckets.get(key);
      if (!bucket) {
        const geometry = buildBucketGeometry(key);
        const inst = new InstancedMesh(geometry, material, BUCKET_CAP);
        inst.frustumCulled = false;
        inst.count = 0;
        group.current.add(inst);
        bucket = { inst, geometry, frameCount: 0 };
        buckets.set(key, bucket);
      }
      if (bucket.frameCount >= BUCKET_CAP) continue;

      const slot = bucket.frameCount++;
      _scale.set(d.radius, d.radius, d.radius);
      _m.compose(d.pos, d.quat, _scale);
      bucket.inst.setMatrixAt(slot, _m);
      bucket.inst.setColorAt(slot, d.isOre ? _oreColor : _rockColor);
    }

    buckets.forEach((b) => {
      b.inst.count = b.frameCount;
      b.inst.instanceMatrix.needsUpdate = true;
      if (b.inst.instanceColor) b.inst.instanceColor.needsUpdate = true;
    });
  });

  if (!material) return null;
  return <group ref={group} />;
}
