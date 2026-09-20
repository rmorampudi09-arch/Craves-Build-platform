import { useEffect } from 'react';

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// Rates are per SECOND, not per frame: no faster braking on a 144 Hz display.
const NORMAL_DAMPING = 14;
const HERO_DAMPING = 5.5;
const SETTLE_EPSILON = 0.5;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Smooth desktop wheel/trackpad scrolling with a soft return to the hero.
 * The hero brake changes arrival SPEED, never the user's destination: no snap,
 * scroll lock or timer that pulls visitors to the top. Touch, keyboard, zoom,
 * nested scrollers and reduced-motion preferences retain native control.
 */
export const usePremiumScroll = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;

    const root = document.documentElement;
    const nav = document.querySelector<HTMLElement>('.navbar__inner');
    const hero = document.getElementById('top');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(any-pointer: fine)');
    const previousClearance = root.style.getPropertyValue('--anchor-clearance');
    let frame = 0;
    let resizeFrame = 0;
    let disposed = false;
    let userInteracted = false;
    let wheelListening = false;
    let mode: 'wheel' | 'anchor' | null = null;
    let currentY = window.scrollY;
    let targetY = currentY;
    let lastWrittenY = currentY;
    let lastTime = 0;
    let lastDirection = 0;
    let maxScroll = 0;
    let heroZone = window.innerHeight;
    let anchorStart = 0;
    let anchorStartTime = 0;
    let anchorDuration = 0;
    let anchorTarget: HTMLElement | null = null;
    let temporaryFocus: HTMLElement | null = null;
    let savedBehavior: { value: string; priority: string } | null = null;
    let nativeGestureUntil = 0;
    let lastInputStyleCheck = -Infinity;
    let lastGeometryCheck = -Infinity;
    let lockSignature = '';
    let scrollLocked = false;
    let nativeCache = new WeakMap<EventTarget, { native: boolean; expires: number }>();
    const hasResizeObserver = typeof ResizeObserver === 'function';

    // Wheel bursts can arrive faster than the display refreshes. Cache geometry
    // and input styles rather than forcing layout on every input event.
    const refreshInputStyles = (now: number) => {
      const signature = [root.className, document.body.className,
        root.style.overflow, root.style.overflowY,
        document.body.style.overflow, document.body.style.overflowY].join('|');
      if (signature === lockSignature && now - lastInputStyleCheck < 120) return;
      lockSignature = signature;
      lastInputStyleCheck = now;
      scrollLocked = document.body.classList.contains('splash-active') ||
        /(hidden|clip)/.test(getComputedStyle(document.body).overflowY) ||
        /(hidden|clip)/.test(getComputedStyle(root).overflowY);
    };
    const initialHash = window.location.hash;
    const navigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const restoringHistory = navigation?.type === 'back_forward';

    const measureClearance = () => {
      resizeFrame = 0;
      if (disposed) return;
      // Read layout first, then write the CSS variable once.
      const bottom = nav?.getBoundingClientRect().bottom ?? 86;
      const clearance = `${Math.ceil(Math.max(0, bottom) + 18)}px`;
      maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
      // Start easing as the first screen re-enters the viewport; strongest
      // damping is reserved for the final approach to the top.
      heroZone = Math.max(1, Math.min(hero?.offsetHeight || window.innerHeight,
        window.innerHeight) * 1.05);
      targetY = clamp(targetY, 0, maxScroll);
      lastGeometryCheck = performance.now();
      nativeCache = new WeakMap();
      if (root.style.getPropertyValue('--anchor-clearance') !== clearance) {
        root.style.setProperty('--anchor-clearance', clearance);
      }
    };

    const scheduleMeasurement = () => {
      if (!resizeFrame) resizeFrame = requestAnimationFrame(measureClearance);
    };

    const ownScrollBehavior = () => {
      if (savedBehavior) return;
      savedBehavior = {
        value: root.style.getPropertyValue('scroll-behavior'),
        priority: root.style.getPropertyPriority('scroll-behavior'),
      };
      // Avoid running CSS smooth scrolling on top of each animation frame.
      root.style.setProperty('scroll-behavior', 'auto');
    };

    const releaseScrollBehavior = () => {
      if (!savedBehavior) return;
      if (savedBehavior.value) {
        root.style.setProperty('scroll-behavior', savedBehavior.value, savedBehavior.priority);
      } else root.style.removeProperty('scroll-behavior');
      savedBehavior = null;
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      mode = null;
      anchorTarget = null;
      lastDirection = 0;
      releaseScrollBehavior();
      currentY = targetY = lastWrittenY = window.scrollY;
    };

    const writePosition = (y: number) => {
      window.scrollTo(window.scrollX, y);
      // Keep the fractional accumulator separate from browser-rounded scrollY.
      lastWrittenY = window.scrollY;
    };

    const clearTemporaryFocus = () => {
      if (!temporaryFocus) return;
      temporaryFocus.removeEventListener('blur', clearTemporaryFocus);
      temporaryFocus.removeAttribute('tabindex');
      temporaryFocus = null;
    };

    const focusDestination = (target: HTMLElement) => {
      clearTemporaryFocus();
      if (!target.hasAttribute('tabindex') && target.tabIndex < 0) {
        target.setAttribute('tabindex', '-1');
        temporaryFocus = target;
        target.addEventListener('blur', clearTemporaryFocus, { once: true });
      }
      try { target.focus({ preventScroll: true }); } catch { /* Older browser fallback. */ }
    };

    const animate = (now: number) => {
      if (!mode || disposed) return;
      // Do not fast-forward after a background tab / suspended laptop resumes.
      const dt = clamp((now - lastTime) / 1000, 0, 0.064);
      lastTime = now;
      let done = false;
      if (mode === 'anchor') {
        const progress = clamp((now - anchorStartTime) / anchorDuration, 0, 1);
        currentY = anchorStart + (targetY - anchorStart) * easeInOutCubic(progress);
        done = progress >= 1;
      } else {
        const difference = targetY - currentY;
        const proximity = difference < 0 ? 1 - clamp(currentY / heroZone, 0, 1) : 0;
        const blend = proximity * proximity * (3 - 2 * proximity);
        // Catch up a little faster during long wheel bursts, without losing
        // the soft, slower final arrival inside the hero.
        const backlog = clamp(Math.abs(difference) / Math.max(1, window.innerHeight) - 0.75, 0, 1);
        const damping = NORMAL_DAMPING + (HERO_DAMPING - NORMAL_DAMPING) * blend +
          6 * backlog * (1 - blend);
        let travel = difference * (1 - Math.exp(-damping * dt));
        if (proximity > 0) {
          const pixelsPerSecond = 2400 - 1900 * blend;
          travel = clamp(travel, -pixelsPerSecond * dt, pixelsPerSecond * dt);
        }
        currentY = clamp(currentY + travel, 0, maxScroll);
        done = Math.abs(targetY - currentY) <= SETTLE_EPSILON;
      }
      if (done) currentY = targetY;
      writePosition(currentY);
      if (done) {
        const destination = anchorTarget;
        stop();
        if (destination) focusDestination(destination);
      } else frame = requestAnimationFrame(animate);
    };

    const startFrames = () => {
      ownScrollBehavior();
      if (!frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };

    const shouldStayNative = (event: WheelEvent, now: number) => {
      const target = event.target;
      const cached = target ? nativeCache.get(target) : undefined;
      if (cached && cached.expires > now) return cached.native;
      let native = false;
      // composedPath preserves nested scrollers and shadow-DOM input widgets.
      for (const node of event.composedPath()) {
        if (node === document.body || node === root) break;
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-native-scroll], dialog[open]')) {
          native = true;
          break;
        }
        // Only ask for geometric sizes when this is actually a scroll container.
        if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY) &&
            node.scrollHeight > node.clientHeight + 1) {
          native = true;
          break;
        }
      }
      if (target) nativeCache.set(target, { native, expires: now + 120 });
      return native;
    };

    const markUserInteraction = () => { userInteracted = true; };
    const interrupt = () => {
      markUserInteraction();
      nativeCache = new WeakMap();
      lastInputStyleCheck = -Infinity;
      nativeGestureUntil = 0;
      stop();
    };

    const onWheel = (event: WheelEvent) => {
      markUserInteraction();
      const now = performance.now();
      if (event.defaultPrevented || motion.matches || !pointer.matches ||
          event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
          !Number.isFinite(event.deltaY) || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        stop();
        return;
      }
      // Some browsers make later events in a gesture non-cancelable. Keep that
      // whole gesture native instead of switching back and forth mid-scroll.
      if (!event.cancelable || now < nativeGestureUntil) {
        nativeGestureUntil = now + 140;
        stop();
        return;
      }
      refreshInputStyles(now);
      if (scrollLocked || shouldStayNative(event, now)) {
        stop();
        return;
      }
      if (!hasResizeObserver && now - lastGeometryCheck > 180) measureClearance();
      // DOM_DELTA_LINE / DOM_DELTA_PAGE are not pixels (notably in Firefox).
      const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? window.innerHeight : 1;
      const delta = event.deltaY * unit;
      const direction = Math.sign(delta);
      if (mode !== 'wheel' || (lastDirection !== 0 && direction !== lastDirection)) {
        // Discard old-direction momentum without canceling/restarting the frame
        // loop or flipping CSS scroll-behavior twice in one input event.
        currentY = targetY = lastWrittenY = window.scrollY;
        anchorTarget = null;
      }
      const destination = clamp(targetY + delta, 0, maxScroll);
      if (!mode && Math.abs(destination - currentY) < 0.01) return;
      event.preventDefault();
      targetY = destination;
      lastDirection = direction;
      mode = 'wheel';
      startFrames();
    };

    const destinationFor = (target: HTMLElement) => {
      const clearance = parseFloat(root.style.getPropertyValue('--anchor-clearance')) || 104;
      return target.id === 'top' ? 0 : clamp(
        target.getBoundingClientRect().top + window.scrollY - clearance, 0, maxScroll);
    };

    const onAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
          event.shiftKey || event.altKey) return;
      const source = event.target instanceof Element ? event.target : null;
      const link = source?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      let id: string;
      try { id = decodeURIComponent(href.slice(1)); } catch { return; }
      const target = document.getElementById(id);
      if (!target) return;
      interrupt();
      measureClearance();
      // Native links still work when motion is reduced; do not cancel them.
      if (motion.matches) return;
      try {
        if (window.location.hash !== href) history.pushState(history.state, '', href);
      } catch { return; } // Fall back to the real link in restricted contexts.
      event.preventDefault();
      anchorStart = window.scrollY;
      targetY = destinationFor(target);
      const distance = Math.abs(targetY - anchorStart);
      anchorDuration = targetY === 0
        ? clamp(1000 + distance * 0.16, 1250, 2300)
        : clamp(520 + distance * 0.16, 600, 1550);
      anchorTarget = target;
      if (distance <= SETTLE_EPSILON) { stop(); focusDestination(target); return; }
      anchorStartTime = performance.now();
      mode = 'anchor';
      startFrames();
    };

    const onScroll = () => {
      // Scrollbar drags, focus movement, find-in-page and other scripts win.
      if (mode && Math.abs(window.scrollY - lastWrittenY) > 2) stop();
      else if (!mode) currentY = targetY = lastWrittenY = window.scrollY;
    };

    const onResize = () => { stop(); scheduleMeasurement(); };
    const onVisibility = () => { if (document.hidden) stop(); };
    const onHistory = () => { interrupt(); scheduleMeasurement(); };

    const alignInitialHash = () => {
      // Retain v4's deep-link and Back/Forward safeguards after the splash.
      if (disposed || restoringHistory || userInteracted || !initialHash ||
          initialHash === '#' || window.location.hash !== initialHash) return;
      let id: string;
      try { id = decodeURIComponent(initialHash.slice(1)); } catch { return; }
      const target = document.getElementById(id);
      if (!target) return;
      measureClearance();
      ownScrollBehavior();
      writePosition(destinationFor(target));
      stop();
    };

    const updateInputMode = () => {
      stop();
      const shouldListen = !motion.matches && pointer.matches;
      if (shouldListen === wheelListening) return;
      if (shouldListen) window.addEventListener('wheel', onWheel, { passive: false });
      else window.removeEventListener('wheel', onWheel);
      wheelListening = shouldListen;
    };

    const listenToMedia = (query: MediaQueryList) => {
      if (typeof query.addEventListener === 'function') query.addEventListener('change', updateInputMode);
      else query.addListener(updateInputMode);
      return () => {
        if (typeof query.removeEventListener === 'function') query.removeEventListener('change', updateInputMode);
        else query.removeListener(updateInputMode);
      };
    };

    measureClearance();
    alignInitialHash();
    updateInputMode();
    const removeMotionListener = listenToMedia(motion);
    const removePointerListener = listenToMedia(pointer);
    let resizeObserver: ResizeObserver | undefined;
    if (hasResizeObserver) {
      resizeObserver = new ResizeObserver(scheduleMeasurement);
      resizeObserver.observe(document.body);
      if (nav) resizeObserver.observe(nav);
      if (hero) resizeObserver.observe(hero);
    }
    window.addEventListener('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', markUserInteraction, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt, { passive: true });
    window.addEventListener('keydown', interrupt);
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', onHistory);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('focusin', stop);
    document.addEventListener('click', onAnchorClick);

    if ('fonts' in document) {
      void document.fonts.ready.then(() => {
        if (disposed) return;
        measureClearance();
        alignInitialHash();
      }).catch(() => { /* Font failures must not disable scrolling. */ });
    }

    return () => {
      disposed = true;
      stop();
      clearTemporaryFocus();
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      removeMotionListener();
      removePointerListener();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('wheel', markUserInteraction);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('keydown', interrupt);
      window.removeEventListener('popstate', onHistory);
      window.removeEventListener('hashchange', onHistory);
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('pageshow', onHistory);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusin', stop);
      document.removeEventListener('click', onAnchorClick);
      if (previousClearance) root.style.setProperty('--anchor-clearance', previousClearance);
      else root.style.removeProperty('--anchor-clearance');
    };
  }, [enabled]);
};
