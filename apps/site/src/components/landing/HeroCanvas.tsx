/** @jsxImportSource react */
import { useGSAP } from "@gsap/react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Brand tokens (theme.css). Light theme swaps to the deeper half of the gradient. */
const DARK = { neon: "#00E5FF", glow: "#7DF9FF", blue: "#2F7BFF", deep: "#3D5AFE", core: "#060B16" };
const LIGHT = { neon: "#0086C9", glow: "#00B8FF", blue: "#2464E8", deep: "#3D5AFE", core: "#DCEAFF" };
type Palette = typeof DARK;

interface Env {
  reduced: boolean;
  coarse: boolean;
  light: boolean;
}

/** Shared mutable inputs, written by DOM listeners and read in useFrame (no React state per frame). */
interface Inputs {
  pointer: THREE.Vector2; // window-normalised -1..1, drives parallax
  ndc: THREE.Vector2; // canvas NDC, drives particle repulsion
  scroll: number; // 0..1 across the hero
}

const BASE_DIST = 7.4;

/**
 * Additive glow that leaves the canvas alpha untouched: the browser composites the premultiplied
 * colour on top of the page, so glow adds light instead of darkening the page behind the canvas.
 */
const ADD = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;
const NORMAL = { blending: THREE.NormalBlending } as const;
const blendFor = (light: boolean) => (light ? NORMAL : ADD);

function useTheme(): boolean {
  const read = () => document.documentElement.dataset.theme === "light";
  const [light, setLight] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setLight(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return light;
}

/* ---------- Particle field: one draw call, repelled by the pointer in the vertex shader ---------- */

const particleVert = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec3 uPointer;
  uniform float uPointerOn;
  attribute float aSeed;
  varying float vAlpha;
  varying float vMix;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 d = world.xyz - uPointer;
    float dist = length(d);
    float push = smoothstep(1.6, 0.0, dist) * uPointerOn;
    world.xyz += normalize(d + 1e-4) * push * 0.55;
    world.y += sin(uTime * 0.6 + aSeed * 6.2831) * 0.04;
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.65 + 0.35 * sin(uTime * (0.8 + aSeed) + aSeed * 40.0);
    gl_PointSize = (2.4 + aSeed * 3.6) * uPixelRatio * (7.0 / -mv.z);
    vAlpha = twinkle * (0.5 + push * 0.9);
    vMix = aSeed;
  }
`;
const particleFrag = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vMix;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(mix(uColorA, uColorB, vMix), a * a * vAlpha * uOpacity);
  }
`;

function Particles({ count, env, pal, inputs }: { count: number; env: Env; pal: Palette; inputs: Inputs }) {
  const ref = useRef<THREE.Points>(null);
  const { camera, gl } = useThree();
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const band = i % 5 < 3; // 60% in a flattened orbital band, the rest in a loose shell
      const r = band ? 2.3 + Math.random() * 2.6 : 2.6 + Math.random() * 3.4;
      const th = Math.random() * Math.PI * 2;
      const ph = band ? Math.PI / 2 + (Math.random() - 0.5) * 0.5 : Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVert,
        fragmentShader: particleFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
          uPointer: { value: new THREE.Vector3(99, 99, 99) },
          uPointerOn: { value: 0 },
          uColorA: { value: new THREE.Color() },
          uColorB: { value: new THREE.Color() },
          uOpacity: { value: 1 },
        },
      }),
    [],
  );
  useEffect(() => {
    Object.assign(mat, blendFor(env.light));
    mat.uniforms.uColorA!.value.set(pal.glow);
    mat.uniforms.uColorB!.value.set(pal.blue);
    mat.uniforms.uOpacity!.value = env.light ? 0.7 : 1;
    mat.needsUpdate = true;
  }, [env.light, pal, mat]);
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);

  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const u = mat.uniforms;
    u.uTime!.value += env.reduced ? 0 : delta;
    u.uPixelRatio!.value = gl.getPixelRatio();
    // Pointer ray against the z=0 plane, facing the camera.
    plane.normal.copy(camera.position).normalize();
    ray.setFromCamera(inputs.ndc, camera);
    const on = Math.abs(inputs.ndc.x) <= 1.2 && Math.abs(inputs.ndc.y) <= 1.2 && ray.ray.intersectPlane(plane, hit);
    if (on) u.uPointer!.value.lerp(hit, 0.18);
    u.uPointerOn!.value += ((on ? 1 : 0) - u.uPointerOn!.value) * 0.08;
    if (ref.current && !env.reduced) ref.current.rotation.y += delta * 0.025;
    void state;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

