import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Camera, GeoJSONSource, Layer, Map as MapLibreMap, Marker, TransformRequestManager} from '@maplibre/maplibre-react-native';
import {colors, radius} from '../../../design/tokens';
import {mapTilesBaseUrl, mapTilesReferer, mapTilesRequestMatch, olaMapStyleUrl} from '../../maps/olaMapTiles';
import {riderOnlineService} from '../native/riderOnlineService';

type Point = {lat: number; lng: number};

const AREA_M = 300;
const M_PER_DEG_LAT = 111_320;

/** The proxy only serves craves.in; the header is registered before the first map mounts (a stable id updates it in place). */
function withReferer(): string {
  const base = mapTilesBaseUrl();
  TransformRequestManager.addHeader({id: 'craves-map-tiles-referer', match: mapTilesRequestMatch(base), name: 'Referer', value: mapTilesReferer(base)});
  return base;
}

/** The customer's area as a 300 m circle, as GeoJSON for the map. */
export function areaCircle({lat, lng}: Point, radiusM = AREA_M): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLng = radiusM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({length: 65}, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return {type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: [ring]}};
}

/** The box around every point the map must show, padded by the area's radius: [west, south, east, north]. */
export function offerBounds(points: Point[], padM = AREA_M): [number, number, number, number] {
  const dLat = padM / M_PER_DEG_LAT;
  const dLng = padM / (M_PER_DEG_LAT * Math.cos((points[0].lat * Math.PI) / 180));
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  return [Math.min(...lngs) - dLng, Math.min(...lats) - dLat, Math.max(...lngs) + dLng, Math.max(...lats) + dLat];
}

/**
 * The offer's map preview (REDESIGN.md, Offer): Ola tiles through the Craves proxy, as the customer app draws them
 * (features/maps/OlaMapPicker), so no map key ships in the app. The kitchen pinned, the rider as a dot from the online
 * service's last fix, the customer's area as a shaded 300 m circle on its centre, never the door. Nothing to tap.
 */
export function OfferMap({kitchen, customerArea, label}: {kitchen?: Point; customerArea?: Point; label: string}) {
  const [failed, setFailed] = useState(false);
  if (!kitchen || failed) {
    // A style or tile that will not load leaves no grey box: the rows under the map carry everything the rider needs.
    return null;
  }
  const base = withReferer();
  const fix = riderOnlineService.lastFix();
  const rider = fix ? {lat: fix.lat, lng: fix.lng} : undefined;
  const bounds = offerBounds([kitchen, ...(customerArea ? [customerArea] : []), ...(rider ? [rider] : [])]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} pointerEvents="none" style={styles.frame} testID="rider-offer-map">
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={olaMapStyleUrl(base)}
        dragPan={false}
        touchZoom={false}
        doubleTapZoom={false}
        doubleTapHoldZoom={false}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        logo={false}
        attribution={false}
        onDidFailLoadingMap={() => setFailed(true)}>
        <Camera initialViewState={{bounds, padding: {top: 24, right: 24, bottom: 24, left: 24}}} maxZoom={17} />
        {customerArea ? (
          <GeoJSONSource id="rider-offer-area" data={areaCircle(customerArea)}>
            <Layer id="rider-offer-area-fill" type="fill" paint={{'fill-color': colors.flameRed, 'fill-opacity': 0.18}} />
            <Layer id="rider-offer-area-line" type="line" paint={{'line-color': colors.flameRed, 'line-width': 1.5}} />
          </GeoJSONSource>
        ) : null}
        <Marker id="rider-offer-kitchen" lngLat={[kitchen.lng, kitchen.lat]} anchor="bottom">
          <View style={styles.pin} testID="rider-offer-map-kitchen" />
        </Marker>
        {rider ? (
          <Marker id="rider-offer-rider" lngLat={[rider.lng, rider.lat]}>
            <View style={styles.dot} testID="rider-offer-map-rider" />
          </Marker>
        ) : null}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {height: 190, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted},
  // The kitchen as a flame-red pin, the rider as an espresso dot: the two things the rider looks for, no labels.
  pin: {width: 18, height: 18, borderRadius: 9, borderBottomRightRadius: 2, transform: [{rotate: '45deg'}], backgroundColor: colors.flameRed, borderWidth: 2, borderColor: colors.white},
  dot: {width: 14, height: 14, borderRadius: 7, backgroundColor: colors.textPrimary, borderWidth: 2, borderColor: colors.white},
});
