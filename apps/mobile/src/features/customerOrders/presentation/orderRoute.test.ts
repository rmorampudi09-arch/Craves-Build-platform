import {decodePolyline, remainingRoute} from './orderRoute';

// ~200 m apart going north (0.0018 deg latitude is about 200 m).
const path = [0, 1, 2, 3].map(i => ({latitude: 17.4 + i * 0.0018, longitude: 78.4}));

describe('decodePolyline', () => {
  it('decodes the Google reference polyline', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    const expected = [
      {latitude: 38.5, longitude: -120.2},
      {latitude: 40.7, longitude: -120.95},
      {latitude: 43.252, longitude: -126.453},
    ];
    expect(points).toHaveLength(3);
    points.forEach((p, i) => {
      expect(p.latitude).toBeCloseTo(expected[i].latitude, 5);
      expect(p.longitude).toBeCloseTo(expected[i].longitude, 5);
    });
  });

  it('returns [] for an empty or cut-off string', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline('_p~iF~ps|U_')).toEqual([]);
  });
});

describe('remainingRoute', () => {
  it('joins the courier to the path after its nearest vertex', () => {
    const courier = {latitude: path[1].latitude + 0.00018, longitude: 78.4};
    expect(remainingRoute(path, courier)).toEqual([courier, path[2], path[3]]);
  });

  it('ends at the last point when the courier is there', () => {
    const courier = {...path[3]};
    expect(remainingRoute(path, courier)).toEqual([courier, path[3]]);
  });

  it('is null when the courier is off the route', () => {
    expect(remainingRoute(path, {latitude: path[1].latitude, longitude: 78.4 + 0.0038})).toBeNull();
  });

  it('is null for a path under 2 points', () => {
    expect(remainingRoute([path[0]], path[0])).toBeNull();
  });
});
