import {NEARBY_CHEF_DISCOVERY_MAX_RETAINED_PAGES} from '../features/chefDiscovery/query/nearbyChefDiscoveryQueries';
import {HOME_FEED_MAX_RETAINED_PAGES} from '../features/home/query/homeFeedQueries';
import {CUSTOMER_NOTIFICATION_LIMIT} from '../features/notifications/query/customerNotificationQueries';

describe('P116 performance retention boundaries', () => {
  it('keeps infinite discovery caches explicitly bounded', () => {
    expect(HOME_FEED_MAX_RETAINED_PAGES).toBe(10);
    expect(NEARBY_CHEF_DISCOVERY_MAX_RETAINED_PAGES).toBe(10);
  });

  it('keeps notification history bounded at the query boundary', () => {
    expect(CUSTOMER_NOTIFICATION_LIMIT).toBe(100);
  });
});
