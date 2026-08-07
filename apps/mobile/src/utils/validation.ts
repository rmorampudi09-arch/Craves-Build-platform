import {z} from 'zod';

export const phoneSchema = z
  .string()
  .transform(v => v.replace(/\D/g, ''))
  .refine(v => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number.');

export const emailSchema = z.string().trim().email('Enter a valid email address.');

export const emailLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export const otpSchema = z
  .string()
  .regex(/^\d{6}$/, 'Enter the 6-digit verification code.');

export const forgotPasswordSchema = z.object({email: emailSchema});

const customerProfileNameSchema = (label: 'First' | 'Last') =>
  z
    .string()
    .trim()
    .min(1, `${label} name is required.`)
    .max(100, `${label} name must be 100 characters or fewer.`);

const customerProfileEmailSchema = z
  .string()
  .trim()
  .max(255, 'Email must be 255 characters or fewer.')
  .email('Enter a valid email address.');

export const customerRegistrationSchema = z.object({
  firstName: customerProfileNameSchema('First'),
  lastName: customerProfileNameSchema('Last'),
  email: z.union([z.literal(''), customerProfileEmailSchema]),
});

const chefRequiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const chefOptionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

export const chefRegistrationSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .max(255, 'Email must be 255 characters or fewer.')
    .email('Enter a valid email address.'),
  firstName: chefRequiredText('First name', 100),
  lastName: chefRequiredText('Last name', 100),
  addressLine1: chefRequiredText('Address', 255),
  addressLine2: chefOptionalText('Address line 2', 255),
  landmark: chefOptionalText('Landmark', 255),
  city: chefRequiredText('City', 120),
  state: chefRequiredText('State', 120),
  postalCode: chefOptionalText('Postal code', 20),
});

export function toIndianE164(phoneNumber: string): string {
  return `+91${phoneNumber.replace(/\D/g, '')}`;
}
