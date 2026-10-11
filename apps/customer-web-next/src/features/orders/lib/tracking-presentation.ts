import { formatOrderStatus } from './order-contract.ts';
import { presentationFor, type DeliveryStatus } from './delivery-status.ts';

export function trackingPresentation(orderStatus: string | null, deliveryStatus: DeliveryStatus | null) {
  if (deliveryStatus) return presentationFor(deliveryStatus);
  const descriptions: Record<string, string> = {
    PAYMENT_PENDING: 'Your order is awaiting payment. Check your orders for the latest payment options.',
    PAID: 'Payment received. Your kitchen will confirm your order.',
    CHEF_ACCEPTANCE_PENDING: 'Your kitchen is reviewing your order.',
    CHEF_ACCEPTED: 'Your kitchen has accepted your order.',
    PREPARING: 'Your kitchen is preparing your food.',
    READY_FOR_PICKUP: 'Your food is ready for pickup. Delivery updates will appear here when available.',
    OUT_FOR_DELIVERY: 'Your order is on the way. More delivery updates will appear here when available.',
    DELIVERED: 'Your order has been delivered.',
    CHEF_REJECTED: 'The kitchen could not accept this order. Check your orders for the latest update.',
    CANCELLED: 'This order has been cancelled.',
    REFUND_PENDING: 'Your refund is being processed.',
    REFUNDED: 'Your refund has been completed.',
    REFUND_FAILED: 'Your refund needs attention. Please contact Craves support.',
  };
  return {
    label: orderStatus ? formatOrderStatus(orderStatus) : 'Loading order',
    description: orderStatus ? descriptions[orderStatus] ?? 'Your latest order status is shown here.' : 'Getting your latest order update.',
  };
}
