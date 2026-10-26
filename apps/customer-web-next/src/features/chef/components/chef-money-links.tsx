"use client";
import Link from "next/link";
import { ChevronRight, FileText, History, Landmark, ReceiptText } from "lucide-react";
import { useChefBank } from "@/features/chef/components/chef-bank-onboarding-panel";
import { bankLine } from "@/features/chef/lib/chef-payout-presentation";
import { messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    label: "Payouts, orders, statements and bank account",
    payouts: "Payout history", payoutsMeta: "Money sent to your bank",
    orders: "Money from each order", ordersMeta: "What Craves paid for each delivered order",
    statements: "Statements", statementsMeta: "PDF records to keep or share",
    bank: "Bank account", bankMeta: "Where Craves sends your money", bankNone: "Not added yet",
  },
  te: {
    label: "చెల్లింపులు, ఆర్డర్లు, స్టేట్‌మెంట్‌లు, బ్యాంక్ ఖాతా",
    payouts: "చెల్లింపుల చరిత్ర", payoutsMeta: "మీ బ్యాంక్‌కు పంపిన డబ్బు",
    orders: "ప్రతి ఆర్డర్ డబ్బు", ordersMeta: "డెలివరీ అయిన ప్రతి ఆర్డర్‌కు Craves ఇచ్చిన డబ్బు",
    statements: "స్టేట్‌మెంట్‌లు (PDF)", statementsMeta: "దాచుకోవడానికి లేదా పంపడానికి PDF",
    bank: "బ్యాంక్ ఖాతా", bankMeta: "Craves మీ డబ్బు పంపే ఖాతా", bankNone: "ఇంకా జోడించలేదు",
  },
  kn: {
    label: "ಪಾವತಿಗಳು, ಆರ್ಡರ್‌ಗಳು, ಸ್ಟೇಟ್‌ಮೆಂಟ್‌ಗಳು, ಬ್ಯಾಂಕ್ ಖಾತೆ",
    payouts: "ಪಾವತಿ ಇತಿಹಾಸ", payoutsMeta: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸಿದ ಹಣ",
    orders: "ಪ್ರತಿ ಆರ್ಡರ್‌ನ ಹಣ", ordersMeta: "ಡೆಲಿವರಿ ಆದ ಪ್ರತಿ ಆರ್ಡರ್‌ಗೆ Craves ನೀಡಿದ ಹಣ",
    statements: "ಸ್ಟೇಟ್‌ಮೆಂಟ್‌ಗಳು (PDF)", statementsMeta: "ಇಟ್ಟುಕೊಳ್ಳಲು ಅಥವಾ ಕಳುಹಿಸಲು PDF",
    bank: "ಬ್ಯಾಂಕ್ ಖಾತೆ", bankMeta: "Craves ನಿಮ್ಮ ಹಣ ಕಳುಹಿಸುವ ಖಾತೆ", bankNone: "ಇನ್ನೂ ಸೇರಿಸಿಲ್ಲ",
  },
});

/** The Money tab's other pages; the bank row says whether an account is there yet. */
export function ChefMoneyLinks() {
  const text = useText(TEXT);
  const bank = useChefBank();
  // "HDFC Bank ••1234", as the app names the account.
  const bankMeta = bank?.state === "NOT_SUBMITTED" ? text.bankNone : (bankLine(bank) ?? text.bankMeta);
  const rows = [
    { href: "/chef/earnings/payouts", icon: History, title: text.payouts, meta: text.payoutsMeta },
    { href: "/chef/earnings/orders", icon: ReceiptText, title: text.orders, meta: text.ordersMeta },
    { href: "/chef/statements", icon: FileText, title: text.statements, meta: text.statementsMeta },
    { href: "/chef/bank", icon: Landmark, title: text.bank, meta: bankMeta },
  ];
  return (
    <nav aria-label={text.label} className="chef-section chef-list">
      {rows.map(({ href, icon: Icon, title, meta }) => (
        <Link key={href} href={href} className="chef-row">
          <span className="chef-row-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <span className="chef-row-main">
            <span className="chef-row-title block">{title}</span>
            <span className="chef-row-meta block">{meta}</span>
          </span>
          <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
