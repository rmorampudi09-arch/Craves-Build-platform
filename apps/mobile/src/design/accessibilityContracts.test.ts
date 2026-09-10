import {colors, textDefaults, touchTarget} from './tokens';

function linearize(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const channel = (offset: number) =>
    linearize(parseInt(normalized.slice(offset, offset + 2), 16) / 255);

  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('accessibility design contracts', () => {
  test('keeps the approved Flame Red brand accent unchanged', () => {
    expect(colors.flameRed).toBe('#F62E18');
  });

  test.each([
    ['action red on white', colors.flameRedAccessible, colors.white],
    ['white on text-bearing action red', colors.white, colors.flameRedAccessible],
    ['success badge text', colors.successText, colors.successSoft],
    ['warning badge text', colors.warningText, colors.warningSoft],
    ['error badge text', colors.error, colors.errorSoft],
    ['info badge text', colors.infoText, colors.infoSoft],
    ['secondary text on warm-strong surface', colors.textSecondary, colors.surfaceWarmStrong],
    ['placeholder text on input surface', colors.placeholder, colors.surfaceBase],
  ])('%s meets the normal-text contrast target', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps shared text scalable', () => {
    expect(textDefaults.allowFontScaling).toBe(true);
  });

  test('keeps Android-first touch targets at least 48 dp', () => {
    expect(touchTarget.minimum).toBeGreaterThanOrEqual(48);
  });
});
