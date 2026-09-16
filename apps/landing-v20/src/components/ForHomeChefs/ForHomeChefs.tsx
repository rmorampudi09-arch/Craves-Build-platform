import Button from '../Button/Button';
import './ForHomeChefs.css';

const ArrowIcon = () => (
  <svg className="chefs__cta-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12h13" />
    <path d="m12.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
);

const ForHomeChefs = () => {
  return (
    <section id="for-chefs" className="chefs">
      <div className="container chefs__frame">
        <div className="chefs__panel">
          <h2 className="chefs__headline">
            Real kitchens. Real people. <span className="chefs__headline-accent">Real passion.</span>
          </h2>

          <p className="chefs__text">
            
            <span className="chefs__text-break"> </span>
            Turn the cooking you already love into meaningful income.
            Craves helps home chefs reach more customers, manage incoming orders,
            showcase their meals, maintain reliable packaging standards, and
            coordinate delivery - so you can spend less time worrying about
            operations and more time doing what you do best: cooking fresh,
            homemade food people genuinely enjoy.
          </p>

          <div className="chefs__actions">
            <Button variant="primary" className="chefs__cta" icon={<ArrowIcon />} onClick={() => { window.location.assign('/chef/application'); }}>
              Start cooking with Craves
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ForHomeChefs;
