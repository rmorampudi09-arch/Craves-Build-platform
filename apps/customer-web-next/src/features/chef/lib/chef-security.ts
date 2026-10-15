/** `+91 ••••• 43210`: the country code and the last five digits, like the app. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : "+91";
  return `${country} ••••• ${digits.slice(-5)}`;
}

/** `c•••@gmail.com`: the first letter and the domain, like the app. */
export function maskEmail(email: string): string {
  const [name, domain = ""] = email.split("@");
  return `${name.charAt(0)}${"•".repeat(Math.min(Math.max(name.length - 1, 1), 6))}@${domain}`;
}
