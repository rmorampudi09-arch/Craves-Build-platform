import './Hero.css';

const Hero = () => {
  return (
    <section id="top" className="hero">
      <div className="hero__media">
        <video
          className="hero__video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/images/hero-poster.jpg"
        >
          <source src="/videos/hero-bg-3.mp4" type="video/mp4" />
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
