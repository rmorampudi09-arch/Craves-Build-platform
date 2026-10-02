import { useEffect, useRef } from 'react';
import './WhyCraves.css';

const WhyCraves = () => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches || typeof IntersectionObserver !== 'function') return;

    const targets = Array.from(section.querySelectorAll<HTMLElement>('[data-why-reveal]'));
    let observer: IntersectionObserver | undefined;
    const showAll = () => {
      targets.forEach((target) => target.classList.add('is-revealed'));
      observer?.disconnect();
    };

    try {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer?.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -32px 0px', threshold: 0 });
      section.classList.add('why--motion-ready');
      targets.forEach((target) => observer?.observe(target));
    } catch {
      // Unsupported or restricted observers must never hide the section.
      showAll();
    }

    const onMotionChange = () => { if (motion.matches) showAll(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) showAll(); };
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', onMotionChange);
    else motion.addListener(onMotionChange);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      observer?.disconnect();
      section.classList.remove('why--motion-ready');
      targets.forEach((target) => target.classList.remove('is-revealed'));
      if (typeof motion.removeEventListener === 'function') motion.removeEventListener('change', onMotionChange);
      else motion.removeListener(onMotionChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return (
    <section ref={sectionRef} id="why-craves" className="why" aria-labelledby="why-craves-title">
      <div className="container why__shell">
        <div className="why__illustration" data-why-reveal="" aria-hidden="true">
          <img
            src="/images/why-craves-home-food.png"
            alt=""
            width="1254"
            height="1254"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </div>

        <p className="why__eyebrow" data-why-reveal="">Why Craves Exists</p>

        <div className="why__message" data-why-reveal="">
          <h2 id="why-craves-title" className="why__title">
           <span  className="why__title-line">
             Everyday food should </span>{' '}

                   still feel personal.
          </h2>
          <p className="why__statement">
            <span className="why__line">
              We connect you with home chefs who cook with care, familiarity
            </span>{' '}
            <span className="why__line">
               and freshness. Every meal brings you closer to home and
            </span>{' '}
            <span className="why__line">
               supports a real kitchen in your community.
            </span>
          </p>
        </div>

        <p className="why__quote" data-why-reveal="">
          <span>&ldquo;Real home food, made with</span>{' '}
          <span>care and delivered with trust.&rdquo;</span>
        </p>
      </div>
    </section>
  );
};

export default WhyCraves;
