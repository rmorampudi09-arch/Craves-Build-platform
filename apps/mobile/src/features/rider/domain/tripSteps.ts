import type {TripAction, TripStep} from '../api/contract';

const ENDED: readonly TripStep[] = ['DELIVERED', 'FAILED', 'CANCELLED'];

/** The step each queued action needs and the step it leads to: the server's order (FleetTripService.STEPS). */
const MOVES: Partial<Record<TripAction, readonly [TripStep, TripStep]>> = {
  'arrived-pickup': ['TO_KITCHEN', 'AT_KITCHEN'],
  'picked-up': ['AT_KITCHEN', 'PICKED_UP'],
  'arrived-drop': ['PICKED_UP', 'AT_DROP'],
  delivered: ['AT_DROP', 'DELIVERED'],
};

/**
 * The step the trip screen shows (blueprint A3): the server's step with this trip's queued actions applied in order, so a
 * restart or a fresh screen opens where the rider left off. failed ends any step; food-not-ready changes nothing; an
 * action that doesn't fit the step it meets is skipped. An ended server step always wins.
 */
export function displayedStep(serverStep: TripStep, pending: readonly {action: TripAction}[]): TripStep {
  if (ENDED.includes(serverStep)) {
    return serverStep;
  }
  return pending.reduce<TripStep>((step, entry) => {
    if (ENDED.includes(step)) {
      return step;
    }
    if (entry.action === 'failed') {
      return 'FAILED';
    }
    const move = MOVES[entry.action];
    return move && move[0] === step ? move[1] : step;
  }, serverStep);
}
