# Week 1 pack: 19 to 25 Oct 2026

Everything you need for the first week of the loop, ready to use. Read [README.md](README.md) first for setup. Claims come only from the claims ledger in [brand.md](brand.md). The step prompts are in [prompts.md](prompts.md).

**Goal for the week:** home chefs in Hyderabad who submit a Craves chef application. We post three reels (plus one language test), and we count CHEF comments, DM replies and CRV references for each one.

Contents:

1. Baseline LEARN from the real account
2. Profile fix
3. Three reels, fully written
4. TALK pack: automation, DMs, first-hour reply bank
5. Week 1 checklist with dates

---

## 1. Baseline LEARN (data as of 14 Oct 2026)

Pulled through Windsor.ai from @craves.in_ (account id 17841414797291891).

### The account

| What | Number |
|---|---|
| Followers | 56 |
| Accounts followed | 1 |
| Posts ever | 2 (one carousel, one single image) |
| Reels ever | 0 |
| Follower city, age and gender | Not available. Meta withholds these below 100 followers. |

### The two posts

Both posts recruit home chefs. Neither is a customer or food post.

| | Carousel | Image |
|---|---|---|
| Went live (IST) | about 00:26, Mon 12 Oct | about 01:22, Tue 13 Oct |
| Language | Tenglish | Telugu script |
| First line | "Mee inti vantalu andariki nachutunnaya?" (Does everyone love your home cooking?) | "ఇంట్లో బాగా వంట చేస్తారా? మీ వంటలు అమ్మి ఇంటి నుంచే డబ్బులు సంపాదించొచ్చు." (Do you cook well at home? You can earn money from home by selling your food.) |
| Call to action | None explicit ("Home Chef ga mee journey start cheyyandi") | "Register at craves.in, link in bio" |
| Views | **189** | 128 |
| Reach | 71 | 48 |
| Likes (organic / total) | 10 / 37 | 9 / 17 |
| Comments | 0 | 2 (one spam comment, one Craves reply to it) |
| Saves | 0 | 0 |
| Shares | 0 | 0 |
| Follows | 1 | 0 |
| Profile visits | 16 | 9 |
| Link | [DeXWk9Gj1CE](https://www.instagram.com/p/DeXWk9Gj1CE/) | [DeaBR3wT3iq](https://www.instagram.com/p/DeaBR3wT3iq/) |

"Total" likes include boosted and cross-posted likes. "Organic" likes do not. results.csv has no likes column, so if you note likes in `notes`, use organic likes every time.

We name the posts by their UTC date (the 11 Oct carousel, the 12 Oct image), as results.csv does in its notes. In IST, and in the `date` column of results.csv, they went live on 12 and 13 Oct.

### Account level, 11 to 13 Oct

| Day | Reach | Views | Reach from non-followers | Reach from followers | Accounts engaged | `profile_links_taps` |
|---|---|---|---|---|---|---|
| 11 Oct | 1,900 | 1,478 | 1,900 | 2 | 12 | 0 |
| 12 Oct | 12,304 | 1,881 | 12,264 | 36 | 46 | 0 |
| 13 Oct | 6,843 | 72 | 6,843 | 7 | 11 | 0 |

From 14 Sep (the start of the pull) to 9 Oct, reach and views were 0 every day. 10 Oct had 1 view. Daily reach is daily unique reach, so the three days cannot be added together. `profile_links_taps` was 0 every day. It is not a count of bio-link taps.

### What this tells us

- **Tenglish beat Telugu script, once.** 189 vs 128 views, 71 vs 48 reach, 16 vs 9 profile visits, 1 vs 0 follows. This is n=1 per language, and the formats differ (carousel vs single image), so it is a hint, not proof.
- **Nobody saved or shared anything.** 0 saves and 0 shares on both posts. Nothing yet was worth keeping or sending to another cook.
- **Nobody raised a hand.** No comment shows chef sign-up intent. The only real comment is spam.
- **We cannot see bio-link taps.** Instagram insights do not show them, and `profile_links_taps` was 0 every day. So we don't know if the image post's "link in bio" worked. The bio itself talks to customers ("Order at craves.in") while customers cannot order yet.
- **Most reach did not come from the posts.** Account reach hit 12,304 on 12 Oct, but the two posts reached 71 and 48 on their own. Almost all reach was from non-followers. Total likes are also well above organic likes. The owner confirmed both posts were boosted. So the 11 to 13 Oct account reach was paid. The organic baseline is the posts' own reach (71 and 48) and organic likes. Boost spend and paid results can't be read until the Meta Ads connector is added in Windsor.ai.
- **Both posts went out after midnight IST.** We have no data on when home cooks scroll. After midnight seems unlikely, so we test 11:00 to 12:30 IST and 20:00 to 21:30 IST this week. These are hypotheses, not facts.
- **No reel data yet.** There is no watch time or skip rate baseline. Week 1 creates it.
- **Applications.** The only count on record is 9 chef applications and 6 approved, from the Admin Explorer live check on 14 Sep 2026. [CONFIRM WITH OWNER: submitted chef applications 12 to 18 Oct 2026, from Admin Explorer (chefs dataset) or the chef reviews list]
- **Both captions use income framing** ("Mee cooking talent ni income ga marchukondi", "డబ్బులు సంపాదించొచ్చు"). The claims ledger in brand.md no longer allows income framing (N1). Do not copy these lines. Section 2 edits them out of the live posts.

### Three starting rules (n=2, so treat them as starting points)

1. **Write in Tenglish by default, and open with a question about their cooking.** From the 11 Oct carousel "Mee inti vantalu andariki nachutunnaya?" (189 views) vs the 12 Oct Telugu-script image (128 views). n=1. Keep testing Telugu script and Hindi/Dakhini, and log the language in results.csv.
2. **Ask for one word in the comments, not a tap on the bio link.** From the 12 Oct image post: its "link in bio" call to action got 0 chef-intent comments, and bio-link taps cannot be counted, while a CHEF comment can. Every reel this week ends with "Comment CHEF", which we can count, and which Business Suite may answer automatically (we test this on Wed 21 Oct).
3. **Make each reel worth saving or sending to another cook.** From both posts: 0 saves and 0 shares. Adam Mosseri (Instagram) said in January 2025 that the top ranking signals are watch time, likes and sends, and that sends matter slightly more for reaching non-followers. So: one useful idea per reel, a checklist people keep (Reel 3), and a "send this to" hook option every time.

**Week 1 hook, rewritten with these rules:** Reel 1 opens with "Mee biryani kosam andaru wait chestara?" (Does everyone wait for your biryani?). Tenglish, a question about their cooking, and it ends with Comment CHEF.

---

## 2. Profile fix (do it before Monday 19 Oct)

Edit by hand in the Instagram app. Windsor.ai cannot change the bio.

**Bio, English (recommended, 139 characters):**

> Hyderabad home chefs: cook at home, Craves brings the orders. Be one of the first kitchens before customers open. Comment CHEF on any post.

**Bio, Tenglish (alternative, 128 characters):**

> Hyderabad home chefs, mee vantalu Craves lo! Customers open ayye mundu join avvandi. Ye post ki aina CHEF ani comment cheyyandi.
>
> Gloss: Hyderabad home chefs, your cooking on Craves! Join before customers open. Comment CHEF on any post.

"Any post", not "a reel": the automation covers all posts, and a new Trial Reel goes to non-followers first, so it may not be on the profile grid until it is shared to followers.

**Link:** `https://craves.in/chef/application`

- It is the same page as the DM link. It works signed in or signed out (signed-out visitors sign in with a phone OTP, then come back to the application).
- If the app asks for a link title, use "Apply as a home chef".
- Never use `craves.in/#for-chefs`. Signed-in visitors get redirected to `/home` and never see the chef section.

**Pinned posts:**

- Pin Reel 3 (the checklist) and Reel 1 only after each one is shared to followers from its trial. A Trial Reel goes to non-followers first, so you may not be able to pin it before then. Check on Thu and Sat.
- Reel 3 goes first: a profile visitor gets the most useful thing first. Reel 1 explains what Craves is for a home chef.

**Old captions: edit out the income lines (before Monday).** Both live captions break N1 ("Mee cooking talent ni income ga marchukondi", "మీ వంటలు అమ్మి ఇంటి నుంచే డబ్బులు సంపాదించొచ్చు"), and the new bio sends profile visitors to them. Do not delete the posts. Their numbers are already in results.csv, so editing a caption loses no baseline data. Edit both in the Instagram app, then tell the owner what you changed.

11 Oct carousel, new caption (only lines from the old caption, plus SAFE lines):

> 🏡❤️ Mee inti vantalu andariki nachutunnaya? 🍲😋
>
> 👩‍🍳 Home Chef ga mee journey start cheyyandi!
>
> Customers: launching soon. Chefs: joining first. Comment CHEF for the link.
>
> #CRAVES #HomeChefs #IntiVantalu #ManaVantalu #HomemadeFood

Gloss: Does everyone love your home cooking? Start your journey as a Home Chef! Customers: launching soon. Chefs: joining first. Comment CHEF for the link.

12 Oct image, new caption (the income sentence and the "you can sell through Craves" sentence removed, nothing new in Telugu script):

> ఇంట్లో బాగా వంట చేస్తారా?
>
> Craves లో ఇప్పుడు chef registrations మొదలయ్యాయి. Register చేసుకోవడానికి craves.in కి వెళ్ళండి. Link bio లో ఉంది.
>
> Customers: launching soon. Chefs: joining first.
>
> #homecooking #foodstagram #telugufood #hyderabadfoodie #homemadefood

Gloss: Do you cook well at home? Chef registrations have started on Craves. To register, go to craves.in. The link is in the bio. Customers: launching soon. Chefs: joining first.

**Old spam reply:** on the 12 Oct image post, Craves answered a promo account ("please feel free to use the content. I will DM you the post."). Hide the spam comment. [CONFIRM WITH OWNER: delete our reply too, since it gives a promo account permission to reuse our content?]

---

## 3. Three reels, fully written

Every reel follows the rules in [project-instructions.md](project-instructions.md): hook in the first 1.5 seconds, on-screen hook text of 8 words or fewer, one idea, 30 to 50 seconds, ends with "Comment CHEF", real home-kitchen footage, all text inside the safe zone (centre of the frame, away from the top and bottom edges).

**Before recording anything:** a native Telugu speaker reads every Tenglish script aloud and fixes anything that sounds wrong. A native Hindi/Dakhini speaker does the same for the Reel 3 variant. The English gloss lines are for the team only. They are not spoken.

**Footage rules:**

- Use a real home kitchen (a team member's own) with their written consent, kept on file (brand.md section 11). Get the same written consent from each voiceover speaker. Hands-only shots are fine.
- No real chef's name, face or kitchen without written consent.
- No house number, gate, street sign, building name or anything that gives away a home address.
- No real ID documents, real phone numbers or real FSSAI numbers on screen. Use blank cards and placeholders.

**Post every reel as a Trial Reel from the Instagram app** (choose the Trial option when you share). Instagram shows it to non-followers first, and metrics arrive after about 24 hours. If it does well, it can be shared to followers.

---

### Reel 1: "Kitchens first. Customers soon."

**Idea (one):** Craves is launching soon for customers, and home chefs are joining first. Set up your kitchen before customers open and be one of the first home chefs in your area. One supporting line only: your menu, your prices. "Orders ring on your phone", "Craves arranges pickup" and "earnings settled daily or weekly, your choice" (S18) each get their own reel in week 2.

**Why it should work:** It borrows the question hook of our best post (11 Oct carousel) but makes it more specific (one dish, people waiting for it). Hook type: `question`. The honest launch line sits right next to the brand line, so nobody who leaves early thinks orders are coming now (ASCI 1.4). It also gives a true reason to act now.

**Post:** Wed 21 Oct, 11:30 IST, Trial Reel. Language: Tenglish.

**Hook options (on-screen text), ranked:**

| Rank | Hook type | On-screen text | Gloss |
|---|---|---|---|
| **1 (pick)** | question | Mee biryani kosam andaru wait chestara? | Does everyone wait for your biryani? |
| 2 | send-to-a-friend | Send this to the best cook you know | |
| 3 | curiosity-gap | Kitchens first. Customers soon. | |
| 4 | result-first | Cook at home. Craves brings the orders. | |
| 5 | question | Is Hyderabad's best food cooked at home? | |

Hook 4 is our brand line, but on its own it implies orders now, so use it only with "Customers: launching soon" on screen at the same time. Hook 2 is the one to test in week 2 if Reel 1 gets views but no shares.

**Voiceover (Tenglish, about 39 s):**

| Time | Spoken (Tenglish) | Gloss (English, not spoken) |
|---|---|---|
| 0:00-0:02 | Mee biryani kosam andaru wait chestara? | Does everyone wait for your biryani? |
| 0:02-0:05 | Aa ruchi mee family varake enduku? | Why keep that taste just for your family? |
| 0:05-0:09 | Cook at home. Craves brings the orders. | Cook at home. Craves brings the orders. |
| 0:09-0:15 | Okka vishayam honest ga cheptanu: customers kosam Craves inka open avvaledu. Launching soon. | One honest thing: Craves isn't open for customers yet. It's launching soon. |
| 0:15-0:22 | Chefs mundu join avutunnaru. Ippude join aithe, mee area lo first home chefs lo okaru avvochu. | Chefs are joining first. Join now and you can be one of the first home chefs in your area. |
| 0:22-0:28 | Customers vachche mundu mee kitchen set up cheskondi. Mee menu, mee prices. | Set up your kitchen before customers come. Your menu, your prices. |
| 0:28-0:35 | Mee phone number tho apply cheyyandi. Craves team mee application, documents review chestundi. | Apply with your phone number. The Craves team reviews your application and documents. |
| 0:35-0:39 | Link kavalante, kinda CHEF ani comment cheyyandi. | Want the link? Comment CHEF below. |

Read it aloud with a timer. If it runs past 45 s, cut line 2 first.

**Shot list (one line per beat):**

From 0:05 to the end, keep one persistent line on screen inside the centre safe zone: "Customers: launching soon. Chefs: joining first." It is small text, so use white on Contrast Red #C92716, or dark #1A1A1A on cream #F1F3F5.

| Time | On screen | Text on screen |
|---|---|---|
| 0:00-0:02 | Close-up: a hand lifts the lid off a pot of biryani, steam rises. | Mee biryani kosam andaru wait chestara? |
| 0:02-0:05 | Hands serve a plate at a home table, faces out of frame. | Just for family? |
| 0:05-0:09 | Wider shot of the same home kitchen counter, cooking under way. Persistent line starts. | Cook at home. Craves brings the orders. |
| 0:09-0:15 | Text card: Flame Red #F62E18, large bold white text. | Customers: launching soon. Chefs: joining first. |
| 0:15-0:22 | Hands wipe the counter and set out spice tins. Calm, morning light. | Be one of the first kitchens in your area |
| 0:22-0:28 | Hands write dish names on a paper menu. No prices visible. | Set up before customers open. Your menu, your prices. |
| 0:28-0:35 | Phone screen recording: craves.in/chef/application, then the phone sign-in. Use a team test number and blur it. Stop before the address and document steps. | Apply with your phone. Reviewed by the Craves team. |
| 0:35-0:39 | End card: Flame Red, Craves logo, large bold white text. | Comment CHEF |

**Caption:**

> Hyderabad home chefs: customers kosam Craves launching soon, chefs mundu join avutunnaru. Comment CHEF for the link.
>
> #HyderabadHomeChef #HomeChefsOfHyderabad #HyderabadFood #HyderabadFoodie #HomeChefs #HomemadeFood #IntiVantalu #ManaVantalu #HomeKitchen #Craves

Gloss: Hyderabad home chefs: Craves is launching soon for customers, and chefs are joining first. Comment CHEF for the link.

**Claims used (all from the SAFE list in brand.md):** S1 "Cook at home. Craves brings the orders." (always shown with S11); S11 "launching soon for customers", chefs joining first; S12 "be one of the first home chefs in your area", "set up your kitchen before customers open"; S2 "Your menu, your prices"; S6 apply with your phone number (OTP); S5 applications reviewed by the Craves team with document review.

**Language variant to test:** Tenglish now. In week 2, re-cut the same footage with Telugu-script on-screen text and caption, and log it as `Telugu script`.

---

### Reel 2: FSSAI myth-buster

**Idea:** Most explainers online still say FSSAI registration stops at Rs 12 lakh. FSSAI itself says that from 1 April 2026 registration covers turnover up to Rs 1.5 crore, and registrations no longer need renewal. Then the FoSCoS steps in plain words, and the reassurance that you can start your Craves application and save it while you get FSSAI.

**Why it should work:** We expect FSSAI to be the hardest step (no data yet), because it is the only item a cook may not already have. A specific, surprising number makes a strong hook. Hook type: `result-first` (a rule change, not an income result). The steps make it worth saving.

**Post:** Thu 22 Oct, 20:30 IST, Trial Reel. Language: Tenglish voice, English on-screen numbers.

**Build it with Claude Code and the motion-reel skill** (animated explainer, see "Build notes" below).

**Hook options (on-screen text), ranked:**

| Rank | Hook type | On-screen text | Gloss |
|---|---|---|---|
| **1 (pick)** | result-first | FSSAI registration turnover limit: now Rs 1.5 crore | |
| 2 | contrarian | FSSAI registration: no more renewals | |
| 3 | send-to-a-friend | Send this to a friend scared of FSSAI | |
| 4 | curiosity-gap | FSSAI rules changed on 1 April 2026 | |
| 5 | POV | POV: FSSAI stopped scaring you | |

Keep the word "turnover" in the hook. Without it, a big "Rs 1.5 crore" on a Craves reel could be read as an earnings figure (ASCI 1.4).

Hook 2 needs the "annual fee still applies" line very early, or it misleads. Hook 3 is the week-2 test if Reel 2 gets saves but few shares.

**Voiceover (Tenglish, about 45 s):**

| Time | Spoken (Tenglish) | Gloss (English, not spoken) |
|---|---|---|
| 0:00-0:03 | FSSAI registration turnover limit ippudu Rs 1.5 crore. | The FSSAI registration turnover limit is now Rs 1.5 crore. |
| 0:03-0:09 | FSSAI says: 1 April 2026 nunchi, turnover Rs 1.5 crore varaku unte registration saripotundi. Licence avasaram ledu. | FSSAI says: from 1 April 2026, if your turnover is up to Rs 1.5 crore, a registration is enough. You don't need a licence. |
| 0:09-0:12 | Inthaku mundu ee limit Rs 12 lakh. | Before this, the limit was Rs 12 lakh. |
| 0:12-0:17 | Inko vishayam: registration ki ika renewal ledu. Kani annual fee matram kattali. | One more thing: registration no longer needs renewal. But you still pay the annual fee. |
| 0:17-0:30 | Ela apply cheyyali? foscos.fssai.gov.in lo user ID create cheyyandi. Registration select chesi, mee details fill cheyyandi. Documents upload chesi, declaration accept chesi, portal chupinche fee pay cheyyandi. 17-digit application reference vastundi. | How do you apply? Create a user ID on foscos.fssai.gov.in. Choose registration and fill in your details. Upload your documents, accept the declaration and pay the fee the portal shows. You get a 17-digit application reference. |
| 0:30-0:33 | Registration ayyaka mee 14-digit FSSAI number vastundi. | Once you are registered, you get your 14-digit FSSAI number. |
| 0:33-0:38 | Craves application submit cheyyadaniki aa number kavali. Adi vachche lopu application start chesi save cheyyochu. | You need that number to submit your Craves application. Until it comes, you can start your application and save it. |
| 0:38-0:41 | FSSAI lo help kavalante, application lo 'Request a call from Craves' undi. | If you need help with FSSAI, the application has "Request a call from Craves". |
| 0:41-0:45 | Ee steps save cheskondi. Craves link kosam CHEF ani comment cheyyandi. | Save these steps. For the Craves link, comment CHEF. |

Never say a fee amount. The old Rs 100 figure is from before the reform. The portal shows the current fee.

The FoSCoS steps (0:17 to 0:30) come from a 2022 NIFTEM guide, written before the reform (brand.md section 10). On Mon 19 Oct, open foscos.fssai.gov.in, check the steps, and rewrite 0:17 to 0:30 if they differ. If nobody can check, replace 0:17 to 0:30 with: "Steps anni foscos.fssai.gov.in lo unnayi." (All the steps are on foscos.fssai.gov.in.)

**Shot list (one line per beat):**

| Time | On screen | Text on screen |
|---|---|---|
| 0:00-0:03 | Flame Red card. "Rs 12 lakh" appears, is struck through, "Rs 1.5 crore" grows in its place. | FSSAI registration turnover limit: now Rs 1.5 crore |
| 0:03-0:09 | Two stacked cards over real kitchen footage: "Up to Rs 1.5 crore turnover: registration" and "Above that: licence". Source line directly under the cards, inside the centre safe zone, large enough to read: white on #C92716, or dark text on #F1F3F5. | From 1 Apr 2026. Source: FSSAI press release, 13 Mar 2026 |
| 0:09-0:12 | The "Rs 12 lakh" card slides away. | Before: Rs 12 lakh |
| 0:12-0:17 | A calendar with "renew" crossed out, then a small coin icon labelled "annual fee". | No renewal. Annual fee still applies. |
| 0:17-0:30 | Five numbered steps build one by one over real kitchen footage (hands, a phone on the counter). | 1 Create a user ID on foscos.fssai.gov.in, 2 Choose registration, fill your details, 3 Upload documents, 4 Accept the declaration, 5 Pay the fee the portal shows |
| 0:30-0:33 | A 14-box strip fills with X marks (never a real number). | Your 14-digit FSSAI number |
| 0:33-0:38 | Phone mock-up of the Craves application with a "save" moment, over real kitchen footage from Reel 1. | Start your Craves application. Save it. Finish later. |
| 0:38-0:41 | The same phone mock-up, the "Request a call from Craves" option highlighted. | Stuck on FSSAI? Request a call from Craves |
| 0:41-0:45 | End card: Flame Red, Craves logo, large bold white text. | Comment CHEF |

**Build notes (Claude Code, motion-reel skill):** open Claude Code in this repo and ask:

> BUILD Reel 2 from docs/marketing/chef-acquisition-growth-agent/week-1.md with the motion-reel skill. 9:16, about 45 seconds, synced to the recorded Tenglish voiceover. Colours, fonts and logo from brand.md: Flame Red #F62E18 with large bold white text only, #C92716 behind any small white text, Plus Jakarta Sans for headings, Inter for body, logo apps/customer-web-next/public/brand/craves-logo-20260805.svg. Keep all text inside the centre safe zone. Show "Source: FSSAI press release, 13 Mar 2026" directly under the rule cards, inside the safe zone. Put the real kitchen footage behind the cards for most beats, with the text animated over it. Render the file only. Do not post.

Record the voiceover first (a real voice, read by a native Telugu speaker) so the animation syncs to it. Put real kitchen footage (hands, a phone on the counter) behind the cards for most beats, with the text animated over it: Instagram has said reels that are mostly text are shown less (Mosseri, May 2023), and since 30 Apr 2026 its originality rule covers photos and carousels as well as Reels. If you test Telugu-script text, check the font has Telugu letters (Plus Jakarta Sans and Inter do not; Noto Sans Telugu does).

**Caption:**

> FSSAI says registration now covers turnover up to Rs 1.5 crore (press release, 13 Mar 2026, fssai.gov.in). Apply on foscos.fssai.gov.in. Comment CHEF for the Craves link.
>
> #FSSAI #FSSAIRegistration #FoSCoS #HomeChefs #HyderabadHomeChef #HomeFoodBusiness #HyderabadFood #HomemadeFood #Craves

**Claims used:** from the FSSAI press release of 13 Mar 2026 (fssai.gov.in): from 1 Apr 2026 registration covers turnover up to Rs 1.5 crore (up from Rs 12 lakh), licence above that; registrations are perpetual, no renewal. Separately, from a secondary source (tax article, 9 Jul 2026, brand.md section 10): annual fees still apply. FoSCoS steps and the 17-digit application reference: brand.md section 10 (NIFTEM 2022), checked on foscos.fssai.gov.in on [date of the Mon 19 Oct check]. From the SAFE list: a 14-digit FSSAI number is needed to submit (S8); you can save progress and finish later (S9); the "Request a call from Craves" FSSAI help (S17).

**Language variant to test:** Tenglish voice now. In week 2, the motion-reel build makes a Telugu-script text version cheap: same voice, Telugu-script cards. Log it as `Telugu script`.

---

### Reel 3: Save-bait checklist (with a Hindi/Dakhini language test)

**Idea:** Five things to keep ready before you apply to Craves: 18 or older, your phone number and email, two kitchen photos, an ID proof, a 14-digit FSSAI number. Plus the privacy rule: documents go only inside the application, never in a DM.

This list is the live chef application on craves.in (S8, S20; owner confirmed 14 Oct 2026). The form also verifies an email with a code, so item 2 is "phone number and email". It also asks for a kitchen address with a map pin. Never show that step on screen (N14).

**Why it should work:** Both old posts got 0 saves. A short checklist is the kind of reel people save to come back to. Hook type: `curiosity-gap`. A number and a clear payoff make it specific for non-followers who have never heard of Craves. The privacy line builds trust with cooks who worry about sharing documents.

**Post:**

- Tenglish version: Fri 23 Oct, 11:30 IST, Trial Reel.
- Hindi/Dakhini version: Sat 24 Oct, 11:30 IST, Trial Reel. Same footage and the same English on-screen text; only the voice and the caption change, so the test compares the spoken language. If it is not ready, move it to week 2.

**Hook options (on-screen text), ranked:**

| Rank | Hook type | On-screen text | Gloss |
|---|---|---|---|
| **1 (pick)** | curiosity-gap | Before you apply, keep these 5 ready | |
| 2 | send-to-a-friend | Send this to the cook in your family | |
| 3 | curiosity-gap | Home chef on Craves? Save this list. | |
| 4 | POV | POV: you finally decided to apply | |
| 5 | contrarian | Don't apply yet. Check this first. | |

Hook 3 assumes the viewer knows Craves. Most Trial Reel viewers are non-followers who don't.

Hook 5 is tempting but it tells people to wait, which works against applications.

**Voiceover (Tenglish, about 44 s):**

| Time | Spoken (Tenglish) | Gloss (English, not spoken) |
|---|---|---|
| 0:00-0:03 | Home chef avvalante, ee 5 ready ga unchukondi. Save cheskondi. | To become a home chef, keep these 5 ready. Save this. |
| 0:03-0:07 | Okati: mee age kanisam 18 undali. | One: you must be at least 18. |
| 0:07-0:12 | Rendu: mee phone number, email. Rendinti ki code vastundi. | Two: your phone number and email. You get a code on each. |
| 0:12-0:18 | Moodu: mee kitchen photos rendu. Clean ga, manchi light lo teeyandi. | Three: two photos of your kitchen. Take them clean, in good light. |
| 0:18-0:25 | Naalugu: ID proof. Aadhaar, PAN, bank statement, leda vere government ID edaina okati. | Four: an ID proof. Aadhaar, PAN, a bank statement, or any other government ID. |
| 0:25-0:32 | Aidu: 14-digit FSSAI number. Inka raleda? Application start chesi save cheyyandi, FSSAI vachaka submit cheyyandi. | Five: a 14-digit FSSAI number. Not yet? Start the application, save it, and submit once your FSSAI comes. |
| 0:32-0:38 | Ee documents anni application lone upload cheyyandi. DM lo evariki pampakandi. | Upload all these documents only inside the application. Don't send them to anyone in a DM. |
| 0:38-0:44 | Craves team mee application review chestundi. Link kosam CHEF ani comment cheyyandi. | The Craves team reviews your application. For the link, comment CHEF. |

**Voiceover, Hindi/Dakhini variant (Latin script, about 44 s):**

On-screen text for this version: the same English text as the Tenglish version (shot list below).

| Time | Spoken (Hindi/Dakhini) | Gloss (English, not spoken) |
|---|---|---|
| 0:00-0:03 | Home chef banna hai toh, ye 5 ready rakho. Save karlo. | To become a home chef, keep these 5 ready. Save this. |
| 0:03-0:07 | Ek: aapki umar 18 saal ya usse zyada honi chahiye. | One: you must be 18 or older. |
| 0:07-0:12 | Do: aapka phone number aur email. Dono pe code aata. | Two: your phone number and email. You get a code on each. |
| 0:12-0:18 | Teen: aapke kitchen ke do photo. Saaf, achhi roshni mein lo. | Three: two photos of your kitchen. Clean, in good light. |
| 0:18-0:25 | Chaar: ID proof. Aadhaar, PAN, bank statement, ya koi bhi government ID. | Four: an ID proof. Aadhaar, PAN, a bank statement, or any government ID. |
| 0:25-0:32 | Paanch: 14-digit FSSAI number. Abhi nai aaya? Application shuru karke save karo, FSSAI aane ke baad submit karo. | Five: a 14-digit FSSAI number. Not yet? Start the application, save it, and submit once your FSSAI comes. |
| 0:32-0:38 | Ye sab documents sirf application mein upload karo. DM mein kisi ko bhi nakko bhejo. | Upload all these documents only inside the application. Don't send them to anyone in a DM. |
| 0:38-0:44 | Craves team aapki application review karti. Link chahiye toh CHEF comment karo. | The Craves team reviews your application. Want the link? Comment CHEF. |

A native Hindi/Dakhini speaker from Hyderabad reads this first. "Nakko" and "hota" are Dakhini touches: keep them only if they sound natural to that reader.

**Shot list (one line per beat, same footage for both versions):**

| Time | On screen | Text on screen |
|---|---|---|
| 0:00-0:03 | Top-down shot: a hand puts a blank paper checklist on a home kitchen counter. | Before you apply, keep these 5 ready |
| 0:03-0:07 | A pen ticks box 1. | 1. 18 or older |
| 0:07-0:12 | A phone on the counter shows the OTP sign-in screen (blurred test number). | 2. Phone number and email |
| 0:12-0:18 | Phone camera frames a clean counter and takes a photo, twice. | 3. Two kitchen photos |
| 0:18-0:25 | A blank card with an ID icon. Never a real ID. | 4. ID proof: Aadhaar, PAN, bank statement or other government ID |
| 0:25-0:32 | A strip of 14 boxes filled with X marks, then a "save" tick on the phone. | 5. 14-digit FSSAI number. No FSSAI yet? Save and finish later. |
| 0:32-0:38 | A hand covers a phone showing a blank mock chat (no names, handles, photos or numbers). A simple "no" mark. | Documents only inside the application. Never in DMs. |
| 0:38-0:44 | End card: Flame Red, Craves logo, large bold white text. | Comment CHEF |

**Caption, Tenglish:**

> Craves home chef application kosam ee 5 ready ga unchukondi. Save this, Comment CHEF for the link.
>
> #HomeChefs #HyderabadHomeChef #HyderabadFoodie #HomemadeFood #IntiVantalu #TeluguFood #HomeKitchen #HyderabadFood #Craves

Gloss: Keep these 5 ready for the Craves home chef application. Save this, Comment CHEF for the link.

**Caption, Hindi/Dakhini:**

> Craves pe home chef banne ke liye ye 5 cheezein ready rakho. Save karo, link ke liye CHEF comment karo.
>
> #HyderabadHomeChef #HomeChefs #HyderabadiFood #GharKaKhana #HomemadeFood #HyderabadFoodie #HyderabadFood #Craves

Gloss: Keep these 5 things ready to become a home chef on Craves. Save this, comment CHEF for the link.

**Claims used (all from the SAFE list in brand.md):** S7 18+; S6 apply with your phone number (OTP); S20 phone and email, each verified with a code; S8 two kitchen photos, an ID proof (Aadhaar, PAN, bank statement or other government ID) and a 14-digit FSSAI number to submit; S9 save progress and finish later; S5 applications reviewed by the Craves team. The privacy line follows N15.

**Language variant to test:** this is the week's language test. Tenglish (Fri) vs Hindi/Dakhini (Sat), same footage, same on-screen text, same time slot, same bilingual DM, both Trial Reels. Log `language` as `Tenglish` and `Hindi/Dakhini` in results.csv. It is n=1 per language and the day differs, so LEARN treats the result as a hint.

---

## 4. TALK pack

### Meta Business Suite setup (desktop, before Reel 1 goes live)

Vendor guides say the comment-to-message automation is free and works only on a computer (Meta's own help page could not be checked). Other details below that come from vendor guides, not Meta's own pages, are marked.

1. On a computer, open Meta Business Suite with the Craves account that manages @craves.in_.
2. Go to **Inbox**, then **Automations**, then the **comment-to-message** template. (Menu names may differ; look for Automations or Comment to message in Inbox.)
3. Choose Instagram. If it asks which posts, choose all posts and reels (or the new reels).
4. **Keywords:** add `CHEF`, `Chef`, `chef` and `చెఫ్` (copy the Telugu word from this page). Vendor guides say keywords are case-sensitive exact matches, up to 5 per automation, and a keyword can be used in only one automation (documented for DM keyword automations; not confirmed for comment triggers, so test each spelling on Tue 20 Oct). That leaves one spare slot.
5. **Public reply:** paste public reply 2 below (English, so every commenter can read it). If Business Suite allows more than one, add all three.
6. **Private message:** paste the private DM below. It is long (about 1,100 characters). In the step 8 test, check the whole message arrives, link and last question included. If it is cut off, shorten the English block first.
7. Save and switch it on.
8. **Test it (Tue 20 Oct), after the old captions are edited (section 2):** from a personal account, comment `CHEF` on the 11 Oct carousel. Check the DM arrives (look in Message Requests if that account does not follow @craves.in_). Repeat with `chef` and `చెఫ్`. Delete the test comments.
9. **Test it on a reel (Wed 21 Oct):** we have not confirmed that comment-to-message works on reels. Right after Reel 1 goes live, one team member comments `CHEF` on it. Vendor guides say the automated reply is sent after 15 minutes. If no DM arrives within 20 minutes, send the DMs by hand for the rest of the week. Do not count team test comments in `keyword_comments`.

Things to know:

- Instagram allows **one private message** per comment, sent within 7 days of the comment. After that, we can only write again if the person replies, and then within 24 hours of their reply (Meta developer docs).
- Vendor guides say a template automation such as an away message takes priority, and that turning on Meta Business Agent pauses existing automations. Do not switch either on this week.
- If someone writes CHEF inside a longer comment ("I want to be a chef"), the automation may not fire. Check comments by hand in the first hour and send the DM yourself if needed.
- Vendor guides say the automated reply waits 15 minutes and is not sent if a person responds first. So do not reply by hand to a CHEF comment in its first 15 minutes. If you do reply sooner, send the private DM yourself.
- ManyChat or LinkDM: not this week. If you add one later, switch this automation off first so two tools don't reply to the same comment.

### Public replies (short, varied)

1. `DM chesam. Kanipinchakapothe Message Requests chudandi.` (We've sent you a DM. If you can't see it, check Message Requests.)
2. `Sent to your DMs. If you don't see it, check Message Requests.` (the automated one)
3. `Link mee DM lo undi. Message Requests kuda chudandi!` (The link is in your DM. Check Message Requests too!)

### The private DM (one message, so everything goes in it)

One automation holds all the keywords, so everyone gets this same DM, including people from the Hindi/Dakhini reel and English speakers. So it is bilingual: Tenglish first, then the same message in English.

> Namaskaram! Craves lo home chef ga apply cheyyadaniki ee link:
> https://craves.in/chef/application?utm_source=instagram&utm_medium=dm&utm_campaign=chef_acq
>
> Mee phone number tho sign in chesi start cheyyandi. Submit cheyyadaniki rendu kitchen photos, ID proof, 14-digit FSSAI number kavali. Progress save avutundi, taruvata finish cheyyochu. Documents application lone upload cheyyandi, ikkada pampakandi.
>
> Customers kosam Craves launching soon, chefs mundu join avutunnaru.
>
> Submit chesaka mee CRV reference (CRV- tho start avutundi) ikkade reply cheyyandi, edaina stuck aithe help chestam.
>
> Mee kitchen Hyderabad lo e area lo undi? Mee special dish enti?
>
> In English: apply with the link above. Sign in with your phone number. To submit you need two kitchen photos, an ID proof and a 14-digit FSSAI number. Your progress is saved. Upload documents only inside the application, never here. Customers open soon. Chefs are joining first. After you submit, reply with your CRV reference so we can help if anything gets stuck. Which area of Hyderabad is your kitchen in, and what is your special dish?

The English block is the gloss of the Tenglish block, and it is sent.

The documents list (S8), the CRV reference (S15) and "progress is saved" (S9) come from the live chef application.

Notes:

- "Area" means a neighbourhood like Kukatpally or Tolichowki. Never ask for a house address.
- The UTM tag in the link is not recorded by anything today. It is there so attribution starts working the day engineering builds UTM capture. Keep it in every DM.

### Follow-ups (only to people who reply, within 24 hours of their reply)

**Follow-up 1: they told us their area and dish.**

> Super! [area] nunchi [dish], chala bagundi. Application lo rendu kitchen photos, ID proof, 14-digit FSSAI number kavali. FSSAI inka lekapothe, application start chesi save cheyyandi, FSSAI vachaka submit cheyyandi. Edaina doubt unte ikkade adagandi.

Gloss: Super! [dish] from [area] sounds great. The application needs two kitchen photos, an ID proof and a 14-digit FSSAI number. If you don't have FSSAI yet, start the application and save it, then submit once your FSSAI comes. Ask here if you have any doubt.

**Follow-up 2: they say they are stuck or have not finished.**

> Application lo e step daggara aagindi? Basic details, kitchen, FSSAI, ID proof, leda review? Cheppandi, help chestam. Documents ikkada pampakandi, application lone upload cheyyandi.

Gloss: Which step of the application did you stop at? Basic details, kitchen, FSSAI, ID proof, or review? Tell us and we'll help. Don't send documents here, upload them only inside the application.

### First-hour reply bank

Reply in the same place they asked (comment or DM). Use Tenglish if they wrote in Tenglish or Telugu, English if they wrote in English. If a question is not here, say: "Good question. Please email contact@craves.in and the team will help." Never guess.

Public replies never contain the word "chef" (not even inside a link), because our own replies would then count as CHEF comments.

**"Do I need FSSAI?"**
- Tenglish: Avunu. Craves application submit cheyyadaniki 14-digit FSSAI number kavali. FSSAI says 1 April 2026 nunchi turnover Rs 1.5 crore varaku registration saripotundi, renewal ledu. Annual fee matram undi: current fee foscos.fssai.gov.in lo chudandi. Ee lopu Craves application start chesi save cheyyochu.
- English: Yes. You need a 14-digit FSSAI number to submit the Craves application. FSSAI says registration covers turnover up to Rs 1.5 crore from 1 April 2026, and does not need renewal. Annual fees still apply: check the current fee on foscos.fssai.gov.in, where you also apply. Meanwhile you can start your Craves application and save it.
- Add: "The application also has a 'Don't have FSSAI?' guide and a 'Request a call from Craves' option." (S17)

**"How much is the FSSAI fee?" / "How long does FSSAI take?"**
- English: The FoSCoS portal shows the current fee when you apply, so please check there. We don't want to quote an old number or guess a timeline.
- Never say Rs 100 or any other amount, and never promise a timeline.

**"What documents do I need?"**
- Tenglish: Rendu kitchen photos, ID proof (Aadhaar, PAN, bank statement leda vere government ID), 14-digit FSSAI number. Anni application lone upload cheyyandi, DM lo pampakandi.
- English: Two kitchen photos, an ID proof (Aadhaar, PAN, a bank statement or another government ID) and a 14-digit FSSAI number. Upload them only inside the application, please don't send them in DMs.

**"Do I have to deliver?" / "How does pickup work?"**
- Tenglish: Food ready ayyaka, mee kitchen nunchi pickup Craves arrange chestundi.
- English: When the food is ready, Craves arranges pickup from your kitchen.
- If they ask who pays for delivery or packaging: [CONFIRM WITH OWNER: approved answer on delivery and packaging costs for chefs]

**"What does Craves charge?" / "What's the commission?"**
- Tenglish: Mee menu, mee prices. Mee earnings daily leda weekly settle avutayi, meeku nachinattu. Leda okka tap tho mee balance bank ki pampukovachu. Payments gurinchi inkemaina unte contact@craves.in ki email cheyyandi.
- English: You set your own prices. Your earnings are settled daily or weekly, your choice, or you send your balance to your bank with one tap. For anything else about payments, email contact@craves.in.
- Never state a fee or a percentage (owner decision, N16).

**"When do I get paid?"**
- Tenglish: Mee earnings daily leda weekly settle avutayi, meeku nachinattu. Leda okka tap tho bank ki pampukovachu. Customers open ayyaka orders start avutayi.
- English: Your earnings are settled daily or weekly, your choice. Or send your balance to your bank with one tap. Orders start once customers open, which is soon.
- Never give an amount (N1).

**"Is it free to apply?"**
- [CONFIRM WITH OWNER: can we say applying is free? The application in the code has no payment step, but nothing chef-facing says so.]

**"When do orders start?"**
- Tenglish: Honest ga cheptam: customers kosam Craves inka open avvaledu, launching soon. Chefs mundu join avutunnaru. Ippude apply cheste, customers open ayye mundu mee kitchen set up cheskovachu.
- English: To be honest, Craves isn't open for customers yet. It's launching soon, and chefs are joining first. If you apply now, you can set up your kitchen before customers open.
- Never give a date. [CONFIRM WITH OWNER: a customer launch date, only if one may be shared]

**"How long does review take?"**
- English: Applications are reviewed in the order they arrive, so the time can vary.
- Never give a number of days. [CONFIRM WITH OWNER: review turnaround, only if we ever want to state one]

**"I'm in Bangalore. Can I join?"**
- English: Right now we're focusing on Hyderabad. Email contact@craves.in and we'll keep you posted.
- Never promise a Bangalore date (N17).

**"Is it safe? Will strangers see my home address?"**
- Tenglish: Mee address comments lo, DM lo pettakandi. Kitchen address application lone istaru, pickup kosam.
- English: Please never post your address in comments or DMs. You give your kitchen address only inside the application, for pickup.
- [CONFIRM WITH OWNER: what customers can see of a kitchen's location on Craves]

**"How much can I earn?"**
- Tenglish: Income entha ani memu promise cheyyamu. Mee menu, mee prices: prati dish rate meere set chestaru.
- English: We don't promise any income figure. Your menu, your prices: you set the price of every dish.
- Never give a number, an example or a range.

**"Is there an app?"**
- English: You apply on craves.in. It works on your phone browser.
- Never say "download the chef app".

**"Can I bring a friend?" / "Can I refer someone?"**
- English: Please send them this reel. If they comment the keyword, we'll DM them the link.
- Never mention a referral programme or referral rewards.

**Someone sends their CRV reference.**
- Tenglish: Thank you! Mee CRV reference note chesukunnam. Craves team mee application review chestundi. Edaina stuck aithe ikkade cheppandi.
- English: Thank you! We've noted your CRV reference. The Craves team will review your application. If anything gets stuck, tell us here.
- Log it the same day: the CRV reference, the date, and which reel the person came from, in the `crv_refs` count for that reel.

### Never ask for these in DMs or comments

- Aadhaar, PAN or any ID number or photo
- FSSAI certificate
- Bank details
- A home or kitchen address, or a map pin
- The OTP code they get on their phone

All documents go only inside the Craves application. If someone sends a document anyway, don't open or forward it. Reply: "Please upload this inside the application instead, and delete it from this chat." Tell the owner.

### Hide spam, never answer it

Comments like "Love this content send this post please" from promo accounts get **hidden**, never answered. We have already had one on the 12 Oct post. Hide in the app, or let Claude hide it through Windsor.ai (`hide_comment`) only after you say yes to that exact comment.

---

## 5. Week 1 checklist

Times are IST. Posting times are tests: log them in `post_time_ist`.

### Before Monday (by Sun 18 Oct)

- [ ] Step 0 from README.md done: Claude Project set up, files uploaded, Windsor.ai test answered.
- [ ] Profile fix: new bio and link (section 2).
- [ ] Edit the two old captions to remove the income lines (section 2). Then tell the owner what you changed.
- [ ] Hide the 12 Oct spam comment.
- [ ] Walk through https://craves.in/chef/application once on a phone with a team test number, for the Reel 1 and Reel 3 screen shots. Use placeholder details, never upload a real ID, and do not submit. Tell whoever counts applications about the test draft, so it is left out of the counts.
- [ ] Name the people: [CONFIRM WITH OWNER: native Telugu reader], [CONFIRM WITH OWNER: Hindi/Dakhini reader], [CONFIRM WITH OWNER: who answers DMs in the first hour after each post], [CONFIRM WITH OWNER: who builds Reel 2 in Claude Code]. Get written consent from the kitchen owner and each voiceover speaker (section 3).
- [ ] Agree which admin sends you the daily count of submitted Hyderabad applications (from `/admin/analytics` on admin.craves.in, chefs dataset, or the chef reviews list). Marketing does not get Admin Explorer access.
- [ ] Ask the owner for the answers still open in this pack: can we say applying is free; delivery and packaging costs for chefs; what customers can see of a kitchen's location; review turnaround (only if we want to state one); a customer launch date (only if it may be shared); may we delete our old reply to the spam comment; submitted applications 12 to 18 Oct; the four people above; and where signed consent forms are kept. Already decided on 14 Oct: the application is live, the fee is not disclosed, earnings are settled daily or weekly or with one tap, Hyderabad only, the 11 to 13 Oct posts were boosted.

### Mon 19 Oct: SCOUT + WRITE (30 min)

- [ ] SCOUT: save 5 reels from Hyderabad home cooks or home food that are clearly outperforming. Paste them into the SCOUT prompt in prompts.md.
- [ ] WRITE: finalise Reel 1. Change the script only if SCOUT finds a stronger hook, and only with claims from brand.md.
- [ ] FoSCoS check: open foscos.fssai.gov.in, confirm the steps in Reel 2 (0:17 to 0:30), and rewrite them if they differ. Write the date of the check in Reel 2's "Claims used".
- [ ] Native Telugu speaker reads Reels 1, 2 and 3 aloud and fixes the Tenglish. Hindi/Dakhini speaker reads the Reel 3 variant.
- [ ] Ask the admin for today's application count as the starting point. Remember an Admin Explorer count can include unsubmitted drafts.

### Tue 20 Oct: BUILD + TALK setup (about 4 hours, split between people)

- [ ] Record the Tenglish voiceovers (Reels 1, 2, 3).
- [ ] Film Reels 1 and 3 in a real home kitchen on a phone. Check every frame: no address, no real ID, no face without written consent.
- [ ] Edit Reel 1 in CapCut or Canva. Big text in the centre safe zone.
- [ ] Reel 2: whoever runs Claude Code starts the motion-reel build (prompt in section 3). Due Thu 18:00.
- [ ] Meta Business Suite automation **on and tested** (section 4, steps 1 to 8). This must be live before Reel 1 posts.

### Wed 21 Oct: post Reel 1

- [ ] 11:30: post Reel 1 as a Trial Reel from the Instagram app.
- [ ] 11:31: team member comments CHEF to test the automation on a reel (section 4, step 9).
- [ ] 11:30 to 12:30: first-hour replies. Answer real questions yourself with the reply bank. Do not reply by hand to a CHEF comment in its first 15 minutes (vendor guides say the automation waits 15 minutes and is not sent if a person replies first). If you do reply sooner, send the private DM yourself. Hide spam.
- [ ] Add a row to results.csv: date (IST), reel_id (the code in the permalink), permalink, format `reel`, language `Tenglish`, post_time_ist `11:30`, hook, hook_type `question`, length_s, and `trial` in notes. media_id comes from the Sunday Windsor pull.
- [ ] Afternoon: edit Reel 3 (Tenglish).

### Thu 22 Oct: post Reel 2

- [ ] By 18:00: Reel 2 render ready. Check it against the script and the claims ledger.
- [ ] 20:30: post Reel 2 as a Trial Reel.
- [ ] 20:30 to 21:30: first-hour replies.
- [ ] Check Reel 1's trial results (they arrive after about 24 hours). If it is doing well, share it to followers. Once it is shared, pin it.
- [ ] Record the Hindi/Dakhini voiceover for Reel 3 and edit that version.
- [ ] Add Reel 2's row the same way (post_time_ist `20:30`, hook_type `result-first`, `trial` in notes).

### Fri 23 Oct: post Reel 3 (Tenglish)

- [ ] 11:30: post Reel 3, Tenglish, as a Trial Reel.
- [ ] 11:30 to 12:30: first-hour replies.
- [ ] Add Reel 3's row the same way (language `Tenglish`, hook_type `curiosity-gap`, `trial` in notes).

### Sat 24 Oct: language test

- [ ] 11:30: post Reel 3, Hindi/Dakhini, as a Trial Reel. If it is not ready, move it to week 2.
- [ ] 11:30 to 12:30: first-hour replies.
- [ ] Check Reel 3 (Tenglish) trial results. If it was shared to followers, pin it ahead of Reel 1.
- [ ] Add its row the same way (language `Hindi/Dakhini`, hook_type `curiosity-gap`, `trial` in notes).

### Every day, Wed to Sun (5 min)

- [ ] Count comments that are just the word CHEF, Chef, chef or చెఫ్, per reel, leaving out team tests and our own replies. Log DM replies and CRV references received, per reel.
- [ ] Check Message Requests as well as the main inbox.
- [ ] Note the day's application count the admin sends you.

### Sun 25 Oct: LEARN (15 min)

- [ ] Run the LEARN auto-pull prompt in prompts.md. Windsor.ai pulls views, reach, saves, shares, average watch time, skip rate and comments (for `keyword_comments`).
- [ ] Add what Instagram can't see: `dm_replies`, `crv_refs` and `applications_7d` (applications with a Hyderabad or Telangana address only).
- [ ] Re-upload results.csv to the Claude Project.
- [ ] This is an early read: the reels are 1 to 4 days old. Log the full 7-day numbers on Sun 1 Nov.
- [ ] The 7-day application windows of the four reels overlap (21 to 27, 22 to 28, 23 to 29 and 24 to 30 Oct), so the application count can't be split between them. Use CHEF comments and CRV references to tell them apart.
- [ ] Get 3 rules for week 2, each citing the reel it came from, and the rewritten hook for the next reel.
