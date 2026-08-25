import React from 'react';
import { CuratedCollectionsOccasionDiscoveryComponent } from '../../components/curated-collections-occasion-discovery/CuratedCollectionsOccasionDiscoveryComponent';
import { useCuratedCollectionsOccasionDiscovery } from '../../hooks/useCuratedCollectionsOccasionDiscovery';

const CollectionsPage = () => {
  const hook = useCuratedCollectionsOccasionDiscovery();
  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-bold text-stone-900">Curated Collections & Occasion Discovery</h1>
        <CuratedCollectionsOccasionDiscoveryComponent {...hook} />
      </div>
    </div>
  );
};

export default CollectionsPage;
