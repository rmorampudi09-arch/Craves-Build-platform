import type {TripAction} from '../api/contract';
import {displayedStep} from './tripSteps';

const queued = (...actions: TripAction[]) => actions.map(action => ({action}));

describe('displayedStep', () => {
  it('applies each queued step in order from the step it needs', () => {
    expect(displayedStep('TO_KITCHEN', queued('arrived-pickup'))).toBe('AT_KITCHEN');
    expect(displayedStep('AT_KITCHEN', queued('picked-up'))).toBe('PICKED_UP');
    expect(displayedStep('PICKED_UP', queued('arrived-drop'))).toBe('AT_DROP');
    expect(displayedStep('AT_DROP', queued('delivered'))).toBe('DELIVERED');
    expect(displayedStep('TO_KITCHEN', queued('arrived-pickup', 'picked-up', 'arrived-drop', 'delivered'))).toBe('DELIVERED');
  });

  it('ends any step with failed, and food-not-ready changes nothing', () => {
    expect(displayedStep('PICKED_UP', queued('failed'))).toBe('FAILED');
    expect(displayedStep('AT_DROP', queued('failed', 'delivered'))).toBe('FAILED');
    expect(displayedStep('AT_KITCHEN', queued('food-not-ready'))).toBe('AT_KITCHEN');
  });

  it('skips an action that does not fit, and the server step wins when it moved on or ended', () => {
    expect(displayedStep('TO_KITCHEN', queued('picked-up'))).toBe('TO_KITCHEN');
    expect(displayedStep('AT_KITCHEN', queued('arrived-pickup', 'picked-up'))).toBe('PICKED_UP');
    expect(displayedStep('CANCELLED', queued('arrived-pickup'))).toBe('CANCELLED');
    expect(displayedStep('DELIVERED', queued('failed'))).toBe('DELIVERED');
    expect(displayedStep('PICKED_UP', [])).toBe('PICKED_UP');
  });
});
