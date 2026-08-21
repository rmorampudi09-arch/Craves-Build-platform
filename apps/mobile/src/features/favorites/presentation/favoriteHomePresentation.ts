import type {FavoriteHomeCard} from '../api/favoriteHomeFeedApi';

export type FavoriteHomeTone = 'positive' | 'attention' | 'muted';

export interface FavoriteHomeStateCopy {
  title: string;
  detail: string | null;
  tone: FavoriteHomeTone;
}

function localTimeLabel(value: string | null, timezoneId: string): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: timezoneId,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export function favoriteHomeDisplayName(card: FavoriteHomeCard): string {
  return card.displayName?.trim() || card.kitchenName?.trim() || 'Saved home kitchen';
}

export function favoriteHomeStateCopy(card: FavoriteHomeCard): FavoriteHomeStateCopy {
  const nextTime = localTimeLabel(card.nextAvailabilityAt, card.timezoneId);
  switch (card.cookingState) {
    case 'COOKING_NOW':
      return {title: 'Cooking now', detail: `${card.activeAvailableDishCount} current dishes`, tone: 'positive'};
    case 'COOKING_LATER_TODAY':
      return {title: 'Cooking later today', detail: nextTime ? `Next kitchen window around ${nextTime}` : null, tone: 'positive'};
    case 'PAUSED':
      return {title: 'Kitchen paused', detail: nextTime ? `Next known window around ${nextTime}` : 'No reliable reopening time yet', tone: 'attention'};
    case 'NOT_ACCEPTING':
      return {title: 'Not taking orders', detail: 'We will not guess when ordering resumes', tone: 'attention'};
    case 'NOT_TODAY':
      return {title: 'Not cooking today', detail: nextTime ? `Next known kitchen window ${nextTime}` : null, tone: 'muted'};
    case 'INACTIVE':
      return {title: 'Kitchen unavailable', detail: 'Kept in Saved so you control the relationship', tone: 'muted'};
    case 'MISSING':
      return {title: 'Home kitchen no longer listed', detail: 'You can remove this saved relationship', tone: 'muted'};
  }
}

export function isCookingToday(card: FavoriteHomeCard): boolean {
  return card.cookingState === 'COOKING_NOW' || card.cookingState === 'COOKING_LATER_TODAY';
}
