import {AppApiError} from '../../../core/http/apiError';
import {SELLING_NOT_READY, chefFailureText} from './sellingNotReady';

describe('chefFailureText', () => {
  it('explains the 409 the server sends until Craves has approved the chef', () => {
    const refused = new AppApiError(
      'CHEF_SELLING_NOT_READY',
      'Complete the required finance review before accepting new orders',
      409,
    );
    expect(chefFailureText(refused, 'fallback')).toBe(SELLING_NOT_READY);
  });

  it('keeps the screen text for any other failure', () => {
    expect(chefFailureText(new Error('network'), 'fallback')).toBe('fallback');
    expect(chefFailureText(new AppApiError('HTTP_409', 'That information changed.', 409), 'fallback')).toBe('fallback');
  });
});
