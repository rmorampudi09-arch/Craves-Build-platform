export const useLiveOrderTrackingTimeline = () => ({
  currentStatus: 'OUT_FOR_DELIVERY',
  etaMinutes: 12,
  deliveryPartner: 'Shiprocket',
  mapUrl: 'https://maps.craves.app/orders/order-1201',
  timeline: [
    { status: 'PLACED', label: 'Order placed', occurredAt: '2026-08-25T10:00:00Z', completed: true },
    { status: 'CHEF_ACCEPTED', label: 'Chef accepted', occurredAt: '2026-08-25T10:02:00Z', completed: true },
    { status: 'PREPARING', label: 'Meal is being prepared', occurredAt: '2026-08-25T10:15:00Z', completed: true },
    { status: 'PICKED_UP', label: 'Delivery partner picked up the order', occurredAt: '2026-08-25T10:36:00Z', completed: true },
    { status: 'OUT_FOR_DELIVERY', label: 'Partner is nearby', occurredAt: '2026-08-25T10:44:00Z', completed: true },
    { status: 'DELIVERED', label: 'Delivered', occurredAt: '2026-08-25T10:56:00Z', completed: false },
  ],
});
