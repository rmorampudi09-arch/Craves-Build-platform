import {
  motionDuration,
  motionSafety,
  motionTransitions,
  resolveMotion,
  shouldAnimateListChanges,
} from './motion';

describe('shared motion baseline', () => {
  it('keeps interaction motion short and modal motion bounded', () => {
    expect(motionDuration.press).toBeGreaterThan(0);
    expect(motionDuration.press).toBeLessThanOrEqual(250);
    expect(motionDuration.selection).toBeLessThanOrEqual(250);
    expect(motionDuration.bottomNavigation).toBeLessThanOrEqual(350);
    expect(motionDuration.viewCart).toBeLessThanOrEqual(350);
    expect(motionDuration.modal).toBeLessThanOrEqual(350);
  });

  it('uses transform and opacity only in shared transition definitions', () => {
    const allowedProperties = new Set(['opacity', 'transform']);

    Object.values(motionTransitions).forEach(transition => {
      transition.properties.forEach(property => {
        expect(allowedProperties.has(property)).toBe(true);
      });
    });
  });

  it('turns interpolation, springs, and continuous motion off for reduced motion', () => {
    const viewCart = resolveMotion('viewCart', true);
    const skeleton = resolveMotion('skeleton', true);

    expect(viewCart.animate).toBe(false);
    expect(viewCart.durationMs).toBe(0);
    expect(viewCart.useSpring).toBe(false);
    expect(skeleton.animate).toBe(false);
    expect(skeleton.continuous).toBe(false);
  });

  it('keeps critical navigation and error presentation free of animation delays', () => {
    expect(motionSafety.authenticationNavigationDelayMs).toBe(0);
    expect(motionSafety.paymentNavigationDelayMs).toBe(0);
    expect(motionSafety.errorPresentationDelayMs).toBe(0);
  });

  it('never opts into whole-list animation and bounds item change animation', () => {
    expect(motionSafety.animateWholeLargeLists).toBe(false);
    expect(motionTransitions.listInsertionRemoval.largeListPolicy).toBe(
      'bounded-items-only',
    );
    expect(shouldAnimateListChanges(1, false)).toBe(true);
    expect(
      shouldAnimateListChanges(motionSafety.maxAnimatedListBatchItems, false),
    ).toBe(true);
    expect(
      shouldAnimateListChanges(
        motionSafety.maxAnimatedListBatchItems + 1,
        false,
      ),
    ).toBe(false);
    expect(shouldAnimateListChanges(1, true)).toBe(false);
  });
});
