import React from 'react';
import { LoyaltyCoinsWalletComponent } from '../../components/loyalty-coins-wallet/LoyaltyCoinsWalletComponent';
import { useLoyaltyCoinsWallet } from '../../hooks/useLoyaltyCoinsWallet';

const LoyaltyCoinsWalletPage = () => {
  const wallet = useLoyaltyCoinsWallet();

  return (
    <main className="min-h-screen bg-gradient-to-b from-yellow-50 via-white to-white px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-yellow-600">Rewards</p>
          <h1 className="text-3xl font-bold text-slate-900">Loyalty coins wallet</h1>
          <p className="mt-2 text-slate-600">Earn on completed orders, referrals, renewals and chef discovery. Redeem at checkout with a clear ledger.</p>
        </header>
        <LoyaltyCoinsWalletComponent {...wallet} />
      </div>
    </main>
  );
};

export default LoyaltyCoinsWalletPage;
