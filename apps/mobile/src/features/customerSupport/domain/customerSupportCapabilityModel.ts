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
  | 'CUSTOMER_SUPPORT_CHAT_CONTRACT_UNAVAILABLE'
  | 'CUSTOMER_SUPPORT_TICKET_CONTRACT_UNAVAILABLE';

export interface CustomerSupportCapabilityUnavailable {
  readonly status: 'unavailable';
  readonly blocker: CustomerSupportBlocker;
  readonly reason: string;
}

export type CustomerSupportIntegrationBoundary = Readonly<
  Record<CustomerSupportCapability, CustomerSupportCapabilityUnavailable>
>;

/**
 * P76 integration boundary. These capabilities stay unavailable until an exact,
 * approved repository contract is registered. The UI must never infer contact
 * details, article data, chat behavior, or ticket success locally.
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
    status: 'unavailable',
    blocker: 'CUSTOMER_SUPPORT_CHAT_CONTRACT_UNAVAILABLE',
    reason: 'No approved customer support chat contract is registered.',
  },
  supportTicket: {
    status: 'unavailable',
    blocker: 'CUSTOMER_SUPPORT_TICKET_CONTRACT_UNAVAILABLE',
    reason: 'No approved customer support ticket contract is registered.',
  },
};
