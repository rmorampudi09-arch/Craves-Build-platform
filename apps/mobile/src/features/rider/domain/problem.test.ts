// What a failed call means to a rider, and the words for it in each language (DESIGN.md "States").
import {AppApiError} from '../../../core/http/apiError';
import {en} from '../strings/en';
import {te} from '../strings/te';
import {problemOf, riderMessage} from './problem';

const api = (code: string, status?: number, message = 'The server says so.') => new AppApiError(code, message, status);

describe('problemOf', () => {
  it.each([
    ['offline', api('NETWORK_ERROR')],
    ['offline', api('REQUEST_TIMEOUT')],
    ['unavailable', api('HTTP_503', 503)],
    ['unavailable', api('STORAGE_UNAVAILABLE', 503)],
    ['unavailable', api('HTTP_429', 429)],
    ['notYet', api('TERMS_UNAVAILABLE', 503)],
    ['notYet', api('RIDER_CHOICES_OFF', 409)],
    ['notYet', api('HTTP_404', 404)],
    ['notAllowed', api('HTTP_403', 403)],
    ['notAllowed', api('FORBIDDEN', 403)],
    ['refused', api('RIDER_NOT_ACTIVE', 403)],
    ['refused', api('NOT_FOUND', 404)],
    ['refused', api('OFFER_TAKEN', 409)],
    ['unknown', new Error('Cannot read properties of undefined')],
    ['unknown', new AppApiError('REQUEST_CANCELLED', 'Request cancelled.', undefined, undefined, false, true)],
  ])('%s: %s', (problem, error) => {
    expect(problemOf(error)).toBe(problem);
  });
});

describe('riderMessage', () => {
  it('reads a refusal in the server’s own words in English', () => {
    expect(riderMessage(api('AMOUNT_OVER_BALANCE', 409, 'You can withdraw up to ₹820 now.'), en, 'en')).toBe('You can withdraw up to ₹820 now.');
  });

  it('uses the app’s words for a known code in another language, and the server’s for the rest', () => {
    expect(riderMessage(api('OFFER_TAKEN', 409), te, 'te')).toBe(te.errors.OFFER_TAKEN);
    expect(riderMessage(api('SOMETHING_NEW', 409, 'New words.'), te, 'te')).toBe('New words.');
  });

  it('never shows the API client’s stand-in for a 403: the app’s words by code', () => {
    const notActive = api('RIDER_NOT_ACTIVE', 403, 'This action is not available for your account.');
    expect(riderMessage(notActive, en, 'en')).toBe(en.errors.RIDER_NOT_ACTIVE);
  });

  it('says what kind of failure it was, with no developer text', () => {
    expect(riderMessage(api('NETWORK_ERROR'), te, 'te')).toBe(te.states.offlineAction);
    expect(riderMessage(api('HTTP_500', 500), en, 'en')).toBe(en.states.unavailableAction);
    expect(riderMessage(api('HTTP_403', 403), en, 'en')).toBe(en.states.notAllowedAction);
    expect(riderMessage(api('RIDER_CHOICES_OFF', 409), en, 'en')).toBe(en.errors.RIDER_CHOICES_OFF);
    expect(riderMessage(new Error('undefined is not a function'), en, 'en')).toBe(en.common.error);
  });
});
