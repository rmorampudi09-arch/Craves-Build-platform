import React from 'react';
import { PreferenceModeVegHealthyComponent } from '../../components/preference-mode-veg-healthy/PreferenceModeVegHealthyComponent';
import { usePreferenceModeVegHealthy } from '../../hooks/usePreferenceModeVegHealthy';

const PreferenceModePage = () => {
  const hook = usePreferenceModeVegHealthy();
  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold text-stone-900">Veg / Healthy Preference Mode</h1>
        <PreferenceModeVegHealthyComponent {...hook} />
      </div>
    </div>
  );
};

export default PreferenceModePage;
