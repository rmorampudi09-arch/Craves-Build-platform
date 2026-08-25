import React from 'react';

type Preference = { discoveryMode: string; vegOnly: boolean; healthyOnly: boolean; spiceTolerance: string; };

type Props = { preference: Preference; loading: boolean; error: string | null; update: (patch: Partial<Preference>) => Promise<void>; };

export const PreferenceModeVegHealthyComponent = ({ preference, loading, error, update }: Props) => (
  <div className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
    {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="flex gap-3">
      {['all', 'veg', 'healthy'].map((mode) => (
        <button key={mode} onClick={() => update({ discoveryMode: mode, vegOnly: mode === 'veg', healthyOnly: mode === 'healthy' })} className={`rounded-xl px-4 py-3 ${preference.discoveryMode === mode ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>{mode}</button>
      ))}
    </div>
    <div className="flex gap-3">
      {['low', 'medium', 'high'].map((level) => (
        <button key={level} onClick={() => update({ spiceTolerance: level })} className={`rounded-xl px-4 py-2 ${preference.spiceTolerance === level ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-700'}`}>{level} spice</button>
      ))}
    </div>
    {loading && <p className="text-sm text-stone-500">Saving preferences…</p>}
  </div>
);
