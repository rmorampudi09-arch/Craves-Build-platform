/** The Craves support line, approved by the business. Dialed as-is; shown with spaces. */
export const CRAVES_SUPPORT_PHONE = '+918367366787';
export const CRAVES_SUPPORT_PHONE_LABEL = '+91 83673 66787';
export const CRAVES_SUPPORT_EMAIL = 'support@craves.in';

export type SupportQuestionDestination = 'orders' | 'chat' | 'mealPlanHelp' | 'addresses';

/** Help & support "Common questions": each opens the place in the app that answers it. */
export const SUPPORT_COMMON_QUESTIONS: readonly {
  label: string;
  destination: SupportQuestionDestination;
}[] = [
  {label: 'Where is my order?', destination: 'orders'},
  {label: 'Refunds and cancellations', destination: 'chat'},
  {label: 'Meal plans: pause, skip and cancel', destination: 'mealPlanHelp'},
  {label: 'Payments and failed payments', destination: 'chat'},
  {label: 'Changing my delivery address', destination: 'addresses'},
];
