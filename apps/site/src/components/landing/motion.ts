/**
 * Landing page scroll motion (GSAP + ScrollTrigger). Loaded lazily by Landing.astro only when the
 * visitor allows motion. The hero intro is CSS (motion.css) so LCP never waits for this chunk.
 * Nothing is hidden before this runs: only elements still below the fold get a start state.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const EASE = "expo.out";

/** Elements already scrolled past or on screen keep their final state: no flash, no hidden content. */
const belowFold = (el: Element) => el.getBoundingClientRect().top > innerHeight * 0.9;

function reveals(landing: HTMLElement) {
  // Section headings: short lift.
  landing.querySelectorAll<HTMLElement>("section:not(.hero) h2").forEach((h) => {
    if (!belowFold(h)) return;
    gsap.from(h, { opacity: 0, y: 24, duration: 0.9, ease: EASE, scrollTrigger: { trigger: h, start: "top 88%", once: true } });
  });

  // Feature tiles: staggered in reading order as each row arrives.
  const tiles = [...landing.querySelectorAll<HTMLElement>(".bento .tile, .extras li")].filter(belowFold);
  if (tiles.length) {
    gsap.set(tiles, { opacity: 0, y: 28 });
    ScrollTrigger.batch(tiles, {
      start: "top 90%",
      once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: EASE, stagger: 0.08, overwrite: true }),
    });
  }

  // Demo window: scales up into place once, so the recording is never left half-faded.
  const demo = landing.querySelector<HTMLElement>(".demo-frame");
  if (demo && belowFold(demo)) {
    gsap.fromTo(
      demo,
      { scale: 0.92, opacity: 0, y: 40, transformOrigin: "50% 0%" },
      { scale: 1, opacity: 1, y: 0, duration: 1.1, ease: EASE, scrollTrigger: { trigger: demo, start: "top 88%", once: true } },
    );
  }

  // How it works: the progress line draws through the steps, numbers light up as it passes.
  const steps = landing.querySelector<HTMLElement>(".steps");
  const line = steps?.querySelector<HTMLElement>(".steps-line i");
  if (steps && line) {
    const vertical = matchMedia("(max-width: 47.99rem)").matches;
    gsap.fromTo(
      line,
      { [vertical ? "scaleY" : "scaleX"]: 0 },
      {
        [vertical ? "scaleY" : "scaleX"]: 1,
        ease: "none",
        scrollTrigger: { trigger: steps, start: "top 80%", end: vertical ? "bottom 60%" : "top 35%", scrub: 0.5 },
      },
    );
    const items = [...steps.querySelectorAll<HTMLElement>("li")];
    items.forEach((li, i) => {
      if (!belowFold(li)) return;
      gsap.from(li.children, {
        opacity: 0,
        y: 16,
        duration: 0.7,
        ease: EASE,
        stagger: 0.06,
        delay: vertical ? 0 : i * 0.12,
        scrollTrigger: { trigger: vertical ? li : steps, start: "top 82%", once: true },
      });
    });
  }

  // FAQ rows: one quiet stagger.
  const faq = [...landing.querySelectorAll<HTMLElement>(".faq details")].filter(belowFold);
  if (faq.length) {
    gsap.from(faq, {
      opacity: 0,
      y: 14,
      duration: 0.6,
      ease: EASE,
      stagger: 0.05,
      scrollTrigger: { trigger: faq[0], start: "top 90%", once: true },
    });
  }
}

/** CTA buttons lean toward a fine pointer (feedback, not decoration); springs back on leave. */
function magnetic(landing: HTMLElement) {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  landing.querySelectorAll<HTMLElement>(".actions .btn").forEach((btn) => {
    const x = gsap.quickTo(btn, "x", { duration: 0.4, ease: "power3.out" });
    const y = gsap.quickTo(btn, "y", { duration: 0.4, ease: "power3.out" });
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.22);
      y((e.clientY - (r.top + r.height / 2)) * 0.3);
    });
    btn.addEventListener("pointerleave", () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.45)", overwrite: true });
    });
  });
}

export function run() {
  const landing = document.querySelector<HTMLElement>(".landing");
  if (!landing) return;
  reveals(landing);
  magnetic(landing);
  // Fonts change line boxes; recompute trigger positions once they settle.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}
