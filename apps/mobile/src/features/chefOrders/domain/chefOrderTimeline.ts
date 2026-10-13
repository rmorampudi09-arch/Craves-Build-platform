import {formatTimeOfDay} from '../../chefShell/domain/chefFormat';
import type {ChefOrderDetail, ChefOrderDetailStatus} from '../api/chefOrderDetailApi';

export interface ChefOrderTimelineStep {
  label: string;
  state: 'done' | 'now' | 'todo';
  /** The time the step happened, and anything worth knowing about it. */
  detail?: string;
}

// Where an order is on its way from placed (0) to delivered (4). Rejected, cancelled and refunded orders stop the line instead.
const PROGRESS: Partial<Record<ChefOrderDetailStatus, number>> = {
  PAYMENT_PENDING: 0,
  PAID: 0,
  CHEF_ACCEPTANCE_PENDING: 0,
  CHEF_ACCEPTED: 1,
  PREPARING: 1,
  READY_FOR_PICKUP: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};

const clock = (iso: string | undefined) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? formatTimeOfDay(date) : undefined;
};
const joined = (parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;

/**
 * The order's steps for the Status card. Times come from the status history when the server sends it; without it
 * the placed time and the time the order last changed (the current step) are all there is, so no other step shows one.
 */
export function buildChefOrderTimeline(order: ChefOrderDetail): ChefOrderTimelineStep[] {
  const history = order.statusHistory ?? [];
  const historyTime = (...statuses: ChefOrderDetailStatus[]) => history.find(entry => statuses.includes(entry.status))?.at;
  const placedAt = historyTime('CHEF_ACCEPTANCE_PENDING') ?? order.createdAt;
  const progress = PROGRESS[order.status];

  if (progress === undefined) {
    // Rejected, cancelled or refunded: the line stops where the order did.
    return [
      {label: 'Order placed', state: 'done', detail: clock(placedAt)},
      {
        label: order.status === 'CHEF_REJECTED' ? 'You rejected the order' : 'Order cancelled',
        state: 'done',
        detail: clock(order.updatedAt),
      },
    ];
  }

  const promise = order.prepTimeMinutes ? `ready in ${order.prepTimeMinutes} min` : undefined;
  const partner = order.deliveryPartner?.name;
  const steps: {done: string; now: string; todo: string; at: string | undefined; extra?: string}[] = [
    {done: 'Order placed', now: 'Order placed', todo: 'Order placed', at: placedAt},
    {done: 'You accepted', now: 'Cooking', todo: 'Accepted', at: historyTime('CHEF_ACCEPTED', 'PREPARING'), extra: promise},
    {done: 'Marked ready', now: 'Ready for pickup', todo: 'Ready for pickup', at: historyTime('READY_FOR_PICKUP')},
    {
      done: partner ? `Picked up by ${partner}` : 'Picked up',
      now: 'On the way',
      todo: 'On the way',
      at: historyTime('OUT_FOR_DELIVERY'),
    },
    {done: 'Delivered', now: 'Delivered', todo: 'Delivered', at: historyTime('DELIVERED')},
  ];

  return steps.map((step, index) => {
    // A delivered order is the end of the line, so every step reads as done rather than "now".
    const state = index < progress || progress === 4 ? 'done' : index === progress ? 'now' : 'todo';
    if (state === 'todo') {
      return {label: step.todo, state};
    }
    // The current step may have no time of its own: it last changed when the order did.
    const at = step.at ?? (index === progress && index > 0 ? order.updatedAt : undefined);
    return {label: state === 'done' ? step.done : step.now, state, detail: joined([clock(at), step.extra])};
  });
}
