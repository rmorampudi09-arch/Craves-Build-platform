import React from 'react';

type LedgerEntry = { type: string; coins: number; reason: string; occurredAt: string };

type Props = {
  balanceCoins: number;
  redeemableValue: number;
  ledger: LedgerEntry[];
};

export const LoyaltyCoinsWalletComponent = ({ balanceCoins, redeemableValue, ledger }: Props) => (
  <section className="space-y-6">
    <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm">
      <p className="text-sm text-yellow-300">Available balance</p>
      <h2 className="mt-2 text-4xl font-bold">{balanceCoins} coins</h2>
      <p className="mt-2 text-slate-300">Redeemable value: ₹{redeemableValue}</p>
    </div>
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-lg font-semibold text-slate-900">Rewards ledger</h3>
      <div className="mt-4 space-y-3">
        {ledger.map((entry, index) => (
          <div key={`${entry.reason}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">{entry.reason}</p>
              <p className="text-sm text-slate-500">{new Date(entry.occurredAt).toLocaleDateString()}</p>
            </div>
            <span className={`font-semibold ${entry.coins >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{entry.coins >= 0 ? '+' : ''}{entry.coins}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);
