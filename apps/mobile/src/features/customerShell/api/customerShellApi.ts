import {httpClient} from '../../../core/http/httpClient';
import type {CustomerBrowsingLocation} from '../state/customerShellSlice';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CustomerNotice {
  id: string;
  title: string;
  body: string;
  noticeType: string | null;
  targetType: string | null;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function coordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    return null;
  }
  return value;
}

function validTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value == null) {
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

function parseNotice(value: unknown): CustomerNotice | null {
  const item = asRecord(value);
  if (!item) {
    return null;
  }

  const id = boundedString(item.id, 64);
  const title = boundedString(item.title, 200);
  const body = boundedString(item.body, 2000);
  const createdAt = validTimestamp(item.createdAt);
  if (!id || !UUID_PATTERN.test(id) || !title || !body || !createdAt) {
    return null;
  }

  const targetId = boundedString(item.targetId, 64);
  if (targetId && !UUID_PATTERN.test(targetId)) {
    return null;
  }

  const readAt = validTimestamp(item.readAt, true);
  if (item.readAt != null && !readAt) {
    return null;
  }

  return {
    id,
    title,
    body,
    noticeType: boundedString(item.noticeType, 80),
    targetType: boundedString(item.targetType, 80),
    targetId,
    readAt,
    createdAt,
  };
}

function parseSavedLocation(value: unknown): CustomerBrowsingLocation | null {
  const item = asRecord(value);
  if (!item) {
    return null;
  }

  const addressId = boundedString(item.id, 64);
  const latitude = coordinate(item.latitude, -90, 90);
  const longitude = coordinate(item.longitude, -180, 180);
  if (
    !addressId ||
    !UUID_PATTERN.test(addressId) ||
    latitude === null ||
    longitude === null
  ) {
    return null;
  }

  const label =
    boundedString(item.addressLabel, 40) ??
    boundedString(item.label, 40) ??
    'Saved address';
  const areaName = boundedString(item.areaName, 120);
  const addressLine1 = boundedString(item.addressLine1, 160);
  const city = boundedString(item.city, 80);
  const state = boundedString(item.state, 80);
  const fallbackParts = [addressLine1, city, state].filter(
    (part): part is string => Boolean(part),
  );
  const displayName = areaName ?? fallbackParts.join(', ');

  if (!displayName) {
    return null;
  }

  return {
    kind: 'SAVED_ADDRESS',
    addressId,
    label,
    displayName,
    latitude,
    longitude,
  };
}

export function unreadNoticeCount(notices: readonly CustomerNotice[]): number {
  return notices.reduce(
    (count, notice) => count + (notice.readAt === null ? 1 : 0),
    0,
  );
}

export const customerShellApi = {
  async listSavedLocations(): Promise<CustomerBrowsingLocation[]> {
    const response = await httpClient.get<unknown>('/api/v1/customer/addresses', {
      dedupeKey: 'customer-shell:addresses',
    });
    if (!Array.isArray(response)) {
      return [];
    }
    return response
      .map(parseSavedLocation)
      .filter((item): item is CustomerBrowsingLocation => item !== null);
  },

  async listNotifications(limit = 100): Promise<CustomerNotice[]> {
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const response = await httpClient.get<unknown>('/api/v1/notifications/in-app', {
      params: {limit: safeLimit},
      dedupeKey: `customer-shell:notifications:${safeLimit}`,
    });
    if (!Array.isArray(response)) {
      return [];
    }
    return response
      .map(parseNotice)
      .filter((item): item is CustomerNotice => item !== null);
  },
};
