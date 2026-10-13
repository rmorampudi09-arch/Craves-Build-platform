import {formatRupees} from '../../chefShell/domain/chefFormat';

/** The referral service sends money as paise in a string. Referral credits are small and exact, so every amount shows paise: `₹450.00`. */
export const referralRupees = (paise: string | number): string => formatRupees(Number(paise) / 100, {paise: true});
