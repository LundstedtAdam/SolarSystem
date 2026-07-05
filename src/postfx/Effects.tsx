import { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PostProcessing } from 'three/webgpu';
import { pass, bloom, screenUV, float, mix, smoothstep, vec4, uniform, vec3 } from 'three/tsl';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';
import { getHeatIntensity } from '../descent/descentUniforms';

const heatUniform = uniform(0);
// Reactive so quality changes to the CA amount never require rebuilding the
// node graph — only whether the branch exists at all (see the useMemo below)
// does.
const caUniform = uniform(0);
const reentryTint = vec3(1.0, 0.6, 0.3);

export function Effects() {
  const renderer = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const q = QUALITY[useStore((s) => s.quality)];

  // The bloom node's strength/radius/threshold are already internally
  // uniform()-wrapped by three.js, so ordinary quality-tier tuning updates
  // them in place (see the effect below) instead of rebuilding the whole
  // pipeline. These refs exist so a *structural* rebuild (bloom/chromatic
  // aberration turning on or off) can dispose the previous GPU resources
  // first — PassNode/BloomNode both own real render targets that were
  // previously leaked on every quality change.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scenePassRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bloomNodeRef = useRef<any>(null);

  const post = useMemo(() => {
    scenePassRef.current?.dispose?.();
    bloomNodeRef.current?.dispose?.();

    const scenePass = pass(scene, camera);
    scenePassRef.current = scenePass;
    const color = scenePass.getTextureNode();

    const dist = screenUV.sub(0.5).length();
    const vignette = mix(float(1.0), float(0.32), smoothstep(0.2, 1.0, dist));

    let lit = color;
    if (q.bloomStrength > 0) {
      const bloomNode = bloom(color, q.bloomStrength, q.bloomRadius, q.bloomThreshold);
      bloomNodeRef.current = bloomNode;
      lit = color.add(bloomNode);
    } else {
      bloomNodeRef.current = null;
    }

    // Build the base image (with chromatic aberration if enabled), THEN apply
    // the re-entry heat tint to all channels. Previously the tint was applied
    // only to the green channel in the aberration path, so the heat read green
    // instead of warm orange.
    let base = lit;
    if (q.chromaticAberration > 0) {
      const offset = screenUV.sub(0.5).mul(caUniform.add(heatUniform.mul(0.003)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passNode = scenePass as any;
      const rSample = passNode.getTextureNode().uv(screenUV.add(offset));
      const bSample = passNode.getTextureNode().uv(screenUV.sub(offset));
      base = vec4(rSample.r, lit.g, bSample.b, float(1.0));
    }

    const heatTinted = mix(base, vec4(reentryTint, float(1.0)), heatUniform.mul(0.3));
    const composed = heatTinted.mul(vignette);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pp = new PostProcessing(renderer as any);
    pp.outputNode = composed;
    return pp;
    // Structural deps only (whether bloom/CA exist in the graph at all) — a
    // plain quality-tier tuning change (e.g. bloomStrength 0.25 -> 0.3) must
    // NOT land here, or it rebuilds (and, until the fix above, leaked) the
    // entire postprocessing pipeline on every quality change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, scene, camera, q.bloomStrength > 0, q.chromaticAberration > 0]);

  // In-place tuning: update the existing uniforms instead of rebuilding.
  useEffect(() => {
    if (bloomNodeRef.current) {
      bloomNodeRef.current.strength.value = q.bloomStrength;
      bloomNodeRef.current.radius.value = q.bloomRadius;
      bloomNodeRef.current.threshold.value = q.bloomThreshold;
    }
    caUniform.value = q.chromaticAberration;
  }, [q.bloomStrength, q.bloomRadius, q.bloomThreshold, q.chromaticAberration]);

  useEffect(() => {
    post.needsUpdate = true;
  }, [post, size.width, size.height]);

  useEffect(() => {
    return () => {
      scenePassRef.current?.dispose?.();
      bloomNodeRef.current?.dispose?.();
    };
  }, []);

  useFrame(() => {
    heatUniform.value = getHeatIntensity();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (post as any).render();
  }, 1);

  return null;
}
