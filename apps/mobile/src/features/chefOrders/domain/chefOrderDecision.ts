import {AppApiError} from '../../../core/http/apiError';
import {
  chefOrderDetailApi,
  type ChefAcceptOrderRequest,
  type ChefOrderDetail,
  type ChefRejectOrderRequest,
} from '../api/chefOrderDetailApi';

export type ChefOrderDecisionKind = 'accept' | 'reject';

export type ChefOrderDecisionInput =
  | {
      kind: 'accept';
      orderId: string;
      prepTimeMinutes: number;
    }
  | {
      kind: 'reject';
      orderId: string;
      reason: string;
    };

export interface ChefOrderDecisionResult {
  order: ChefOrderDetail;
  idempotencyKey: string;
}

export interface ChefOrderDecisionApi {
  getOrder(orderId: string): Promise<ChefOrderDetail>;
  acceptOrder(
    orderId: string,
    request: ChefAcceptOrderRequest,
    idempotencyKey?: string,
  ): Promise<ChefOrderDetail>;
  rejectOrder(
    orderId: string,
    request: ChefRejectOrderRequest,
    idempotencyKey?: string,
  ): Promise<ChefOrderDetail>;
}

export class ChefOrderDecisionConflictError extends AppApiError {
  constructor(readonly latestOrder: ChefOrderDetail) {
    super(
      'CHEF_ORDER_NOT_ACTIONABLE',
      `This order is now ${formatChefOrderStatus(latestOrder.status)}. Refreshing the latest status.`,
      409,
    );
    this.name = 'ChefOrderDecisionConflictError';
  }
}

export function formatChefOrderStatus(status: ChefOrderDetail['status']): string {
  return status
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function maskChefOrderContactPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return 'Contact unavailable';
  }
  const visible = digits.slice(-4);
  const maskedLength = Math.max(digits.length - visible.length, 4);
  return `${'•'.repeat(maskedLength)} ${visible}`;
}

export function createChefOrderDecisionIdempotencyKey(
  kind: ChefOrderDecisionKind,
  order: Pick<ChefOrderDetail, 'id' | 'updatedAt'>,
): string {
  const revision = Date.parse(order.updatedAt);
  if (!Number.isFinite(revision)) {
    throw new AppApiError(
      'CHEF_ORDER_REVISION_INVALID',
      'The order revision could not be verified. Refresh and try again.',
    );
  }
  return `chef-order-${kind}-${order.id}-${revision}`;
}

function requireAcceptPrepTime(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new AppApiError(
      'CHEF_ORDER_PREP_TIME_REQUIRED',
      'Enter a valid preparation time in minutes before accepting.',
      400,
    );
  }
  return value;
}

function requireRejectReason(value: string): string {
  const reason = value.trim();
  if (!reason) {
    throw new AppApiError(
      'CHEF_ORDER_REJECT_REASON_REQUIRED',
      'Enter a reason before rejecting this order.',
      400,
    );
  }
  if (reason.length > 500) {
    throw new AppApiError(
      'CHEF_ORDER_REJECT_REASON_TOO_LONG',
      'Keep the rejection reason under 500 characters.',
      400,
    );
  }
  return reason;
}

export interface ChefOrderDecisionCoordinator {
  execute(input: ChefOrderDecisionInput): Promise<ChefOrderDecisionResult>;
}

export function createChefOrderDecisionCoordinator(
  api: ChefOrderDecisionApi = chefOrderDetailApi,
): ChefOrderDecisionCoordinator {
  const inFlightByOrder = new Map<string, Promise<ChefOrderDecisionResult>>();

  return {
    execute(input) {
      if (inFlightByOrder.has(input.orderId)) {
        return Promise.reject(
          new AppApiError(
            'CHEF_ORDER_DECISION_IN_PROGRESS',
            'An order decision is already in progress.',
            409,
          ),
        );
      }

      const request = (async (): Promise<ChefOrderDecisionResult> => {
        const latest = await api.getOrder(input.orderId);
        if (latest.status !== 'CHEF_ACCEPTANCE_PENDING') {
          throw new ChefOrderDecisionConflictError(latest);
        }

        const idempotencyKey = createChefOrderDecisionIdempotencyKey(
          input.kind,
          latest,
        );
        const order =
          input.kind === 'accept'
            ? await api.acceptOrder(
                input.orderId,
                {
                  prepTimeMinutes: requireAcceptPrepTime(input.prepTimeMinutes),
                  note: null,
                },
                idempotencyKey,
              )
            : await api.rejectOrder(
                input.orderId,
                {reason: requireRejectReason(input.reason)},
                idempotencyKey,
              );

        return {order, idempotencyKey};
      })();

      inFlightByOrder.set(input.orderId, request);
      return request.finally(() => {
        if (inFlightByOrder.get(input.orderId) === request) {
          inFlightByOrder.delete(input.orderId);
        }
      });
    },
  };
}
