import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {toAppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {useAppSelector} from '../../../app/store/hooks';
import type {CustomerBrowsingLocation} from '../../customerShell/state/customerShellSlice';

/** user-chef "Notify me" for a delivery spot where no home kitchen cooks yet. */
export const LAUNCH_ALERTS_PATH = '/api/v1/customer/launch-alerts';

export class LaunchAlertContractError extends Error {
  constructor() {
    super('We could not read your notification request. Please try again.');
    this.name = 'LaunchAlertContractError';
  }
}

function parseSubscribed(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || typeof (value as {subscribed?: unknown}).subscribed !== 'boolean') {
    throw new LaunchAlertContractError();
  }
  return (value as {subscribed: boolean}).subscribed;
}

export const launchAlertApi = {
  async isSubscribed(latitude: number, longitude: number, signal?: AbortSignal): Promise<boolean> {
    const response = await httpClient.get<unknown>(LAUNCH_ALERTS_PATH, {
      params: {latitude, longitude},
      signal,
      dedupeKey: `launch-alert:${latitude}:${longitude}`,
    });
    return parseSubscribed(response);
  },

  async subscribe(latitude: number, longitude: number, areaName: string): Promise<boolean> {
    return parseSubscribed(await httpClient.put<unknown>(LAUNCH_ALERTS_PATH, {latitude, longitude, areaName}));
  },
};

/** The 50-place cap (409) explains itself; anything else gets one plain line instead of the raw API text. */
export function launchAlertErrorText(error: unknown): string {
  const apiError = toAppApiError(error);
  return apiError.status === 409 ? apiError.message : "We couldn't save that. Please try again.";
}

/** Status and "Notify me" for the selected location; disabled until Home knows no kitchen cooks there. */
export function useLaunchAlert(location: CustomerBrowsingLocation | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = ['launch-alert', identityId, location?.latitude, location?.longitude] as const;
  const status = useQuery({
    queryKey,
    queryFn: ({signal}) => launchAlertApi.isSubscribed(location!.latitude, location!.longitude, signal),
    enabled: Boolean(enabled && identityId && location),
  });
  const subscribe = useMutation({
    // The server keeps up to 160 characters of the area name.
    mutationFn: () =>
      launchAlertApi.subscribe(
        location!.latitude,
        location!.longitude,
        location!.displayName.trim().slice(0, 160) || location!.label,
      ),
    onSuccess: subscribed => queryClient.setQueryData(queryKey, subscribed),
  });
  return {
    subscribed: status.data === true,
    subscribe: () => subscribe.mutate(),
    saving: subscribe.isPending,
    error: subscribe.error,
  };
}
