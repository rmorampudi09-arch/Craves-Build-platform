import React from 'react';
import {ChefTopBar} from './ui';

/** Kept for screens that have not moved to ChefTopBar yet; the bell opens the notifications screen. */
export function ChefHeader({title}: {title: string}) {
  return <ChefTopBar title={title} />;
}
