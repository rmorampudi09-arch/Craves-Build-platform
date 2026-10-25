import type { Language } from "@/shared/i18n/language";

/**
 * Page titles, their one-line descriptions and "back to" labels, keyed by the English words the pages
 * pass to ChefPageHeader. Pages stay server components and keep plain English props; the header shows
 * the chef's language. chef-page-text.test.ts checks every page's words are here.
 */
const PAGE_TEXT: Record<string, { te: string; kn: string }> = {
  // Tabs and sections, used as "back to" labels.
  Home: { te: "హోమ్", kn: "ಹೋಮ್" },
  Orders: { te: "ఆర్డర్లు", kn: "ಆರ್ಡರ್‌ಗಳು" },
  Menu: { te: "మెనూ", kn: "ಮೆನು" },
  Money: { te: "డబ్బు", kn: "ಹಣ" },
  More: { te: "మరిన్ని", kn: "ಇನ್ನಷ್ಟು" },
  "Meal plans": { te: "మీల్ ప్లాన్‌లు", kn: "ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳು" },
  // Titles.
  "Bank account": { te: "బ్యాంక్ ఖాతా", kn: "ಬ್ಯಾಂಕ್ ಖಾತೆ" },
  "Daily limits": { te: "రోజువారీ పరిమితి", kn: "ದಿನದ ಮಿತಿ" },
  "Documents & verification": { te: "పత్రాలు, ధృవీకరణ", kn: "ದಾಖಲೆಗಳು, ಪರಿಶೀಲನೆ" },
  "Balance & payouts": { te: "మీ డబ్బు, చెల్లింపులు", kn: "ನಿಮ್ಮ ಹಣ, ಪಾವತಿಗಳು" },
  "Payout history": { te: "చెల్లింపుల చరిత్ర", kn: "ಪಾವತಿ ಇತಿಹಾಸ" },
  Statements: { te: "స్టేట్‌మెంట్‌లు (PDF)", kn: "ಸ್ಟೇಟ್‌ಮೆಂಟ್‌ಗಳು (PDF)" },
  "Money from each order": { te: "ప్రతి ఆర్డర్ డబ్బు", kn: "ಪ್ರತಿ ಆರ್ಡರ್‌ನ ಹಣ" },
  Notifications: { te: "నోటిఫికేషన్లు", kn: "ಅಧಿಸೂಚನೆಗಳು" },
  "Can customers find you?": { te: "కస్టమర్లకు మీ వంటగది కనిపిస్తుందా?", kn: "ಗ್ರಾಹಕರಿಗೆ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಕಾಣುತ್ತದೆಯೇ?" },
  "Opening hours": { te: "వంటగది సమయాలు", kn: "ಅಡುಗೆಮನೆ ಸಮಯ" },
  "Order settings": { te: "ఆర్డర్ సెట్టింగ్స్", kn: "ಆರ್ಡರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು" },
  "Refer a chef": { te: "చెఫ్‌ను పరిచయం చేయండి", kn: "ಚೆಫ್ ಅವರನ್ನು ಪರಿಚಯಿಸಿ" },
  "Login & security": { te: "లాగిన్, భద్రత", kn: "ಲಾಗಿನ್, ಭದ್ರತೆ" },
  "Help & support": { te: "సహాయం", kn: "ಸಹಾಯ" },
  "Chat with us": { te: "మాతో చాట్ చేయండి", kn: "ನಮ್ಮೊಂದಿಗೆ ಚಾಟ್ ಮಾಡಿ" },
  // Descriptions.
  "Your kitchen, settings and account.": { te: "మీ వంటగది, సెట్టింగ్స్, ఖాతా.", kn: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ, ಸೆಟ್ಟಿಂಗ್‌ಗಳು, ಖಾತೆ." },
  "How many plates you can cook": { te: "మీరు ఎన్ని ప్లేట్లు వండగలరు", kn: "ನೀವು ಎಷ್ಟು ಪ್ಲೇಟ್ ಅಡುಗೆ ಮಾಡಬಹುದು" },
  "Money sent to your bank.": { te: "మీ బ్యాంక్‌కు పంపిన డబ్బు.", kn: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸಿದ ಹಣ." },
  "Take out your money, and see how it is worked out.": { te: "మీ డబ్బు తీసుకోండి, అది ఎలా లెక్కించారో చూడండి.", kn: "ನಿಮ್ಮ ಹಣ ತೆಗೆದುಕೊಳ್ಳಿ, ಅದನ್ನು ಹೇಗೆ ಲೆಕ್ಕ ಹಾಕಲಾಗಿದೆ ನೋಡಿ." },
  "PDF records of your orders and money, to keep or share.": { te: "మీ ఆర్డర్లు, డబ్బు వివరాల PDF — దాచుకోవడానికి లేదా పంపడానికి.", kn: "ನಿಮ್ಮ ಆರ್ಡರ್ ಮತ್ತು ಹಣದ PDF — ಇಟ್ಟುಕೊಳ್ಳಲು ಅಥವಾ ಕಳುಹಿಸಲು." },
  "What Craves paid for each delivered order.": { te: "డెలివరీ అయిన ప్రతి ఆర్డర్‌కు Craves ఇచ్చిన డబ్బు.", kn: "ಡೆಲಿವರಿ ಆದ ಪ್ರತಿ ಆರ್ಡರ್‌ಗೆ Craves ನೀಡಿದ ಹಣ." },
  "When customers can order from you.": { te: "కస్టమర్లు మీ దగ్గర ఎప్పుడు ఆర్డర్ చేయవచ్చు.", kn: "ಗ್ರಾಹಕರು ನಿಮ್ಮಲ್ಲಿ ಯಾವಾಗ ಆರ್ಡರ್ ಮಾಡಬಹುದು." },
  "How your phone tells you about orders, and how you answer them.": { te: "ఆర్డర్ వచ్చినప్పుడు ఫోన్ ఎలా చెప్పాలి, మీరు ఎలా జవాబు ఇవ్వాలి.", kn: "ಆರ್ಡರ್ ಬಂದಾಗ ಫೋನ್ ಹೇಗೆ ತಿಳಿಸಬೇಕು, ನೀವು ಹೇಗೆ ಉತ್ತರಿಸಬೇಕು." },
  "Invite home chefs and earn from their sales.": { te: "ఇంటి చెఫ్‌లను ఆహ్వానించండి, వారి అమ్మకాలపై సంపాదించండి.", kn: "ಮನೆಯ ಚೆಫ್‌ಗಳನ್ನು ಆಹ್ವಾನಿಸಿ, ಅವರ ಮಾರಾಟದಿಂದ ಗಳಿಸಿ." },
  "What you earned and what you can take out.": { te: "మీరు సంపాదించింది, మీరు తీసుకోగల డబ్బు.", kn: "ನೀವು ಗಳಿಸಿದ್ದು ಮತ್ತು ನೀವು ತೆಗೆದುಕೊಳ್ಳಬಹುದಾದ ಹಣ." },
  "Ask about your kitchen, orders or money. A person from Craves helps with anything the assistant can’t.": {
    te: "మీ వంటగది, ఆర్డర్లు లేదా డబ్బు గురించి అడగండి. అసిస్టెంట్ చేయలేనిది Craves వ్యక్తి సహాయం చేస్తారు.",
    kn: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ, ಆರ್ಡರ್ ಅಥವಾ ಹಣದ ಬಗ್ಗೆ ಕೇಳಿ. ಅಸಿಸ್ಟೆಂಟ್ ಮಾಡಲಾಗದ್ದನ್ನು Craves ವ್ಯಕ್ತಿ ಸಹಾಯ ಮಾಡುತ್ತಾರೆ.",
  },
  // With the order number filled in afterwards ({number}).
  "About order #{number}.": { te: "ఆర్డర్ #{number} గురించి.", kn: "ಆರ್ಡರ್ #{number} ಬಗ್ಗೆ." },
  "Order #{number}": { te: "ఆర్డర్ #{number}", kn: "ಆರ್ಡರ್ #{number}" },
};

/** The chef's words for an English page title, description or label; English when none is listed. */
export function pageText(english: string, language: Language): string {
  return language === "en" ? english : (PAGE_TEXT[english]?.[language] ?? english);
}

export function hasPageText(english: string): boolean {
  return english in PAGE_TEXT;
}
