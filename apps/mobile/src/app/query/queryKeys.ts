export type QueryRoleScope = 'CUSTOMER' | 'CHEF';

export type QueryKeyValue =
  | string
  | number
  | boolean
  | null
  | readonly QueryKeyValue[]
  | QueryKeyRecord;

export type QueryKeyRecord = Readonly<Record<string, QueryKeyValue>>;

export interface PublicQueryContext {
  locationKey?: string;
  filters?: QueryKeyRecord;
  entityId?: string;
  paging?: QueryKeyRecord;
}

export interface PrivateQueryContext extends PublicQueryContext {
  userId: string;
  role: QueryRoleScope;
}

export interface PrivateCacheScope {
  userId?: string;
  role?: QueryRoleScope;
}

const QUERY_NAMESPACE = 'craves';
const QUERY_VERSION = 'v1';
const PUBLIC_SCOPE = 'public';
const PRIVATE_SCOPE = 'private';

export const privateQueryPrefix = [
  QUERY_NAMESPACE,
  QUERY_VERSION,
  PRIVATE_SCOPE,
] as const;

function isQueryKeyRecord(value: unknown): value is QueryKeyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: QueryKeyValue): QueryKeyValue {
  if (Array.isArray(value)) {
    return value.map(item => canonicalize(item));
  }

  if (isQueryKeyRecord(value)) {
    const normalized: Record<string, QueryKeyValue> = {};

    Object.keys(value)
      .sort()
      .forEach(key => {
        const child = value[key];
        if (child !== undefined) {
          normalized[key] = canonicalize(child);
        }
      });

    return normalized;
  }

  return value;
}

function requireNonBlank(label: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty.`);
  }
  return normalized;
}

function normalizePublicContext(context: PublicQueryContext): QueryKeyRecord {
  const normalized: Record<string, QueryKeyValue> = {};

  if (context.locationKey !== undefined) {
    normalized.locationKey = requireNonBlank('locationKey', context.locationKey);
  }
  if (context.filters !== undefined) {
    normalized.filters = canonicalize(context.filters);
  }
  if (context.entityId !== undefined) {
    normalized.entityId = requireNonBlank('entityId', context.entityId);
  }
  if (context.paging !== undefined) {
    normalized.paging = canonicalize(context.paging);
  }

  return canonicalize(normalized) as QueryKeyRecord;
}

export function createPublicQueryKey(
  domain: string,
  context: PublicQueryContext = {},
) {
  return [
    QUERY_NAMESPACE,
    QUERY_VERSION,
    PUBLIC_SCOPE,
    requireNonBlank('domain', domain),
    normalizePublicContext(context),
  ] as const;
}

export function createPrivateQueryKey(
  domain: string,
  context: PrivateQueryContext,
) {
  return [
    ...privateQueryPrefix,
    requireNonBlank('domain', domain),
    {
      userId: requireNonBlank('userId', context.userId),
      role: context.role,
      ...normalizePublicContext(context),
    },
  ] as const;
}

export function isPrivateQueryKey(queryKey: readonly unknown[]): boolean {
  return (
    queryKey[0] === privateQueryPrefix[0] &&
    queryKey[1] === privateQueryPrefix[1] &&
    queryKey[2] === privateQueryPrefix[2]
  );
}

export function matchesPrivateQueryScope(
  queryKey: readonly unknown[],
  scope: PrivateCacheScope = {},
): boolean {
  if (!isPrivateQueryKey(queryKey)) {
    return false;
  }

  if (scope.userId === undefined && scope.role === undefined) {
    return true;
  }

  const context = queryKey[4];
  if (!isQueryKeyRecord(context)) {
    return false;
  }

  if (scope.userId !== undefined && context.userId !== scope.userId) {
    return false;
  }

  return scope.role === undefined || context.role === scope.role;
}
