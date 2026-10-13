import {chefOnboardingApi} from '../../chefOnboarding/api/chefOnboardingApi';
import {useChefRead} from './useChefRead';

/**
 * The chef application as the server holds it (documents, FSSAI, support contact). One cache entry for every
 * Profile screen that needs it; a chef approved before the new application has none, which reads as a 404.
 */
export function useChefOnboardingState() {
  return useChefRead('chef-onboarding-state', () => chefOnboardingApi.load(), {staleTime: 60_000});
}
