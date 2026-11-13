import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, PanResponder, Pressable, Text, View, type LayoutChangeEvent} from 'react-native';
import {Icon, LoadingIndicator} from '../../../shared/components';
import {colors, font, iconSize, radius, spacing, themedStyles, typography} from '../theme';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {useStrings} from '../strings/StringsProvider';

const KNOB = 56;
const INSET = 6;
const ARMED_MS = 3000;

/**
 * The trip's pinned step (I've reached the kitchen, Picked up, I'm at the door): slide the knob across, or tap once and
 * tap again within 3 s, so a bump in a pocket or on a pothole never sends a step. TalkBack's double tap confirms at
 * once (a slide is never the only way: WCAG 2.5.7). Like BottomAction it ignores input while its step is sending.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  disabled,
  testID,
}: {
  label: string;
  onConfirm: () => Promise<unknown> | void;
  disabled?: boolean;
  testID?: string;
}) {
  const {strings} = useStrings();
  const reduceMotion = useReducedMotionPreference();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const travel = useRef(0);
  const blocked = Boolean(disabled) || busy;

  // The pan responder lives for the component's life; it reads the latest render through this ref.
  const live = useRef({blocked, confirm: () => {}, settle: () => {}, tap: () => {}});
  live.current.blocked = blocked;
  live.current.tap = () => (armed ? live.current.confirm() : setArmed(true));
  live.current.settle = () => {
    if (reduceMotion) {
      x.setValue(0);
    } else {
      Animated.timing(x, {toValue: 0, duration: 180, useNativeDriver: true}).start();
    }
  };
  live.current.confirm = () => {
    if (live.current.blocked) {
      return;
    }
    setArmed(false);
    const result = onConfirm();
    if (result instanceof Promise) {
      setBusy(true);
      result.finally(() => {
        setBusy(false);
        live.current.settle();
      });
    } else {
      live.current.settle();
    }
  };

  // The knob owns the drag: a touch that starts on it is its own from the first moment (the responder system never asks
  // the track's Pressable to hand a touch over), and a touch anywhere else on the track is the Pressable's tap.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.blocked,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(0, Math.min(travel.current, g.dx))),
      onPanResponderRelease: (_e, g) => {
        if (travel.current > 0 && g.dx >= travel.current * 0.85) {
          x.setValue(travel.current);
          live.current.confirm();
        } else {
          live.current.settle();
          if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
            live.current.tap(); // a tap on the knob counts like a tap on the track
          }
        }
      },
      onPanResponderTerminate: () => live.current.settle(),
    }),
  ).current;

  // A first tap arms it for 3 s; the label says to tap again.
  useEffect(() => {
    if (!armed) {
      return undefined;
    }
    AccessibilityInfo.announceForAccessibility(strings.common.tapAgain);
    const timer = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(timer);
  }, [armed, strings.common.tapAgain]);

  const onLayout = (event: LayoutChangeEvent) => {
    travel.current = Math.max(0, event.nativeEvent.layout.width - KNOB - INSET * 2);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={strings.common.slideHint}
      accessibilityState={{disabled: blocked, busy}}
      accessibilityActions={[{name: 'activate'}]}
      onAccessibilityAction={event => event.nativeEvent.actionName === 'activate' && live.current.confirm()}
      disabled={blocked}
      onPress={() => live.current.tap()}
      onLayout={onLayout}
      style={[styles.track, blocked && !busy && styles.trackOff]}
      testID={testID}>
      <View style={styles.labelBox} pointerEvents="none">
        <Text style={[styles.label, blocked && !busy && styles.labelOff]} numberOfLines={2}>
          {armed ? strings.common.tapAgain : label}
        </Text>
      </View>
      <Animated.View
        {...pan.panHandlers}
        hitSlop={8}
        style={[styles.knob, {transform: [{translateX: armed && !reduceMotion ? Animated.add(x, 20) : x}]}]}
        testID={testID ? `${testID}-knob` : undefined}>
        {busy ? (
          <LoadingIndicator accessible={false} color={colors.onWhite} size="small" />
        ) : (
          <Icon name="chevron-right" size={iconSize.xl} color={blocked ? colors.placeholder : colors.onWhite} surface={false} />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = themedStyles(c => ({
  track: {minHeight: KNOB + INSET * 2, borderRadius: radius.pill, backgroundColor: c.flameRed, justifyContent: 'center', overflow: 'hidden'},
  trackOff: {backgroundColor: c.muted},
  // The label keeps clear of the knob on the left and leaves room on the right; it wraps rather than shrinking.
  labelBox: {paddingLeft: KNOB + INSET * 2 + spacing.xs, paddingRight: spacing.xl, paddingVertical: spacing.xs},
  label: {fontFamily: font.bold, fontSize: typography.button, color: c.white, textAlign: 'center'},
  labelOff: {color: c.textSecondary},
  // The knob is always white with a dark chevron, Day or Night, like the white label on the red.
  knob: {
    position: 'absolute',
    top: INSET,
    left: INSET,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.white,
  },
}));
