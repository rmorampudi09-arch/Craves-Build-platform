import React from 'react';
import Svg, {Path, Circle, Polyline, Rect} from 'react-native-svg';
import {colors, iconSize} from '../../design/tokens';

export type IconName =
  | 'account'
  | 'chef'
  | 'home'
  | 'orders'
  | 'analytics'
  | 'cart'
  | 'search'
  | 'wifi-off'
  | 'star'
  | 'ticket'
  | 'phone'
  | 'mail'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'chevron-right'
  | 'chevron'
  | 'shield'
  | 'arrow-left'
  | 'check'
  | 'location'
  | 'bell'
  | 'heart'
  | 'clock'
  | 'trash'
  | 'delivery';

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
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === 'account' && (<><Circle cx="12" cy="8" r="4" {...common} /><Path d="M4.5 21c.8-4.1 3.3-6.2 7.5-6.2s6.7 2.1 7.5 6.2" {...common} /></>)}
      {name === 'chef' && (<><Path d="M7 10.5v8.7c0 .5.4.8.9.8h8.2c.5 0 .9-.3.9-.8v-8.7" {...common} /><Path d="M7.4 10.6a3.8 3.8 0 0 1 .9-7.4A4.3 4.3 0 0 1 12 5a4.3 4.3 0 0 1 3.7-1.8 3.8 3.8 0 0 1 .9 7.4" {...common} /><Path d="M9.4 16.5h5.2" {...common} /></>)}
      {name === 'home' && (<><Path d="M3 11.5 12 4l9 7.5" {...common} /><Path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" {...common} /></>)}
      {name === 'orders' && (<><Rect x="5" y="3" width="14" height="18" rx="2" {...common} /><Path d="M8.5 8h7M8.5 12h7M8.5 16h4" {...common} /></>)}
      {name === 'analytics' && (<><Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...common} /><Path d="M4 10h3M10 4h3M16 13h3" {...common} /></>)}
      {name === 'cart' && (<><Path d="M3.5 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H7" {...common} /><Circle cx="10" cy="20" r="1" {...common} /><Circle cx="18" cy="20" r="1" {...common} /></>)}
      {name === 'search' && (<><Circle cx="10.5" cy="10.5" r="6.5" {...common} /><Path d="m15.5 15.5 5 5" {...common} /></>)}
      {name === 'wifi-off' && (<><Path d="M2.5 8.8A15.2 15.2 0 0 1 7 6.3M10.5 5.1a15.2 15.2 0 0 1 11 3.7" {...common} /><Path d="M5.5 12.2A10.3 10.3 0 0 1 9 10.4M12.5 9.9a10.3 10.3 0 0 1 6 2.3" {...common} /><Path d="M9 15.5a5.2 5.2 0 0 1 6 0M12 19h.01M3 3l18 18" {...common} /></>)}
      {name === 'star' && <Path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" {...common} />}
      {name === 'ticket' && (<><Path d="M4 6.5h16v4a2.5 2.5 0 0 0 0 5v2H4v-2a2.5 2.5 0 0 0 0-5v-4Z" {...common} /><Path d="M12 8v2M12 14v2" {...common} /></>)}
      {name === 'phone' && <Path d="M7.2 3.5 4.8 5.9c-.8.8-.4 3.1.9 5.5 1.8 3.4 4.5 6.1 7.9 7.9 2.4 1.3 4.7 1.7 5.5.9l2.4-2.4-4-3-2 2c-.6.6-2.6-.4-4.4-2.2s-2.8-3.8-2.2-4.4l2-2-3-4Z" {...common} />}
      {name === 'mail' && (<><Rect x="3" y="5" width="18" height="14" rx="2" {...common} /><Polyline points="4,7 12,13 20,7" {...common} /></>)}
      {name === 'lock' && (<><Rect x="5" y="10" width="14" height="11" rx="2" {...common} /><Path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" {...common} /></>)}
      {name === 'eye' && (<><Path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" {...common} /><Circle cx="12" cy="12" r="2.5" {...common} /></>)}
      {name === 'eye-off' && (<><Path d="M3 3l18 18" {...common} /><Path d="M10.5 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.4 3.1M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1 0 2-.2 2.8-.5" {...common} /></>)}
      {(name === 'chevron-right' || name === 'chevron') && <Polyline points="9,5 16,12 9,19" {...common} />}
      {name === 'shield' && (<><Path d="M12 3 5.5 5.5v5.2c0 4.5 2.5 8.2 6.5 10.3 4-2.1 6.5-5.8 6.5-10.3V5.5L12 3Z" {...common} /><Path d="m9.5 12 1.7 1.7 3.5-4" {...common} /></>)}
      {name === 'arrow-left' && (<><Path d="M20 12H5" {...common} /><Polyline points="11,6 5,12 11,18" {...common} /></>)}
      {name === 'check' && <Polyline points="5,12 10,17 19,7" {...common} />}
      {name === 'location' && (<><Path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" {...common} /><Circle cx="12" cy="10" r="2.2" {...common} /></>)}
      {name === 'bell' && (<><Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" {...common} /><Path d="M10 21h4" {...common} /></>)}
      {name === 'heart' && <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" {...common} />}
      {name === 'clock' && (<><Circle cx="12" cy="12" r="8.5" {...common} /><Path d="M12 7v5l3.5 2" {...common} /></>)}
      {name === 'trash' && (<><Path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" {...common} /></>)}
      {name === 'delivery' && (<><Circle cx="7" cy="18" r="2" {...common} /><Circle cx="18" cy="18" r="2" {...common} /><Path d="M5 18H3l2-6h7l2.5 3H18a2 2 0 0 1 2 2v1M8 12l2-4h4M13 8h3" {...common} /></>)}
    </Svg>
  );
}
