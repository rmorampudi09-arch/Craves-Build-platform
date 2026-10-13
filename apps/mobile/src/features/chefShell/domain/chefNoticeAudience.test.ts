import {isChefAudienceNotice} from './chefNoticeAudience';

const notice = (noticeType: string | null, targetType: string | null = null) => ({noticeType, targetType});

describe('isChefAudienceNotice', () => {
  it('drops the notices a customer gets about their own orders', () => {
    // "Order created ... Complete payment to continue"
    expect(isChefAudienceNotice(notice('ORDER_CREATED', 'ORDER'))).toBe(false);
    expect(isChefAudienceNotice(notice('PAYMENT_SUCCEEDED', 'ORDER'))).toBe(false);
    expect(isChefAudienceNotice(notice('DELIVERY_OUT_FOR_DELIVERY', 'ORDER'))).toBe(false);
    expect(isChefAudienceNotice(notice('REFUND_PROCESSED', 'ORDER'))).toBe(false);
  });

  it('drops "the chef accepted/declined your order", which is a customer notice despite the CHEF_ prefix', () => {
    expect(isChefAudienceNotice(notice('CHEF_ACCEPTED_ORDER', 'ORDER'))).toBe(false);
    expect(isChefAudienceNotice(notice('chef_rejected_order', 'ORDER'))).toBe(false);
  });

  it('keeps kitchen notices such as a new order to answer', () => {
    expect(isChefAudienceNotice(notice('CHEF_ORDER_AWAITING_ACCEPTANCE', 'ORDER'))).toBe(true);
    expect(isChefAudienceNotice(notice('CHEF_PAYOUT_REVERSED', 'CHEF_PAYOUT'))).toBe(true);
    expect(isChefAudienceNotice(notice('ORDER_AWAITING', 'CHEF_ORDER'))).toBe(true);
  });

  it('keeps notices of an unknown type, as craves.in does', () => {
    expect(isChefAudienceNotice(notice('ACCOUNT'))).toBe(true);
    expect(isChefAudienceNotice(notice(null))).toBe(true);
  });
});
