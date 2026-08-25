import React from 'react';
import { useLoyaltyCoinReferral } from '../../hooks/useLoyaltyCoinReferral';

export function LoyaltyCoinReferralComponent() {
  const data = useLoyaltyCoinReferral('11111111-1111-1111-1111-111111111111');

  return (
    <div className="min-h-screen bg-yellow-50 p-6">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-yellow-950">Loyalty coins & referrals</h1>
        <p className="mt-2 text-yellow-700">Earn coins on every order and share your invite code with friends.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-yellow-100 p-5">
            <p className="text-sm text-yellow-900">Coin balance</p>
            <p className="text-3xl font-bold text-yellow-950">{data?.coinBalance ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-yellow-100 p-5">
            <p className="text-sm text-yellow-900">Referral code</p>
            <p className="text-2xl font-bold text-yellow-950">{data?.referralCode ?? '...'}</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-gray-600">{data?.shareMessage}</p>
      </div>
    </div>
  );
}
