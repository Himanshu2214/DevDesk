// Motion tokens for Motion for React – the same curves and durations as the CSS tokens in styles/motion.css.
import type { Transition } from 'motion/react';

export const EASE_OUT = [0.2, 0, 0, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;

const enter = (duration: number): Transition => ({ duration, ease: EASE_OUT });
const exit = (duration: number): Transition => ({ duration, ease: EASE_IN });

/** Fade + small scale/rise for dialogs and the command palette */
export const dialogMotion = {
  initial: { opacity: 0, scale: 0.98, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: enter(0.22) },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: exit(0.14) },
};
export const scrimMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: enter(0.18) },
  exit: { opacity: 0, transition: exit(0.14) },
};
export const toastMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: enter(0.22) },
  exit: { opacity: 0, scale: 0.98, transition: exit(0.14) },
};
/** Shared-layout indicator (active nav item) */
export const indicatorTransition: Transition = { duration: 0.22, ease: EASE_OUT };
