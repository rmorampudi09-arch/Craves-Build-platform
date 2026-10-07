import Button from '../Button/Button';
import './ForHomeChefs.css';

const ArrowIcon = () => (
  <svg
    className="chefs__cta-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M5 12h13" />
    <path d="m12.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
);

const CustomersIcon = () => (
  <svg
    className="chefs__benefit-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="9" cy="7" r="4" />
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const GrowthIcon = () => (
  <svg
    className="chefs__benefit-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M3 21h18" />
    <rect x="4" y="14" width="3" height="7" rx="0.5" />
    <rect x="10" y="9" width="3" height="12" rx="0.5" />
    <rect x="16" y="3" width="3" height="18" rx="0.5" />
  </svg>
);

const PassionIcon = () => (
  <svg
    className="chefs__benefit-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
         a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84
         a5.5 5.5 0 0 0 0-7.78Z"
    />
  </svg>
);

const ForHomeChefs = () => {
  return (
    <section
      id="for-chefs"
      className="chefs chefs--invitation"
      aria-labelledby="for-chefs-heading"
    >
      <div className="chefs__layout">
        {/* Decorative image: cropped within its own column. */}
        <div
          className="chefs__food chefs__food--left"
          aria-hidden="true"
        >

        </div>

        <div className="chefs__content">

          <div className="chefs__headline-stage">
            <h2
              id="for-chefs-heading"
              className="chefs__headline"
            >
              <span className="chefs__headline-line chefs__headline-line--one">
                <span className="chefs__letter-anchor chefs__letter-anchor--s">
                  S
                  <img
                    className="chefs__letter-friend chefs__letter-friend--tomato"
                    src="/images/chef-letters/tomato.png"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                hare what yo
                <span className="chefs__letter-anchor chefs__letter-anchor--u">
                  u
                  {/* Optional sprig artwork was not supplied; do not request a missing file. */}
                  <img
                    className="chefs__letter-friend chefs__letter-friend--carrot"
                    src="/images/chef-letters/carrot.png"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
              </span>

              <span className="chefs__headline-line chefs__headline-line--two">
                l
                <span className="chefs__letter-anchor chefs__letter-anchor--o">
                  o
                  <img
                    className="chefs__letter-friend chefs__letter-friend--potato"
                    src="/images/chef-letters/potato.png"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                ve to coo
                <span className="chefs__letter-anchor chefs__letter-anchor--k">
                  k
                  <img
                    className="chefs__letter-friend chefs__letter-friend--onion"
                    src="/images/chef-letters/onion.png"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                .
              </span>
            </h2>
          </div>

          <p className="chefs__text">
            <span className="chefs__description-line">
               Interested in bringing your homemade food to more people?
            </span>{' '}
            <span className="chefs__description-line">
             Explore becoming a home chef with Craves.
            </span>
          </p>

          <div className="chefs__actions">
            <Button
              variant="primary"
              className="chefs__cta"
              onClick={() => { window.location.assign('/chef/application'); }}
              icon={<ArrowIcon />}
            >
              Start cooking with Craves
            </Button>
          </div>

          <ul
            className="chefs__benefits"
            aria-label="Benefits for home chefs"
          >
            <li className="chefs__benefit">
              <CustomersIcon />
              <span className="chefs__benefit-label">
                Reach
                <br />
                nearby customers
              </span>
            </li>

            <li className="chefs__benefit">
              <GrowthIcon />
              <span className="chefs__benefit-label">
                Grow
                <br />
                at your own pace
              </span>
            </li>

            <li className="chefs__benefit">
              <PassionIcon />
              <span className="chefs__benefit-label">
                Turn passion
                <br />
                into income
              </span>
            </li>
          </ul>
        </div>

        {/* Decorative image: cropped within its own column. */}
        <div
          className="chefs__food chefs__food--right"
          aria-hidden="true"
        >

        </div>
      </div>
    </section>
  );
};

export default ForHomeChefs;
