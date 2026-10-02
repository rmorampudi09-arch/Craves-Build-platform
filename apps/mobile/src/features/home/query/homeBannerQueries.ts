import {useQuery} from '@tanstack/react-query';
import {homeBannerApi} from '../api/homeBannerApi';

export const homeBannerQueryKey = ['craves', 'v1', 'public', 'home-banners'] as const;

export function useHomeBannersQuery(enabled: boolean) {
  return useQuery({
    queryKey: homeBannerQueryKey,
    queryFn: ({signal}) => homeBannerApi.list(signal),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: enabled ? 30_000 : false,
    retry: 1,
  });
}
