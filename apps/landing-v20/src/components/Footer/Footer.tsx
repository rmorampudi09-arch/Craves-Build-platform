import './Footer.css';

const FOOTER_COLUMNS = [
  {
    title: 'Craves',
    className: 'footer__col--craves',
    links: [{ label: 'About us', href: '#why-craves' }, { label: 'Contact us', href: '/contact' }],
  },
  {
    title: 'Legal',
    className: 'footer__col--legal',
    links: [{ label: 'Privacy policy', href: '/privacy' }, { label: 'Terms of service', href: '/terms' }, { label: 'Refund policy', href: '/refunds-cancellations' }, { label: 'Security', href: '/security' }],
  },
  {
    title: 'For chefs',
    className: 'footer__col--chefs',
    links: [{ label: 'Become a chef', href: '/chef/application' }, { label: 'Chef resources', href: '/chef' }, { label: 'Guidelines', href: '#chef-guidelines' }, { label: 'Earnings', href: '/chef/earnings' }, { label: 'Help center', href: '/contact' }],
  },
];

const socialLinks = [
  {
    label: 'LinkedIn',
    href: '#social',
    icon: (
      <svg
        className="footer__icon-linkedin"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M6.8 8.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z" />
        <path d="M5.4 10.1h2.9v8.5H5.4z" />
        <path d="M10.2 10.1h2.8v1.2c.5-.9 1.6-1.5 3-1.5 2.4 0 3.8 1.6 3.8 4.4v4.4h-2.9v-4c0-1.4-.5-2.3-1.8-2.3-1.1 0-1.8.8-2 1.8-.1.2-.1.5-.1.8v3.8h-2.9v-8.6Z" />
      </svg>
    ),
  },

  {
    label: 'Instagram',
    href: '#social',
    icon: (
      <svg
        className="footer__icon-instagram"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5" />
        <circle cx="12" cy="12" r="4.1" />
        <circle
          cx="17.25"
          cy="6.75"
          r="1.2"
          className="footer__social-dot"
        />
      </svg>
    ),
  },

  {
    label: 'YouTube',
    href: '#social',
    icon: (
      <svg
        className="footer__icon-youtube"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M21 12c0 2-.2 3.6-.4 4.5-.2.8-.8 1.4-1.6 1.6-1.5.4-7 .4-7 .4s-5.5 0-7-.4c-.8-.2-1.4-.8-1.6-1.6C3.2 15.6 3 14 3 12s.2-3.6.4-4.5c.2-.8.8-1.4 1.6-1.6C6.5 5.5 12 5.5 12 5.5s5.5 0 7 .4c.8.2 1.4.8 1.6 1.6.2.9.4 2.5.4 4.5Z" />
        <path
          className="footer__social-play"
          d="m10 8.9 5.2 3.1-5.2 3.1V8.9Z"
        />
      </svg>
    ),
  },

  {
    label: 'Facebook',
    href: '#social',
    icon: (
      <svg
        className="footer__icon-facebook"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.5v3h2.6v8h3.4Z" />
      </svg>
    ),
  },

{
  label: 'X',
  href: '#social',
  icon: (
    <img
      className="footer__icon-x"
      src="/images/twitter.png"
      alt=""
      aria-hidden="true"
    />
  ),
},
];

const Footer = () => {
  return (
    <footer id="contact" className="footer">
      <div className="container footer__top">
        <div className="footer__brand">
          <img className="footer__logo" src="/images/craves-logo.png" alt="Craves" />
          <p>Good food. Real impact. Homemade meals from real people.</p>
          <img
            className="footer__sticker footer__sticker--brand"
            src="/images/made-with-love-sticker.png"
            alt="Made with love"
            width="1218"
            height="1291"
            loading="lazy"
            decoding="async"
          />
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <div className={`footer__col ${col.className}`} key={col.title}>
            <h4>{col.title.toUpperCase()}</h4>
            <ul>
              {col.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="footer__col footer__social-col">
          <h4>SOCIAL</h4>
          <div className="footer__socials" aria-label="Social links">
            {socialLinks.map((item) => (
              <a
                key={item.label}
                className="footer__social-link"
                href={item.href}
                data-channel={item.label}
                aria-label={item.label}
                title={item.label}
              >
                {item.icon}
              </a>
            ))}
          </div>
          <img
            className="footer__sticker footer__sticker--social"
            src="/images/feel-like-home-sticker.png"
            alt="Feels like home"
            width="720"
            height="742"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>

      <div className="container footer__bottom">
        <p>&copy; 2026 Craves. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
