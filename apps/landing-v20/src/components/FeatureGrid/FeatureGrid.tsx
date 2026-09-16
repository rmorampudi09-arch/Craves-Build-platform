import './FeatureGrid.css';

const FEATURES = [
  {
    icon: '/images/icons/icon-support.png',
    title: 'Support Home Chefs',
    text: 'Empowering home chefs and the passion they cook with.',
  },
  {
    icon: '/images/icons/icon-homemade.png',
    title: 'Homemade Goodness',
    text: 'Fresh ingredients, authentic recipes and real taste.',
  },
  {
    icon: '/images/icons/icon-safety.png',
    title: 'Safe & Hygienic',
    text: 'Careful preparation and hygienic packing standards.',
  },
  {
    icon: '/images/icons/icon-delivery.png',
    title: 'Delivered with Care',
    text: 'Homemade food brought from chef to door with care.',
  },
];

const FeatureGrid = () => {
  return (
    <section id="mission" className="features">
      <div className="container">
        <p className="features__kicker">
          Made with love &bull; From chef to door &bull; Home cooked
          happiness
        </p>
        <h2 className="features__headline">Real food. Real home.</h2>

        <div className="features__grid">
          {FEATURES.map((feature) => (
            <div className="features__card" key={feature.title}>
              <div className="features__icon">
                <img src={feature.icon} alt="" aria-hidden="true" />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureGrid;
