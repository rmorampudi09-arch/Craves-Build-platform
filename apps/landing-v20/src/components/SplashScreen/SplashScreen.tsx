import { useEffect, useRef } from 'react';
import './SplashScreen.css';

type SplashScreenProps = {
  onRevealStart: () => void;
  onComplete: () => void;
};

const SplashScreen = ({ onRevealStart, onComplete }: SplashScreenProps) => {
  const callbacksRef = useRef({ onRevealStart, onComplete });
  const splashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    callbacksRef.current = { onRevealStart, onComplete };
  }, [onRevealStart, onComplete]);

  useEffect(() => {
    const splash = splashRef.current;
    if (!splash) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timers = new Set<number>();
    const imageListeners: Array<() => void> = [];
    let disposed = false;
    let started = false;
    let revealed = false;
    let finished = false;
    let targetFrame = 0;
    let handoffFrame = 0;
    let handoffTimer: number | undefined;
    document.body.classList.add('splash-active');
    document.documentElement.setAttribute('data-craves-splash-active', 'true');

    const later = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!disposed && !finished) callback();
      }, delay);
      timers.add(timer);
    };

    const cancelHandoff = () => {
      window.cancelAnimationFrame(handoffFrame);
      handoffFrame = 0;
      window.clearTimeout(handoffTimer);
      handoffTimer = undefined;
    };

    const afterPaint = (callback: () => void) => {
      cancelHandoff();
      let delivered = false;
      const deliver = () => {
        if (disposed || delivered) return;
        delivered = true;
        cancelHandoff();
        callback();
      };
      // Hidden tabs may suspend animation frames. Keep every handoff bounded.
      handoffTimer = window.setTimeout(deliver, 240);
      handoffFrame = window.requestAnimationFrame(() => {
        handoffFrame = window.requestAnimationFrame(deliver);
      });
    };

    const intersectsViewport = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < window.innerHeight &&
        bounds.right > 0 && bounds.left < window.innerWidth;
    };

    const releaseBoot = () => {
      // The existing TypeScript/Vite hook paints this cover before React starts.
      // Remove it only once the matching React splash or landing page is painted.
      document.dispatchEvent(new Event('craves:boot-release'));
      document.getElementById('craves-boot')?.remove();
      document.documentElement.removeAttribute('data-craves-boot');
    };

    const reveal = () => {
      if (revealed || disposed) return;
      revealed = true;
      callbacksRef.current.onRevealStart();
    };

    const finish = () => {
      if (finished || disposed) return;
      finished = true;
      reveal();
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      document.body.classList.remove('splash-active');
      document.documentElement.removeAttribute('data-craves-splash-active');
      const requestedAt = performance.now();
      const handoff = () => {
        if (disposed) return;
        const app = splash.closest('.app');
        const underlay = app?.querySelectorAll<HTMLElement>('.navbar, .hero') ?? [];
        const painted = app?.classList.contains('app--ready') &&
          Array.from(underlay).every((element) =>
            (!element.classList.contains('navbar') && !intersectsViewport(element)) ||
            Number(getComputedStyle(element).opacity) >= 0.99);
        if (!document.hidden && !painted && performance.now() - requestedAt < 2000) {
          afterPaint(handoff);
          return;
        }
        releaseBoot();
        callbacksRef.current.onComplete();
      };
      // Keep the final decoded logo over its target until the landing commit
      // has painted. Also cover early exits for failed assets/reduced motion.
      afterPaint(handoff);
    };

    const updateTarget = () => {
      targetFrame = 0;
      if (disposed || finished) return false;
      const navLogo = document.querySelector<HTMLElement>('.navbar__logo img');
      const title = splash.querySelector<HTMLImageElement>('.splash__wordmark');
      if (!navLogo || !title) return false;
      const target = navLogo.getBoundingClientRect();
      const titleWidth = Number.parseFloat(getComputedStyle(title).width);
      if (!target.width || !target.height || !titleWidth) return false;
      const radius = getComputedStyle(navLogo).borderTopLeftRadius;
      const titleScale = (target.width * 1048) / (1254 * titleWidth);
      splash.style.setProperty('--nav-logo-left', `${target.left}px`);
      splash.style.setProperty('--nav-logo-top', `${target.top}px`);
      splash.style.setProperty('--nav-logo-width', `${target.width}px`);
      splash.style.setProperty('--nav-logo-height', `${target.height}px`);
      splash.style.setProperty('--nav-logo-radius', radius);
      splash.style.setProperty('--splash-title-scale', `${titleScale}`);
      return true;
    };

    const scheduleTarget = () => {
      if (!targetFrame && !disposed && !finished) {
        targetFrame = window.requestAnimationFrame(() => { updateTarget(); });
      }
    };

    const start = () => {
      if (started || disposed || finished) return;
      const images = Array.from(splash.querySelectorAll<HTMLImageElement>('img'));
      window.cancelAnimationFrame(targetFrame);
      targetFrame = 0;
      if (!images.every((image) => image.naturalWidth > 0) || !updateTarget()) {
        finish();
        return;
      }

      started = true;
      // Prepare the landing under the opaque boot cover before the CSS morph
      // clock starts. A busy main thread must not delay a timer-based reveal
      // until after the compositor has already shrunk away the splash.
      reveal();
      const beginAnimation = () => {
        if (disposed || finished) return;
        const app = splash.closest('.app');
        const hero = app?.querySelector('.hero');
        if (!app?.classList.contains('app--ready') ||
          (hero && intersectsViewport(hero) && !hero.classList.contains('is-visible'))) {
          afterPaint(beginAnimation);
          return;
        }
        if (!updateTarget()) {
          finish();
          return;
        }
        splash.classList.add('splash--ready');
        // Both painted surfaces use the same original wordmark and background.
        releaseBoot();
        // Keep the approved CSS delays, morph and final-logo timings intact.
        later(finish, motion.matches ? 180 : 2700);
      };
      afterPaint(beginAnimation);
    };

    const onAnimationStart = (event: AnimationEvent) => {
      // Keep the reserved scrollbar strip red until the surface actually moves.
      if (event.animationName === 'splashSurfaceMorph') {
        document.documentElement.removeAttribute('data-craves-splash-active');
      }
    };
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName === 'splashSurfaceMorph') {
        document.body.classList.remove('splash-active');
      } else if (event.animationName === 'splashFinalLogoIn') {
        later(finish, 30);
      }
    };
    const onMotionChange = () => { if (motion.matches) finish(); };
    const onVisibilityChange = () => { if (document.hidden) finish(); };

    const whenDecoded = (image: HTMLImageElement): Promise<boolean> =>
      new Promise((resolve) => {
        let handled = false;
        const decode = () => {
          if (handled) return;
          handled = true;
          image.removeEventListener('load', decode);
          image.removeEventListener('error', decode);
          if (!image.naturalWidth) resolve(false);
          else if (typeof image.decode === 'function') {
            void image.decode().then(() => resolve(true), () => resolve(false));
          } else resolve(true);
        };
        if (image.complete) decode();
        else {
          image.addEventListener('load', decode, { once: true });
          image.addEventListener('error', decode, { once: true });
          imageListeners.push(() => {
            image.removeEventListener('load', decode);
            image.removeEventListener('error', decode);
          });
        }
      });

    // Reuse the inline, already-visible original logo to avoid a second fetch
    // delaying the title on a first visit or a hard reload.
    const bootTitle = document.getElementById('craves-boot-wordmark') as HTMLImageElement | null;
    const title = splash.querySelector<HTMLImageElement>('.splash__wordmark');
    if (bootTitle && title) title.src = bootTitle.currentSrc || bootTitle.src;

    scheduleTarget();
    window.addEventListener('resize', scheduleTarget, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    splash.addEventListener('animationstart', onAnimationStart);
    splash.addEventListener('animationend', onAnimationEnd);
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', onMotionChange);
    else motion.addListener(onMotionChange);

    const navLogo = document.querySelector<HTMLImageElement>('.navbar__logo img');
    const images = [
      ...Array.from(splash.querySelectorAll<HTMLImageElement>('img')),
      ...(navLogo ? [navLogo] : []),
    ];
    type BootWindow = Window & {
      __cravesBoot?: { stylesReady: Promise<void>; release: () => void };
    };
    const stylesReady = (window as BootWindow).__cravesBoot?.stylesReady ?? Promise.resolve();
    // In production the startup hook lets CSS download without blocking first
    // paint. Wait until those exact styles apply before measuring the logo.
    void Promise.all([Promise.all(images.map(whenDecoded)), stylesReady]).then(([results]) => {
      if (disposed || finished) return;
      if (results.every(Boolean)) start();
      else finish();
    });
    later(() => { if (!splash.classList.contains('splash--ready')) finish(); }, 8000);
    // An initially hidden page may never emit a visibilitychange event.
    if (document.hidden) finish();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(targetFrame);
      cancelHandoff();
      timers.forEach((timer) => window.clearTimeout(timer));
      imageListeners.forEach((remove) => remove());
      window.removeEventListener('resize', scheduleTarget);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      splash.removeEventListener('animationstart', onAnimationStart);
      splash.removeEventListener('animationend', onAnimationEnd);
      if (typeof motion.removeEventListener === 'function') motion.removeEventListener('change', onMotionChange);
      else motion.removeListener(onMotionChange);
      splash.classList.remove('splash--ready');
      document.body.classList.remove('splash-active');
      document.documentElement.removeAttribute('data-craves-splash-active');
    };
  }, []);

  return (
    <div ref={splashRef} className="splash" aria-hidden="true">
      <div className="splash__surface">
        <div className="splash__ambient" />
        <div className="splash__brand">
          <img className="splash__wordmark" src="/images/craves-wordmark-white.png"
            width={1048} height={285} alt="Craves" fetchPriority="high" decoding="async" />
        </div>
        <img className="splash__final-logo" src="/images/craves-navbar-logo.png"
          alt="" fetchPriority="high" decoding="async" />
      </div>
    </div>
  );
};

export default SplashScreen;
