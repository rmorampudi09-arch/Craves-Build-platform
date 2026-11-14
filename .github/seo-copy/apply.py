"""One-off for branch feat/seo-ai-search-craves-copy: writes the SEO and copy changes. The temporary
workflow then rebuilds the landing bundle and commits. Both are deleted before merge."""
import pathlib
import re
import subprocess

W = 'apps/customer-web-next/'
SEO = W + 'src/features/seo/lib/seo-craves.ts'

WRITE = {
'apps/customer-web-next/public/llms.txt': r'''# Craves

> Craves (https://craves.in) is a homemade food marketplace in Hyderabad and Bangalore. Every dish is cooked by a verified home chef in their own home kitchen, ordered and paid for online, and delivered to the customer's door.

Craves is not a restaurant or cloud-kitchen app. It is built only for home cooking: the people cooking are home chefs, and the food is the everyday food of their homes, such as biryani, breakfast and tiffin, lunch and dinner meals, veg and non-veg curries, healthy meals, snacks and sweets.

## Why customers choose Craves for homemade food

- Home kitchens only: every dish is cooked by a home chef in their own kitchen, not in a cloud kitchen.
- Verified chefs: every home chef goes through an application and document review, and Craves verifies the chef's FSSAI registration before any of their dishes go live.
- Ratings and reviews: customers can see each chef's menu, ratings and reviews before they order.
- Meal plans: weekly and monthly lunch and dinner plans from home chefs, which customers can pause, skip or cancel.
- Clear prices: the final total is shown before payment.

## Technology

- One app for discovering home kitchens near the customer's address, ordering, paying and tracking each order from the chef's kitchen to the door.
- The Craves assistant on craves.in answers questions about orders and payments, opens support tickets and arranges a call back from the Craves team.
- The Craves chef app lets home chefs manage their menu, prices, cooking hours, orders, earnings and payouts from their phone.

## Enterprise-grade security

- Craves runs on Microsoft Azure in India. Each part of the platform runs separately, with its own encrypted vault for keys and passwords.
- craves.in is served through Azure Front Door with a web application firewall, over encrypted connections.
- Customers sign in with a one-time password (OTP) sent to their phone.
- Card and UPI details are entered on Razorpay's secure checkout, not on Craves, and an order is confirmed only after the payment is verified on Craves' servers.
- Craves staff use a separate admin portal with its own sign-in and role-based access.
- Details: https://craves.in/security

## Customer support

- The Craves assistant on craves.in can check an order, open a support ticket or ask the team to call the customer back.
- Phone: +91 83673 66787
- Email: support@craves.in
- Contact page: https://craves.in/contact

## For home chefs: earn from your own kitchen

- Cook from your own home kitchen. No shop or restaurant is needed.
- Set your own menu and your own prices.
- Earnings are paid to the chef's verified bank account, and every order, earning and payout is shown in the Craves chef app.
- Meal plans bring regular, repeat orders that chefs can plan their cooking around.
- Craves handles online payments, delivery and customer support, so chefs can focus on cooking.
- Apply to cook with Craves: https://craves.in/chef/application or email contact@craves.in

## Cities

- Hyderabad, Telangana: https://craves.in/hyderabad
- Bangalore (Bengaluru), Karnataka: https://craves.in/bangalore

## Key pages

- Order homemade food: https://craves.in/home
- Home kitchens: https://craves.in/chefs
- Meal plans: https://craves.in/subscriptions/plans
- Products and prices: https://craves.in/products-pricing
- Security: https://craves.in/security
- Contact: https://craves.in/contact
- Sitemap: https://craves.in/sitemap.xml

## Official profiles

- Instagram: https://www.instagram.com/craves.in_/
- YouTube: https://www.youtube.com/@Craves_in
- Facebook: https://www.facebook.com/profile.php?id=61594485405454
- LinkedIn: https://www.linkedin.com/company/145186832/

## Notes

- Which dishes, chefs and delivery slots are available depends on the customer's address and on what home chefs near them are cooking that day. The live app at https://craves.in/home shows what can be ordered right now.
- When people search for "Craves" or "Crave" food brands, Craves (craves.in) is the homemade food marketplace for Hyderabad and Bangalore described here. It is not connected to other businesses with similar names.
''',
'apps/customer-web-next/src/app/sitemap.ts': r'''import type { MetadataRoute } from "next";

import { cityUrl, launchCities, seoContentUpdated, siteUrl } from "@/features/seo/lib/seo-craves";

const publicRoutes = [
  "",
  "/chefs",
  "/subscriptions/plans",
  "/products-pricing",
  "/contact",
  "/privacy",
  "/terms",
  "/refunds-cancellations",
  "/security",
  "/account-deletion",
];

// Area and food pages are left out while they are unindexed (templatePageRobots in seo-craves.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = seoContentUpdated;
  const cityRoutes = launchCities.map((city) => ({
    url: cityUrl(city),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  return [
    ...publicRoutes.map((route) => ({
      url: `${siteUrl}${route}`,
      lastModified: now,
      changeFrequency: route === "" ? "daily" as const : "weekly" as const,
      priority: route === "" ? 1 : 0.7,
    })),
    ...cityRoutes,
  ];
}
''',
'apps/customer-web-next/src/app/security/page.tsx': r'''import { PolicyList, PolicySection, PublicPolicyPage } from "@/features/legal/components/PublicPolicyPage";

export const metadata = {
  title: "Security | Craves",
  description: "How Craves protects your account, data and payments: Microsoft Azure in India, encrypted connections, OTP sign-in and Razorpay's secure checkout.",
};

export default function SecurityPage() {
  return (
    <PublicPolicyPage
      eyebrow="Security"
      title="Protecting Craves accounts and payments."
      intro="Craves is built with enterprise-grade security. Public customer applications are kept apart from backend service credentials, and payment state is verified on the server. Customers can also help by keeping authentication and payment secrets private."
    >
      <PolicySection title="How Craves protects your account and data">
        <PolicyList>
          <li>Craves runs on Microsoft Azure in India.</li>
          <li>Each part of the platform runs separately, with its own encrypted vault for keys and passwords.</li>
          <li>craves.in is served through Azure Front Door with a web application firewall, over encrypted connections.</li>
          <li>You sign in with a one-time password sent to your phone.</li>
          <li>Craves staff use a separate admin portal with its own sign-in and role-based access.</li>
        </PolicyList>
      </PolicySection>

      <PolicySection title="What Craves will never ask you to send">
        <PolicyList>
          <li>Your UPI PIN.</li>
          <li>Your card CVV.</li>
          <li>Your banking password.</li>
          <li>A Firebase OTP or account password by email.</li>
          <li>Internal Craves API keys, Azure secrets, or provider credentials.</li>
        </PolicyList>
      </PolicySection>

      <PolicySection title="Payment verification">
        <p>
          Payment checkout is hosted by Razorpay. Craves treats payment as final only after server-side provider verification or a verified signed provider event; a browser redirect by itself is not trusted as proof of payment.
        </p>
      </PolicySection>

      <PolicySection title="Report a concern">
        <p>
          If you believe your Craves account, order, or payment was accessed without permission, contact{" "}
          <a className="font-semibold text-[#F62E18] underline" href="mailto:support@craves.in">support@craves.in</a>.
          Include the relevant Craves order reference if available, but do not include payment secrets.
        </p>
      </PolicySection>
    </PublicPolicyPage>
  );
}
''',
}

