import {nearerKm, roundToSpot} from './homeSpot';

describe('the home spot', () => {
  it('keeps two decimal places of each coordinate, so the exact position never leaves the phone', () => {
    expect(roundToSpot({lat: 17.45678, lng: 78.39123})).toEqual({lat: 17.46, lng: 78.39});
    expect(roundToSpot({lat: 17.4549, lng: 78.3951})).toEqual({lat: 17.45, lng: 78.4});
  });

  it('says how much nearer home an order leaves the rider, in kilometres with one decimal', () => {
    expect(nearerKm(3240)).toBe('3.2');
    expect(nearerKm(560)).toBe('0.6');
    expect(nearerKm(5000)).toBe('5.0');
  });
});
