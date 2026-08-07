import {emailSchema, otpSchema, phoneSchema, toIndianE164} from './validation';
describe('auth validation',()=>{
  it('accepts Indian mobile numbers and normalizes to E.164',()=>{expect(phoneSchema.safeParse('9876543210').success).toBe(true);expect(toIndianE164('98765 43210')).toBe('+919876543210');});
  it('rejects invalid OTP and email',()=>{expect(otpSchema.safeParse('12345').success).toBe(false);expect(emailSchema.safeParse('not-an-email').success).toBe(false);});
});
