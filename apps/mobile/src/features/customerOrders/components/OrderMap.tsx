import React, {useRef, useState, type ReactNode} from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import {BlurTargetView, BlurView} from 'expo-blur';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type CameraStop,
} from '@maplibre/maplibre-react-native';
import {colors, iconSize} from '../../../design/tokens';
import {iosType} from '../../../design/iosType';
import {mapTilesBaseUrl, olaMapStyleUrl} from '../../maps/olaMapTiles';
import {useMapTilesReferer, type MapPoint} from '../../maps/OlaMapPicker';

/** Hyderabad, where Craves delivers today: the blurred backdrop when an order has no map pin. */
const FALLBACK_CENTER: MapPoint = {latitude: 17.385, longitude: 78.4867};
const EDGE_PADDING = {top: 72, right: 56, bottom: 56, left: 56};

interface Props {
  /** Where the order is going. */
  home: MapPoint | null;
  /** The delivery partner, once the server reports a position. */
  courier: MapPoint | null;
  /** Before pickup the map is only a backdrop: blurred, washed out and still. */
  blurred: boolean;
  interactive?: boolean;
  /** Extra camera padding at the bottom, for a sheet that overlaps the map. */
  bottomInset?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

const lngLat = (point: MapPoint): [number, number] => [point.longitude, point.latitude];

function cameraFor(
  home: MapPoint | null,
  courier: MapPoint | null,
  blurred: boolean,
  bottomInset: number,
): CameraStop {
  const padding = {...EDGE_PADDING, bottom: EDGE_PADDING.bottom + bottomInset};
  if (home && courier && !blurred) {
    return {
      bounds: [
        Math.min(home.longitude, courier.longitude),
        Math.min(home.latitude, courier.latitude),
        Math.max(home.longitude, courier.longitude),
        Math.max(home.latitude, courier.latitude),
      ],
      padding,
      duration: 600,
    };
  }
  const center = (blurred ? home : courier ?? home) ?? FALLBACK_CENTER;
  return {center: lngLat(center), zoom: blurred ? 14 : 15.5, padding, duration: 600};
}

export function OrderMap({
  home,
  courier,
  blurred,
  interactive = false,
  bottomInset = 0,
  accessibilityLabel,
  style,
  children,
}: Props) {
  const base = mapTilesBaseUrl();
  useMapTilesReferer(base);
  const target = useRef<View>(null);
  const [failed, setFailed] = useState(false);
  const gestures = interactive && !blurred;
  const showCourier = courier && !blurred;
  const route: GeoJSON.Feature | null =
    home && showCourier
      ? {
          type: 'Feature',
          properties: {},
          geometry: {type: 'LineString', coordinates: [lngLat(courier), lngLat(home)]},
        }
      : null;

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.frame, style]}>
      <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
        {failed ? null : (
          <MapLibreMap
            style={StyleSheet.absoluteFill}
            // A TextureView is part of the view tree, so the blur can sample it.
            androidView="texture"
            mapStyle={olaMapStyleUrl(base)}
            dragPan={gestures}
            touchZoom={gestures}
            doubleTapZoom={gestures}
            doubleTapHoldZoom={gestures}
            touchRotate={false}
            touchPitch={false}
            compass={false}
            logo={false}
            attribution={false}
            onDidFailLoadingMap={() => setFailed(true)}>
            <Camera {...cameraFor(home, courier, blurred, bottomInset)} />
            {route ? (
              <GeoJSONSource id="order-route" data={route}>
                <Layer
                  id="order-route-line"
                  type="line"
                  layout={{'line-cap': 'round', 'line-join': 'round'}}
                  paint={{
                    'line-color': colors.espressoBrown,
                    'line-width': 3.5,
                    'line-dasharray': [0.1, 2],
                  }}
                />
              </GeoJSONSource>
            ) : null}
            {home ? (
              <Marker id="order-home" lngLat={lngLat(home)} anchor="center">
                <View style={styles.homePin}>
                  <MaterialDesignIcons name="home-variant" size={iconSize.sm} color={colors.white} />
                </View>
              </Marker>
            ) : null}
            {showCourier ? (
              <Marker id="order-courier" lngLat={lngLat(courier)} anchor="center">
                <View style={styles.courierPin}>
                  <MaterialDesignIcons name="moped" size={iconSize.sm} color={colors.white} />
                </View>
              </Marker>
            ) : null}
          </MapLibreMap>
        )}
      </BlurTargetView>
      {blurred ? (
        <>
          <BlurView
            pointerEvents="none"
            blurTarget={target}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={28}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.veil} />
        </>
      ) : (
        <Text style={[iosType.caption2, styles.attribution]}>
          © Ola Maps · © OpenStreetMap contributors
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: '#ECEAE7',
  },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  homePin: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.espressoBrown,
  },
  courierPin: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.flameRedAccessible,
  },
  attribution: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    color: colors.textSecondary,
    fontSize: 9,
    lineHeight: 11,
  },
});
