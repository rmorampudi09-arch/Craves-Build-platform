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
import {CustomerDishDetailLegacyScreen} from './CustomerDishDetailLegacyScreen';

/**
 * The detail implementation keeps its existing data/cart/favorite contracts,
 * while this route changes the presentation from a full navigation page to a
 * dismissible bottom sheet. The transparent modal leaves the previous list
 * mounted underneath, so its scroll position is preserved.
 */
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
          <View style={styles.handle} />
          <CustomerDishDetailLegacyScreen />
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  sheet: {
    width: '100%',
    height: '88%',
    overflow: 'hidden',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    paddingTop: spacing.xs,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginBottom: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
});
