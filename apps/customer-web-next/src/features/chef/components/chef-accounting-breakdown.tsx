import { formatInr } from "@/features/chef/components/chef-ui";
import type { ChefAccounting } from "@/features/admin/finance/lib/finance-contract";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    failed: "The breakdown couldn’t load. Refresh your balance before checking a payment.",
    grossFood: "Food earnings before deductions",
    serviceFee: "Craves service fee (incl. GST on the fee)",
    withholding: "Tax withheld",
    net: "Net earnings",
    other: "Other adjustments",
    payments: "Payments made to you (after bank returns)",
    outstanding: "Outstanding balance",
    covers: "Covers all {count} paid and delivered orders recorded so far.",
    feeNote: "The service fee total includes {fee} fee and {gst} GST on the fee, not an extra deduction. GST on customers’ food is separate. Part of the outstanding balance may be held or reserved, so it isn’t always available to withdraw.",
    legacy: "{count} older earnings entered by hand are kept separately and aren’t added to your withdrawable balance automatically.",
  },
  te: {
    failed: "వివరాలు లోడ్ కాలేదు. ఏదైనా చెల్లింపు చూసే ముందు మీ బ్యాలెన్స్ మళ్లీ చూడండి.",
    grossFood: "కోతలకు ముందు ఆహారం మీద సంపాదన",
    serviceFee: "Craves సర్వీస్ ఫీజు (ఫీజుపై GST తో కలిపి)",
    withholding: "పన్ను కోత",
    net: "నికర సంపాదన",
    other: "ఇతర సర్దుబాట్లు",
    payments: "మీకు చెల్లించినది (బ్యాంక్ తిరిగి పంపినవి తీసేసి)",
    outstanding: "మీకు రావలసిన బ్యాలెన్స్",
    covers: "ఇప్పటివరకు నమోదైన {count} చెల్లించిన, డెలివరీ అయిన ఆర్డర్లు అన్నీ ఇందులో ఉన్నాయి.",
    feeNote: "సర్వీస్ ఫీజు మొత్తంలో {fee} ఫీజు, ఫీజుపై {gst} GST ఉన్నాయి — ఇది అదనపు కోత కాదు. కస్టమర్ల ఆహారంపై GST వేరు. మీకు రావలసిన బ్యాలెన్స్‌లో కొంత భాగం ఆపి ఉంచవచ్చు లేదా పక్కన పెట్టవచ్చు, కాబట్టి అదంతా ఎప్పుడూ తీసుకోవడానికి అందుబాటులో ఉండదు.",
    legacy: "చేతితో నమోదు చేసిన {count} పాత సంపాదనలు వేరుగా ఉంచారు; అవి మీరు తీసుకోగల బ్యాలెన్స్‌లో ఆటోమేటిక్‌గా కలవవు.",
  },
  kn: {
    failed: "ವಿವರ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಯಾವುದೇ ಪಾವತಿ ನೋಡುವ ಮೊದಲು ನಿಮ್ಮ ಬ್ಯಾಲೆನ್ಸ್ ಮತ್ತೆ ನೋಡಿ.",
    grossFood: "ಕಡಿತಕ್ಕೂ ಮೊದಲು ಆಹಾರದಿಂದ ಗಳಿಕೆ",
    serviceFee: "Craves ಸೇವಾ ಶುಲ್ಕ (ಶುಲ್ಕದ ಮೇಲಿನ GST ಸೇರಿ)",
    withholding: "ತೆರಿಗೆ ಕಡಿತ",
    net: "ನಿವ್ವಳ ಗಳಿಕೆ",
    other: "ಇತರ ಹೊಂದಾಣಿಕೆಗಳು",
    payments: "ನಿಮಗೆ ಮಾಡಿದ ಪಾವತಿಗಳು (ಬ್ಯಾಂಕ್ ಹಿಂದಿರುಗಿಸಿದ್ದನ್ನು ಕಳೆದು)",
    outstanding: "ನಿಮಗೆ ಬರಬೇಕಾದ ಬಾಕಿ",
    covers: "ಇಲ್ಲಿಯವರೆಗೆ ದಾಖಲಾದ ಎಲ್ಲಾ {count} ಪಾವತಿಸಿದ, ಡೆಲಿವರಿ ಆದ ಆರ್ಡರ್‌ಗಳು ಇದರಲ್ಲಿವೆ.",
    feeNote: "ಸೇವಾ ಶುಲ್ಕದ ಒಟ್ಟು ಮೊತ್ತದಲ್ಲಿ {fee} ಶುಲ್ಕ ಮತ್ತು ಶುಲ್ಕದ ಮೇಲಿನ {gst} GST ಸೇರಿದೆ — ಇದು ಹೆಚ್ಚುವರಿ ಕಡಿತವಲ್ಲ. ಗ್ರಾಹಕರ ಆಹಾರದ ಮೇಲಿನ GST ಬೇರೆ. ಬರಬೇಕಾದ ಬಾಕಿಯ ಸ್ವಲ್ಪ ಭಾಗವನ್ನು ತಡೆಹಿಡಿಯಬಹುದು ಅಥವಾ ಮೀಸಲಿಡಬಹುದು, ಹಾಗಾಗಿ ಅದೆಲ್ಲವೂ ಯಾವಾಗಲೂ ತೆಗೆದುಕೊಳ್ಳಲು ಸಿಗುವುದಿಲ್ಲ.",
    legacy: "ಕೈಯಿಂದ ದಾಖಲಿಸಿದ {count} ಹಳೆಯ ಗಳಿಕೆಗಳನ್ನು ಬೇರೆಯಾಗಿ ಇಡಲಾಗಿದೆ; ಅವು ನೀವು ತೆಗೆದುಕೊಳ್ಳಬಹುದಾದ ಬ್ಯಾಲೆನ್ಸ್‌ಗೆ ತಾನಾಗಿ ಸೇರುವುದಿಲ್ಲ.",
  },
});

export function ChefAccountingBreakdown({accounting}: {accounting: ChefAccounting | undefined}) {
  const text = useText(TEXT);
  if (!accounting) return <p role="status" className="text-[0.875rem] text-[#6B6B6B]">{text.failed}</p>;
  const rows: [string, string][] = [
    [text.grossFood, accounting.grossFood],
    [text.serviceFee, accounting.totalServiceFee],
    [text.withholding, accounting.withholding],
    [text.net, accounting.originalNetEarnings],
    [text.other, accounting.otherLedgerMovements],
    [text.payments, accounting.recordedPayments],
    [text.outstanding, accounting.outstanding],
  ];
  return <div className="grid gap-3">
    <p className="text-[0.875rem] leading-6 text-[#6B6B6B]">{format(text.covers, {count: accounting.recordedOrders})}</p>
    <dl className="divide-y divide-[#E3E6EA] text-[0.875rem]">{rows.map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-2.5"><dt className="text-[#1A1A1A]">{label}</dt><dd className="chef-amount font-semibold">{formatInr(amount)}</dd></div>)}</dl>
    <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">{format(text.feeNote, {fee: formatInr(accounting.feeBeforeGst), gst: formatInr(accounting.feeGst)})}</p>
    {accounting.legacyRecords > 0 && <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">{format(text.legacy, {count: accounting.legacyRecords})}</p>}
  </div>;
}
