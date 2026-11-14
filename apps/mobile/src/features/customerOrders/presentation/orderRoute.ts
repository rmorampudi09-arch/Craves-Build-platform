import type {MapPoint} from '../../maps/OlaMapPicker';

/** Google encoded polyline, precision 5. A malformed or cut-off string gives []. */
export function decodePolyline(encoded: string): MapPoint[] {
  const points: MapPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) {
        return null;
      }
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) {
        return null;
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLng = dLat === null ? null : next();
    if (dLat === null || dLng === null) {
      return [];
    }
    lat += dLat;
    lng += dLng;
    points.push({latitude: lat / 1e5, longitude: lng / 1e5});
  }
  return points;
}

function metersBetween(a: MapPoint, b: MapPoint): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * The part of the road path still ahead of the courier: the courier, then the path after its
 * nearest vertex. Null when there is no usable path or the courier is off it.
 */
export function remainingRoute(
  path: MapPoint[],
  courier: MapPoint,
  maxOffRouteMeters = 300,
): MapPoint[] | null {
  if (path.length < 2) {
    return null;
  }
  let nearest = 0;
  let nearestMeters = Infinity;
  path.forEach((point, i) => {
    const meters = metersBetween(point, courier);
    if (meters < nearestMeters) {
      nearest = i;
      nearestMeters = meters;
    }
  });
  if (nearestMeters > maxOffRouteMeters) {
    return null;
  }
  const rest = path.slice(nearest + 1);
  return [courier, ...(rest.length ? rest : [path[path.length - 1]])];
}
