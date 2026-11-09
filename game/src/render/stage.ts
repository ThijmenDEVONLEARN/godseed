import { SCREEN } from '../ui/layout';

/** Scales the fixed 1080x1920 stage to fit the window, keeping 9:16. */
export function fitToWindow(el: HTMLElement): void {
  const fit = () => {
    const s = Math.min(window.innerWidth / SCREEN.w, window.innerHeight / SCREEN.h);
    el.style.transform = `translate(${(window.innerWidth - SCREEN.w * s) / 2}px, ${(window.innerHeight - SCREEN.h * s) / 2}px) scale(${s})`;
  };
  window.addEventListener('resize', fit);
  fit();
}
