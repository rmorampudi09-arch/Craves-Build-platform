import React from 'react';
import Svg, {Circle, ClipPath, Defs, Ellipse, G, Path, Polygon, Polyline, Rect} from 'react-native-svg';
import {colors} from '../../design/tokens';

/** The drawings for empty, offline and error screens, from the approved empty-states canvas. */
export type EmptyIllustrationName =
  | 'cart'
  | 'orders'
  | 'comingSoonArea'
  | 'deliveryBike'
  | 'location'
  | 'search'
  | 'kitchenNoDishes'
  | 'saved'
  | 'addresses'
  | 'mealPlans'
  | 'notifications'
  | 'offline'
  | 'loadError'
  | 'newOrders'
  | 'menu'
  | 'earnings'
  | 'payouts'
  | 'reviews'
  | 'chefMealPlans'
  | 'support'
  | 'comingSoon'
  | 'session';

const INK = colors.espresso;
const RED = colors.flameRed;
const SOFT_RED = colors.flameRedSoft;
const TINT = colors.iconSurface;
const CREAM = colors.cream;
const CREAM_DEEP = colors.creamDeep;
const LINE = colors.border;
const LINE_STRONG = colors.borderStrong;
const GROUND = '#F3E6DC';
const WHITE = colors.white;

const SPARKLE = 'M0 -8 L1.8 -1.8 L8 0 L1.8 1.8 L0 8 L-1.8 1.8 L-8 0 L-1.8 -1.8 Z';
const SMALL_SPARKLE = 'M0 -6 L1.4 -1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4 -1.4 Z';
const HEART = 'M0 6 C-8 0 -9 -6 -4.5 -7.5 C-2 -8.3 0 -6 0 -4.5 C0 -6 2 -8.3 4.5 -7.5 C9 -6 8 0 0 6 Z';
const STAR = 'M0 -14 L3.53 -4.85 L13.31 -4.33 L5.71 1.85 L8.23 11.33 L0 6 L-8.23 11.33 L-5.71 1.85 L-13.31 -4.33 L-3.53 -4.85 Z';
const RUPEE = 'M96 52 H112 M96 59 H112 M100 52 C109 52 109 66 100 66 H97 L108 74';