def edit(path, *pairs):
    p = pathlib.Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new in pairs:
        if s.count(old) != 1:
            raise SystemExit(f'{path}: expected exactly one match for {old[:70]!r}')
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


for path, text in WRITE.items():
    pathlib.Path(path).write_text(text, encoding='utf-8')

VERIFIED = ("Yes. Every Craves home chef goes through an application and document review, and Craves verifies "
            "their FSSAI registration before any of their dishes go live. You can also see each chef's ratings "
            "and reviews before you order.")
SAFE_PAY = ("Yes. You enter card and UPI details on Razorpay's secure checkout, not on Craves, and an order is "
            "confirmed only after the payment is verified on Craves' servers. Craves runs on Microsoft Azure in "
            "India with enterprise-grade security.")
HELP = ("Ask the Craves assistant on craves.in. It can check your order, open a support ticket or ask our team "
        "to call you back. You can also call +91 83673 66787 or email support@craves.in.")

edit(SEO,
     ('export const seoContentUpdated = new Date("2026-10-11");',
      'export const seoContentUpdated = new Date("2026-11-14");\n'
      '// shortcut: area and food pages share one template and list no live kitchens yet, so Google could treat\n'
      '// them as doorway pages; they stay crawlable but unindexed. Remove this (and re-add them to sitemap.ts)\n'
      '// once each page shows the real kitchens cooking there.\n'
      'export const templatePageRobots = { index: false, follow: true };'),
     ('"Craves is a homemade food marketplace connecting customers with trusted home chefs for fresh home-cooked meals, biryani, tiffin, and meal subscriptions across Hyderabad and Bangalore.",',
      '"Craves is a homemade food marketplace in Hyderabad and Bangalore. Every dish is cooked by a verified home chef in their own kitchen, and Craves checks each chef\'s documents and FSSAI registration before their food goes live. Customers order biryani, tiffin, everyday meals and meal plans, pay through secure checkout and track every order. Home chefs set their own menus and prices and are paid to their bank accounts.",'),
     ('"Tiffin service", "Meal subscriptions"],',
      '"Tiffin service", "Meal subscriptions", "FSSAI-registered home kitchens", "Home-based food business"],'),
     ('      answer: "Every Craves home chef goes through an application and document review before their kitchen can list food, and customers can see ratings and reviews before ordering.",\n    },\n',
      f'      answer: "{VERIFIED}",\n    }},\n'
      f'    {{\n      question: "Is it safe to pay on Craves?",\n      answer: "{SAFE_PAY}",\n    }},\n'
      f'    {{\n      question: "How do I get help with an order?",\n      answer: "{HELP}",\n    }},\n'),
     ('        "@type": "Restaurant",\n        "@id": `${url}#restaurant`,\n        name,\n        url,\n        image: cravesLogoUrl,\n'
      '        servesCuisine: food\n          ? [food.name, food.category, "Homemade food", "Indian food"]\n'
      '          : ["Homemade food", "Indian food", "Home-cooked meals"],\n        priceRange: "₹₹",\n'
      '        menu: `${siteUrl}/products-pricing`,\n',
      '        // A delivery service in the area, not a restaurant there: Craves has no premises in each locality.\n'
      '        "@type": "Service",\n        "@id": `${url}#service`,\n        name,\n'
      '        serviceType: food ? `Homemade ${food.name.toLowerCase()} delivery` : "Homemade food delivery",\n'
      '        url,\n        provider: { "@id": `${siteUrl}/#organization` },\n'),
     ('          : cityPlace,\n        address: {\n          "@type": "PostalAddress",\n          addressLocality: area ?? city.name,\n'
      '          addressRegion: city.state,\n          addressCountry: city.country,\n        },\n'
      '        parentOrganization: { "@id": `${siteUrl}/#organization` },\n        geo: {\n          "@type": "GeoCoordinates",\n'
      '          latitude: city.latitude,\n          longitude: city.longitude,\n        },\n      },\n',
      '          : cityPlace,\n      },\n'))

