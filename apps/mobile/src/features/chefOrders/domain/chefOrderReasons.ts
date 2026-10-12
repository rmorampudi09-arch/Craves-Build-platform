import {shortOrderNumber} from '../../chefShell/domain/chefFormat';

export type RejectReasonId = 'sold-out' | 'busy' | 'closing' | 'area' | 'other';

/** The one-tap reasons on the reject sheet. The server takes a free-text reason, so the label is what is sent. */
export const REJECT_REASONS: readonly {id: RejectReasonId; label: string}[] = [
  {id: 'sold-out', label: 'An item is sold out'},
  {id: 'busy', label: 'Kitchen is too busy right now'},
  {id: 'closing', label: 'Closing soon'},
  {id: 'area', label: "Can't deliver to this area"},
  {id: 'other', label: 'Other reason'},
];

const MAX_REASON_LENGTH = 500;

/** The text sent as the reject reason, or null while the sheet is not complete (nothing picked, or "Other reason" with no note). */
export function buildRejectReason(id: RejectReasonId | null, note: string): string | null {
  const reason = REJECT_REASONS.find(candidate => candidate.id === id);
  const trimmed = note.trim();
  if (!reason || (reason.id === 'other' && !trimmed)) {
    return null;
  }
  const text = reason.id === 'other' ? trimmed : trimmed ? `${reason.label}: ${trimmed}` : reason.label;
  return text.slice(0, MAX_REASON_LENGTH);
}

export type NotPickedUpReasonId = 'late' | 'left' | 'cancel' | 'other';

export const NOT_PICKED_UP_REASONS: readonly {id: NotPickedUpReasonId; label: string}[] = [
  {id: 'late', label: "Partner hasn't arrived yet"},
  {id: 'left', label: 'Partner left without the order'},
  {id: 'cancel', label: 'Partner asked me to cancel'},
  {id: 'other', label: 'Something else'},
];

/** The support case for an order the courier has not collected, ready for the support API. */
export function buildNotPickedUpCase(orderId: string, id: NotPickedUpReasonId, note: string) {
  const reason = NOT_PICKED_UP_REASONS.find(candidate => candidate.id === id)?.label ?? 'Something else';
  const trimmed = note.trim();
  return {
    orderId,
    subject: `Not picked up · ${shortOrderNumber(orderId)}`,
    message: trimmed ? `${reason}\n\n${trimmed}` : reason,
  };
}
