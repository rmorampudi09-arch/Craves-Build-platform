import {
  CUSTOMER_SUPPORT_CAPABILITIES,
  customerSupportIntegrationBoundary,
} from './customerSupportCapabilityModel';

describe('customerSupportCapabilityModel', () => {
  it('keeps every P76 server-owned support capability explicitly unavailable', () => {
    expect(CUSTOMER_SUPPORT_CAPABILITIES).toEqual([
      'supportConfiguration',
      'helpContent',
      'supportAvailability',
      'chatSession',
      'supportTicket',
    ]);

    CUSTOMER_SUPPORT_CAPABILITIES.forEach(capability => {
      expect(customerSupportIntegrationBoundary[capability].status).toBe('unavailable');
    });
  });

  it('uses stable blocker codes instead of simulating support success', () => {
    expect(customerSupportIntegrationBoundary.supportConfiguration.blocker).toBe(
      'CUSTOMER_SUPPORT_CONFIGURATION_CONTRACT_UNAVAILABLE',
    );
    expect(customerSupportIntegrationBoundary.helpContent.blocker).toBe(
      'CUSTOMER_SUPPORT_HELP_CONTENT_CONTRACT_UNAVAILABLE',
    );
    expect(customerSupportIntegrationBoundary.supportAvailability.blocker).toBe(
      'CUSTOMER_SUPPORT_AVAILABILITY_CONTRACT_UNAVAILABLE',
    );
    expect(customerSupportIntegrationBoundary.chatSession.blocker).toBe(
      'CUSTOMER_SUPPORT_CHAT_CONTRACT_UNAVAILABLE',
    );
    expect(customerSupportIntegrationBoundary.supportTicket.blocker).toBe(
      'CUSTOMER_SUPPORT_TICKET_CONTRACT_UNAVAILABLE',
    );
  });
});