const line = {fill: 'none', stroke: INK, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round'} as const;

/** Cream disc, ground shadow and the little red sparkles every drawing shares. */
function Backdrop({cy = 96, ground = {cx: 120, rx: 70}, sparkles = []}: {
  cy?: number;
  ground?: {cx: number; rx: number};
  sparkles?: {x: number; y: number; kind: 'big' | 'small' | 'ring' | 'dot'}[];
}) {
  return (
    <>
      <Circle cx={120} cy={cy} r={80} fill={CREAM} />
      <Ellipse cx={ground.cx} cy={172} rx={ground.rx} ry={7} fill={GROUND} />
      {sparkles.map(({x, y, kind}) =>
        kind === 'big' ? (
          <Path key={`${x}-${y}`} d={SPARKLE} fill={RED} transform={`translate(${x} ${y})`} />
        ) : kind === 'small' ? (
          <Path key={`${x}-${y}`} d={SMALL_SPARKLE} fill={SOFT_RED} transform={`translate(${x} ${y})`} />
        ) : kind === 'ring' ? (
          <Circle key={`${x}-${y}`} cx={x} cy={y} r={4} fill="none" stroke={RED} strokeWidth={2} />
        ) : (
          <Circle key={`${x}-${y}`} cx={x} cy={y} r={3.5} fill={SOFT_RED} opacity={0.55} />
        ),
      )}
    </>
  );
}

function Pin({x, tipY, r = 20, children}: {x: number; tipY: number; r?: number; children?: React.ReactNode}) {
  const top = tipY - r * 1.6;
  return (
    <>
      <Path
        d={`M${x} ${tipY} C${x} ${tipY} ${x - r} ${tipY - r * 0.9} ${x - r} ${top} a${r} ${r} 0 0 1 ${r * 2} 0 C${x + r} ${tipY - r * 0.9} ${x} ${tipY} ${x} ${tipY} Z`}
        {...line}
        fill={RED}
      />
      {children}
    </>
  );
}

function Calendar({x, w, h}: {x: number; w: number; h: number}) {
  const right = x + w;
  return (
    <G {...line}>
      <Rect x={x} y={54} width={w} height={h} rx={14} fill={WHITE} />
      <Path d={`M${x} 68 a14 14 0 0 1 14 -14 H${right - 14} a14 14 0 0 1 14 14 V78 H${x} Z`} fill={RED} />
      <Path d={`M${x + 26} 46 V62 M${right - 26} 46 V62`} strokeWidth={4} />
    </G>
  );
}

const DRAWINGS: Record<EmptyIllustrationName, () => React.ReactElement> = {
  cart: () => (
    <>
      <Backdrop sparkles={[{x: 44, y: 52, kind: 'big'}, {x: 198, y: 120, kind: 'small'}, {x: 192, y: 52, kind: 'ring'}, {x: 52, y: 130, kind: 'dot'}]} />
      <G {...line}>
        <Path d="M102 72 V60 a18 18 0 0 1 36 0 V72" />
        <Path d="M78 72 H162 L170 166 H70 Z" fill={WHITE} />
        <Path d="M78 72 H162 L163.3 86 H76.7 Z" fill={CREAM_DEEP} />
        <Path d="M96 40 l-4 -8 M120 34 v-9 M144 40 l4 -8" stroke={LINE_STRONG} />
      </G>
      <Circle cx={120} cy={124} r={21} fill={RED} />
      <Path d={HEART} fill={WHITE} transform="translate(120 125)" />
    </>
  ),
  orders: () => (
    <>
      <Backdrop ground={{cx: 120, rx: 66}} sparkles={[{x: 52, y: 70, kind: 'big'}, {x: 192, y: 132, kind: 'small'}, {x: 58, y: 138, kind: 'ring'}]} />
      <G {...line}>
        <Path d="M84 42 H152 V160 L143.5 154 L135 160 L126.5 154 L118 160 L109.5 154 L101 160 L92.5 154 L84 160 Z" fill={WHITE} />
        <Path d="M98 76 H138 M98 92 H130 M98 108 H136" stroke={LINE_STRONG} strokeWidth={5} />
        <Path d="M98 134 H112 M124 134 H138" />
      </G>
      <Circle cx={154} cy={48} r={19} fill={RED} stroke={INK} strokeWidth={2.5} />
      <Path d="M146 39 V45 a3 3 0 0 0 6 0 V39 M149 39 V57 M160 49 V57" fill="none" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Ellipse cx={160} cy={44} rx={3.2} ry={5} fill={WHITE} />
    </>
  ),
  comingSoonArea: () => (
    <>
      <Backdrop cy={98} ground={{cx: 120, rx: 76}} sparkles={[{x: 38, y: 44, kind: 'big'}, {x: 208, y: 132, kind: 'dot'}]} />
      <G {...line}>
        <Path d="M54 66 L94 56 V154 L54 164 Z" fill={WHITE} />
        <Path d="M94 56 L144 66 V164 L94 154 Z" fill={CREAM_DEEP} />
        <Path d="M144 66 L186 56 V154 L144 164 Z" fill={WHITE} />
        <Path d="M64 146 C78 130 92 146 108 128 C116 119 122 118 128 116" stroke={RED} strokeDasharray="0.5 7" />
        <Path d="M164 112 V68" />
        <Path d="M164 68 H186 L180 75 L186 82 H164 Z" fill={SOFT_RED} />
      </G>
      <Pin x={134} tipY={116}>
        <Circle cx={134} cy={84} r={7.5} fill={WHITE} />
      </Pin>
      <Ellipse cx={134} cy={121} rx={13} ry={3.5} fill="none" stroke={RED} strokeWidth={2} opacity={0.45} />
    </>
  ),
  // A rider on a red scooter heading for a map pin (bike 3 on the Home coming-soon canvas).
  deliveryBike: () => (
    <>
      <Backdrop ground={{cx: 122, rx: 86}} sparkles={[{x: 40, y: 40, kind: 'big'}, {x: 212, y: 140, kind: 'small'}, {x: 150, y: 24, kind: 'ring'}]} />
      <Path d="M10 112 H26 M4 126 H24 M12 140 H26" stroke={LINE_STRONG} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={38} cy={164} r={4} fill={GROUND} />
      <Circle cx={28} cy={158} r={3} fill={GROUND} />
      <G {...line}>
        <Path d="M172 116 L178 152" />
        <Circle cx={72} cy={152} r={17} fill={INK} />
        <Circle cx={72} cy={152} r={9} fill={WHITE} stroke="none" />
        <Circle cx={72} cy={152} r={3} fill={INK} stroke="none" />
        <Circle cx={178} cy={152} r={17} fill={INK} />
        <Circle cx={178} cy={152} r={9} fill={WHITE} stroke="none" />
        <Circle cx={178} cy={152} r={3} fill={INK} stroke="none" />
        <Path d="M44 132 C44 120 52 112 66 112 L122 112 C128 112 130 118 128 124 L124 138 L150 138 L160 98 C162 90 172 88 176 94 C180 100 178 112 174 122 C170 132 166 142 158 148 L95 148 A23 23 0 0 0 49 148 L44 142 Z" fill={RED} />
        <Path d="M160 148 C160 136 170 128 182 130 C190 131 196 138 197 146 L191 146 C189 140 185 137 180 137 C172 137 167 142 166 148 Z" fill={RED} />
        <Path d="M84 112 C84 105 88 102 94 102 H120 C126 102 129 106 127 112 Z" fill={INK} />
        <Path d="M36 110 H88 M46 110 L54 124" />
        <Rect x={38} y={60} width={48} height={50} rx={7} fill={WHITE} />
        <Path d="M38 76 V67 C38 63 41 60 45 60 H79 C83 60 86 63 86 67 V76 Z" fill={RED} />
        <Path d="M96 92 L128 96 C135 97 138 101 137 108 L136 134 H127 L126 110 L98 108 C92 107 90 96 96 92 Z" fill={INK} />
        <Path d="M124 132 H140 C145 132 147 138 143 138 H124 Z" fill={WHITE} />
        <Path d="M94 68 C100 62 114 62 120 68 L126 92 C127 98 122 102 116 102 H98 C92 102 89 98 90 92 Z" fill={WHITE} />
        <Path d="M104 64 L110 100" stroke={RED} strokeWidth={3} />
        <Path d="M112 72 L148 64 C152 63 154 70 150 72 L118 84 C112 86 108 76 112 72 Z" fill={WHITE} />
        <Path d="M147 71 L157 70" strokeWidth={4.5} />
        <Circle cx={151} cy={68} r={4.5} fill={CREAM_DEEP} />
        <Path d="M168 90 L167 76 M165 64 L161 53" />
        <Rect x={156} y={64} width={28} height={12} rx={6} fill={WHITE} />
        <Circle cx={183} cy={70} r={3.5} fill={CREAM_DEEP} />
        <Ellipse cx={160} cy={50} rx={4.5} ry={3.5} fill={WHITE} />
        <Path d="M94 48 C94 36 102 30 112 30 C123 30 130 38 130 48 C130 56 126 60 120 60 H100 C96 60 94 56 94 48 Z" fill={RED} />
        <Path d="M116 42 H130 C131 48 129 54 124 54 H116 C113 54 113 42 116 42 Z" fill={INK} />
        <Path d="M119 46 H126" stroke={WHITE} strokeWidth={2} />
      </G>
      <Path d={HEART} fill={RED} transform="translate(62 93) scale(1.25)" />
      <Path d="M192 66 L202 62 M193 73 L204 73" stroke={RED} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M206 108 C214 96 222 86 220 72" fill="none" stroke={RED} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="0.5 7" />
      <Pin x={218} tipY={62} r={11}>
        <Circle cx={218} cy={44.4} r={4.2} fill={WHITE} stroke={INK} strokeWidth={2} />
      </Pin>
    </>
  ),
  location: () => (
    <>
      <Defs>
        <ClipPath id="emptyMapDisc">
          <Circle cx={120} cy={112} r={54} />
        </ClipPath>
      </Defs>
      <Backdrop cy={100} ground={{cx: 120, rx: 60}} sparkles={[{x: 196, y: 58, kind: 'big'}, {x: 44, y: 120, kind: 'small'}, {x: 50, y: 62, kind: 'ring'}]} />
      <Circle cx={120} cy={112} r={56} fill={WHITE} stroke={INK} strokeWidth={2.5} />
      <G clipPath="url(#emptyMapDisc)" fill="none" strokeLinecap="round">
        <Path d="M60 96 C92 86 132 124 182 112" stroke={GROUND} strokeWidth={9} />
        <Path d="M100 52 C110 96 92 132 104 176" stroke={GROUND} strokeWidth={9} />
        <Path d="M140 56 C136 90 150 130 168 160" stroke={CREAM_DEEP} strokeWidth={6} />
        <Rect x={128} y={126} width={18} height={14} rx={3} fill={TINT} />
        <Rect x={78} y={118} width={14} height={18} rx={3} fill={TINT} />
      </G>
      <Circle cx={120} cy={114} r={26} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="3 6" opacity={0.5} />
      <Ellipse cx={120} cy={115} rx={11} ry={3.5} fill={RED} opacity={0.25} />
      <Pin x={120} tipY={112} r={22}>
        <Circle cx={120} cy={74} r={8} fill={WHITE} />
      </Pin>
    </>
  ),
  search: () => (
    <>
      <Backdrop ground={{cx: 114, rx: 70}} sparkles={[{x: 48, y: 54, kind: 'big'}, {x: 40, y: 104, kind: 'ring'}, {x: 206, y: 160, kind: 'dot'}]} />
      <G {...line}>
        <Path d="M56 118 H150 C150 144 130 160 103 160 C76 160 56 144 56 118 Z" fill={WHITE} />
        <Path d="M88 160 H118 V166 H88 Z" fill={CREAM_DEEP} />
        <Path d="M66 132 C82 138 124 138 140 132" stroke={TINT} strokeWidth={6} />
        <Path d="M178 106 L198 126" strokeWidth={10} />
        <Circle cx={158} cy={86} r={30} fill={WHITE} strokeWidth={3} />
        <Path d="M150 79 a8 8 0 1 1 11.5 7.2 c-2.2 1 -3.5 2.6 -3.5 5" stroke={RED} strokeWidth={3.5} />
      </G>
      <Circle cx={158} cy={99} r={2.4} fill={RED} />
      <Path d="M136 64 C140 60 146 58 150 58" fill="none" stroke={TINT} strokeWidth={4} strokeLinecap="round" />
    </>
  ),
  kitchenNoDishes: () => (
    <>
      <Backdrop cy={96} ground={{cx: 120, rx: 72}} sparkles={[{x: 42, y: 52, kind: 'big'}, {x: 200, y: 134, kind: 'dot'}]} />
      <G {...line}>
        <Path d="M68 108 H56 a6 6 0 0 0 0 12 H68" />
        <Path d="M172 108 H184 a6 6 0 0 1 0 12 H172" />
        <Path d="M68 96 H172 V138 a24 24 0 0 1 -24 24 H92 a24 24 0 0 1 -24 -24 Z" fill={WHITE} />
        <Path d="M78 126 C96 132 144 132 162 126" stroke={TINT} strokeWidth={6} />
        <Path d="M62 96 C62 74 178 74 178 96 Z" fill={CREAM_DEEP} />
        <Rect x={111} y={68} width={18} height={10} rx={5} fill={RED} />
      </G>
      <Circle cx={176} cy={62} r={20} fill={RED} stroke={INK} strokeWidth={2.5} />
      <Path d="M176 51 V62 L183 66" fill="none" stroke={WHITE} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  saved: () => (
    <>
      <Backdrop ground={{cx: 120, rx: 66}} sparkles={[{x: 200, y: 104, kind: 'small'}, {x: 44, y: 120, kind: 'dot'}]} />
      <G {...line}>
        <Path d="M66 120 H174 C174 148 150 164 120 164 C90 164 66 148 66 120 Z" fill={WHITE} />
        <Path d="M76 134 C94 140 146 140 164 134" stroke={TINT} strokeWidth={6} />
        <Path d="M102 164 H138 V170 H102 Z" fill={CREAM_DEEP} />
        <Path d="M120 106 C94 90 86 74 94 63 C101 54 114 56 120 66 C126 56 139 54 146 63 C154 74 146 90 120 106 Z" fill={RED} />
        <Path d={HEART} transform="translate(62 62)" strokeWidth={2} />
        <Path d={HEART} transform="translate(178 50) scale(0.8)" strokeWidth={2.4} />
      </G>
      <Path d="M104 70 C106 66 110 64 113 65" fill="none" stroke={WHITE} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
    </>
  ),
  addresses: () => (
    <>
      <Backdrop ground={{cx: 116, rx: 72}} sparkles={[{x: 42, y: 56, kind: 'big'}, {x: 204, y: 144, kind: 'dot'}, {x: 44, y: 136, kind: 'ring'}]} />
      <G {...line}>
        <Path d="M70 106 V166 H152 V106" fill={WHITE} />
        <Path d="M60 110 L111 66 L162 110 Z" fill={CREAM_DEEP} />
        <Rect x={99} y={130} width={24} height={36} rx={3} fill={TINT} />
        <Rect x={80} y={118} width={14} height={14} rx={2} fill={WHITE} />
        <Rect x={130} y={118} width={14} height={14} rx={2} fill={WHITE} />
        <Path d="M60 166 H166" />
      </G>
      <Pin x={174} tipY={116} r={22} />
      <Path d="M174 70 V90 M164 80 H184" fill="none" stroke={WHITE} strokeWidth={3.2} strokeLinecap="round" />
    </>
  ),
  mealPlans: () => (
    <>
      <Backdrop ground={{cx: 124, rx: 74}} sparkles={[{x: 40, y: 60, kind: 'big'}, {x: 206, y: 58, kind: 'ring'}]} />
      <Calendar x={56} w={108} h={104} />
      <G fill={GROUND}>
        {[[70, 90], [92, 90], [114, 90], [136, 90], [70, 112], [114, 112], [70, 134], [92, 134]].map(([x, y]) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={14} height={14} rx={4} />
        ))}
      </G>
      <Rect x={92} y={112} width={14} height={14} rx={4} fill={TINT} stroke={RED} strokeWidth={2} />
      <G {...line}>
        <Path d="M158 102 V88 H186 V102" />
        <Path d="M150 108 C150 98 194 98 194 108 Z" fill={RED} />
        <Rect x={148} y={108} width={48} height={20} rx={6} fill={WHITE} />
        <Rect x={148} y={128} width={48} height={20} rx={6} fill={CREAM_DEEP} />
        <Rect x={148} y={148} width={48} height={20} rx={6} fill={WHITE} />
        <Path d="M144 114 V162 M200 114 V162" strokeWidth={3} />
      </G>
    </>
  ),
  notifications: () => (
    <>
      <Backdrop ground={{cx: 120, rx: 58}} sparkles={[{x: 46, y: 70, kind: 'big'}, {x: 50, y: 130, kind: 'dot'}, {x: 196, y: 128, kind: 'ring'}]} />
      <G {...line}>
        <Path d="M106 138 a14 14 0 0 0 28 0 Z" fill={RED} />
        <Path d="M120 52 C97 52 84 69 84 92 V114 L72 130 H168 L156 114 V92 C156 69 143 52 120 52 Z" fill={WHITE} />
        <Path d="M72 130 H168 V138 H72 Z" fill={CREAM_DEEP} />
        <Circle cx={120} cy={46} r={6} fill={RED} />
        <Path d="M96 96 C96 82 104 72 114 68" stroke={TINT} strokeWidth={5} />
        <Path d="M166 50 H178 L166 64 H178" />
        <Path d="M186 30 H195 L186 40 H195" strokeWidth={2.2} />
      </G>
    </>
  ),
  offline: () => (
    <>
      <Backdrop cy={98} ground={{cx: 120, rx: 56}} sparkles={[{x: 196, y: 62, kind: 'big'}, {x: 44, y: 134, kind: 'ring'}, {x: 200, y: 138, kind: 'dot'}]} />
      <G fill="none" strokeLinecap="round">
        <Path d="M58 92 C92 58 148 58 182 92" stroke={LINE} strokeWidth={11} />
        <Path d="M78 112 C102 88 138 88 162 112" stroke={LINE_STRONG} strokeWidth={11} />
        <Path d="M98 132 C111 120 129 120 142 132" stroke={INK} strokeWidth={11} />
      </G>
      <Circle cx={120} cy={152} r={9} fill={RED} stroke={INK} strokeWidth={2.5} />
      <Path d="M68 52 L172 156" stroke={WHITE} strokeWidth={18} strokeLinecap="round" />
      <Path d="M68 52 L172 156" stroke={RED} strokeWidth={9} strokeLinecap="round" />
    </>
  ),
  loadError: () => {
    const crack = '120,52 111,74 126,90 109,108 124,126 113,146 120,170';
    const plate = (
      <>
        <Circle cx={120} cy={110} r={56} fill={WHITE} stroke={INK} strokeWidth={2.5} />
        <Circle cx={120} cy={110} r={38} fill="none" stroke={CREAM_DEEP} strokeWidth={5} />
        <Polyline points={crack} fill="none" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      </>
    );
    return (
      <>
        <Defs>
          <ClipPath id="emptyPlateLeft">
            <Polygon points={`0,0 120,0 ${crack} 120,190 0,190`} />
          </ClipPath>
          <ClipPath id="emptyPlateRight">
            <Polygon points={`240,0 120,0 ${crack} 120,190 240,190`} />
          </ClipPath>
        </Defs>
        <Backdrop cy={98} ground={{cx: 120, rx: 70}} sparkles={[{x: 196, y: 50, kind: 'big'}, {x: 44, y: 58, kind: 'ring'}]} />
        <G clipPath="url(#emptyPlateLeft)">
          <G transform="translate(-6 2) rotate(-6 120 110)">{plate}</G>
        </G>
        <G clipPath="url(#emptyPlateRight)">
          <G transform="translate(7 4) rotate(7 120 110)">{plate}</G>
        </G>
        <Path d="M84 168 l6 -6 l4 7 Z" fill={WHITE} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M150 170 l8 -4 l1 7 Z" fill={WHITE} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        <Circle cx={174} cy={96} r={13} fill={RED} stroke={INK} strokeWidth={2.5} />
        <Path d="M174 89 V98" stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
        <Circle cx={174} cy={103} r={1.8} fill={WHITE} />
      </>
    );
  },
  newOrders: () => (
    <>
      <Backdrop cy={96} ground={{cx: 120, rx: 70}} sparkles={[{x: 44, y: 54, kind: 'big'}, {x: 200, y: 58, kind: 'ring'}]} />
      <G {...line}>
        <Path d="M48 108 l-10 -5 M46 122 h-12 M192 108 l10 -5 M194 122 h12" stroke={LINE_STRONG} />
        <Rect x={114} y={78} width={12} height={16} rx={3} fill={CREAM_DEEP} />
        <Circle cx={120} cy={74} r={8} fill={RED} />
        <Path d="M68 142 C68 112 92 94 120 94 C148 94 172 112 172 142 Z" fill={WHITE} />
        <Path d="M88 128 C90 116 100 108 110 105" stroke={TINT} strokeWidth={5} />
        <Rect x={56} y={142} width={128} height={16} rx={6} fill={CREAM_DEEP} />
      </G>
    </>
  ),
  menu: () => (
    <>
      <Backdrop cy={98} ground={{cx: 120, rx: 80}} sparkles={[{x: 206, y: 152, kind: 'big'}, {x: 34, y: 150, kind: 'dot'}]} />
      <G {...line}>
        <Circle cx={120} cy={106} r={54} fill={WHITE} />
        <Circle cx={120} cy={106} r={38} stroke={LINE} strokeDasharray="5 7" />
        <Path d="M44 58 V76 Q44 84 51 84 Q58 84 58 76 V58 M51 58 V76" />
        <Path d="M51 84 V158" strokeWidth={5} />
        <Path d="M190 58 C202 68 202 98 190 104 Z" fill={WHITE} />
        <Path d="M190 104 V158" strokeWidth={5} />
      </G>
      <Circle cx={120} cy={106} r={17} fill={RED} stroke={INK} strokeWidth={2.5} />
      <Path d="M120 98 V114 M112 106 H128" stroke={WHITE} strokeWidth={3.2} strokeLinecap="round" />
    </>
  ),
  earnings: () => (
    <>
      <Backdrop cy={98} ground={{cx: 120, rx: 70}} sparkles={[{x: 44, y: 64, kind: 'big'}, {x: 204, y: 140, kind: 'dot'}]} />
      <G {...line}>
        <Rect x={70} y={74} width={96} height={30} rx={10} fill={CREAM_DEEP} />
        <Circle cx={104} cy={62} r={22} fill={RED} />
        <Circle cx={140} cy={58} r={15} fill={SOFT_RED} />
        <Rect x={60} y={86} width={120} height={78} rx={16} fill={WHITE} />
        <Rect x={146} y={110} width={40} height={28} rx={10} fill={TINT} />
        <Path d="M72 150 H120" stroke={GROUND} strokeWidth={5} />
      </G>
      <Circle cx={163} cy={124} r={4} fill={RED} />
      <Path d={RUPEE} fill="none" stroke={WHITE} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  payouts: () => (
    <>
      <Backdrop ground={{cx: 120, rx: 76}} sparkles={[{x: 42, y: 54, kind: 'big'}, {x: 36, y: 132, kind: 'ring'}]} />
      <G {...line}>
        <Path d="M62 88 L116 54 L170 88 Z" fill={CREAM_DEEP} />
        <Rect x={64} y={88} width={104} height={12} rx={3} fill={WHITE} />
        {[74, 98, 122, 146].map(x => (
          <Rect key={x} x={x} y={100} width={12} height={46} fill={WHITE} />
        ))}
        <Rect x={58} y={146} width={116} height={12} rx={3} fill={WHITE} />
        <Rect x={52} y={158} width={128} height={10} rx={3} fill={CREAM_DEEP} />
        <Path d="M176 128 C196 124 204 104 198 82" stroke={RED} strokeWidth={3} />
        <Path d="M189 87 L198 79 L204 90" stroke={RED} strokeWidth={3} />
      </G>
      <Circle cx={116} cy={76} r={6.5} fill={RED} stroke={INK} strokeWidth={2} />
      <Circle cx={196} cy={58} r={13} fill={SOFT_RED} stroke={INK} strokeWidth={2.5} />
      <Path d="M190 52 H202 M190 57 H202 M193 52 C200 52 200 62 193 62 H191 L199 68" fill="none" stroke={WHITE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  reviews: () => (
    <>
      <Backdrop ground={{cx: 116, rx: 64}} sparkles={[{x: 198, y: 42, kind: 'big'}, {x: 40, y: 62, kind: 'ring'}, {x: 204, y: 136, kind: 'dot'}]} />
      <G stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M58 64 a16 16 0 0 1 16 -16 H166 a16 16 0 0 1 16 16 V114 a16 16 0 0 1 -16 16 H108 L84 152 V130 H74 a16 16 0 0 1 -16 -16 Z" fill={WHITE} />
        <Path d={STAR} transform="translate(120 88)" fill={RED} />
        <Path d={STAR} transform="translate(86 92) scale(0.72)" fill={CREAM_DEEP} strokeWidth={3.2} />
        <Path d={STAR} transform="translate(154 92) scale(0.72)" fill={CREAM_DEEP} strokeWidth={3.2} />
      </G>
      <Path d="M96 116 H144" stroke={GROUND} strokeWidth={5} strokeLinecap="round" />
    </>
  ),
  chefMealPlans: () => (
    <>
      <Backdrop ground={{cx: 120, rx: 66}} sparkles={[{x: 40, y: 60, kind: 'big'}, {x: 204, y: 60, kind: 'ring'}, {x: 40, y: 140, kind: 'dot'}]} />
      <Calendar x={64} w={112} h={108} />
      <G fill={GROUND}>
        {[[78, 92], [102, 92], [126, 92], [150, 92], [78, 116], [102, 116], [126, 116], [78, 140], [102, 140]].map(([x, y]) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={x === 150 ? 14 : 16} height={y === 140 ? 14 : 16} rx={4} />
        ))}
      </G>
      <Circle cx={170} cy={144} r={22} fill={RED} stroke={INK} strokeWidth={2.5} />
      <Path d="M170 134 V154 M160 144 H180" stroke={WHITE} strokeWidth={3.4} strokeLinecap="round" />
    </>
  ),
  support: () => (
    <>
      <Backdrop ground={{cx: 124, rx: 66}} sparkles={[{x: 200, y: 52, kind: 'big'}, {x: 40, y: 146, kind: 'ring'}]} />
      <G stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M52 66 a14 14 0 0 1 14 -14 H138 a14 14 0 0 1 14 14 V106 a14 14 0 0 1 -14 14 H90 L70 138 V120 H66 a14 14 0 0 1 -14 -14 Z" fill={WHITE} />
        <Path d="M112 116 a12 12 0 0 1 12 -12 H178 a12 12 0 0 1 12 12 V146 a12 12 0 0 1 -12 12 H174 V172 L158 158 H124 a12 12 0 0 1 -12 -12 Z" fill={RED} />
      </G>
      {[82, 102, 122].map(x => (
        <Circle key={x} cx={x} cy={86} r={5.5} fill={LINE_STRONG} />
      ))}
      <Path d="M128 122 H174 M128 136 H160" stroke={WHITE} strokeWidth={4} strokeLinecap="round" />
    </>
  ),
  comingSoon: () => (
    <>
      <Backdrop ground={{cx: 120, rx: 56}} sparkles={[{x: 186, y: 56, kind: 'big'}, {x: 52, y: 120, kind: 'small'}, {x: 56, y: 62, kind: 'ring'}]} />
      <G {...line}>
        <Path d="M84 56 V156 M156 56 V156" strokeWidth={3.5} />
        <Path d="M92 56 H148 C148 86 126 94 126 104 C126 114 148 122 148 152 H92 C92 122 114 114 114 104 C114 94 92 86 92 56 Z" fill={WHITE} />
        <Path d="M100 70 H140 C138 82 124 90 120 98 C116 90 102 82 100 70 Z" fill={RED} stroke="none" />
        <Path d="M100 150 C104 134 114 128 120 126 C126 128 136 134 140 150 Z" fill={RED} stroke="none" />
        <Path d="M120 100 V124" stroke={RED} strokeWidth={2} strokeDasharray="2 4" />
        <Rect x={76} y={44} width={88} height={12} rx={6} fill={CREAM_DEEP} />
        <Rect x={76} y={152} width={88} height={12} rx={6} fill={CREAM_DEEP} />
      </G>
    </>
  ),
  session: () => (
    <>
      <Backdrop ground={{cx: 124, rx: 60}} sparkles={[{x: 48, y: 56, kind: 'big'}, {x: 196, y: 64, kind: 'ring'}, {x: 52, y: 136, kind: 'dot'}]} />
      <G {...line}>
        <Rect x={84} y={36} width={72} height={132} rx={14} fill={WHITE} />
        <Rect x={92} y={52} width={56} height={98} rx={6} fill={TINT} stroke="none" />
        <Path d="M112 44 H128" />
        <Path d="M108 98 V88 a12 12 0 0 1 24 0 V98" />
        <Rect x={102} y={98} width={36} height={30} rx={7} fill={RED} />
      </G>
      <Circle cx={120} cy={110} r={4} fill={WHITE} />
      <Path d="M120 112 V119" stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={166} cy={142} r={18} fill={WHITE} stroke={INK} strokeWidth={2.5} />
      <Path d="M174 142 a8 8 0 1 1 -3 -6.2 M171 129 L171 135.8 L177.5 135" fill="none" stroke={RED} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

/** A 240 × 190 drawing scaled to `width`; decorative, so screen readers skip it. */
export function EmptyIllustration({name, width = 240}: {name: EmptyIllustrationName; width?: number}) {
  const Drawing = DRAWINGS[name];
  return (
    <Svg
      accessibilityElementsHidden
      height={(width * 190) / 240}
      importantForAccessibility="no-hide-descendants"
      testID={`empty-illustration-${name}`}
      viewBox="0 0 240 190"
      width={width}>
      <Drawing />
    </Svg>
  );
}
