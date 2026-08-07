import {z} from 'zod';
export const phoneSchema=z.string().transform(v=>v.replace(/\D/g,'')).refine(v=>/^[6-9]\d{9}$/.test(v),'Enter a valid 10-digit Indian mobile number.');
export const emailSchema=z.string().trim().email('Enter a valid email address.');
export const emailLoginSchema=z.object({email:emailSchema,password:z.string().min(8,'Password must be at least 8 characters.')});
export const otpSchema=z.string().regex(/^\d{6}$/,'Enter the 6-digit verification code.');
export const forgotPasswordSchema=z.object({email:emailSchema});
export const customerRegistrationSchema=z.object({firstName:z.string().trim().min(1,'First name is required.').max(80),lastName:z.string().trim().min(1,'Last name is required.').max(80),email:z.union([z.literal(''),emailSchema])});
export const chefRegistrationSchema=z.object({email:emailSchema,firstName:z.string().trim().min(1,'First name is required.').max(80),lastName:z.string().trim().min(1,'Last name is required.').max(80),addressLine1:z.string().trim().min(3,'Address is required.').max(180),addressLine2:z.string().trim().max(180).optional(),landmark:z.string().trim().max(120).optional(),city:z.string().trim().min(2,'City is required.').max(80),state:z.string().trim().min(2,'State is required.').max(80),postalCode:z.union([z.literal(''),z.string().trim().regex(/^\d{6}$/,'Enter a valid 6-digit pincode.')])});
export function toIndianE164(phoneNumber:string):string{return `+91${phoneNumber.replace(/\D/g,'')}`}
