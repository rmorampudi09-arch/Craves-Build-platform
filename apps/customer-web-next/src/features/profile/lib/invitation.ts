// Same invitation as the app: a generic message with no reward or tracking attribution.
export const INVITATION_MESSAGE = "Craves — homemade food from trusted home chefs.";
export const INVITATION_LINK = "https://craves.in";
export const INVITATION_TEXT = `${INVITATION_MESSAGE}\n${INVITATION_LINK}`;

/** wa.me opens the WhatsApp app on phones and WhatsApp Web on computers. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** "?&body=" is read by both Android ("?body=") and iOS ("&body=") messaging apps. */
export function smsShareUrl(text: string): string {
  return `sms:?&body=${encodeURIComponent(text)}`;
}
