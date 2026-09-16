import type { ReactNode } from 'react';
import './DeliveredWithCare.css';

type Feature = {
  icon: ReactNode;
  title: string;
};

const ChefIcon = () => (
  <img
    className="specials__icon-image specials__icon-image--chef"
    src="/images/icons/home-chef-user.png"
    alt=""
  />
);

const BowlIcon = () => (
  <svg className="specials__icon-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="56" rx="18" ry="4" fill="rgba(21, 28, 40, 0.08)" />
    <path d="M16 33h32c0 10.5-7.2 17-16 17s-16-6.5-16-17Z" fill="#ff7648" />
    <path d="M14 31.5h36c0 12.1-8 19.5-18 19.5s-18-7.4-18-19.5Z" fill="#f04a3a" stroke="#2b3040" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M18.5 31.5c1.7-8.4 6.8-14.5 13.5-14.5s11.8 6.1 13.5 14.5h-27Z" fill="#ffd45c" stroke="#2b3040" strokeWidth="2.5" strokeLinejoin="round" />
    <circle cx="24" cy="24" r="2.1" fill="#60b95d" />
    <circle cx="31" cy="21.5" r="2.1" fill="#60b95d" />
    <circle cx="39" cy="24.8" r="2.1" fill="#60b95d" />
    <path d="M23 13c0 2.3-1.8 3.5-1.8 5.4" stroke="#2b3040" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M32 11c0 2.5-2 3.8-2 5.9" stroke="#2b3040" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M41 13c0 2.3-1.8 3.5-1.8 5.4" stroke="#2b3040" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const SafeIcon = () => (
  <svg className="specials__icon-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="56" rx="18" ry="4" fill="rgba(21, 28, 40, 0.08)" />
    <path d="M32 10 49 16v12.8c0 10.2-7 18.8-17 22.2-10-3.4-17-12-17-22.2V16l17-6Z" fill="#ffffff" stroke="#2b3040" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M32 17.2 43 21v8.2c0 6.4-4.2 12.2-11 14.9-6.8-2.7-11-8.5-11-14.9V21l11-3.8Z" fill="#4db57b" />
    <path d="m25.6 31.2 4.2 4.3 8.6-9.1" fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PinIcon = () => (
  <svg className="specials__icon-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="56" rx="16" ry="4" fill="rgba(21, 28, 40, 0.08)" />
    <path d="M32 50c-2.2-2.8-4.5-5.5-6.7-8.2-4.2-5.1-7.3-9.3-7.3-15 0-8 6.2-14.3 14-14.3s14 6.3 14 14.3c0 5.7-3.1 9.9-7.3 15C36.5 44.5 34.2 47.2 32 50Z" fill="#ef4034" stroke="#2b3040" strokeWidth="2.5" strokeLinejoin="round" />
    <circle cx="32" cy="26.5" r="5.5" fill="#ffffff" />
  </svg>
);

const DeliveryIcon = () => (
  <img
    className="specials__icon-image specials__icon-image--delivery"
    src="/images/icons/delivery-scooter-user.png"
    alt=""
  />
);

const CalendarIcon = () => (
  <svg className="specials__icon-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="56" rx="18" ry="4" fill="rgba(21, 28, 40, 0.08)" />
    <rect x="14" y="16" width="36" height="32" rx="8" fill="#ffffff" stroke="#2b3040" strokeWidth="2.5" />
    <path d="M14 26h36" stroke="#2b3040" strokeWidth="2.5" />
    <path d="M22 12v8" stroke="#2b3040" strokeWidth="3" strokeLinecap="round" />
    <path d="M42 12v8" stroke="#2b3040" strokeWidth="3" strokeLinecap="round" />
    <rect x="20" y="31" width="7" height="6" rx="2" fill="#ef4034" />
    <rect x="29" y="31" width="7" height="6" rx="2" fill="#ffd45c" />
    <rect x="38" y="31" width="7" height="6" rx="2" fill="#7f8cff" />
    <rect x="20" y="39" width="7" height="6" rx="2" fill="#84d1ff" />
    <rect x="29" y="39" width="7" height="6" rx="2" fill="#59c57b" />
    <rect x="38" y="39" width="7" height="6" rx="2" fill="#ff9b70" />
  </svg>
);

const LEFT_FEATURES: Feature[] = [
  { icon: <ChefIcon />, title: 'Home Chefs' },
  { icon: <BowlIcon />, title: 'Homemade Meals' },
  { icon: <SafeIcon />, title: 'Clean & Safe' },
];

const RIGHT_FEATURES: Feature[] = [
  { icon: <PinIcon />, title: 'Near You' },
  { icon: <DeliveryIcon />, title: 'Doorstep Delivery' },
  { icon: <CalendarIcon />, title: 'Meal Plans' },
];

const DeliveredWithCare = () => {
  return (
    <section id="delivery" className="specials">
      <div className="container specials__shell">
        <div className="specials__intro">
          <h2 className="specials__headline">What&rsquo;s special about <span className="specials__headline-brand">Craves</span>?</h2>
          <p className="specials__text">
            Home chefs, homemade meals and dependable doorstep delivery
            - thoughtfully brought together in one simple experience.
          </p>
        </div>

        <div className="specials__stage">
          <div className="specials__column specials__column--left">
            {LEFT_FEATURES.map((feature, index) => (
              <article
                className={`specials__card specials__card--left specials__card--${index + 1}`}
                key={feature.title}
              >
                <div className="specials__icon" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
              </article>
            ))}
          </div>

          <div className="specials__phone-wrap" aria-label="Craves mobile app preview">
            <div className="specials__glow" aria-hidden="true" />
            <div className="specials__phone">
              <div className="specials__notch" aria-hidden="true" />
              <div className="specials__screen">
                <div className="specials__topbar">
                  <img className="specials__brand-logo" src="/images/craves-logo.png" alt="Craves" />
                  <span className="specials__city">Hyderabad ▾</span>
                </div>

                <div className="specials__search">Search homemade meals...</div>

                <div className="specials__chips">
                  <span className="specials__chip specials__chip--active">Breakfast</span>
                  <span className="specials__chip">Lunch</span>
                  <span className="specials__chip">Snacks</span>
                  <span className="specials__chip">Dinner</span>
                </div>

                <div className="specials__panel">
                  <div className="specials__meal-image">
                    <img src="/images/hero-poster.jpg" alt="Featured homemade meal in the Craves app" />
                  </div>
                  <div className="specials__meal-copy">
                    <div>
                      <h4>Homestyle Paneer Curry</h4>
                      <p>By Lakshmi&rsquo;s Kitchen</p>
                    </div>
                    <span className="specials__price">₹99</span>
                  </div>
                </div>

                <div className="specials__subpanels">
                  <div className="specials__mini-card">
                    <strong>Today&rsquo;s Special</strong>
                    <span>Freshly made meals available now</span>
                  </div>
                  <div className="specials__mini-card specials__mini-card--compact">
                    <strong>Chef near you</strong>
                    <span>6 kitchens serving now</span>
                  </div>
                </div>

                <div className="specials__nav">
                  <span className="is-active">Home</span>
                  <span>Explore</span>
                  <span>Orders</span>
                  <span>Profile</span>
                </div>
              </div>
            </div>
          </div>

          <div className="specials__column specials__column--right">
            {RIGHT_FEATURES.map((feature, index) => (
              <article
                className={`specials__card specials__card--right specials__card--${index + 1}`}
                key={feature.title}
              >
                <div className="specials__icon" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DeliveredWithCare;
