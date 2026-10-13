import {httpClient} from '../../../core/http/httpClient';

// Manifest marker for the APIM coverage check; screens fall back to Coming soon at runtime.
export const NOTIFICATION_PREFERENCES_AVAILABLE = false;

/** The channels the server keeps a switch for; SMS has none yet. */
export type NotificationChannel = 'IN_APP' | 'PUSH' | 'EMAIL';
const CHANNELS = new Set<string>(['IN_APP', 'PUSH', 'EMAIL']);

export interface NotificationPreference {
  channel: NotificationChannel;
  enabled: boolean;
  updatedAt: string | null;
}

function parsePreference(value: unknown): NotificationPreference | null {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!raw || typeof raw.channel !== 'string' || !CHANNELS.has(raw.channel) || typeof raw.enabled !== 'boolean') {
    return null;
  }
  return {
    channel: raw.channel as NotificationChannel,
    enabled: raw.enabled,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/** A channel the chef never touched has no row and is on. */
export function isChannelEnabled(preferences: NotificationPreference[], channel: NotificationChannel): boolean {
  return preferences.find(preference => preference.channel === channel)?.enabled ?? true;
}

export const notificationPreferencesApi = {
  async list(signal?: AbortSignal): Promise<NotificationPreference[]> {
    const response = await httpClient.get<unknown>('/api/v1/notifications/preferences', {
      signal,
      dedupeKey: 'notification-preferences',
    });
    if (!Array.isArray(response)) {
      throw new Error('NOTIFICATION_PREFERENCES_INVALID_RESPONSE');
    }
    return response.flatMap(entry => parsePreference(entry) ?? []);
  },

  async set(channel: NotificationChannel, enabled: boolean, signal?: AbortSignal): Promise<NotificationPreference> {
    const saved = parsePreference(
      await httpClient.put<unknown>(`/api/v1/notifications/preferences/${channel}`, {enabled}, {signal}),
    );
    if (!saved) {
      throw new Error('NOTIFICATION_PREFERENCES_INVALID_RESPONSE');
    }
    return saved;
  },
};