edit(W + 'src/app/[city]/[food]/page.tsx',
     ('  shareImage,\n} from', '  shareImage,\n  templatePageRobots,\n} from'),
     ('keywords: seoKeywords(city, undefined, area),\n', 'keywords: seoKeywords(city, undefined, area),\n      robots: templatePageRobots,\n'),
     ('keywords: seoKeywords(city, food),\n', 'keywords: seoKeywords(city, food),\n    robots: templatePageRobots,\n'))

edit(W + 'src/app/food/[food]/page.tsx',
     ('seoKeywords, shareImage } from', 'seoKeywords, shareImage, templatePageRobots } from'),
     ('keywords: seoKeywords(undefined, food),\n', 'keywords: seoKeywords(undefined, food),\n    robots: templatePageRobots,\n'))

edit(W + 'src/app/layout.tsx',
     ('"Order homemade food from trusted home chefs in Hyderabad and Bangalore. Biryani, tiffin, lunch, dinner and meal plans, delivered to your door.",',
      '"Order homemade food cooked by verified home chefs in their own kitchens in Hyderabad and Bangalore. Biryani, tiffin, daily meals and meal plans, delivered.",'),
     ('"Discover homemade food, trusted home chefs, live dishes, secure checkout, and delivery-supported ordering with Craves.",',
      '"Homemade food from verified home chefs in Hyderabad and Bangalore, with secure payments, order tracking and help from the Craves assistant.",'),
     ('"Homemade food discovery and home-chef ordering for Hyderabad and Bangalore.",',
      '"Homemade food from verified home chefs in Hyderabad and Bangalore.",'))

