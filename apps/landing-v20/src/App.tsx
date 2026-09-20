import { useCallback, useEffect, useState } from 'react';
import Navbar from './components/Navbar/Navbar';
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
import CustomerAuth from './components/CustomerAuth';
import LandingNotice from './components/LandingNotice';

function App() {
  const [landingReady, setLandingReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

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
