import type {ChefOperationalOrderStatus} from '../../chefShell/api/chefOperationalApi';

export type ChefDashboardSalesRange = '7D' | '30D' | '90D';

export const CHEF_DASHBOARD_SALES_RANGES: readonly {
  id: ChefDashboardSalesRange;
  label: string;
}[] = [
  {id: '7D', label: '7 days'},
  {id: '30D', label: '30 days'},
  {id: '90D', label: '90 days'},
];

export function getChefDashboardGreeting(hour: number): string {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

export function formatChefDashboardOrderStatus(
  status: ChefOperationalOrderStatus,
): string {
  switch (status) {
    case 'CHEF_ACCEPTED':
      return 'Accepted';
    case 'PREPARING':
      return 'Preparing';
    case 'READY_FOR_PICKUP':
      return 'Ready for pickup';
    case 'OUT_FOR_DELIVERY':
      return 'Out for delivery';
    case 'CHEF_ACCEPTANCE_PENDING':
      return 'New order';
    case 'DELIVERED':
      return 'Delivered';
    case 'CHEF_REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    case 'REFUND_PENDING':
      return 'Refund pending';
    case 'REFUNDED':
      return 'Refunded';
    case 'REFUND_FAILED':
      return 'Refund failed';
    case 'PAYMENT_PENDING':
      return 'Payment pending';
    case 'PAID':
      return 'Paid';
  }
}

export function shortChefDashboardOrderReference(orderId: string): string {
  const compact = orderId.replace(/-/g, '');
  const suffix = compact.slice(-6).toUpperCase();
  return suffix ? `#${suffix}` : '#ORDER';
}
