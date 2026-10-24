import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {BlurView} from 'expo-blur';
import {colors, radius, spacing} from '../../../design/tokens';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {isDishSheetDismissal} from '../dishDetailNavigation';
import {CustomerDishDetailScreen as CustomerDishDetailLegacyScreen} from './CustomerDishDetailLegacyScreen';

const OPEN_EASING = Easing.bezier(0.2, 0.9, 0.1, 1);

/**
 * The dish popup. The route is a transparent modal, so the page behind stays drawn and still;
 * only the dim fades and the white sheet rises. Every close slides the sheet back down first.
 */
export function CustomerDishDetailScreen() {
  const navigation = useNavigation();
  const reduceMotion = useReducedMotionPreference();
  const {height} = useWindowDimensions();
  // How far the sheet sits below its open place; the dim follows it.
  const offset = useRef(new Animated.Value(height)).current;
  const closingRef = useRef(false);
  const settings = useRef({height, reduceMotion});
  settings.current = {height, reduceMotion};

  useEffect(() => {
    Animated.timing(offset, {
      toValue: 0,
      duration: settings.current.reduceMotion ? 0 : 380,
      easing: OPEN_EASING,
      useNativeDriver: true,
    }).start();
  }, [offset]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (closingRef.current || !isDishSheetDismissal(event.data.action.type)) return;
        event.preventDefault();
        closingRef.current = true;
        Animated.timing(offset, {
          toValue: settings.current.height,
          duration: settings.current.reduceMotion ? 0 : 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => navigation.dispatch(event.data.action));
      }),
    [navigation, offset],
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        offset.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 120 || gesture.vy > 1.2) {
          navigation.goBack();
          return;
        }
        Animated.spring(offset, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          mass: 0.7,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(offset, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          mass: 0.7,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const dimOpacity = offset.interpolate({
    inputRange: [0, height],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.overlay}>
      <Animated.View style={[StyleSheet.absoluteFill, {opacity: dimOpacity}]}>
        {/* shortcut: Android shows the dim without blur (blurring the page behind needs a BlurTargetView around it); add one if the dim looks flat on the phone. */}
        {Platform.OS === 'ios' ? (
          <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        <Pressable
          accessibilityLabel="Close dish details"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backdrop}
        />
      </Animated.View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.sheet, {transform: [{translateY: offset}]}]}>
        <CustomerDishDetailLegacyScreen />
        {/* Drawn last so it sits on the photo and on the slim header. */}
        <View pointerEvents="none" style={styles.handle} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20,14,12,0.40)',
  },
  sheet: {
    width: '100%',
    // 650 of 844 on the design phone.
    height: '77%',
    overflow: 'hidden',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
  },
  handle: {
    position: 'absolute',
    top: spacing.xs,
    left: '50%',
    width: 42,
    height: 4,
    marginLeft: -21,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(38,26,21,0.18)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});