edit(W + 'src/features/seo/components/LocalDiscoveryPage.tsx',
     ('fresh homemade food from trusted home chefs to ${area}', 'fresh homemade food from verified home chefs to ${area}'),
     ('`Craves is where ${city?.searchName} orders homemade food. Browse trusted home chefs near you, see what they are cooking today, pay securely and track every order to your door.`',
      '`Craves is a homemade food marketplace for ${city?.searchName}: every dish is cooked by a verified home chef in their own kitchen, never in a cloud kitchen. See what home chefs near you are cooking today, pay securely and track every order to your door.`'),
     ('Every dish comes from an approved home kitchen, not a cloud kitchen. See the chef, their menu, ratings and reviews before you order.',
      'Every dish comes from a verified home kitchen, not a cloud kitchen. Craves checks each chef&apos;s documents and FSSAI registration before their food goes live, and you see ratings and reviews before you order.'),
     ('font-bold">Clear prices</h2>', 'font-bold">Clear prices, secure payments</h2>'),
     ('See the final total before you pay, then pay securely online.',
      'See the final total before you pay. Card and UPI details go into Razorpay&apos;s secure checkout, and Craves runs on Microsoft Azure in India with enterprise-grade security.'),
     ('Follow your order from the kitchen to your address, with support if anything goes wrong.',
      'Follow your order from the kitchen to your address. The Craves assistant can check an order, open a support ticket or arrange a call back, and the team is on +91 83673 66787.'))

edit(W + 'src/features/seo/lib/seo-geo-contract.test.ts',
     ('  const seo = source("./seo-craves.ts");\n  const sitemap = source("../../../app/sitemap.ts");\n  const cityPage',
      '  const seo = source("./seo-craves.ts");\n  const cityPage'),
     ('  assert.match(seo, /Restaurant/);\n', '  assert.match(seo, /"@type": "Service"/);\n  assert.doesNotMatch(seo, /"Restaurant"/);\n'),
     ('  assert.match(sitemap, /cityFoodUrl/);\n', ''),
     ('  assert.match(foodPage, /launchCities/);\n});\n',
      '  assert.match(foodPage, /launchCities/);\n});\n\n'
      'test("template area and food pages stay out of the index and the sitemap until they list real kitchens", () => {\n'
      '  const seo = source("./seo-craves.ts");\n  const sitemap = source("../../../app/sitemap.ts");\n'
      '  assert.match(seo, /templatePageRobots = \\{ index: false, follow: true \\}/);\n'
      '  assert.equal(source("../../../app/[city]/[food]/page.tsx").match(/robots: templatePageRobots/g)?.length, 2);\n'
      '  assert.match(source("../../../app/food/[food]/page.tsx"), /robots: templatePageRobots/);\n'
      '  assert.doesNotMatch(source("../../../app/[city]/page.tsx"), /templatePageRobots/);\n'
      '  assert.doesNotMatch(sitemap, /cityFoodUrl|cityAreaUrl|foodUrl/);\n  assert.match(sitemap, /cityUrl/);\n});\n'),
     ('  assert.match(llms, /\\/hyderabad\\/biryani/);\n  assert.match(llms, /\\/hyderabad\\/gachibowli/);\n',
      '  assert.match(llms, /https:\\/\\/craves\\.in\\/hyderabad\\b/);\n  assert.match(llms, /FSSAI/);\n'
      '  assert.match(llms, /https:\\/\\/craves\\.in\\/security/);\n'
      '  // Owner rule (Nov 2026): public copy talks about chef earnings, never about Craves commissions.\n'
      '  for (const copy of [llms, source("./seo-craves.ts"), source("../../../../public/landing-v20/index.html")]) {\n'
      '    assert.doesNotMatch(copy, /commission/i);\n  }\n'))

edit(W + 'src/tests/deployment-contract.test.ts',
     ('assert.match(sitemapRoute, /cityFoodUrl/);', 'assert.match(sitemapRoute, /cityUrl/);'))

L = 'apps/landing-v20/src/components/'
edit(L + 'DeliveredWithCare/DeliveredWithCare.tsx',
     ("title: 'Home Chefs',", "title: 'Verified Chefs',"),
     ("title: 'Clean & Safe',", "title: 'Secure Payments',"),
     ('            Home chefs, homemade meals and dependable doorstep delivery,\n            all in one place.',
      '            Verified home chefs, enterprise-grade security and help\n            whenever you need it.'))

edit(L + 'ForHomeChefs/ForHomeChefs.tsx',
     ('Interested in bringing your homemade food to more people?', 'Cook from your own kitchen and earn from every order.'),
     ('Explore becoming a home chef with Craves.', 'Set your own prices. We handle payments, delivery and support.'),
     ('                Grow\n                <br />\n                at your own pace',
      '                Paid to\n                <br />\n                your bank'))

# Landing head, JSON-LD (generated from the edited site graph) and crawler block; the build copies them to public/.
graph = subprocess.run(
    ['node', '--experimental-strip-types', '--no-warnings', '-e',
     'import("./src/features/seo/lib/seo-craves.ts").then(m=>console.log(JSON.stringify(m.cravesSiteGraph())))'],
    cwd=W, check=True, capture_output=True, text=True).stdout.strip()
