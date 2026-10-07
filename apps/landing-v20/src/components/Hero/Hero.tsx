import { useEffect, useRef, useState } from 'react';
import './Hero.css';

const recoveryDelays = [1000, 3000, 8000];
const progressTimeout = 30000;

const Hero = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestPlaybackRef = useRef<((userInitiated?: boolean) => void) | null>(null);
  const [needsPlay, setNeedsPlay] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let active = true;
    let blocked = false;
    let pendingPlay = false;
    let playAttempt = 0;
    let recoveries = 0;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastMediaTime = video.currentTime;
    let lastProgressAt = performance.now();

    const canPlayNow = () => document.visibilityState !== 'hidden' && navigator.onLine;
    const cancelRecovery = () => {
      clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
    };
    const resetProgressClock = () => {
      lastMediaTime = video.currentTime;
      lastProgressAt = performance.now();
    };
    const reloadVideo = () => {
      // Invalidate the old play promise before load() aborts it.
      playAttempt += 1;
      pendingPlay = false;
      video.load();
      resetProgressClock();
    };
    const recover = () => {
      if (!active || blocked || !canPlayNow() || recoveryTimer !== undefined) return;
      if (recoveries >= recoveryDelays.length) {
        setNeedsPlay(true);
        return;
      }
      recoveryTimer = setTimeout(() => {
        recoveryTimer = undefined;
        if (!active || !canPlayNow()) return;
        recoveries += 1;
        reloadVideo();
        requestPlayback();
      }, recoveryDelays[recoveries]);
    };
    const requestPlayback = (userInitiated = false) => {
      if (!active || !canPlayNow() || (blocked && !userInitiated)) return;
      if (userInitiated) {
        const shouldReload = Boolean(video.error) || pendingPlay || recoveries >= recoveryDelays.length;
        blocked = false;
        recoveries = 0;
        cancelRecovery();
        resetProgressClock();
        if (shouldReload) reloadVideo();
      } else if (video.error) {
        recover();
        return;
      }
      if (!video.paused || pendingPlay) return;

      // Set the properties before play(), including on browser-restored pages.
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      pendingPlay = true;
      const attempt = ++playAttempt;
      void video.play().catch((error: unknown) => {
        if (!active || attempt !== playAttempt) return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          blocked = true;
          cancelRecovery();
          setNeedsPlay(true);
        } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
          recover();
        }
      }).finally(() => {
        if (attempt === playAttempt) pendingPlay = false;
      });
    };
    const onReady = () => requestPlayback();
    const onPlaying = () => {
      if (!active) return;
      blocked = false;
      cancelRecovery();
      resetProgressClock();
      setNeedsPlay(false);
    };
    const onVisibility = () => {
      resetProgressClock();
      if (canPlayNow()) requestPlayback();
      else cancelRecovery();
    };
    const onResume = () => {
      resetProgressClock();
      requestPlayback();
    };
    const onOffline = () => {
      resetProgressClock();
      cancelRecovery();
    };
    const watchdog = setInterval(() => {
      if (!active || blocked || !canPlayNow()) {
        resetProgressClock();
        return;
      }
      const bounds = video.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight ||
        bounds.right <= 0 || bounds.left >= window.innerWidth) {
        // Some browsers pause offscreen autoplay. Reading a lower section
        // should not restart the hero download or consume its retry budget.
        resetProgressClock();
        return;
      }
      if (video.currentTime !== lastMediaTime) {
        // Real playback progress, rather than a 'playing' event alone, clears
        // the consecutive-failure budget. Looping also counts as progress.
        recoveries = 0;
        resetProgressClock();
      } else if (performance.now() - lastProgressAt >= progressTimeout) {
        // Ordinary buffering gets a generous uninterrupted grace period.
        // Recover a hung request/play promise only after that period expires.
        recover();
        resetProgressClock();
      }
    }, 5000);

    requestPlaybackRef.current = requestPlayback;
    video.addEventListener('canplay', onReady);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', recover);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onResume);
    window.addEventListener('offline', onOffline);
    requestPlayback();

    return () => {
      active = false;
      cancelRecovery();
      clearInterval(watchdog);
      requestPlaybackRef.current = null;
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', recover);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('online', onResume);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return (
    <section id="top" className="hero">
      <div className="hero__media">
        <video
          ref={videoRef}
          className="hero__video"
          src="/videos/hero-web-5ecc2e7719878461f7e7b33e79536788269e436a121b675923af942cf22cbc43.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div className="hero__scrim" />
      </div>

      <div className="container hero__content">
        <div className="hero__inner">
          <h1 className="hero__headline">
            <span>CRAVE MORE.</span>
            <br />
            <span>TASTE MORE.</span>
          </h1>

          <p className="hero__subtext">Freshly made by home chefs</p>
          {needsPlay && (
            <button
              className="hero__play"
              type="button"
              onClick={() => requestPlaybackRef.current?.(true)}
            >
              Play background video
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default Hero;
