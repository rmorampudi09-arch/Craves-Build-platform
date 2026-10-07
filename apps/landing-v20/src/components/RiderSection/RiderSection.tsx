import './RiderSection.css';

const RiderSection = () => {
  return (
    <section className="rider" aria-labelledby="rider-section-title">
      <div className="container rider__container">
        <div className="rider__shell">
          <div className="rider__content">
            <span className="rider__eyebrow">DELIVERY, WITH CARE</span>
            <h2 id="rider-section-title" className="rider__headline">
              <span className="rider__headline-text">From kitchen </span>{' '}
                <span className="rider__headline-text"> to doorstep,</span>{' '}
               <span className="rider__headline-text"> handled with care.</span>{' '}
            </h2>

            <p className="rider__text">
              Homemade meals, carefully packed and brought to your door - with the care that started in the kitchen.
            </p>
          </div>

          <div className="rider__media">
            <div className="rider__image-card">
              <img
                className="rider__image"
                src="/images/rider-delivery.png"
                loading="lazy"
                decoding="async"
                alt="Craves delivery rider on a motorcycle carrying an insulated delivery box"
              />
            </div>
          </div>
        </div>

        <blockquote className="rider__caption">
          <p>
            <span className="rider__quote-mark" aria-hidden="true"></span>
            Different kitchens. Different recipes.{' '}
            <em>One feeling — home.</em>
            <span className="rider__quote-mark" aria-hidden="true"></span>
          </p>
        </blockquote>
      </div>
    </section>
  );
};

export default RiderSection;
