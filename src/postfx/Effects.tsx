import { useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PostProcessing } from 'three/webgpu';
import { pass, bloom, screenUV, float, mix, smoothstep } from 'three/tsl';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';

/**
 * TSL node post-processing: scene pass → additive bloom → vignette, with ACES
 * tone mapping + sRGB applied by PostProcessing on output. A priority useFrame
 * takes over the render loop (R3F stops auto-rendering when priority > 0).
 */
export function Effects() {
  const renderer = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const bloomStrength = QUALITY[useStore((s) => s.quality)].bloomStrength;

  const post = useMemo(() => {
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode();

    // Vignette: 1.0 at center → 0.4 at the corners.
    const dist = screenUV.sub(0.5).length();
    const vignette = mix(float(1.0), float(0.4), smoothstep(0.25, 0.95, dist));

    // Additive bloom (strength, radius, threshold) — skipped on low quality.
    const lit = bloomStrength > 0 ? color.add(bloom(color, bloomStrength, 0.5, 0.0)) : color;
    const composed = lit.mul(vignette);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pp = new PostProcessing(renderer as any);
    pp.outputNode = composed;
    return pp;
  }, [renderer, scene, camera, bloomStrength]);

  // Rebuild the output transform when the drawing buffer size changes.
  useEffect(() => {
    post.needsUpdate = true;
  }, [post, size.width, size.height]);

  useFrame(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (post as any).render();
  }, 1);

  return null;
}
