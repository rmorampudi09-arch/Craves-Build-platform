/**
 * Customer Terms and Privacy text, copied word for word from craves.in/terms and
 * craves.in/privacy (effective 15 August 2026). Change it only when the site changes.
 */
export type LegalDocumentKey = 'terms' | 'privacy';

export interface LegalSection {
  heading: string;
  body?: string;
  bullets?: readonly string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}

export const LEGAL_DOCUMENTS: Readonly<Record<LegalDocumentKey, LegalDocument>> = {
  terms: {
    title: 'Terms & conditions',
    intro:
      'Effective 15 August 2026. These terms apply to customer use of the Craves marketplace in Hyderabad, India, together with the Refunds & Cancellations and Privacy pages.',
    sections: [
      {
        heading: '1. What Craves provides',
        body: 'A marketplace to discover approved home chefs, view dishes and meal plans, place orders, pay online and track fulfilment. Craves runs the technology, payment workflow and supported delivery.',
      },
      {
        heading: '2. Accounts and secure access',
        body: 'Give accurate account and order details. Never share OTPs, UPI PINs, card security codes or passwords. You are responsible for activity on your account unless you report unauthorised access to Craves support.',
      },
      {
        heading: '3. Menus, prices and checkout',
        body: 'Availability changes as chefs update menus and capacity. Prices are in Indian rupees. The final checkout amount is what Craves sends to the payment provider. One checkout can contain orders from several chefs, each with its own lifecycle.',
      },
      {
        heading: '4. Payments',
        body: 'Online payments are processed by Razorpay. A success screen alone does not confirm payment; Craves relies on verified provider status. Cash on delivery is not offered at launch.',
      },
      {
        heading: '5. Chef acceptance and fulfilment',
        body: 'After payment, an order may wait for the chef to accept it. Delivery is scheduled after acceptance. A declined or timed-out order follows the refund rules, and Craves does not substitute another chef.',
      },
      {
        heading: '6. Cancellations and refunds',
        body: 'Refund eligibility is described on the Refunds & Cancellations page. For any case not listed there, contact support.',
      },
      {
        heading: '7. Acceptable use',
        body: 'Do not use Craves for fraud, abuse of chefs or customers, interference with the service or unauthorised access. Craves may restrict access to protect people and systems.',
      },
      {
        heading: '8. Support and updates',
        body: 'Questions go to support@craves.in. Material changes are published here with a new effective date.',
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    intro:
      'Effective 15 August 2026. How Craves handles your information to run the marketplace, your account, orders, payments, refunds, support and delivery.',
    sections: [
      {
        heading: 'Information Craves uses',
        bullets: [
          'Phone number, name, email if you add one, and your sign-in session.',
          'Saved delivery addresses and the address used for each order.',
          'Cart, order, meal plan, chef, delivery, notification and support details.',
          'Payment and refund references, amounts and statuses.',
          'Security and diagnostic records needed to protect the service.',
        ],
      },
      {
        heading: 'Payments',
        body: 'Razorpay processes payments. Craves keeps payment and refund references and verified status, and never asks for your card CVV or UPI PIN.',
      },
      {
        heading: 'Service providers',
        body: 'Only what each provider needs is shared: Firebase for phone sign-in, Razorpay for payments and refunds, delivery partners for fulfilment, Microsoft Azure for hosting, and messaging services for order updates.',
      },
      {
        heading: 'Security',
        body: 'Your data is only available to your signed-in account. Secrets are never placed in the app, and sensitive personal data is masked from diagnostics.',
      },
      {
        heading: 'Questions or requests',
        body: 'Write to support@craves.in. Some transaction, refund and security records are kept where accounting, disputes or the law require it.',
      },
    ],
  },
};
