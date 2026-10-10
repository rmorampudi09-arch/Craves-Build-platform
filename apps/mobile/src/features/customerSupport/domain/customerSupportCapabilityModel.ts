export const CUSTOMER_SUPPORT_CAPABILITIES = [
  'supportConfiguration',
  'helpContent',
  'supportAvailability',
  'chatSession',
  'supportTicket',
] as const;

export type CustomerSupportCapability =
  (typeof CUSTOMER_SUPPORT_CAPABILITIES)[number];

export type CustomerSupportBlocker =
  | 'CUSTOMER_SUPPORT_CONFIGURATION_CONTRACT_UNAVAILABLE'
  | 'CUSTOMER_SUPPORT_HELP_CONTENT_CONTRACT_UNAVAILABLE'
  | 'CUSTOMER_SUPPORT_AVAILABILITY_CONTRACT_UNAVAILABLE'
  | 'CUSTOMER_SUPPORT_TICKET_CONTRACT_UNAVAILABLE';

export interface CustomerSupportCapabilityUnavailable {
  readonly status: 'unavailable';
  readonly blocker: CustomerSupportBlocker;
  readonly reason: string;
}

export interface CustomerSupportCapabilityAvailable {
  readonly status: 'available';
  readonly reason: string;
}

export type CustomerSupportIntegrationBoundary = Readonly<
  Record<
    Exclude<CustomerSupportCapability, 'chatSession'>,
    CustomerSupportCapabilityUnavailable
  > & {chatSession: CustomerSupportCapabilityAvailable}
>;

/**
 * P76 integration boundary. These capabilities stay unavailable until an exact,
 * approved repository contract is registered. The UI must never infer contact
 * details, article data, or ticket success locally. Chat is backed by the
 * POST /api/v1/support/chat assistant contract.
 */
export const customerSupportIntegrationBoundary: CustomerSupportIntegrationBoundary = {
  supportConfiguration: {
    status: 'unavailable',
    blocker: 'CUSTOMER_SUPPORT_CONFIGURATION_CONTRACT_UNAVAILABLE',
    reason: 'No approved customer support configuration contract is registered.',
  },
  helpContent: {
    status: 'unavailable',
    blocker: 'CUSTOMER_SUPPORT_HELP_CONTENT_CONTRACT_UNAVAILABLE',
    reason: 'No approved customer help category or article contract is registered.',
  },
  supportAvailability: {
    status: 'unavailable',
    blocker: 'CUSTOMER_SUPPORT_AVAILABILITY_CONTRACT_UNAVAILABLE',
    reason: 'No approved support-hours or availability contract is registered.',
  },
  chatSession: {
    status: 'available',
    reason: 'Customer support chat is served by the Craves AI support assistant.',
  },
  supportTicket: {
    status: 'unavailable',
    blocker: 'CUSTOMER_SUPPORT_TICKET_CONTRACT_UNAVAILABLE',
    reason: 'No approved customer support ticket contract is registered.',
  },
};
