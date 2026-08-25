import { useState } from 'react';

const offers = [
  { code: 'WELCOME100', title: '₹100 off first order', description: 'For first-time Craves customers above ₹399', minOrderValue: 399, discountAmount: 100, tags: ['FIRST_ORDER', 'INTRO'] },
  { code: 'FREEDEL', title: 'Free delivery', description: 'Free delivery above ₹249 in select localities', minOrderValue: 249, discountAmount: 49, tags: ['FREE_DELIVERY', 'LOCALITY'] },
];

export const useOffersCouponsPromotions = () => {
  const [code, setCode] = useState('WELCOME100');
  const [result, setResult] = useState<{ eligible: boolean; discountApplied: number; finalTotal: number; reason: string } | null>(null);
  const cartTotal = 540;

  return {
    code,
    setCode,
    cartTotal,
    offers,
    result,
    apply: () => {
      const offer = offers.find((item) => item.code === code) ?? offers[0];
      const eligible = cartTotal >= offer.minOrderValue;
      const discountApplied = eligible ? offer.discountAmount : 0;
      setResult({ eligible, discountApplied, finalTotal: cartTotal - discountApplied, reason: eligible ? 'Promotion applied successfully' : `Minimum order ₹${offer.minOrderValue}` });
    },
  };
};
