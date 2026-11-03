import React from 'react';
import {NativeModules, requireNativeComponent, StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {colors, radius} from '../../../design/tokens';

type Point = {lat: number; lng: number};

/** The rider flavor's own view (android/app/src/rider, RiderOfferMap.kt): Google Maps in lite mode. */
const NativeOfferMap = requireNativeComponent<{kitchen: Point; customerArea?: Point; style: StyleProp<ViewStyle>}>('CravesRiderOfferMap');

let saidNoKey = false;

/** The map needs a Maps key in the build (RIDER_MAPS_API_KEY, docs/riders/RELEASE.md); without one the offer stays text only, said once. */
export function offerMapAvailable(): boolean {
  const present = (NativeModules.CravesRiderDevice as {mapsKeyPresent?: boolean} | undefined)?.mapsKeyPresent === true;
  if (!present && !saidNoKey) {
    saidNoKey = true;
    console.warn('Offer map off: this build has no Google Maps key (RIDER_MAPS_API_KEY), so offers show text rows only.');
  }
  return present;
}

/**
 * The offer's map preview (REDESIGN.md, Offer): the kitchen pinned, the rider as a dot, the customer's area as a shaded
 * 300 m circle on its centre, never the door. Nothing to tap: the rows under it carry the numbers.
 */
export function OfferMap({kitchen, customerArea, label}: {kitchen?: Point; customerArea?: Point; label: string}) {
  if (!kitchen || !offerMapAvailable()) {
    return null;
  }
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} pointerEvents="none" style={styles.frame} testID="rider-offer-map">
      <NativeOfferMap kitchen={kitchen} customerArea={customerArea} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {height: 190, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted},
});
