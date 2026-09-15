import {z} from 'zod';

const inboundResourceIdSchema = z.string().uuid();
const DEFAULT_DEDUPE_WINDOW_MS = 2_000;

export type InboundRouteCandidate =
  | {kind: 'CUSTOMER'}
  | {kind: 'CHEF'}
  | {kind: 'ORDER'; orderId: string}
  | {kind: 'OFFER'}
  | {kind: 'KITCHEN'; kitchenId: string};

export type InboundRouteDestination =
  | {kind: 'CUSTOMER_HOME'}
  | {kind: 'CHEF_HOME'}
  | {kind: 'CUSTOMER_ORDER_DETAIL'; orderId: string}
  | {kind: 'CUSTOMER_ORDER_TRACKING'; orderId: string}
  | {kind: 'CHEF_ORDER_DETAIL'; orderId: string}
  | {kind: 'CUSTOMER_KITCHEN_PROFILE'; kitchenId: string};

export type InboundAuthorizedRole = 'CUSTOMER' | 'CHEF';

export interface InboundRouteContext {
  authenticated: boolean;
  authorizedRole: InboundAuthorizedRole | null;
  productReady: boolean;
}

export type InboundRouteResolution =
  | {status: 'NAVIGATE'; destination: InboundRouteDestination}
  | {status: 'DEFER'; reason: 'AUTH_REQUIRED' | 'PRODUCT_NOT_READY'}
  | {status: 'BLOCKED'; reason: 'ROLE_MISMATCH' | 'DESTINATION_UNAVAILABLE'};

export interface InboundRouteDedupe {
  claim: (destination: InboundRouteDestination, now?: number) => boolean;
  release: (destination: InboundRouteDestination) => void;
  reset: () => void;
}

export function isInboundResourceId(value: unknown): value is string {
  return typeof value === 'string' && inboundResourceIdSchema.safeParse(value).success;
}

export function parseInboundUrl(value: string): InboundRouteCandidate | null {
  if (typeof value !== 'string' || value !== value.trim() || !value.startsWith('craves://')) {
    return null;
  }

  const route = value.slice('craves://'.length);
  if (!route || route.includes('?') || route.includes('#')) {
    return null;
  }

  if (route === 'customer') {
    return {kind: 'CUSTOMER'};
  }
  if (route === 'chef') {
    return {kind: 'CHEF'};
  }
  if (route === 'offer') {
    return {kind: 'OFFER'};
  }

  const segments = route.split('/');
  if (segments.length !== 2 || !isInboundResourceId(segments[1])) {
    return null;
  }

  if (segments[0] === 'order') {
    return {kind: 'ORDER', orderId: segments[1]};
  }
  if (segments[0] === 'kitchen') {
    return {kind: 'KITCHEN', kitchenId: segments[1]};
  }

  return null;
}

export function resolveInboundRoute(
  candidate: InboundRouteCandidate,
  context: InboundRouteContext,
): InboundRouteResolution {
  if (!context.authenticated) {
    return {status: 'DEFER', reason: 'AUTH_REQUIRED'};
  }
  if (!context.productReady || context.authorizedRole === null) {
    return {status: 'DEFER', reason: 'PRODUCT_NOT_READY'};
  }

  if (candidate.kind === 'ORDER') {
    return context.authorizedRole === 'CHEF'
      ? {
          status: 'NAVIGATE',
          destination: {kind: 'CHEF_ORDER_DETAIL', orderId: candidate.orderId},
        }
      : {
          status: 'NAVIGATE',
          destination: {kind: 'CUSTOMER_ORDER_DETAIL', orderId: candidate.orderId},
        };
  }

  if (candidate.kind === 'CUSTOMER') {
    return context.authorizedRole === 'CUSTOMER'
      ? {status: 'NAVIGATE', destination: {kind: 'CUSTOMER_HOME'}}
      : {status: 'BLOCKED', reason: 'ROLE_MISMATCH'};
  }

  if (candidate.kind === 'CHEF') {
    return context.authorizedRole === 'CHEF'
      ? {status: 'NAVIGATE', destination: {kind: 'CHEF_HOME'}}
      : {status: 'BLOCKED', reason: 'ROLE_MISMATCH'};
  }

  if (candidate.kind === 'KITCHEN') {
    return context.authorizedRole === 'CUSTOMER'
      ? {
          status: 'NAVIGATE',
          destination: {
            kind: 'CUSTOMER_KITCHEN_PROFILE',
            kitchenId: candidate.kitchenId,
          },
        }
      : {status: 'BLOCKED', reason: 'ROLE_MISMATCH'};
  }

  // P70/P71 intentionally left Coupons/Offers without a production route because
  // the authoritative offer/eligibility contract is unavailable. Recognize the
  // canonical destination but keep it fail closed rather than fabricating a screen.
  return {status: 'BLOCKED', reason: 'DESTINATION_UNAVAILABLE'};
}

export function inboundDestinationKey(destination: InboundRouteDestination): string {
  switch (destination.kind) {
    case 'CUSTOMER_HOME':
      return destination.kind;
    case 'CHEF_HOME':
      return destination.kind;
    case 'CUSTOMER_ORDER_DETAIL':
    case 'CUSTOMER_ORDER_TRACKING':
    case 'CHEF_ORDER_DETAIL':
      return `${destination.kind}:${destination.orderId}`;
    case 'CUSTOMER_KITCHEN_PROFILE':
      return `${destination.kind}:${destination.kitchenId}`;
  }
}

export function createInboundRouteDedupe(
  windowMs: number = DEFAULT_DEDUPE_WINDOW_MS,
): InboundRouteDedupe {
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new Error('Inbound route dedupe window must be a non-negative number.');
  }

  const acceptedAt = new Map<string, number>();

  return {
    claim(destination, now = Date.now()) {
      const key = inboundDestinationKey(destination);
      const previous = acceptedAt.get(key);
      if (previous !== undefined && now - previous < windowMs) {
        return false;
      }

      acceptedAt.set(key, now);
      for (const [existingKey, timestamp] of acceptedAt) {
        if (now - timestamp >= windowMs) {
          acceptedAt.delete(existingKey);
        }
      }
      return true;
    },
    release(destination) {
      acceptedAt.delete(inboundDestinationKey(destination));
    },
    reset() {
      acceptedAt.clear();
    },
  };
}

export const inboundRouteDedupe = createInboundRouteDedupe();
