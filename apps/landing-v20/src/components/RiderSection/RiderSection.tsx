import './RiderSection.css';

const RiderSection = () => {
  return (
    <section className="rider" aria-labelledby="rider-section-title">
      <div className="container rider__container">
        <div className="rider__shell">
          <div className="rider__content">
            <span className="rider__eyebrow">Reliable delivery</span>
            <h2 id="rider-section-title" className="rider__headline">
              From kitchen to doorstep, handled with care.
            </h2>
            <p className="rider__lead">
              Fresh meals, careful handling, and reliable delivery - bringing every homemade meal safely to your door.
            </p>
            <p className="rider__text">
              Every order is picked up thoughtfully, transported responsibly, and delivered with the same attention that went
              into cooking it - so the food reaches your home warm, neat and ready to enjoy.
            </p>
          </div>

          <div className="rider__media">
            <div className="rider__image-card">
              <img
                className="rider__image"
                src="/images/rider-delivery.png"
                alt="Craves delivery rider on a motorcycle carrying an insulated delivery box"
              />
            </div>
          </div>
        </div>

        <blockquote className="rider__caption">
          <p>
            <span className="rider__quote-mark" aria-hidden="true">“</span>
            Different kitchens. Different recipes. One feeling - home.{''}
            <span className="rider__quote-mark" aria-hidden="true">”</span>
          </p>
        </blockquote>
      </div>
    </section>
  );
};

export default RiderSection;