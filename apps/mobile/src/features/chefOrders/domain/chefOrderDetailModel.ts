import type {
  ChefOrderDetail,
  ChefOrderDetailStatus,
} from '../api/chefOrderDetailApi';

export interface ChefOrderUnavailableCapability {
  availability: 'UNAVAILABLE';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  reason: string;
}

export interface ChefOrderDecisionActionability {
  sourceStatus: ChefOrderDetailStatus;
  acceptCandidate: boolean;
  rejectCandidate: boolean;
  requiresServerRevalidation: true;
}

export interface ChefOrderAuthorizedContactSnapshot {
  recipientName: string;
  contactPhoneNumber: string;
}

export interface ChefOrderMapPoint {
  latitude: number;
  longitude: number;
}

export interface ChefOrderDetailContractModel {
  order: ChefOrderDetail;
  actionability: ChefOrderDecisionActionability;
  authorizedContactSnapshot: ChefOrderAuthorizedContactSnapshot | null;
  deliveryMapPoint: ChefOrderMapPoint | null;
  unavailable: {
    acceptanceDeadline: ChefOrderUnavailableCapability;
    statusTimeline: ChefOrderUnavailableCapability;
    customerOrderNote: ChefOrderUnavailableCapability;
    paymentMethod: ChefOrderUnavailableCapability;
    contactAuthorizationAndChat: ChefOrderUnavailableCapability;
  };
}

export const chefOrderDetailUnavailableCapabilities = {
  acceptanceDeadline: {
    availability: 'UNAVAILABLE',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason:
      'Chef OrderResponse does not expose chef_acceptance_expires_at, so the mobile app cannot derive an authoritative acceptance countdown.',
  },
  statusTimeline: {
    availability: 'UNAVAILABLE',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason:
      'No approved public Chef order status-history or timeline read contract is exposed by the current repository.',
  },
  customerOrderNote: {
    availability: 'UNAVAILABLE',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason:
      'The current Chef OrderResponse does not expose the customer checkout note required by Guide Reference 39.',
  },
  paymentMethod: {
    availability: 'UNAVAILABLE',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason:
      'The current Chef OrderResponse exposes authoritative order totals and currency but no customer payment-method detail.',
  },
  contactAuthorizationAndChat: {
    availability: 'UNAVAILABLE',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason:
      'Order ownership authorizes the returned delivery contact snapshot, but no separate contact-permission, chat, or support-event logging contract is exposed.',
  },
} as const satisfies Record<string, ChefOrderUnavailableCapability>;

export function deriveChefOrderDecisionActionability(
  status: ChefOrderDetailStatus,
): ChefOrderDecisionActionability {
  const awaitingDecision = status === 'CHEF_ACCEPTANCE_PENDING';
  return {
    sourceStatus: status,
    acceptCandidate: awaitingDecision,
    rejectCandidate: awaitingDecision,
    requiresServerRevalidation: true,
  };
}

export function deriveChefOrderDetailContractModel(
  order: ChefOrderDetail,
): ChefOrderDetailContractModel {
  const deliveryAddress = order.deliveryAddress;
  return {
    order,
    actionability: deriveChefOrderDecisionActionability(order.status),
    authorizedContactSnapshot: deliveryAddress
      ? {
          recipientName: deliveryAddress.recipientName,
          contactPhoneNumber: deliveryAddress.contactPhoneNumber,
        }
      : null,
    deliveryMapPoint: deliveryAddress
      ? {
          latitude: deliveryAddress.latitude,
          longitude: deliveryAddress.longitude,
        }
      : null,
    unavailable: chefOrderDetailUnavailableCapabilities,
  };
}
