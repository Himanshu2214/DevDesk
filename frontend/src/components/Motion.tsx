// App-wide motion: page transitions (a random one of a few per navigation), the scroll progress bar of a page and the
// ripple on buttons – after Animate UI's page transition, scroll progress and ripple button, built on Motion for React 18.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m, useScroll, useSpring, type Variants } from 'motion/react';

const VARIANTS: Variants[] = [
  { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } },                                      // rise
  { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.01 } },                      // zoom
  { initial: { opacity: 0, x: 22 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -14 } },                                     // slide
  { initial: { opacity: 0, filter: 'blur(8px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, exit: { opacity: 0, filter: 'blur(4px)' } }, // focus
  { initial: { opacity: 0, clipPath: 'inset(0 0 12% 0 round 10px)' }, animate: { opacity: 1, clipPath: 'inset(0 0 0% 0 round 10px)' }, exit: { opacity: 0 } }, // reveal
];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Wraps the current page; a new key (route) plays a randomly chosen transition */
export function PageTransition({ id, children }: { id: string; children: React.ReactNode }) {
  const v = useMemo(() => VARIANTS[Math.floor(Math.random() * VARIANTS.length)], [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const variants: Variants = reduced() ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { ...v, exit: { ...(v.exit as object), transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } } };
  return <AnimatePresence mode="wait" initial={false}>
    <m.div key={id} className="route" variants={variants} initial="initial" animate="animate" exit="exit"
      transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.8, opacity: { duration: 0.18 } }}>{children}</m.div>
  </AnimatePresence>;
}

/** Thin bar at the top of a scrolling page body that fills as you scroll */
export function ScrollProgress({ target }: { target: React.RefObject<HTMLElement> }) {
  const { scrollYProgress } = useScroll({ container: target });
  const scaleX = useSpring(scrollYProgress, { stiffness: 260, damping: 32, restDelta: 0.001 });
  const [show, setShow] = useState(false);
  useEffect(() => scrollYProgress.on('change', p => setShow(p > 0.002)), [scrollYProgress]);
  return <m.div className="scroll-progress" aria-hidden="true" style={{ scaleX, opacity: show ? 1 : 0 }} />;
}

/** Ripple from the pressed point on buttons, pills and nav items (one listener for the whole app) */
export function Ripples() {
  const on = useRef(!reduced());
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!on.current || e.button !== 0) return;
      const el = (e.target as Element).closest<HTMLElement>('.btn, .ib, .pill, .ni, .bnav-i, .xb, .um-btn, .ob-chip, .gcal-connect');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      el.classList.add('has-ripple');
      el.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    };
    addEventListener('pointerdown', down, { passive: true });
    return () => removeEventListener('pointerdown', down);
  }, []);
  return null;
}
