import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';

/**
 * Matériaux animés du plateau. Ils reçoivent tous un uniform `uTime` piloté par
 * `useAnimatedMaterial` ; les positions sont lues en coordonnées monde pour que
 * l'eau ou la lave « coulent » d'une case à l'autre sans couture.
 */
const worldVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const noise = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

export function waterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: worldVertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      ${noise}
      void main() {
        vec2 p = vWorld.xz * 1.6;
        float n = fbm(p + vec2(uTime * 0.25, uTime * 0.18));
        float m = fbm(p * 1.7 - vec2(uTime * 0.2, -uTime * 0.12) + n);
        float caustic = smoothstep(0.55, 0.78, m);
        vec3 deep = vec3(0.05, 0.22, 0.38);
        vec3 shallow = vec3(0.24, 0.62, 0.86);
        vec3 col = mix(deep, shallow, n) + caustic * vec3(0.55, 0.85, 1.0) * 0.55;
        gl_FragColor = vec4(col, 0.62 + caustic * 0.25);
      }
    `,
  });
}

export function lavaMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: worldVertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      ${noise}
      void main() {
        vec2 p = vWorld.xz * 1.3;
        float n = fbm(p + vec2(uTime * 0.08, -uTime * 0.05));
        float veins = fbm(p * 2.2 + n * 2.0 - uTime * 0.1);
        float crust = smoothstep(0.42, 0.62, veins);
        vec3 hot = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.85, 0.35), smoothstep(0.5, 0.9, n));
        vec3 col = mix(hot * (1.15 + 0.25 * sin(uTime * 2.0 + n * 6.0)), vec3(0.16, 0.05, 0.06), crust);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** Rideau lumineux (zones, portée) : dégradé vertical et bandes qui montent. */
export function curtainMaterial(color: string, strength = 1): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) }, uStrength: { value: strength } },
    vertexShader: worldVertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float fade = pow(1.0 - vUv.y, 1.6);
        float bands = 0.75 + 0.25 * sin(vUv.y * 18.0 - uTime * 3.0);
        gl_FragColor = vec4(uColor * fade * bands * uStrength, 1.0);
      }
    `,
  });
}

/** Dalles de zone : remplissage doux + liseré sur le bord de chaque case. */
export function tileMaterial(color: string, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
    vertexShader: worldVertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 d = min(vUv, 1.0 - vUv);
        float edge = 1.0 - smoothstep(0.0, 0.06, min(d.x, d.y));
        float pulse = 0.85 + 0.15 * sin(uTime * 2.2);
        gl_FragColor = vec4(uColor, uOpacity * pulse * (0.65 + edge * 0.9));
      }
    `,
  });
}

/** Colonne de lumière au-dessus de la créature active. */
export function beaconMaterial(color: string): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) } },
    vertexShader: worldVertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float fade = pow(1.0 - vUv.y, 2.2);
        float swirl = 0.6 + 0.4 * sin(vUv.x * 6.2832 * 3.0 + vUv.y * 9.0 - uTime * 2.5);
        gl_FragColor = vec4(uColor * fade * swirl * 0.9, 1.0);
      }
    `,
  });
}

/** Crée un matériau une fois, avance son horloge à chaque image, le libère au démontage. */
export function useAnimatedMaterial<T extends ShaderMaterial>(factory: () => T, deps: readonly unknown[]): T {
  const mat = useMemo(factory, deps);
  useFrame(({ clock }) => {
    mat.uniforms.uTime!.value = clock.elapsedTime;
  });
  useDisposable(mat);
  return mat;
}

/** Libère une ressource GPU (géométrie, matériau, texture) quand elle est remplacée. */
export function useDisposable(resource: { dispose(): void } | null | undefined): void {
  useEffect(() => () => resource?.dispose(), [resource]);
}

/**
 * Brouillard de guerre : une texture d'une case par texel (filtrage linéaire = bords doux).
 * Rouge = 0 jamais vu (nuit opaque où dérive une brume), 0,5 exploré (assombri), 1 visible.
 */
export function fogMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uFog: { value: null } },
    vertexShader: worldVertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uFog;
      varying vec3 vWorld;
      varying vec2 vUv;
      ${noise}
      void main() {
        float v = texture2D(uFog, vUv).r;
        float mist = fbm(vWorld.xz * 0.45 + vec2(uTime * 0.04, -uTime * 0.03));
        float unknown = 1.0 - smoothstep(0.0, 0.5, v);
        float explored = 1.0 - smoothstep(0.5, 1.0, v);
        float alpha = max(unknown * (0.9 + mist * 0.1), explored * 0.58);
        vec3 col = mix(vec3(0.025, 0.02, 0.04), vec3(0.16, 0.11, 0.24), mist * unknown * 0.9);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}
