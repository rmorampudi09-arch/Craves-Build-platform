import type {SupportCaseStatus, SupportCaseSummary} from '../../customerSupport/api/customerSupportCasesApi';
import type {StatusChipTone} from '../../chefShell/components/ui';
import {formatRelativeTime, shortCaseNumber} from '../../chefShell/domain/chefFormat';

/** `#01042`: the last 5 characters of the long case number, in the same short style as order numbers. */
export const ticketNumber = (supportCase: SupportCaseSummary) => shortCaseNumber(supportCase.caseNumber);

const STATUS: Record<SupportCaseStatus, {label: string; tone: StatusChipTone}> = {
  OPEN: {label: 'Open', tone: 'info'},
  IN_PROGRESS: {label: 'In progress', tone: 'cooking'},
  WAITING_FOR_REQUESTER: {label: 'Reply needed', tone: 'new'},
  RESOLVED: {label: 'Solved', tone: 'ready'},
  CLOSED: {label: 'Closed', tone: 'done'},
};

export const ticketStatus = (status: SupportCaseStatus) => STATUS[status];

/** A closed ticket takes no more replies; a solved one still does. */
export const isTicketClosed = (status: SupportCaseStatus) => status === 'CLOSED';

/** `Craves replied · 2 hr ago`, `You wrote · Yesterday`, `Closed · 2 Oct`. */
export function ticketSubtitle(supportCase: SupportCaseSummary, now: Date): string {
  if (supportCase.status === 'CLOSED' || supportCase.status === 'RESOLVED') {
    const label = supportCase.status === 'CLOSED' ? 'Closed' : 'Solved';
    return `${label} · ${formatRelativeTime(supportCase.closedAt ?? supportCase.resolvedAt ?? supportCase.updatedAt, now)}`;
  }
  const {lastSupportMessageAt: support, lastRequesterMessageAt: chef} = supportCase;
  if (support && (!chef || Date.parse(support) >= Date.parse(chef))) {
    return `Craves replied · ${formatRelativeTime(support, now)}`;
  }
  return `You wrote · ${formatRelativeTime(chef ?? supportCase.createdAt, now)}`;
}