/* ---------- Globe: lit core, fresnel rim, geodesic wireframe ---------- */

const rimVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const rimFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uStrength;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - max(dot(vN, vV), 0.0), uPower);
    gl_FragColor = vec4(uColor, f * uStrength);
  }
`;

function Globe({ pal, env }: { pal: Palette; env: Env }) {
  const wire = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.62, 2)), []);
  const nodes = useMemo(() => {
    const ico = new THREE.IcosahedronGeometry(1.62, 1);
    // Unique vertices only, as glowing "cities" on the globe.
    const p = ico.getAttribute("position");
    const seen = new Set<string>();
    const out: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(k)) (seen.add(k), out.push(p.getX(i), p.getY(i), p.getZ(i)));
    }
    ico.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    return g;
  }, []);
  const rim = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: rimVert,
        fragmentShader: rimFrag,
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color() }, uPower: { value: 2.6 }, uStrength: { value: 1 } },
      }),
    [],
  );
  useEffect(() => {
    Object.assign(rim, blendFor(env.light));
    rim.needsUpdate = true;
    rim.uniforms.uColor!.value.set(pal.neon);
    rim.uniforms.uStrength!.value = env.light ? 0.55 : 0.9;
  }, [pal, env.light, rim]);
  useEffect(() => () => (wire.dispose(), nodes.dispose(), rim.dispose()), [wire, nodes, rim]);
  const blend = blendFor(env.light);

  const spin = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (spin.current && !env.reduced) spin.current.rotation.y += delta * 0.08;
  });

  return (
    <group ref={spin} rotation={[0.35, 0, -0.18]}>
      <mesh>
        <sphereGeometry args={[1.28, 48, 32]} />
        <meshStandardMaterial
          color={pal.core}
          metalness={0.7}
          roughness={0.42}
          emissive={pal.deep}
          emissiveIntensity={env.light ? 0.04 : 0.03}
        />
      </mesh>
      <mesh scale={1.34} material={rim}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <lineSegments geometry={wire}>
        <lineBasicMaterial color={pal.neon} transparent opacity={env.light ? 0.55 : 0.42} {...blend} depthWrite={false} />
      </lineSegments>
      <points geometry={nodes}>
        <pointsMaterial color={pal.glow} size={0.06} sizeAttenuation transparent opacity={0.95} {...blend} depthWrite={false} />
      </points>
    </group>
  );
}

/* ---------- Orbits: three tilted rings, each with one satellite ---------- */

const ORBITS = [
  { r: 2.2, tilt: [1.2, 0.2, 0.15], speed: 0.42, color: "glow" },
  { r: 2.62, tilt: [1.45, -0.5, -0.1], speed: -0.28, color: "neon" },
  { r: 3.05, tilt: [1.05, 0.65, 0.4], speed: 0.2, color: "blue" },
] as const;

function Orbit({ o, pal, env, phase }: { o: (typeof ORBITS)[number]; pal: Palette; env: Env; phase: number }) {
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * o.r, Math.sin(a) * o.r, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [o.r]);
  useEffect(() => () => ring.dispose(), [ring]);
  const sat = useRef<THREE.Group>(null);
  const angle = useRef(phase);
  useFrame((_, delta) => {
    if (!env.reduced) angle.current += delta * o.speed;
    sat.current?.position.set(Math.cos(angle.current) * o.r, Math.sin(angle.current) * o.r, 0);
  });
  const blend = blendFor(env.light);
  const c = pal[o.color];
  return (
    <group rotation={o.tilt as unknown as [number, number, number]}>
      <lineLoop geometry={ring}>
        <lineBasicMaterial color={c} transparent opacity={env.light ? 0.55 : 0.5} {...blend} depthWrite={false} />
      </lineLoop>
      <group ref={sat}>
        <mesh>
          <sphereGeometry args={[0.042, 16, 12]} />
          <meshBasicMaterial color={c} />
        </mesh>
        <pointLight color={c} intensity={env.light ? 0.5 : 1.2} distance={2.2} decay={2} />
      </group>
    </group>
  );
}

/** Soft additive halo behind the globe: a cheap bloom stand-in (one sprite, no postprocessing). */
function Halo({ pal, env }: { pal: Palette; env: Env }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.28)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <sprite scale={6} position={[0, 0, -1.5]}>
      <spriteMaterial
        map={tex}
        color={pal.deep}
        transparent
        opacity={env.light ? 0.16 : 0.5}
        {...blendFor(env.light)}
        depthWrite={false}
      />
    </sprite>
  );
}

/* ---------- Rig: pointer parallax + scroll-linked camera ---------- */

function Rig({ env, inputs, children }: { env: Env; inputs: Inputs; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const k = 1 - Math.pow(0.001, delta); // frame-rate independent easing
    const s = env.reduced ? 0 : inputs.scroll;
    const px = env.reduced ? 0 : inputs.pointer.x;
    const py = env.reduced ? 0 : inputs.pointer.y;
    g.rotation.y += (px * 0.22 - g.rotation.y) * k * 0.6;
    g.rotation.x += (-py * 0.14 + s * 0.55 - g.rotation.x) * k * 0.6;
    g.position.y += (s * 0.9 - g.position.y) * k;
    // Dolly the camera out along its current orbit direction as the hero scrolls away.
    const want = BASE_DIST + s * 2.8;
    const len = camera.position.length();
    camera.position.setLength(len + (want - len) * k);
  });
  return <group ref={ref}>{children}</group>;
}

function Scene({ env, inputs }: { env: Env; inputs: Inputs }) {
  const pal = env.light ? LIGHT : DARK;
  const count = env.coarse ? 900 : 2600;
  return (
    <>
      <ambientLight intensity={env.light ? 0.9 : 0.25} color={pal.glow} />
      <pointLight position={[4, 3, 4]} intensity={22} color={pal.neon} decay={2} />
      <pointLight position={[-4.5, -2, -1.5]} intensity={18} color={pal.deep} decay={2} />
      <directionalLight position={[0, 2.5, -5]} intensity={1.6} color={pal.blue} />
      <Rig env={env} inputs={inputs}>
        <Halo pal={pal} env={env} />
        <Globe pal={pal} env={env} />
        {ORBITS.map((o, i) => (
          <Orbit key={i} o={o} pal={pal} env={env} phase={i * 2.1} />
        ))}
        <Particles count={count} env={env} pal={pal} inputs={inputs} />
      </Rig>
      {!env.coarse && (
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableDamping
          dampingFactor={0.06}
          rotateSpeed={0.5}
          autoRotate={!env.reduced}
          autoRotateSpeed={0.45}
          minPolarAngle={Math.PI * 0.32}
          maxPolarAngle={Math.PI * 0.62}
        />
      )}
    </>
  );
}

export default function HeroCanvas({ onReady }: { onReady: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const light = useTheme();
  const env = useMemo<Env>(
    () => ({
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      coarse: matchMedia("(pointer: coarse)").matches || innerWidth < 768,
      light,
    }),
    [light],
  );
  const inputs = useRef<Inputs>({ pointer: new THREE.Vector2(), ndc: new THREE.Vector2(9, 9), scroll: 0 }).current;
  // Render only while on screen and the tab is visible; reduced motion renders on demand (static frame).
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === "visible");
  const frameloop = env.reduced ? "demand" : onScreen && tabVisible ? "always" : "never";

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(!!e?.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    const onMove = (e: PointerEvent) => {
      inputs.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      const r = el.getBoundingClientRect();
      inputs.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const onLeave = () => inputs.ndc.set(9, 9);
    if (!env.reduced) {
      addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [env.reduced, inputs]);

  // Scroll position across the hero drives the camera dolly (ScrollTrigger, no scroll listeners).
  useGSAP(
    () => {
      const hero = wrap.current?.closest(".hero");
      if (!hero || env.reduced) return;
      ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: "bottom top",
        onUpdate: (st) => (inputs.scroll = st.progress),
      });
    },
    { scope: wrap, dependencies: [env.reduced] },
  );

  return (
    <div ref={wrap} className="atlas-scene-canvas" aria-hidden="true">
      <Canvas
        frameloop={frameloop}
        dpr={[1, env.coarse ? 1.5 : 1.75]}
        camera={{ position: [0, 0.35, BASE_DIST], fov: 38, near: 0.1, far: 50 }}
        gl={{ antialias: !env.coarse, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          requestAnimationFrame(() => requestAnimationFrame(onReady));
        }}
      >
        <Scene env={env} inputs={inputs} />
      </Canvas>
    </div>
  );
}
