import React from 'react';
import {UnderlineTabs} from '../../../shared/components/UnderlineTabs';
import {CHEF_ORDER_FILTERS, type ChefOrderFilter} from '../domain/chefOrderFilters';

export interface FilterChipsProps {
  selected: ChefOrderFilter;
  /** Orders in each list. A filter with no entry shows no number (Past has none; Scheduled has none until its list is known). */
  counts: Partial<Record<ChefOrderFilter, number>>;
  onSelect: (filter: ChefOrderFilter) => void;
}

/** New · Preparing · Ready · Scheduled · Past as red-underline tabs. Switching is a filter, not a page: the caller swaps the content in place. */
export function FilterChips({selected, counts, onSelect}: FilterChipsProps) {
  return (
    <UnderlineTabs
      accessibilityLabel="Order lists"
      onSelect={onSelect}
      selected={selected}
      tabs={CHEF_ORDER_FILTERS.map(({filter, label}) => {
        const count = counts[filter];
        return {
          key: filter,
          label,
          count,
          accessibilityLabel: count === undefined ? label : `${label}, ${count} ${count === 1 ? 'order' : 'orders'}`,
        };
      })}
    />
  );
}
