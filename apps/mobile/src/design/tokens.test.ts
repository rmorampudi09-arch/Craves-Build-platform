import {
  colors,
  iconSize,
  safeArea,
  spacing,
  textDefaults,
  touchTarget,
} from './tokens';

describe('design token baseline', () => {
  it('locks the approved CRAVES brand colors', () => {
    expect(colors.flameRed).toBe('#F62E18');
    expect(colors.espressoBrown).toBe('#261A15');
  });

  it('keeps spacing on the 4 dp rhythm', () => {
    Object.values(spacing).forEach(value => {
      expect(value % 4).toBe(0);
    });
  });

  it('provides shared semantic colors instead of reusing the brand action color', () => {
    expect(colors.success).not.toBe(colors.flameRed);
    expect(colors.warning).not.toBe(colors.flameRed);
    expect(colors.error).not.toBe(colors.flameRed);
    expect(colors.info).not.toBe(colors.flameRed);
  });

  it('keeps Android interaction targets accessible', () => {
    expect(touchTarget.minimum).toBeGreaterThanOrEqual(48);
    expect(touchTarget.comfortable).toBeGreaterThanOrEqual(
      touchTarget.minimum,
    );
    expect(iconSize.md).toBeLessThanOrEqual(touchTarget.minimum);
  });

  it('keeps dynamic type enabled and safe-area clearances tokenized', () => {
    expect(textDefaults.allowFontScaling).toBe(true);
    expect(safeArea.contentPadding).toBeGreaterThan(0);
    expect(safeArea.contentBottomPadding).toBeGreaterThan(0);
    expect(safeArea.floatingControlClearance).toBeGreaterThan(0);
  });
});