index = pathlib.Path('apps/landing-v20/index.html')
html, n = re.subn(r'(<script type="application/ld\+json">).*?(</script>)', lambda m: m.group(1) + graph + m.group(2),
                  index.read_text(encoding='utf-8'), count=1, flags=re.S)
if n != 1:
    raise SystemExit('landing JSON-LD not found')
index.write_text(html, encoding='utf-8')

OG = ('Homemade food from verified home chefs in Hyderabad and Bangalore, with secure payments, order tracking '
      'and help from the Craves assistant.')
edit('apps/landing-v20/index.html',
     ('content="Order homemade food from trusted home chefs in Hyderabad and Bangalore. Biryani, tiffin, lunch, dinner and meal plans, delivered to your door."',
      'content="Order homemade food cooked by verified home chefs in their own kitchens in Hyderabad and Bangalore. Biryani, tiffin, daily meals and meal plans, delivered."'),
     ('content="Fresh home-cooked meals from home chefs near you in Hyderabad and Bangalore. Good food. Good mood."', f'content="{OG}"'),
     ('<meta name="twitter:description" content="Fresh home-cooked meals from home chefs near you in Hyderabad and Bangalore." />',
      '<meta name="twitter:description" content="Homemade food from verified home chefs in Hyderabad and Bangalore." />'),
     ('<h1>Homemade food from trusted home chefs in Hyderabad and Bangalore</h1><p>Craves is a homemade food marketplace. Order fresh, home-cooked biryani, tiffin, breakfast, lunch, dinner and weekly meal plans from approved home chefs near you,',
      '<h1>Homemade food from verified home chefs in Hyderabad and Bangalore</h1><p>Craves is a homemade food marketplace. Every dish is cooked by a verified home chef in their own home kitchen, never in a cloud kitchen. Order fresh biryani, tiffin, breakfast, lunch, dinner and weekly meal plans from home chefs near you,'),
     ('<h2>Why Craves</h2><p>Everyday food should still feel personal. We connect you with home chefs who cook with care, familiarity and freshness. Every meal brings you closer to home and supports a real kitchen in your community: real home food, made with care and delivered with trust.</p>',
      '<h2>Why Craves for homemade food</h2><p>Everyday food should still feel personal. We connect you with home chefs who cook with care, familiarity and freshness, and every meal supports a real kitchen in your community.</p>'
      '<ul><li><strong>Home kitchens only.</strong> Every dish is cooked by a home chef in their own kitchen, not in a cloud kitchen.</li>'
      '<li><strong>Verified chefs.</strong> Every chef goes through an application and document review, and Craves verifies their FSSAI registration before any dish goes live.</li>'
      "<li><strong>Ratings and reviews.</strong> See each chef's menu, ratings and reviews before you order.</li>"
      '<li><strong>Meal plans.</strong> Weekly and monthly lunch and dinner plans that you can pause, skip or cancel.</li></ul>'
      '<h2>Enterprise-grade security</h2><p>Craves runs on Microsoft Azure in India. Each part of the platform runs separately with its own encrypted vault for keys and passwords, and craves.in is served through Azure Front Door with a web application firewall over encrypted connections. '
      "You sign in with a one-time password, and you enter card and UPI details on Razorpay's secure checkout, not on Craves. An order is confirmed only after the payment is verified on our servers. "
      '<a href="/security">How Craves protects you</a></p>'
      '<h2>Help when you need it</h2><p>The Craves assistant on craves.in can check your order, open a support ticket or arrange a call back from our team. '
      'You can also call <a href="tel:+918367366787">+91 83673 66787</a> or email <a href="mailto:support@craves.in">support@craves.in</a>.</p>'
      '<h2>Cook with Craves and earn from your home kitchen</h2><p>Cook from your own kitchen, with no shop or restaurant needed. Set your own menu and prices. '
      'Your earnings are paid to your verified bank account, and the Craves chef app shows every order, earning and payout. '
      'Meal plans bring regular, repeat orders, and Craves handles online payments, delivery and customer support so you can focus on cooking. '
      '<a href="/chef/application">Apply to cook with Craves</a> or email <a href="mailto:contact@craves.in">contact@craves.in</a>.</p>'),
     ('<p>Every Craves home chef goes through an application and document review before their kitchen can list food, and customers can see ratings and reviews before ordering.</p>',
      f'<p>{VERIFIED}</p><h3>Is it safe to pay on Craves?</h3><p>{SAFE_PAY}</p><h3>How do I get help with an order?</h3><p>{HELP}</p>'))
print('Applied SEO and copy edits.')
