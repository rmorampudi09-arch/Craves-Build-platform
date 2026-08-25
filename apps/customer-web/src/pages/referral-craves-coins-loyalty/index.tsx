import React from 'react';
import { ReferralCravesCoinsLoyaltyComponent } from '../../components/referral-craves-coins-loyalty/ReferralCravesCoinsLoyaltyComponent';
import { useReferralCravesCoinsLoyalty } from '../../hooks/useReferralCravesCoinsLoyalty';

const LoyaltyPage = () => {
  const hook = useReferralCravesCoinsLoyalty();
  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold text-stone-900">Referral & Craves Coins Loyalty</h1>
        <ReferralCravesCoinsLoyaltyComponent {...hook} />
      </div>
    </div>
  );
};

export default LoyaltyPage;
