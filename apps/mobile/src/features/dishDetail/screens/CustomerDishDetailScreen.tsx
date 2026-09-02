import React from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
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
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <CustomerDishDetailLegacyScreen />
        </View>
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
