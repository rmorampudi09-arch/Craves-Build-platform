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

  it('shows the server text for the 409 sent while a delete request is open', () => {
    const text = 'Your account is set to be deleted. Tap Keep my account to open your kitchen.';
    const refused = new AppApiError('ACCOUNT_DELETION_PENDING', 'm', 409, undefined, false, false, [], undefined, text);
    expect(chefFailureText(refused, 'fallback')).toBe(text);
  });

  it('keeps the screen text when that 409 carries no server text', () => {
    expect(chefFailureText(new AppApiError('ACCOUNT_DELETION_PENDING', 'm', 409), 'fallback')).toBe('fallback');
  });

  it('keeps the screen text for any other failure', () => {
    expect(chefFailureText(new Error('network'), 'fallback')).toBe('fallback');
    expect(chefFailureText(new AppApiError('HTTP_409', 'That information changed.', 409), 'fallback')).toBe('fallback');
  });
});
