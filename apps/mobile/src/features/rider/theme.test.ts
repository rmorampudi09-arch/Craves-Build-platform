import {colors, riderTheme, setRiderTheme, themedStyles, type RiderPalette, type RiderThemeName} from './theme';

const channel = (hex: string, at: number) => {
  const v = parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Text 4.5:1; white on flame red only as large text (19 sp bold), and marks and icons 3:1 (WCAG 1.4.3, 1.4.11).
const PAIRS: [keyof RiderPalette, keyof RiderPalette, number][] = [
  ['textPrimary', 'ground', 4.5],
  ['textPrimary', 'surface', 4.5],
  ['textSecondary', 'ground', 4.5],
  ['textSecondary', 'surface', 4.5],
  ['textSecondary', 'muted', 4.5],
  ['redText', 'surface', 4.5],
  ['redText', 'ground', 4.5],
  ['white', 'flameRed', 3],
  ['kitchenInk', 'kitchen', 4.5],
  ['kitchenSub', 'kitchen', 4.5],
  ['dropInk', 'drop', 4.5],
  ['dropSub', 'drop', 4.5],
  ['successText', 'successSoft', 4.5],
  ['warningText', 'warningSoft', 4.5],
  ['infoText', 'infoSoft', 4.5],
  ['redText', 'errorSoft', 4.5],
  ['onInverse', 'inverse', 4.5],
  ['onSuccess', 'success', 3],
  ['white', 'doneHead', 4.5],
  ['onDoneHeadSoft', 'doneHead', 4.5],
  ['white', 'sos', 4.5],
  ['kitchenMark', 'kitchen', 3],
  ['dropMark', 'drop', 3],
  ['success', 'surface', 3],
];

describe.each(['day', 'night'] as RiderThemeName[])('%s colours', theme => {
  beforeAll(() => setRiderTheme(theme));
  afterAll(() => setRiderTheme('day'));

  it.each(PAIRS)('%s on %s reads at %s:1 or better', (fg, bg, min) => {
    expect(ratio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('themedStyles', () => {
  afterEach(() => setRiderTheme('day'));

  it('hands back the current theme style on every read, made once per theme', () => {
    const make = jest.fn((c: RiderPalette) => ({panel: {backgroundColor: c.kitchen}}));
    const styles = themedStyles(make);
    expect(riderTheme()).toBe('day');
    expect(styles.panel.backgroundColor).toBe('#FFE4CC');
    setRiderTheme('night');
    expect(styles.panel.backgroundColor).toBe('#3A2B23');
    setRiderTheme('day');
    expect(styles.panel.backgroundColor).toBe('#FFE4CC');
    expect(make).toHaveBeenCalledTimes(2);
  });
});
