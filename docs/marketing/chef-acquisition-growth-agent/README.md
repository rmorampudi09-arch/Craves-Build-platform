# Craves chef acquisition: Instagram growth agent

This kit turns FlowMarq's "Instagram Growth Agent: Setup" guide (by @flowmarqai) into a weekly loop for Craves. Claude scouts, writes, helps build, talks and learns, every week: **SCOUT -> WRITE -> BUILD -> TALK -> LEARN**. Each week gets a little smarter because LEARN feeds the next SCOUT.

**The goal is one thing: home chefs in Hyderabad who submit a Craves chef application.** Not customers, not vanity views.

You don't need to code. Version 1 runs inside one Claude Project and takes about 2 hours a week. Parts of Version 2 already work today (see below).

**Where we start (14 Oct 2026):** @craves.in_ has 56 followers and 2 posts, both chef recruitment, both feed posts. No reels yet. Customers are not open yet: Craves is welcoming home chefs first. The full baseline is in [week-1.md](week-1.md).

## Files in this kit

| File | What it is |
|---|---|
| [README.md](README.md) | This page: setup, weekly rhythm, what to watch, decisions, open questions. |
| [project-instructions.md](project-instructions.md) | The block you paste into the Claude Project's custom instructions. |
| [brand.md](brand.md) | Knowledge file: who Craves is, who we recruit, voice, words, the **claims ledger**, visual identity, past captions, language guidance. |
| [results.csv](results.csv) | The results log. Header plus two baseline rows for the existing feed posts. |
| [prompts.md](prompts.md) | The five step prompts (SCOUT, WRITE, BUILD, TALK, LEARN), plus LEARN with an automatic Windsor.ai pull. |
| [week-1.md](week-1.md) | First-week pack: baseline, profile fix, 3 written reels, TALK copy, reply bank, dated checklist. |
| [campaign/campaign.md](campaign/campaign.md) | The live full-scale campaign (14 to 28 Oct 2026): what Claude publishes on schedule, what the team does, the images, copy and schedule. |

## What you need

| Tool | What it's for | Cost or status |
|---|---|---|
| **Claude** (the Craves claude.ai account) | The agent's brain. One Project holds the memory. | Existing account |
| **@craves.in_** Instagram professional account | Insights (views, reach, watch time, skip rate, saves, shares) and Trial Reels | Free |
| **Meta Business Suite** (desktop) | TALK: the comment-to-message automation for CHEF, and the inbox | Free |
| **A video tool** | BUILD. Simple route: CapCut or Canva, with phone footage of a real home kitchen. Pro route: Claude Code with the motion-reel skill (or Remotion) for animated explainers like the FSSAI reel. | Free tiers to start |
| **Windsor.ai connector** in Claude | LEARN pulls reel metrics and comments by itself (Instagram account id 17841414797291891) | Already connected to the Craves Claude account |
| **Google Sheet or results.csv** | The results log | Free |
| **A daily application count** | Daily chef application counts, taken from `/admin/analytics` in the Craves admin portal (admin.craves.in), "chefs" dataset, or the chef reviews list | An admin (CHEF_ADMIN or platform) sends the daily count of submitted applications. Marketing does not get Admin Explorer access: it shows full user, chef and order records. |
| **Native speakers** | A Telugu speaker reads every Tenglish or Telugu script, and a Hindi/Dakhini speaker from Hyderabad reads every Hindi/Dakhini script, before recording | Someone on the team: [CONFIRM WITH OWNER: who] |

