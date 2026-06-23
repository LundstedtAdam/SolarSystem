import { useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PostProcessing } from 'three/webgpu';
import { pass, bloom, screenUV, float, mix, smoothstep, vec4 } from 'three/tsl';
import { useStore } from '../store';
import { QUALITY } from '../systems/quality';

export function Effects() {
  const renderer = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const q = QUALITY[useStore((s) => s.quality)];

  const post = useMemo(() => {
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode();

    const dist = screenUV.sub(0.5).length();
    const vignette = mix(float(1.0), float(0.32), smoothstep(0.2, 1.0, dist));

    const lit = q.bloomStrength > 0
      ? color.add(bloom(color, q.bloomStrength, q.bloomRadius, q.bloomThreshold))
      : color;

    let composed;
    if (q.chromaticAberration > 0) {
      // Chromatic aberration: sample the scene pass with offset UVs per channel.
      const offset = screenUV.sub(0.5).mul(float(q.chromaticAberration));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passNode = scenePass as any;
      const rSample = passNode.getTextureNode().uv(screenUV.add(offset));
      const bSample = passNode.getTextureNode().uv(screenUV.sub(offset));
      const r = rSample.r;
      const g = lit.g;
      const b = bSample.b;
      composed = vec4(r, g, b, float(1.0)).mul(vignette);
    } else {
      composed = lit.mul(vignette);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pp = new PostProcessing(renderer as any);
    pp.outputNode = composed;
    return pp;
  }, [renderer, scene, camera, q.bloomStrength, q.bloomRadius, q.bloomThreshold, q.chromaticAberration]);

  useEffect(() => {
    post.needsUpdate = true;
  }, [post, size.width, size.height]);

  useFrame(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (post as any).render();
  }, 1);

  return null;
}
