import {
  CUSTOMER_DELIVERY_POLL_INTERVAL_MS,
  getCustomerDeliveryStatusPresentation,
  isTerminalCustomerDeliveryStatus,
} from './presentation/customerOrderTrackingPresentation';

describe('P55 delivery tracking presentation', () => {
  it('uses the approved 30-second controlled refresh interval', () => {
    expect(CUSTOMER_DELIVERY_POLL_INTERVAL_MS).toBe(30_000);
  });

  it('stops automatic refresh for terminal delivery states only', () => {
    expect(isTerminalCustomerDeliveryStatus('DELIVERED')).toBe(true);
    expect(isTerminalCustomerDeliveryStatus('CANCELLED')).toBe(true);
    expect(isTerminalCustomerDeliveryStatus('RETURNED')).toBe(true);
    expect(isTerminalCustomerDeliveryStatus('FAILED')).toBe(true);
    expect(isTerminalCustomerDeliveryStatus('IN_TRANSIT')).toBe(false);
    expect(isTerminalCustomerDeliveryStatus('DELAYED')).toBe(false);
  });

  it('maps provider-neutral states to customer copy without inventing ETA', () => {
    expect(getCustomerDeliveryStatusPresentation('IN_TRANSIT')).toEqual({
      label: 'On the way',
      detail: 'Your order is in transit.',
      stage: 7,
      tone: 'accent',
    });
    expect(getCustomerDeliveryStatusPresentation('DELAYED').tone).toBe('warning');
  });
});
