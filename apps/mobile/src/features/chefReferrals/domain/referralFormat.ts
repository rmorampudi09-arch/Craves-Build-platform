import {formatRupeesExact} from '../../chefShell/domain/chefFormat';

/** The referral service sends money as paise in a string; the chef sees `₹420` or `₹49.50`. */
export const referralRupees = (paise: string | number): string => formatRupeesExact(Number(paise) / 100);
