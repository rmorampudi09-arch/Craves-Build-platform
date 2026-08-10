# Craves customer landing reference release notes

Release scope: public customer landing visual refresh.

The desktop landing page now follows the four approved 2026-08-11 reference compositions in this order: hero, How Craves Works, Why Craves, and Meet the Home Chefs / Craves App. The existing canonical Craves logo remains the product logo and is rendered over the logo area in the supplied hero reference. The existing responsive landing experience remains below the desktop breakpoint.

Existing authentication, chef-registration, session redirect, footer/contact, customer discovery, checkout, payment, order, backend, and Azure resource behavior are not redesigned by this change.

The build preparation script verifies all four supplied PNGs against pinned SHA-256 values and fails if the artwork bytes differ from the approved references.
