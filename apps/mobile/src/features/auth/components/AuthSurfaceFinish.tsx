import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors } from '../../../design/tokens';
import { loginColors } from './loginVisuals';

interface Props {
  action?: boolean;
  selected?: boolean;
  radius?: number;
}

/** Smooth highlights stay below text; no opaque shine strip over the control. */
export function AuthSurfaceFinish({ action, selected, radius = 16 }: Props) {
  const id = useId();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.clip,
        { borderRadius: radius },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${id}-base`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop
              offset="0"
              stopColor={action ? '#FF5C45' : selected ? '#FFF3F1' : '#FFFFFF'}
            />
            <Stop
              offset="0.28"
              stopColor={
                action ? loginColors.red : selected ? '#FFECE9' : '#F9FAFB'
              }
            />
            <Stop
              offset="0.55"
              stopColor={
                action ? loginColors.textRed : selected ? '#FFE5E1' : '#F3F4F6'
              }
            />
            <Stop
              offset="0.85"
              stopColor={
                action ? loginColors.red : selected ? '#FFDDD8' : '#F7F8FA'
              }
            />
            <Stop
              offset="1"
              stopColor={action ? '#FF5944' : selected ? '#FFDCD6' : '#FAFBFC'}
            />
          </LinearGradient>
          <RadialGradient
            id={`${id}-light`}
            cx="10%"
            cy="4%"
            rx="70%"
            ry="100%"
          >
            <Stop
              offset="0"
              stopColor={colors.white}
              stopOpacity={action ? 0.74 : 0.9}
            />
            <Stop
              offset="0.3"
              stopColor={colors.white}
              stopOpacity={action ? 0.18 : 0.3}
            />
            <Stop offset="1" stopColor={colors.white} stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id={`${id}-edge`} x1="0%" y1="0%" x2="80%" y2="100%">
            <Stop offset="0" stopColor={colors.white} stopOpacity="0.9" />
            <Stop offset="0.45" stopColor={colors.white} stopOpacity="0.15" />
            <Stop offset="1" stopColor={colors.white} stopOpacity="0.7" />
          </LinearGradient>
        </Defs>
        <Rect
          width="100%"
          height="100%"
          rx={radius}
          fill={`url(#${id}-base)`}
        />
        <Rect
          width="100%"
          height="100%"
          rx={radius}
          fill={`url(#${id}-light)`}
        />
        <Rect
          x="1%"
          y="3%"
          width="98%"
          height="94%"
          rx={Math.max(0, radius - 2)}
          fill="none"
          stroke={`url(#${id}-edge)`}
          strokeWidth={action ? 1.3 : 1}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
