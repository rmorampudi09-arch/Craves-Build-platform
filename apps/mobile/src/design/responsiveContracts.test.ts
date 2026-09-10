import {
  classifyResponsiveWidth,
  getBottomActionPadding,
  responsiveLayout,
  shouldStackCriticalActions,
} from './responsive';
import {spacing} from './tokens';

describe('P114 responsive layout contracts', () => {
  test.each([
    [320, 'compact'],
    [390, 'standard'],
    [480, 'large'],
  ] as const)('classifies %i dp as %s', (width, expected) => {
    expect(classifyResponsiveWidth(width)).toBe(expected);
  });

  test('stacks critical actions for compact width or enlarged text', () => {
    expect(shouldStackCriticalActions(320, 1)).toBe(true);
    expect(shouldStackCriticalActions(390, responsiveLayout.enlargedFontScale)).toBe(true);
    expect(shouldStackCriticalActions(390, 1)).toBe(false);
    expect(shouldStackCriticalActions(480, 1)).toBe(false);
  });

  test('adds gesture/navigation inset clearance to sticky actions', () => {
    expect(getBottomActionPadding(0)).toBe(spacing.sm);
    expect(getBottomActionPadding(24)).toBe(24 + spacing.xs);
  });

  test('retains the established readable auth width on large displays', () => {
    expect(responsiveLayout.authContentMaxWidth).toBe(560);
  });
});
