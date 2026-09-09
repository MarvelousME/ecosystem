export const motion = {
  duration: { fast: 0.14, normal: 0.24, slow: 0.42 },
  ease: {
    standard: 'power2.out',
    emphasized: 'power3.out',
    spring: 'elastic.out(1, 0.6)'
  },
  distance: { sm: 8, md: 16, lg: 28 }
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export async function pageEnter(el: HTMLElement | null) {
  if (!el || prefersReducedMotion()) {
    if (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
    return;
  }
  const { gsap } = await import('gsap');
  gsap.fromTo(
    el,
    { opacity: 0, y: motion.distance.md, filter: 'blur(6px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: motion.duration.normal, ease: motion.ease.emphasized }
  );
}

export async function staggerIn(selector: string, scope?: ParentNode) {
  if (prefersReducedMotion()) return;
  const { gsap } = await import('gsap');
  const root = scope || document;
  gsap.fromTo(
    root.querySelectorAll(selector),
    { opacity: 0, y: motion.distance.sm },
    { opacity: 1, y: 0, duration: motion.duration.normal, stagger: 0.05, ease: motion.ease.standard }
  );
}

export async function loginTimeline(refs: {
  mark: HTMLElement | null;
  title: HTMLElement | null;
  card: HTMLElement | null;
  cta: HTMLElement | null;
}) {
  if (prefersReducedMotion()) return;
  const { gsap } = await import('gsap');
  const tl = gsap.timeline();
  tl.fromTo(refs.mark, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: motion.ease.emphasized })
    .fromTo(refs.title, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35 }, '-=0.2')
    .fromTo(refs.card, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4 }, '-=0.1')
    .fromTo(refs.cta, { opacity: 0.4 }, { opacity: 1, duration: 0.25 });
}
