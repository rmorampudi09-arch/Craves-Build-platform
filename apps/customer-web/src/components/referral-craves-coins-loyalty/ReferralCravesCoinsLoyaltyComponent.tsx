import React from 'react';

type Entry = { id: string; activityType: string; referenceCode: string; coinsDelta: number; balanceAfter: number; createdAt: string; };

type Props = { entries: Entry[]; loading: boolean; error: string | null; redeem: () => Promise<void>; };

export const ReferralCravesCoinsLoyaltyComponent = ({ entries, loading, error, redeem }: Props) => (
  <div className="space-y-4">
    <button onClick={redeem} disabled={loading} className="rounded-xl bg-stone-900 px-4 py-3 text-white disabled:bg-stone-300">{loading ? 'Redeeming…' : 'Redeem 25 coins'}</button>
    {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between rounded-xl border border-stone-200 p-4">
            <div>
              <p className="font-semibold text-stone-900">{entry.activityType}</p>
              <p className="text-sm text-stone-500">{entry.referenceCode}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-amber-700">{entry.coinsDelta} coins</p>
              <p className="text-xs text-stone-500">Balance {entry.balanceAfter}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
