import React from 'react';
import Svg, {Path, Circle, Polyline, Rect} from 'react-native-svg';
import {colors, iconSize} from '../../design/tokens';

export type IconName =
  | 'account'
  | 'chef'
  | 'home'
  | 'orders'
  | 'phone'
  | 'mail'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'chevron-right'
  | 'chevron'
  | 'shield'
  | 'arrow-left'
  | 'check';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({
  name,
  size = iconSize.md,
  color = colors.espressoBrown,
}: Props) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden>
      {name === 'account' && (
        <>
          <Circle cx="12" cy="8" r="4" {...common} />
          <Path d="M4.5 21c.8-4.1 3.3-6.2 7.5-6.2s6.7 2.1 7.5 6.2" {...common} />
        </>
      )}
      {name === 'chef' && (
        <>
          <Path d="M6 9.5V20h12V9.5" {...common} />
          <Path d="M7 10a4 4 0 0 1 1.2-7.8A4.8 4.8 0 0 1 12 4a4.8 4.8 0 0 1 3.8-1.8A4 4 0 0 1 17 10" {...common} />
          <Path d="M9 14h6M9 17h6" {...common} />
        </>
      )}
      {name === 'home' && (
        <>
          <Path d="M3 11.5 12 4l9 7.5" {...common} />
          <Path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" {...common} />
        </>
      )}
      {name === 'orders' && (
        <>
          <Rect x="5" y="3" width="14" height="18" rx="2" {...common} />
          <Path d="M8.5 8h7M8.5 12h7M8.5 16h4" {...common} />
        </>
      )}
      {name === 'phone' && (
        <Path d="M7.2 3.5 4.8 5.9c-.8.8-.4 3.1.9 5.5 1.8 3.4 4.5 6.1 7.9 7.9 2.4 1.3 4.7 1.7 5.5.9l2.4-2.4-4-3-2 2c-.6.6-2.6-.4-4.4-2.2s-2.8-3.8-2.2-4.4l2-2-3-4Z" {...common} />
      )}
      {name === 'mail' && (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="2" {...common} />
          <Polyline points="4,7 12,13 20,7" {...common} />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect x="5" y="10" width="14" height="11" rx="2" {...common} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" {...common} />
        </>
      )}
      {name === 'eye' && (
        <>
          <Path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" {...common} />
          <Circle cx="12" cy="12" r="2.5" {...common} />
        </>
      )}
      {name === 'eye-off' && (
        <>
          <Path d="M3 3l18 18" {...common} />
          <Path d="M10.5 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.4 3.1M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1 0 2-.2 2.8-.5" {...common} />
        </>
      )}
      {(name === 'chevron-right' || name === 'chevron') && (
        <Polyline points="9,5 16,12 9,19" {...common} />
      )}
      {name === 'shield' && (
        <>
          <Path d="M12 3 5.5 5.5v5.2c0 4.5 2.5 8.2 6.5 10.3 4-2.1 6.5-5.8 6.5-10.3V5.5L12 3Z" {...common} />
          <Path d="m9.5 12 1.7 1.7 3.5-4" {...common} />
        </>
      )}
      {name === 'arrow-left' && (
        <>
          <Path d="M20 12H5" {...common} />
          <Polyline points="11,6 5,12 11,18" {...common} />
        </>
      )}
      {name === 'check' && <Polyline points="5,12 10,17 19,7" {...common} />}
    </Svg>
  );
}
