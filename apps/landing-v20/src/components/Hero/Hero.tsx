import { useEffect, useRef, useState } from 'react';
import './Hero.css';

const Hero = () => {
  const video = useRef<HTMLVideoElement>(null);
  const [startVideo, setStartVideo] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (motion.matches || connection?.saveData) return;

    let disposed = false;
    let started = false;
    let frame = 0;
    let idle = 0;
    let timer = 0;
    const start = () => {
      idle = 0;
      timer = 0;
      if (!disposed && !document.hidden) {
        started = true;
        setStartVideo(true);
      }
    };
    const schedule = () => {
      if (started || document.hidden || frame || idle || timer) return;
      // Give the visible poster and controls a paint before scheduling media.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(start, { timeout: 1500 });
          else timer = window.setTimeout(start, 200);
        });
      });
    };
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, []);

  useEffect(() => {
    if (!startVideo || !video.current) return;
    video.current.load();
    void video.current.play().catch(() => { /* The poster remains if autoplay is unavailable. */ });
  }, [startVideo]);

  return (
    <section id="top" className="hero is-visible">
      <div className="hero__media">
        <video
          className="hero__video"
          ref={video}
          autoPlay={startVideo}
          muted
          loop
          playsInline
          preload="none"
          poster="/images/hero-poster.jpg"
        >
          {startVideo && <source src="/videos/hero-bg-fast.mp4" type="video/mp4" />}
        </video>
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


        </div>
      </div>
    </section>
  );
};

export default Hero;
