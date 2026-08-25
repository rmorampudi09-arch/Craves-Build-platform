import { useMemo, useState } from 'react';

const seedCards = [
  { id: '1', title: 'Pure Veg Lunch Box', subtitle: 'Jain and no-onion options from Himayatnagar', priceForTwo: 249, deliveryEtaMinutes: 28, tags: ['VEG', 'JAIN', 'BUDGET'], relevance: 96 },
  { id: '2', title: 'High Protein Millet Combo', subtitle: 'Paneer, sprouts and millet bowl', priceForTwo: 299, deliveryEtaMinutes: 24, tags: ['VEG', 'HEALTHY', 'HIGH_PROTEIN'], relevance: 93 },
  { id: '3', title: "Today's Andhra Specials", subtitle: 'Limited quantity spicy home-style specials', priceForTwo: 349, deliveryEtaMinutes: 35, tags: ['TODAY_SPECIAL', 'SPICY', 'NON_VEG'], relevance: 91 },
];

export const useSmartFiltersDietaryDiscovery = () => {
  const [veg, setVeg] = useState(false);
  const [healthy, setHealthy] = useState(false);

  const cards = useMemo(
    () => seedCards.filter((card) => (!veg || card.tags.includes('VEG')) && (!healthy || card.tags.includes('HEALTHY'))),
    [veg, healthy],
  );

  return {
    veg,
    healthy,
    cards,
    collections: ['Veg', 'Healthy', 'High Protein', 'Budget Meals', "Today's Specials"],
    toggleVeg: () => setVeg((current) => !current),
    toggleHealthy: () => setHealthy((current) => !current),
  };
};
