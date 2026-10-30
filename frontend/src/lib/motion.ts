// Motion tokens for Motion for React – the same curves and durations as the CSS tokens in styles/motion.css.
import type { Transition } from 'motion/react';

export const EASE_OUT = [0.2, 0, 0, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;

const enter = (duration: number): Transition => ({ duration, ease: EASE_OUT });
const exit = (duration: number): Transition => ({ duration, ease: EASE_IN });

/** Modal dialog (motion.dev "Modal dialog"): tilts up out of a 3D perspective with a soft spring; quick ease-in exit */
export const dialogMotion = {
  initial: { opacity: 0, scale: 0.94, y: 14, rotateX: 10, transformPerspective: 900 },
  animate: { opacity: 1, scale: 1, y: 0, rotateX: 0, transformPerspective: 900, transition: { type: 'spring', stiffness: 380, damping: 32 } as Transition },
  exit: { opacity: 0, scale: 0.97, y: 6, rotateX: -4, transformPerspective: 900, transition: exit(0.14) },
};
/** Backdrop fades and softly blurs what is behind the dialog */
export const scrimMotion = {
  initial: { opacity: 0, backdropFilter: 'blur(0px)' },
  animate: { opacity: 1, backdropFilter: 'blur(3px)', transition: enter(0.2) },
  exit: { opacity: 0, backdropFilter: 'blur(0px)', transition: exit(0.14) },
};
export const toastMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: enter(0.22) },
  exit: { opacity: 0, scale: 0.98, transition: exit(0.14) },
};
/** Shared-layout indicator (active nav item) */
export const indicatorTransition: Transition = { duration: 0.22, ease: EASE_OUT };
