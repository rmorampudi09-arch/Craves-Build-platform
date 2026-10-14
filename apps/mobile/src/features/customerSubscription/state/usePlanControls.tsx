import React from 'react';
import {Alert} from 'react-native';
import {toAppApiError} from '../../../core/http/apiError';
import type {CustomerSubscription, DayCredit, DayCreditChoice} from '../api/customerSubscriptionApi';
import {DateSheet} from '../components/MealPlanUi';
import {
  dayCreditCard,
  formatMealPlanDate,
  pauseInfo,
  pendingDayCredits,
  resumeDateFor,
  skippableDates,
  todayIso,
} from '../domain/mealPlanPresentation';
import {
  usePlanPolicyQuery,
  usePlanScheduleQuery,
  useSubscriptionActions,
  useSubscriptionOccurrencesQuery,
} from '../query/mealPlanQueries';

export const CANCEL_COPY =
  'Cancelling stops upcoming meals right away. Meals already being prepared will still be delivered.';

/**
 * Pause, resume, skip and cancel for one plan, with their confirmations. My Meal Plan and the My plans
 * cards share it so the rules live in one place. The caller renders `skipSheet`.
 */
export function usePlanControls(subscriptionId: string, subscription: CustomerSubscription | undefined) {
  const planId = subscription?.planId ?? null;
  const scheduleItems = usePlanScheduleQuery(planId).data?.items ?? [];
  const policy = usePlanPolicyQuery(planId).data;
  const occurrencesQuery = useSubscriptionOccurrencesQuery(subscriptionId);
  const occurrences = occurrencesQuery.data ?? [];
  const actions = useSubscriptionActions(subscriptionId);
  const [skipDates, setSkipDates] = React.useState<string[] | null>(null);

  const now = new Date();
  const today = todayIso(now);
  const status = subscription?.status;
  // Controls follow the plan policy; with no policy loaded nothing is offered (no 403 taps).
  const canPause = status === 'ACTIVE' && policy?.customerPauseEnabled === true;
  const canResume = status === 'PAUSED' && policy?.customerResumeEnabled === true;
  const canSkip = status === 'ACTIVE' && policy?.customerSkipEnabled === true;
  const canCancel =
    (status === 'ACTIVE' || status === 'PAUSED') && policy?.customerCancelEnabled === true;

  const confirm = (
    title: string,
    message: string,
    actionLabel: string,
    action: () => Promise<void>,
    destructive = false,
  ) =>
    Alert.alert(title, message, [
      {text: 'Not now', style: 'cancel'},
      {
        text: actionLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => {
          action().catch(error => Alert.alert('Plan not updated', toAppApiError(error).message));
        },
      },
    ]);

  const earliestTime = scheduleItems.map(item => item.serviceTime).sort()[0] ?? null;
  const resumeDate = resumeDateFor(now, policy?.resumeLeadMinutes ?? 0, earliestTime);
  const pausing = pauseInfo(subscription ?? {status: ''}, resumeDate, today);
  const pause = () => confirm('Pause your plan?', pausing.pauseMessage, 'Pause plan', actions.pause);
  const choose = (creditId: string, choice: DayCreditChoice) => {
    actions
      .chooseDayCredit(creditId, choice)
      .catch(error => Alert.alert('Choice not saved', toAppApiError(error).message));
  };
  // A choice can't be changed later, so the card's buttons ask first (the prompt after Resume is already a question).
  const confirmChoice = (credit: DayCredit, choice: DayCreditChoice) => {
    const card = dayCreditCard(credit, today);
    const label = choice === 'REFUND' ? card.refundLabel : card.extendLabel;
    Alert.alert(
      `${label}?`,
      choice === 'REFUND'
        ? "The refund goes back to the UPI or card you paid with. You can't change this later."
        : "Your plan runs longer by these days. You can't change this later.",
      [
        {text: 'Not now', style: 'cancel'},
        {text: label, onPress: () => choose(credit.id, choice)},
      ],
    );
  };
  const offerChoice = (credit: DayCredit) => {
    const card = dayCreditCard(credit, today);
    Alert.alert(card.title, card.note ?? '', [
      {text: 'Later', style: 'cancel'},
      {text: card.refundLabel, onPress: () => choose(credit.id, 'REFUND')},
      ...(card.extendAvailable ? [{text: card.extendLabel, onPress: () => choose(credit.id, 'EXTEND')}] : []),
    ]);
  };
  const resume = () => {
    const offered = new Set(pendingDayCredits(subscription ?? {}).map(credit => credit.id));
    confirm(
      'Resume your plan?',
      `Meals start again from ${formatMealPlanDate(resumeDate, 'long')}.`,
      'Resume plan',
      () =>
        actions.resume(resumeDate).then(resumed => {
          // The paused paid days come back as a new choice when refunds are on.
          const paused = pendingDayCredits(resumed).find(credit => credit.kind === 'PAUSE' && !offered.has(credit.id));
          if (paused) {
            offerChoice(paused);
          }
        }),
    );
  };
  const openSkip = () => {
    // shortcut: the sheet lists only the next 7 skippable dates; add scrolling if plans need more.
    const dates = skippableDates(occurrences, now, policy?.skipCutoffMinutes ?? 0).slice(0, 7);
    if (dates.length === 0) {
      Alert.alert('No meals to skip', 'There are no upcoming meals you can skip right now.');
      return;
    }
    setSkipDates(dates);
  };
  const skip = (date: string) => {
    setSkipDates(null);
    confirm(
      'Skip this meal?',
      `You won't get meals on ${formatMealPlanDate(date, 'long')}.`,
      'Skip meal',
      () => actions.skip(date),
    );
  };
  const cancel = () => confirm('Cancel your plan?', CANCEL_COPY, 'Cancel plan', actions.cancel, true);

  return {
    now,
    today,
    scheduleItems,
    occurrences,
    occurrencesQuery,
    actions,
    canPause,
    canResume,
    canSkip,
    canCancel,
    pausing,
    pause,
    resume,
    openSkip,
    cancel,
    confirmChoice,
    skipSheet: skipDates ? (
      <DateSheet title="Skip a meal" dates={skipDates} onSelect={skip} onClose={() => setSkipDates(null)} />
    ) : null,
  };
}
