import type {ChefOperationalNotice} from '../api/chefOperationalApi';

// Port of craves.in's chef notifications filter (customer-web-next, Notifications.tsx: isKitchenNotice / isOwnOrderNotice).
// Sent to customers despite the CHEF_ prefix: "the chef accepted/declined your order".
const CUSTOMER_CHEF_TYPES = new Set(['CHEF_ACCEPTED_ORDER', 'CHEF_REJECTED_ORDER']);

type NoticeKind = Pick<ChefOperationalNotice, 'noticeType' | 'targetType'>;

function isKitchenNotice({noticeType, targetType}: NoticeKind): boolean {
  const type = (noticeType ?? '').toUpperCase();
  return (
    (type.startsWith('CHEF_') && !CUSTOMER_CHEF_TYPES.has(type)) ||
    (targetType ?? '').toUpperCase().startsWith('CHEF_')
  );
}

/**
 * False for notices about food the person bought as a customer; Chef mode leaves those to the customer app.
 * A notice of an unknown type shows in both, like on craves.in.
 */
export function isChefAudienceNotice(notice: NoticeKind): boolean {
  if (isKitchenNotice(notice)) return true;
  const type = (notice.noticeType ?? '').toUpperCase();
  return !(CUSTOMER_CHEF_TYPES.has(type) || /^(ORDER|PAYMENT|DELIVERY|REFUND)_/.test(type));
}
