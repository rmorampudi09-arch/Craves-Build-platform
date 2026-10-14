import React, {useEffect, useRef} from 'react';
import {Animated, Easing, KeyboardAvoidingView, Modal, Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {colors} from '../../design/tokens';
import {useReducedMotionPreference} from '../../design/reducedMotion';

export interface SheetModalProps {
  visible: boolean;
  /** Android back. */
  onRequestClose: () => void;
  /** Tapping the dim area; defaults to onRequestClose. */
  onScrimPress?: () => void;
  scrimOpacity?: number;
  scrimLabel?: string;
  /** The card that rises from the bottom. */
  children: React.ReactNode;
}

/**
 * A popup over a page that stays still: the dim fades in on its own layer and only the card slides up.
 * (A Modal with animationType="slide" slides the dim too, which flashes dark.) The card rides above the keyboard.
 * Closing is instant, so a dialog that opens next never overlaps a sheet that is still leaving.
 */
export function SheetModal({visible, onRequestClose, onScrimPress, scrimOpacity = 0.42, scrimLabel = 'Close', children}: SheetModalProps) {
  const reduceMotion = useReducedMotionPreference();
  const {height} = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || reduceMotion) {
      progress.setValue(visible ? 1 : 0);
      return undefined;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, visible]);

  return (
    <Modal animationType="none" onRequestClose={onRequestClose} statusBarTranslucent transparent visible={visible}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {backgroundColor: colors.espresso, opacity: progress.interpolate({inputRange: [0, 1], outputRange: [0, scrimOpacity]})},
        ]}>
        <Pressable accessibilityLabel={scrimLabel} accessibilityRole="button" onPress={onScrimPress ?? onRequestClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={styles.dock}>
        <Animated.View style={{transform: [{translateY: progress.interpolate({inputRange: [0, 1], outputRange: [height, 0]})}]}}>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dock: {flex: 1, justifyContent: 'flex-end'},
});
