import { useCallback, useEffect, useState } from 'react';
import Navbar from './components/Navbar/Navbar';
import CustomerAuth from './components/CustomerAuth';
import LandingNotice from './components/LandingNotice';
import Hero from './components/Hero/Hero';
import ForHomeChefs from './components/ForHomeChefs/ForHomeChefs';
import RiderSection from './components/RiderSection/RiderSection';
import DeliveredWithCare from './components/DeliveredWithCare/DeliveredWithCare';
import StoryVideo from './components/StoryVideo/StoryVideo';
import WhyCraves from './components/WhyCraves/WhyCraves';
import Footer from './components/Footer/Footer';
import SplashScreen from './components/SplashScreen/SplashScreen';
import { usePremiumScroll } from './hooks/usePremiumScroll';
import './App.css';

// Shared with the first-paint boot script in vite.config.ts.
const SPLASH_SEEN_KEY = 'craves.landing.splashSeen';
const BOOT_FADE_MS = 300;

function splashSeenThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SPLASH_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

type BootWindow = Window & { __cravesBoot?: { stylesReady: Promise<void> } };

/** Repeat visits: fade the plain boot cover away once the landing has painted. */
function fadeOutBootCover() {
  const release = () => document.dispatchEvent(new Event('craves:boot-release'));
  const stylesReady = (window as BootWindow).__cravesBoot?.stylesReady ?? Promise.resolve();
  void stylesReady.then(() => window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const cover = document.getElementById('craves-boot');
    if (!cover || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      release();
      return;
    }
    cover.style.transition = `opacity ${BOOT_FADE_MS}ms ease-out`;
    cover.style.opacity = '0';
    window.setTimeout(release, BOOT_FADE_MS);
  })));
}

function App() {
  // The splash plays once per browser session; later visits open straight onto the page.
  const [firstVisit] = useState(() => !splashSeenThisSession());
  const [landingReady, setLandingReady] = useState(!firstVisit);
  const [showSplash, setShowSplash] = useState(firstVisit);

  useEffect(() => {
    if (!firstVisit) {
      fadeOutBootCover();
      return;
    }
    try {
      window.sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    } catch {
      // Without storage the splash simply plays again next time.
    }
  }, [firstVisit]);

  // Prepare scrolling during the reveal, before the splash releases its lock.
  // Wheel input stays blocked while splash-active is present.
  usePremiumScroll(landingReady);

  const startLandingReveal = useCallback(() => {
    setLandingReady(true);
  }, []);

  const finishSplash = useCallback(() => {
    setLandingReady(true);
    setShowSplash(false);
  }, []);

  useEffect(() => {
    if (!landingReady) return;

    const sections = Array.from(document.querySelectorAll<HTMLElement>('main section'));

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer: IntersectionObserver | undefined;
    const showAll = () => {
      observer?.disconnect();
      sections.forEach((section) => section.classList.add('is-visible'));
    };

    if (motion.matches || typeof IntersectionObserver !== 'function') {
      showAll();
      return;
    }

    try {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer?.unobserve(entry.target);
            }
          });
        },
        // A tall mobile section can never meet a percentage threshold on some
        // small/zoomed viewports. Reveal on first intersection, slightly early.
        { rootMargin: '100px 0px 100px 0px', threshold: 0 },
      );
      sections.forEach((section) => observer?.observe(section));
    } catch {
      // Missing/disabled browser APIs must never leave the page invisible.
      showAll();
    }

    const onMotionChange = () => { if (motion.matches) showAll(); };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) showAll();
    };
    if (typeof motion.addEventListener === 'function') {
      motion.addEventListener('change', onMotionChange);
    } else {
      motion.addListener(onMotionChange);
    }
    window.addEventListener('pageshow', onPageShow);

    return () => {
      observer?.disconnect();
      if (typeof motion.removeEventListener === 'function') {
        motion.removeEventListener('change', onMotionChange);
      } else {
        motion.removeListener(onMotionChange);
      }
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [landingReady]);

  return (
    <div className={`app ${landingReady ? 'app--ready' : 'app--intro'}`}>
      <Navbar />
      <main>
        <Hero />
        <WhyCraves />
        <DeliveredWithCare />
        <StoryVideo />
        <ForHomeChefs />
        <RiderSection />
      </main>
      <Footer />

      <LandingNotice />
      <CustomerAuth />

      {showSplash && (
        <SplashScreen onRevealStart={startLandingReveal} onComplete={finishSplash} />
      )}
    </div>
  );
}

export default App;
