import React, {useRef} from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {colors, radius, spacing} from '../../../design/tokens';
import {CustomerDishDetailScreen as CustomerDishDetailLegacyScreen} from './CustomerDishDetailLegacyScreen';

export function CustomerDishDetailScreen() {
  const navigation = useNavigation();
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        translateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 120 || gesture.vy > 1.2) {
          navigation.goBack();
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          mass: 0.7,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          mass: 0.7,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => navigation.goBack()}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close dish details"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backdrop}
        />
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.sheet, {transform: [{translateY}]}]}>
          <CustomerDishDetailLegacyScreen />
          {/* Drawn last so it sits on the photo and on the slim header. */}
          <View pointerEvents="none" style={styles.handle} />
        </Animated.View>
      </View>
    </Modal>
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
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  sheet: {
    width: '100%',
    height: '88%',
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