Not included: ElevenLabs (the guide's optional AI voice). A real voice in Tenglish fits better. If you add it later, the native-speaker check still applies.

## Step 0: Build the agent's brain (one time, about 15 minutes)

Do this before Monday 19 Oct 2026, when week 1 starts.

### Route A: Claude Project (no code, recommended for the marketer)

1. In Claude, signed in to the Craves account, create a new **Project** called `Craves Chef Growth Agent`.
2. Open [project-instructions.md](project-instructions.md), copy the block inside the box, and paste it into the Project's **custom instructions**.
3. Upload these files to the Project's **knowledge**: `brand.md`, `results.csv`, `prompts.md`. Add `week-1.md` for the first week.
4. Check the Windsor.ai connector is switched on for chats in this Project. Test it: ask *"Using Windsor.ai, how many followers does @craves.in_ have?"* You should get 56 or more. If Claude asks you to paste numbers instead, the connector is off.
5. Open [week-1.md](week-1.md) and do the "before Monday" items (profile fix, TALK automation, agree who sends the daily application count).
6. Every Sunday, paste the rows Claude gives you into `results.csv` (one master copy) and re-upload it to the Project, replacing the old file.

### Route B: Claude Code (for whoever builds the animated reels)

1. Open Claude Code in this repository. The kit lives in `docs/marketing/chef-acquisition-growth-agent/`.
2. Start each session with: *"Read docs/marketing/chef-acquisition-growth-agent/project-instructions.md and follow the block in it for this session. Then read brand.md, results.csv and prompts.md in the same folder."*
3. If the Windsor.ai tools are connected in your Claude Code session, LEARN pulls data the same way as in the Project.
4. For BUILD, ask: *"BUILD this script with the motion-reel skill, 9:16, using the colours, fonts and logo in brand.md."* It renders a video file on your machine. Nothing is posted.
5. Pick one master copy of `results.csv` (the Google Sheet or the repo file). Re-upload it to the Project every Sunday so both routes see the same log.

## Your weekly rhythm

| Day | Step | What happens | Time |
|---|---|---|---|
| Monday | SCOUT + WRITE | Save 5 reels that are taking off with home cooks and home food in Hyderabad. Paste them in. Pick an idea, get hooks, script, shot list and caption. | 20 min |
| Tuesday | BUILD | **A native speaker reads every script before recording** (Telugu for Tenglish or Telugu script, Hindi/Dakhini for Hindi/Dakhini). Then shoot real kitchen footage on a phone, or build an explainer in Claude Code. | 30 to 90 min |
| Wed to Fri | Post + TALK | Post as a Trial Reel when testing a hook. Reply to real questions yourself in the first hour (reply bank in week-1.md). Hide spam. | 15 min per post |
| Every day | Count | CHEF comments, DM replies, CRV references received, and the day's application count an admin sends you. | 5 min |
| Sunday | LEARN | Log each reel 7 days after posting. Claude pulls the numbers through Windsor.ai, you add the counts Instagram can't see, paste the updated rows into results.csv and re-upload it. Claude sets 3 rules for next week. | 15 min |

**About 2 hours a week.** Week 1 posts three reels (all written in week-1.md). After that, post at least one a week.

**Posting time is a test, not a fact.** Our two posts went out at about 00:26 and 01:22 IST. Try mid-morning (11:00 to 12:30 IST) and evening (20:00 to 21:30 IST), log the time in `post_time_ist`, and let LEARN compare.

**Trial Reels:** with 56 followers, use Trial Reels for hook tests. Instagram shows them to non-followers first. Post them from the Instagram app (the Windsor.ai post action has no Trial Reel option).

## What to watch, in order

The goal is **submitted chef applications from Hyderabad**. That number is small and slow, and today we can't see which reel caused it. So LEARN ranks reels on the leading signals below, and checks applications alongside.

1. **CHEF comments per 1,000 views** (`keyword_comments / views x 1000`). The clearest sign a reel made a home chef raise their hand.
2. **DM replies.** People who answered the question in the automatic DM. That is where a conversation starts.
3. **CRV references received.** After applying, a chef gets a reference like CRV-10001. When they send it to us, we can link that application to the reel's DM thread. Ask an admin to check the reference in the chef reviews list (it shows CRV numbers) to confirm it was submitted.
4. **Saves + shares.** Instagram says sends (shares) are one of its top ranking signals, and a share can land with another home cook. Saves show the reel was worth keeping.
5. **Average watch time vs length, and skip rate.** Skip rate is the share of views that left in the first 3 seconds. High skip rate means the hook needs work.

**Follows are secondary.** Instagram's API does not report follows for reels. Check them in the app if you want, and note them.

### How we count applications today

There is no analytics on the website and no "source" field on the chef application. So we use four signals together:

| Signal | Where it comes from | Column |
|---|---|---|
| CHEF comments per reel | Windsor.ai comments pull, or count by hand | `keyword_comments` |
| DM replies | Meta Business Suite inbox | `dm_replies` |
| CRV references sent back to us | The automatic DM asks people to reply with their CRV reference after submitting, "so we can help if anything gets stuck" | `crv_refs` |
| Applications in the 7 days after a reel | An admin counts them in Admin Explorer (`/admin/analytics`, chefs dataset) or the chef reviews list, and sends you the number | `applications_7d` |

Things to know:

- **Counting CHEF comments.** Count only comments not written by @craves.in_, and only comments that are just the word CHEF, Chef, chef or చెఫ్ (so "home chef" in our own reply, or "nice chef", does not count; LEARN also shows a looser count of comments that contain the word). Windsor.ai's `comment_username` is empty unless the connected user can moderate comments on the linked Facebook Page, so either connect those rights or keep our public replies free of the word chef and check the count by hand.
- Admin Explorer counts application rows by the day they were created, and that can include drafts that were never submitted. The chef reviews list shows only submitted applications, but it has no date filter, so count the ones submitted in the window by hand. Check all three tabs (PENDING, APPROVED, REJECTED): the list opens on PENDING.
- Count only applications with a Hyderabad or Telangana address (the chef reviews list shows city and state).
- When two reels' 7-day windows overlap, you can't split the count between them. Use CHEF comments and CRV references to tell them apart.
- In `results.csv`, `date` and `post_time_ist` are both IST: convert Windsor.ai's UTC `timestamp`. The kit calls the two baseline posts the "11 Oct carousel" and "12 Oct image" (their UTC dates); in IST they went live on 12 and 13 Oct.
- `reel_id` is the code in the permalink. `media_id` is Windsor.ai's numeric id, the one the comments pull uses, so LEARN merges by `media_id`.

**The missing piece is engineering, not marketing.** The DM link carries `utm_source=instagram&utm_medium=dm&utm_campaign=chef_acq`. The tag survives the phone sign-in, but nothing records it today. Once engineering captures UTM tags and stores a source on the chef application, attribution can start working for DM links, as long as the source is saved on the first visit (chefs often save and come back later). [CONFIRM WITH OWNER: tag the bio link too, e.g. utm_medium=bio] The marketer can't fix this.

## Version 2: what works today and what needs code

| Piece | Status | Notes |
|---|---|---|
| LEARN pulls its own reel metrics | **Works today for posts; reel fields untested until the first reel is live** | Windsor.ai, connector `instagram`, account 17841414797291891. Fields: `media_views`, `media_reach`, `media_saved`, `media_shares`, `media_comments_count`, `media_reel_avg_watch_time`, `media_reel_skip_rate`, `media_reel_total_interactions`, `media_caption`, `media_permalink`, `timestamp`, `media_id`. Avoid deprecated `media_plays` and `media_impressions`. Check the unit of `media_reel_avg_watch_time` on Sun 25 Oct, the first pull with a reel: if the value is far bigger than the reel length, it is milliseconds, so divide by 1000 for `avg_watch_s`. `media_reel_skip_rate` is a percent. |
| LEARN counts CHEF comments per reel | **Works today** | Windsor.ai comments: `comment_id`, `comment_text`, `comment_timestamp`, `media_id`. Count only comments not written by @craves.in_, and only comments that are just CHEF/Chef/chef/చెఫ్ (see "Counting CHEF comments" above). |
| Instagram write actions from Claude | **Available, needs a human yes every time** | Windsor.ai has `reply_to_comment`, `hide_comment` and `create_video_post` (posts as a reel). Claude must ask before each one. Comment actions may return a permission error until the Instagram account is reconnected in Windsor.ai; test once with a human yes. |
| Comment-to-DM on CHEF | **Set up by hand, untested on reels** | Meta Business Suite on desktop. Vendor guides describe it. Whether it fires on reel comments is unconfirmed, so test it in week 1 (steps in week-1.md). If no DM arrives within 20 minutes, send DMs by hand. |
| Animated explainer reels | **Works today** | Claude Code with the motion-reel skill (or Remotion). Phone footage of a real kitchen for everything else. |
| Sunday LEARN runs on a schedule | **Next step, not set up** | A weekly scheduled Claude routine can run the Sunday pull and send you the summary. A second routine can send a Monday brief: 3 reel ideas and draft hooks built on Sunday's LEARN rules. SCOUT still needs you to paste the 5 reels you saved, since Claude doesn't browse Instagram. |
| Knowing which applications came from Instagram | **Needs engineering** | Capture UTM tags on `/chef/application` and store a source on the chef application. Nothing reads the tags today. |
| Paid boost results | **Optional, worth adding** | The 11 to 13 Oct posts were boosted (owner confirmed), but no Meta Ads connector is connected, so spend and paid results can't be read. Connect the Meta Ads (`facebook`) connector in Windsor.ai, and write `boosted` in `notes` for any boosted reel so LEARN compares organic with organic. |
| Follower city split | **Not until 100 followers** | Meta withholds audience demographics below 100 followers. |
| AI agent answering DMs | **Optional, later** | People answer real questions for now. Vendor guides say turning on Meta Business Agent pauses existing automations, so check before switching it on. |
| ManyChat or LinkDM | **Optional** | For buttons and multi-step DMs. Turn the Business Suite automation off first, so two tools don't reply to the same comment. |

## Rules that never bend

- **Claims come only from the claims ledger in [brand.md](brand.md).** No earnings or income figures or promises, ever. Never state the Craves fee or commission (owner decision).
- **Honest launch framing.** Customers are not open yet. Never "start earning today", "orders waiting" or "guaranteed orders".
- **A native speaker reads every script before recording:** a Telugu speaker for Tenglish or Telugu script, a Hindi/Dakhini speaker from Hyderabad for Hindi/Dakhini.
- **Privacy.** Never ask for Aadhaar, PAN, an FSSAI certificate, bank details or an address in DMs or comments. Documents go only inside the Craves application.
- **Never paste applicant names, phone numbers or addresses into Claude or results.csv.** Counts and CRV references only.
- **No real chef's name, face or kitchen** without written consent. No one's full home address on screen.
- **Claude never posts, replies, hides or deletes** on Instagram without a person saying yes to that exact action.

## Decisions made

| Decision | Why |
|---|---|
| The goal is submitted chef applications from Hyderabad | That is what grows the supply side before customers open. Views and follows don't. |
| LEARN ranks by CHEF comments per 1,000 views first, then DM replies, CRV references, saves + shares, watch time and skip rate | Applications are too few and too slow to rank reels on alone. Instagram's API doesn't report follows for reels. |
| Hyderabad only for now | Owner decision (14 Oct 2026): Hyderabad now, Bangalore later. |
| Never disclose the fee; talk about how earnings are settled | Owner decision (14 Oct 2026). Earnings are settled daily or weekly, the chef's choice, or with one tap to their bank (the choice ships with the RazorpayX payout work). |
| Comment keyword CHEF, set up as `CHEF`, `Chef`, `chef` and Telugu `చెఫ్` | One easy word. Vendor guides say keywords are case-sensitive exact matches, up to 5 per automation. |
| DM link `https://craves.in/chef/application?utm_source=instagram&utm_medium=dm&utm_campaign=chef_acq` | Works signed in or signed out (signed out goes to phone OTP, then back). Never `craves.in/#for-chefs`: signed-in visitors get redirected to `/home`. |
| Attribution through four manual signals | There is no analytics and no source field today. The UTM is ready for when capture is built. |
| Tenglish is the default reel voice, with an English gloss on every line | The Tenglish carousel beat the Telugu-script image post, 189 vs 128 views. That is n=1 and the formats differ, so we keep testing Telugu script and Hindi/Dakhini. |
| Honest launch framing: "be one of the first home chefs on Craves in your area" | Customers are not open yet, so any "start earning now" line would be false. |
| brand.md owns the claims ledger | ASCI Code 1.1, 1.4 and 1.5 (substantiation, no misleading by omission) and Meta's unrealistic-outcomes policy for income opportunities. |
| FSSAI angle uses FSSAI's own words and no fee amount | FSSAI's press release (13 Mar 2026) says that from 1 Apr 2026 registration covers turnover up to Rs 1.5 crore and registrations are perpetual (no renewal). A tax article (9 Jul 2026) says annual fees still apply, so that point is not an "FSSAI says" line. The old Rs 100 fee figure is pre-reform; check the fee on foscos.fssai.gov.in. |
| Spam comments are hidden, not answered | A promo account already left "Love this content send this post please" on our image post. |
| Trial Reels for hook tests | With 56 followers, reach has to come from non-followers. |
| Posting times are tested, not assumed | Our two posts went out after midnight IST. 11:00 to 12:30 and 20:00 to 21:30 IST are hypotheses for a home-cook audience. |
| Profile bio speaks to chefs, link `https://craves.in/chef/application` | The bio says "Order at craves.in" while customers can't order yet. Edit it by hand in the app: Windsor.ai can't change the bio. |

## Decided by the owner (14 Oct 2026)

| Question | Answer |
|---|---|
| Is the chef application live? | Yes, on craves.in. So the documents list, the save-and-finish-later step, the CRV reference and the "Don't have FSSAI?" guide with "Request a call from Craves" are all SAFE (brand.md S8, S9, S15, S17, S20). |
| What do we say about the fee? | Nothing. Never state the fee or a percentage (N16). Say instead how earnings are settled: daily or weekly, the chef's choice, or with one tap to their bank (S18). |
| Bangalore? | Hyderabad only for now, Bangalore later (N17). |
| Packaging? | Once a chef is approved, Craves sends packaging materials, free, no other conditions (S21). |
| Were the 11 to 13 Oct posts boosted? | Yes. The organic baseline is the posts' own reach (71 and 48). |

## Open questions for the owner

| # | Question | Why it matters |
|---|---|---|
| 1 | How long does application review take? | No turnaround is written anywhere. The status page says applications are reviewed in arrival order and the time can vary. |
| 2 | Is there a customer launch date we may share? | Today we can only say "launching soon for customers". The support guide says never promise a date. |
| 3 | Can admins approve v2 applications in the live admin portal? | A 9 Oct doc said the live admin portal predated v2. No doc says it was redeployed since. |
| 4 | Which admin sends the daily count of submitted Hyderabad applications, and who answers chef DMs in the first hour? | LEARN needs daily counts without marketing seeing applicant records, and TALK needs a person. |
| 5 | Will any chef give written consent to appear in a reel? | We have no testimonials or consented chef footage. Instagram stops recommending accounts that mainly post unoriginal content to non-followers (a Reels rule extended to photos and carousels on 30 Apr 2026), so real kitchen footage matters. |
| 6 | Can engineering add UTM and source capture to the chef application? | Without it, Instagram applications can't be told apart from others. |
| 7 | What do we say about chef terms, packaging and kitchen standards? | The "Craves Chef Terms" link goes to the general terms page, and no packaging or hygiene standards are written down. Chefs will ask. |
| 8 | Can chefs also sell on other platforms? | Not documented. Chefs will ask. |
| 9 | Can we say "free to apply"? | The application has no payment step, but no page says it is free (ledger C13). Chefs will ask. |
| 10 | What can customers see of a kitchen's location? | Cooks worry about sharing a home address. We can only say the address stays inside the application. |
| 11 | Who pays for delivery? | Not documented for chefs. It is in the week-1 reply bank as a placeholder. |
| 12 | May we delete our old reply to the spam comment on the 12 Oct image? | It tells a promo account it may reuse our content. |
| 13 | Where are signed consent forms kept, and is there a form? | Every kitchen owner and voiceover speaker in week 1 signs one. |

**Also unconfirmed, we test in week 1:** whether Meta Business Suite's comment-to-message works on reels, and whether the keyword rules (case-sensitive, up to 5 keywords) apply to comments as well as DMs. Both come from vendor guides, not Meta's own pages.
