/** @jsxImportSource react */
import { lazy, Suspense, useEffect, useState } from "react";

/**
 * Hero "atlas" scene island. SSR renders only the static CSS fallback (reserved box, no layout shift).
 * The three.js chunk is fetched after the island is visible, the browser is idle, WebGL works
 * and the visitor has not asked for reduced motion (that case still gets one static WebGL frame).
 */
const HeroCanvas = lazy(() => import("./HeroCanvas"));

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const idle = (cb: () => void) =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 300);

export default function HeroScene() {
  const [mode, setMode] = useState<"fallback" | "live">("fallback");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!hasWebGL()) return;
    // Low-memory devices and data-saver keep the CSS fallback.
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData || (nav.deviceMemory !== undefined && nav.deviceMemory < 2)) return;
    // Start the 3D chunk only after the page has loaded and gone idle, so it never competes
    // with the hero text, fonts or the GSAP chunk for bandwidth or main thread.
    let cancelled = false;
    const start = () => idle(() => !cancelled && setMode("live"));
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      removeEventListener("load", start);
    };
  }, []);

  return (
    <div className="atlas-scene" data-shown={shown ? "" : undefined}>
      <div className="atlas-scene-fallback" aria-hidden="true" />
      {mode === "live" && (
        <Suspense fallback={null}>
          <HeroCanvas onReady={() => setShown(true)} />
        </Suspense>
      )}
    </div>
  );
}
