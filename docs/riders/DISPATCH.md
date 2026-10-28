# Craves Rider: how orders reach riders

28 Oct 2026 · Phase 4 · for Gopi, ops, and anyone who changes dispatch. It covers what riders can count on, how an order is offered, what riders choose, how fairness is measured, and what Craves will not build. The research behind it, with every source, is the project doc `rider-app/research/R13-dispatch-fairness-freedom.md`. The backend detail is in `BACKEND.md`, under "Dispatch chain".

Craves runs its own riders to deliver its chefs' food well, not to squeeze riders. What it needs is simple: each order reaches a rider who wants it, and riders trust the system enough to stay. Most platforms get there with pressure: acceptance rates, tiers, streaks and hidden scores. Craves gets there with rules a rider can read on one screen. Every promise below is backed by code and a test.

## 1. What every rider can count on

| Promise | Where the code keeps it | Why |
|---|---|---|
| **Saying no is free.** Declining or missing an offer is never counted. There is no acceptance rate, no cooldown and no lost place in line. | `POST /offers/{id}/decline` changes only that offer. Dispatch reads no offer history (`FleetDispatcher.nearbyRiders`, `fair`). | Telangana Act 21 of 2026 s.13(3)(b) [1]; Seattle [11]; *Uber v Aslam* [10] |
| **Only three things decide who hears first:** distance to the kitchen, pay per online hour today, and minutes waited. Nothing else counts: no ratings, no acceptance rate, no history before today, no hidden score. | `FleetDispatcher.ranked`, `fair`, `standings` | Bologna v Deliveroo [5]; Garante v Foodinho [6][7]; EU Platform Work Directive Art 7 [2] |
| **Every offer says why it came to you.** | `trip_offer.reason`, the line on the offer card (`whyOffer`), and ops's "Why this rider" column | EU PWD Arts 9 and 11 [2]; CJEU C-203/22 [9]; Amsterdam v Uber and Ola [8] |
| **The rules are in the app, in your language, and change only with 14 days' notice.** | Terms → "How you get orders" (`offerRulesLines`); refused otherwise (`RULES_NEED_NOTICE` and the V170 trigger); upcoming rules shown in advance (`upcoming.offerRules`) | Telangana s.12, s.13(2) [1] |
| **You choose when and how far you work.** Go online or offline any time. Take a 5 to 60 minute break without going offline. Set the farthest ride to a kitchen and to a customer you'll take. Head home and hear only of orders on your way. None of it counts against you. | `/shift/pause`, `/shift/resume`, `/preferences`, `/home-spot` and `/shift/heading-home`, behind the switch `CRAVES_FLEET_RIDER_CHOICES_ENABLED` | Telangana s.13(3)(b) [1]; NDMA heat advisory [32] |
| **No speed pressure.** No countdown on a trip except the kitchen's free wait, no lateness penalty, and no delivery promise to customers that you pay for. | Rider screens (WORKPLAN rule 8) | EU PWD Art 12 [2]; India's Labour Ministry against 10-minute delivery [33] |
| **You see your pay per online hour**, and the fleet's middle figure once five or more riders work that day. | Home (`todayPerHourPaise`, `fleetPerHourPaise`) | Fairwork's fair-pay principle [30] |
| **Your data is yours:** a full copy from the app, any time. | `GET /my-data` | DPDP Act 2023 s.11 [4]; Amsterdam v Ola [8] |
| **A person decides any pause or end of your account,** with written reasons, notice, and a chance to answer. | Due process (`BACKEND.md`, "Due process") | Telangana s.14 [1]; EU PWD Art 10(5) [2] |

Changing any of these changes riders' terms. That needs the lawyer, and 14 days' notice in the app.

## 2. How an order is offered

The rules live in the dispatch policy (console: Rider pilot setup → Dispatch). The defaults keep the old behaviour: 3 riders at once, one round, nearest first. Nothing changes until ops publishes a policy that says otherwise.

### Who can hear of an order

A rider hears of an order only if all of these hold:

- They are ACTIVE, on an open shift, and not on a break.
- They are free: no trip in progress and no open offer.
- The server has heard from them: the phone called in the last 45 s, with a real (not mock) fix under 3 minutes old, and it can ring.
- They are inside the policy radius of the kitchen (5 km to start).
- They are in the pilot zone (while test mode is on).
- With rider choices on: the ride to the kitchen and the drop are within the rider's own limits. The kitchen ride is measured as the offer shows it, straight line × detour.

### In what order

- **Nearest first** (fair band 0): by straight-line distance to the kitchen. With `CRAVES_FLEET_ROAD_RANKING_ENABLED`, the 5 nearest are re-ranked by road distance.
- **Fair turns** (fair band above 0): see §3.

### How many riders at once, and for how long

| Setting (console label) | Allowed | Default | What it does |
|---|---|---|---|
| Riders who see an order at once | 1 to 3 | 3 | When more than one rider sees it, the first to accept gets it. |
| Time a rider has to accept | 30 to 60 s | 40 s | How long each rider has to decide. |
| Rounds of offers | 1 to 5 | 1 | If everyone asked passes or lets the time run out, the next riders not yet asked hear of it, while the stage lasts. Nobody is asked twice about one order. |
| Time Craves riders get before Borzo | 45 to 120 s | 60 s | Rounds × time to accept must fit inside it. After it, the order goes to Borzo, then Pidge, then the ops queue, as before. |
| Fair band, km | 0 to 5 | 0 | 0 means nearest first. Above 0 means fair turns among riders within that distance of the nearest. |

A new round starts soon after the last one is decided. While a policy runs rounds, the delivery command checks every 5 s (every 10 s otherwise).
- **A round always gets its full time.** It goes out only if the stage still has the full time to decide left. If not, the order moves on to Borzo at once, so no rider's time is cut short.
- **A round is never withdrawn by mistake.** The stage closes only under a lock on its row, the same lock a round is sent under. So a round another worker has just sent never disappears from a rider's phone while it rings.
- **If the rider chosen first becomes busy** a moment before their offer goes out, the stage stays open, and the next check offers the order to the riders free then.
- **The cost guard** works per rider, as before: a rider is skipped if their pay plus the overhead would cost more than the next courier plus the premium.

### What the offer card tells the rider

| When | The offer card says |
|---|---|
| Nearest, offered alone | "You're the nearest free rider." |
| Nearest, offered with others | "You're one of the 3 nearest free riders. The first to accept gets it." |
| A later round | "You're the next nearest free rider." (with others: "one of the next 3 nearest …") |
| A fair turn | "Fair turns: free riders near the kitchen who have earned less per online hour today hear first. It's your turn." |

- The count is only the riders actually asked together, never more. The line never says what other riders did. An app that doesn't recognise a rule shows no line.
- Each offer stores why it was made (`trip_offer.reason`): the rule, the rider's place, how many riders were ranked, and the round. For a fair turn it also stores the band, the riders in it, the rider's pay per online hour and their minutes free.
- Ops sees the reason for each offer on the rider's page. The rider sees it in their copy of their data (§6).

## 3. Fair turns

**Why.** Nearest-first piles work onto a few riders. In Swiggy-derived data, the top 10% of riders took half of all pay [12]. Among riders close to the nearest one, who gets the order barely matters to the customer, but it matters a great deal to the riders.

**The rule.**

1. **The band.** Riders within the fair band of the nearest rider, measured the same way riders are ranked. Riders outside the band come after, nearest first. With road ranking on, only the 5 riders ranked by road can be in a band.
2. **First in the band:** the rider with the least pay per online hour today. Pay is compared in ₹10 steps, so a few rupees don't decide.
3. **A tie:** the rider who has waited longest for an order. Their wait counts from the latest of three times: their shift's start, their last trip's end, or the end of their last break. Passing on an offer does not reset it.
4. **Each round** draws the band again, around the nearest rider not yet asked.

**Pay per online hour today** is net pay credited today, divided by available online time today.
- **Today** is the IST day. Trip pay counts when it was finalised; slot top-ups count at the slot's end.
- **Available online time** is shift time within today, less breaks. At least 30 minutes is counted.
- So a rider who just came online with nothing earned sits at ₹0 with the others, and the one who has waited longest goes first.

Early in the day everyone is at ₹0, so fair turns work like the queue at an auto stand: whoever has waited longest goes first. As the day goes on, the line leans toward whoever has earned least for their time.

**An example.** A Madhapur kitchen, fair band 1.5 km, one rider at a time:

| Rider | To the kitchen | Earned today | Online | Per hour | Waiting |
|---|---|---|---|---|---|
| Ravi | 0.4 km | ₹300 | 2 h | ₹150 | 5 min |
| Salma | 0.9 km | ₹120 | 2 h | ₹60 | 20 min |
| Arjun | 1.6 km | ₹40 | 1 h | ₹40 | 35 min |
| Kiran | 2.3 km | ₹0 | 1 h | ₹0 | 50 min |

- **Round 1.** The band runs to 0.4 + 1.5 = 1.9 km, so it holds Ravi, Salma and Arjun. Arjun hears first (₹40 an hour). Nearest first would have chosen Ravi.
- **Round 2,** if Arjun passes. The band is redrawn around Ravi, the nearest rider not yet asked, so it holds Ravi and Salma. Salma hears.
- **Kiran** is outside the band for this kitchen. His turn comes with orders nearer to him. The band keeps pickup rides short and the customer's food warm.

**What it costs, and who pays.**
- **Riders' distance.** A farther rider rides further to the kitchen, and is paid for it beyond the free kilometre (₹9 a km on the seeded card). Craves pays that.
- **The research figures** (re-runs of the published methods):
  - fairness cost riders 24–35% more distance [15] and 29–41% more working time [14];
  - customers waited about 1% longer [12].
- **Never run fair turns without a band.** Worst-off-first with no band costs 190% more pickup distance [16].
- **Craves's own figure.** Measure the cost with `offer_rules` (§8), and with the replay before switching it on (§7).

**A known trade-off.**
- **A rider who passes keeps their place.** The law forbids a cooldown, so a rider who keeps passing stays first in line. Each pass costs that order one round, and then the next rider hears.
- **The risk is cherry-picking.** A strict queue with free declines invites it [17].
- **How to watch it.** Look for later rounds in `offer_rules`. Never act on one rider's passes.

## 4. What riders choose

Behind `CRAVES_FLEET_RIDER_CHOICES_ENABLED` (off). `GET /me` reports it as `features.riderChoices`, and the app hides both choices until it is on. Turn it on only after the gateway re-run that adds the new routes (`GO-LIVE.md` §8). If the switch is turned off later, riders' saved limits are kept but ignored.

**A break while online** (Home → "Take a break").
- **Length.** The app offers 10, 20 or 30 minutes; the server accepts 5 to 60.
- **During it.** No offers arrive. The rider stays online and can come back any time with "I'm back", which always works, even after the switch goes off. A new break replaces the one running.
- **Pay.** A break is not online time. It doesn't count toward a booked slot's guaranteed minimum, and it doesn't lower pay per online hour.
- **An offer still ringing** when the break starts goes to the next rider at once, at no cost to this one.
- **Fair turns.** Waiting counts again from the break's end.

**Farthest pickup and drop** (Profile → "Orders you hear of").
- **To the kitchen:** any distance, or at most 1, 2, 3 or 5 km.
- **Kitchen to customer:** any distance, or at most 3, 5, 8 or 12 km.
- **Limits.** The server accepts 0.5 to 10 km and 1 to 20 km. The kitchen distance is measured as offers show it.
- **Effect.** Dispatch leaves the rider out of any order beyond either limit, so fewer orders may reach them. The choice never counts against them.

**Heading home** (Phase 5; Home → "Head home").
- **The home spot.** The rider saves it in Profile, standing at home ("I'm home: save this spot"). The phone rounds it to 2 decimal places (an area about 1 km across) and the server keeps no more, so it is never an address. Only the rider sees it, in the app and in their data copy; ops's copy says only that one is kept. It can be deleted any time, even with the switch off, and is forgotten 90 days after it was last saved or used.
- **For an hour** the rider hears only of orders whose drop leaves them at least 500 m nearer home, and whose ride (to the kitchen, to the customer, then home) adds at most 2 km, or a quarter of the way home if that is more, to riding straight home. Distances are straight lines. All the other rules still apply.
- **It ends** after the hour, when the rider stops it ("Stop heading home" always works), when they go offline, or when a real fix comes within 1 km of the home spot. Turning it on again starts a new hour. There is no daily limit.
- **The offer card** adds "On your way home: the drop leaves you 3.2 km nearer home."
- **Fair turns are unchanged:** heading home only narrows which orders reach the rider. Like the other choices, it never counts against them.
- **Where the numbers come from:** Uber's destination filter uses the same added-distance test, and Namma Yatri a 2 km corridor (research R14).

## 5. Pay per online hour

- **The rider's own figure.** Once a rider has been online for 30 minutes today, Home shows "₹X an hour online today".
- **The fleet's middle figure.** Once five or more riders have been online for 30 minutes today, Home adds the median: "Half of today's riders made ₹Y an hour or more."
- **Fewer than five riders: no fleet figure,** so nobody can work out another rider's pay. Each server caches the figure for 60 s.

**Online time** runs until the shift ends, or 3 minutes after the phone last called if it stopped calling (a phone that died mid-shift isn't counted as online), less breaks.

This is the figure fair turns compare. It is also what the Telangana union and Fairwork ask for: pay for all the time riders give, waiting included [30]. Ops sees the spread across riders in `earnings_per_online_hour`.

## 6. Your data

`GET /my-data` (Profile → Your data → "Share a copy of my data") returns one JSON document. It holds, newest first, at most 5,000 rows per list:
- **About you:** profile; documents (no files); phones; payout accounts (masked).
- **Your work:** shifts with phone health; breaks; offers with why each came; trips (kitchen and drop areas only); trip steps (times only: a step's location at the drop would place the customer); slots.
- **Your money:** pay lines; holds; payouts; withdrawals; recoveries.
- **Your record:** status changes; support issues; SOS presses; terms and privacy notices accepted.
- **Ops's actions** on the account, including every download of this copy: what was done, by whom and when. Ops's notes are left out, as they can name other people.

**Left out:** photos (documents, selfies, delivery); on-trip GPS points, which are counted, not included, and kept 90 days; and customers' names, phone numbers and addresses. Support sends the photos and GPS points on request. A copy too big to share from the phone (over 400 KB) asks the rider to call support.

**For ops.** Ops downloads the same document for a rider who asks: "Download the rider's data (JSON)" on the rider's page, or `GET /admin/fleet/riders/{id}/data-export`.
- **Who can:** platform, operations and compliance admins.
- **Audit:** every download is recorded as `RIDER_DATA_EXPORTED`, and the rider sees it in their own copy.
- **Speed:** the DPDP Rules allow 90 days to answer [4]; the app answers at once.

## 7. Choosing the rules

### Recommended for the pilot

| Setting | Value | Why |
|---|---|---|
| Riders who see an order at once | 1 | **No race:** each rider decides alone, at their own pace. Three riders racing to tap is speed pressure, and the nearest usually wins [18]. DoorDash, Wolt, Gojek and Uber's normal requests go to one rider at a time [19][21][22][34]. |
| Time a rider has to accept | 30 s | Wolt gives 30–60 s and DoorDash 50 s [20][21]. 30 s is the lowest the declared range allows. |
| Rounds of offers | 3 | Three riders still hear of each order, one after another. |
| Time Craves riders get before Borzo | 120 s | **3 rounds of 30 s, with a few seconds between them.** A round starts only when its full 30 s still fit, so 90 s would allow only 2 rounds. Home-cooked food takes far longer than a minute, so Borzo starting a minute later rarely delays the customer. |
| Fair band | 1.5 km | **About 5 minutes' extra ride at most,** paid beyond the free kilometre. The research publishes no band size, so start here and tune with data. |

**Setting them with no notice.** Until the first rate card is published, riders have no terms, so any rules may start at once. `GO-LIVE.md` §6 step 1 sets them in shadow first, then publishes the rate card. After that, every change to the rules, wider or narrower, needs a start 14 days away, and riders see the new rules under Terms in the meantime.

**Before choosing,** run the replay on the pilot area's recorded orders twice: once nearest first, once with these rules (`REPLAY.md`, "Comparing offer rules"). Compare the Gini and the spread of pay per hour against the mean pickup distance. If 1.5 km adds over 30% to the mean pickup, try 1 km.

**To keep the old behaviour** (3 at once, nearest first), leave the rules alone. You can still switch later, with 14 days' notice.

### When to change them

| What you see | Query (`PILOT-HEALTH.md`) | Change |
|---|---|---|
| Under nearest first, the Gini of pay per online hour stays over 0.3 for a week, with 5 or more riders a day | `earnings_per_online_hour` | Fair turns at 1.5 km (14 days' notice). |
| Fair-turn pickups average over 30% longer than nearest-first ones for a week | `offer_rules` | Narrow the band (14 days' notice). |
| Over 20% of offers expire unanswered | `offer_outcomes` | Riders aren't hearing offers. Check `offer_to_ring` and the phones first. |
| Many orders accepted only in later rounds, or reaching Borzo | `offer_rules`, `fleet_stage_outcomes` | More riders in that area, or 2 riders at once (14 days' notice). |
| Many riders narrowing their distances | `rider_choices` | Offers ask too much: look at the radius and the pay per km. |
| Most kitchens over 10 minutes' wait for two weeks | `kitchen_wait` | Design offers timed to the food (§9). |
| Over 20% of rides to the kitchen are 1.5 times the straight line | `pickup_detour` | Road ranking (14 days' notice, WORKPLAN rule 9). |

- **Radius and time to accept** change at once, within their declared ranges. That lets ops shrink the radius on a heat or rain day. Whether either should need notice is a question for the lawyer (§11).
- **Add riders only while pay holds up.** When Deliveroo Spain let riders log in freely, more riders came online, each got fewer orders, and pay fell [28]. Before adding pilot riders, read the fleet's middle pay per online hour in `earnings_per_online_hour`. If it is falling, keep a waitlist. This is a rule for ops, not code.

## 8. Measuring

Each week, open Rider pilot health in the console and read these alongside the existing health queries:

| Query | Shows | Look for |
|---|---|---|
| `earnings_per_online_hour` | Per day: riders online 30 minutes or more; the p10, p50 and p90 of pay per online hour; the Gini | A Gini over 0.3 for a week with 5 or more riders: try fair turns. With under 10 riders, read p10 and p90 instead: one rider moves the Gini a lot. A falling p50: stop adding riders. |
| `offer_rules` | Per day: rule, round, offers, accepted, mean pickup distance | Fair-turn pickups over 30% longer than nearest-first ones for a week: narrow the band. |
| `rider_choices` | Breaks (riders, count, minutes, longest) and riders with distance limits | Many riders setting limits: offers ask too much. |
| `kitchen_wait` | Per kitchen: trips, p50 and p90 minutes from arrival to pickup, and how often the food was ready first | A kitchen whose p50 is past the free minutes: ask the chef to tap ready when the food is packed. |
| `offer_outcomes` | Offers accepted, declined, expired, lost and withdrawn | Expired over 20%: riders aren't hearing offers. Watch the decline rate, but never use it to rank anyone. |

Once a month, publish a short fleet summary to riders:
- the middle pay per online hour and its spread;
- the share of orders that went by fair turns;
- kitchen waits;
- what changed and why.

New York's regulator publishes figures like these every quarter [29]. No Indian platform publishes the spread of rider pay.

## 9. Next, when the data says so

| Step | Start when | What |
|---|---|---|
| Offers timed to the food | `kitchen_wait`: most kitchens over 10 minutes at the median, for two weeks | Send the offer when the food will be ready, less the ride and a buffer, using the chef's ready estimate. Meituan cut rider waiting by 51% in a trial [24]. FoodMatch cut it by about 40% on Swiggy data [13]. |
| Two orders per trip | `batching_candidates` 15% or more while `rider_busy_share` is over 60% (blueprint C7) | Same kitchen or a close drop, only when the cooking time leaves room. |
| Matching all open orders together | 20–30 riders online at peak, with idle riders and waiting orders often in the same zone | Every 10–30 s per zone, solve a table of orders × riders with the Hungarian method (milliseconds at this size). The cost is travel time plus a small weight on the fair-turn gap. Offers still go to one rider at a time. The industry has moved here [19][23][25]. FoodMatch cut extra delivery time by 30% against greedy dispatch [13]. |
| Heading home | Riders ask for it | Only orders whose drop is nearer a place the rider picks for this shift. The place is kept on the shift and forgotten when it ends. It is a home location, so a privacy review comes first. |
| Suggested limits by vehicle | Bicycle riders join | Suggest 3 km for a bicycle on the Profile chips. Never impose it. |
| Weekly payslip | Riders or the lawyer ask | A PDF per week in the rider's language, from the earnings already shown. |
| Many riders | A match cycle over 1–2 s, a second city, or 500 or more riders online in a city | Dispatch per city, then per zone. Rider positions in Redis with H3 cells, and events on Event Hubs (Kafka). Every solve is time-limited, with a greedy fallback. Replicas. |

Known shortcuts in today's code, each marked `shortcut:` in the code:
- `FleetDispatcher.standings` runs 3 queries per rider in the band. That is fine for tens of riders; batch them past about 50 in a band.
- Each round asks the couriers for a fresh quote: about one per round, and a few more when two workers race. Keep the first one on the trip if couriers start limiting quotes.
- A rider's data copy reads `trip` by rider, and `trip` has no full index on `rider_id`. Add one if copies get slow.

## 10. Not built, on purpose

- **Decline cooldowns or lost turns.** The research brief suggested skipping a rider for 10 minutes after a decline, to curb cherry-picking. Telangana s.13(3)(b) forbids any adverse consequence for declining.
- **Pressure on acceptance or presence:** acceptance or cancellation rates, ratings in dispatch, tiers, streaks, login-hour bonuses, fines for missed slots. In 2021, one rejection in 100 could drop a Zomato rider a tier [27]. In 2024, 87% of riders surveyed said ID blocking had affected them [31].
- **Priority for riders who auto-accept**, as Grab gives [26]. It punishes riders who read an offer first.
- **Riders bidding against each other** for orders.
- **Hidden scores of any kind**, fraud and risk scores included. Any flag goes to a person, who decides with notice.
- **Automatic deactivation.**
- **Delivery-time promises that riders pay for**, and countdowns on a trip.
- **Background location**, emotion or chat analysis, and face matching against a database [2][7].
- **Unlimited rider sign-ups** (§7).

## 11. The law, and open questions

| Requirement | Source | In Craves |
|---|---|---|
| Explain the system in the rider's language | Telangana s.12(1) [1]; EU PWD Art 9 [2]; ILO C193 Art 13 [3] | Terms → "How you get orders"; this file |
| 14 days' notice of changed terms | Telangana s.13(2) [1] | Rate cards, the detour and the offer rules (code and trigger) |
| Declining carries no consequence | Telangana s.13(3)(b) [1] | Nothing reads declines |
| Explain each decision | EU PWD Art 11 [2]; C-203/22 [9] | `trip_offer.reason`, the offer line, the data copy |
| A person decides suspensions and terminations | Telangana s.14 [1]; EU PWD Art 10(5) [2] | Due process |
| Data access | DPDP s.11 [4]; ILO C193 Art 16 [3] | `/my-data` |
| No undue pressure | EU PWD Art 12 [2]; ILO C193 Art 5 [3] | No trip countdowns; breaks |
| Check the system regularly | EU PWD Arts 8 and 10 [2]; Garante 2021 [6] | Weekly pilot health; a replay before each rule change |
| Grievance officer, with reasoned orders in 30 days | Telangana ss.22–24 [1] | Support issues (fixed within 72 h). The in-app link to the State portal comes once the portal exists. |

For the lawyer:
1. **Is the Act in force?** Telangana issued G.O.Ms.No. 7 on 22 Jun 2026 "regarding implementation". If it brought the Act into force, ss.12–14 apply now.
2. **Radius and time to accept.** Should changes to either need 14 days' notice? Today, only the detour and the offer rules do.
3. **Translations.** The Telugu and Hindi wording for fair turns and breaks. The strings exist and wait for native review (P2-08).
4. **The State's data feed (s.21),** once its format is published.

## Sources

1. Telangana Platform Based Gig Workers Act, 2026 (Act 21), PRS India: https://prsindia.org/files/bills_acts/acts_states/telangana/2026/Act21of2026TG.pdf
2. Directive (EU) 2024/2831 on platform work, EUR-Lex: https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32024L2831
3. ILO Convention C193, decent work in the platform economy (12 Jun 2026): https://www.ilo.org/sites/default/files/2026-06/ILC114-Instrument%20C.193-EN.pdf
4. Digital Personal Data Protection Rules 2025, PIB: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
5. Bologna tribunal: Deliveroo's "Frank" was discriminatory (31 Dec 2020), Mind: https://www.mind.eu.com/rh/en/article/italy-deliveroos-long-used-algorithm-was-discriminatory-and-hindered-the-right-to-strike-rules-bologna-tribunal
6. Garante fines Foodinho €2.6m (2021), Covington Inside Privacy: https://www.insideprivacy.com/gdpr/italian-supervisory-authority-fines-foodinho-over-its-use-of-performance-management-algorithms/
7. Garante fines Foodinho €5m (2024), Eurofound: https://apps.eurofound.europa.eu/platformeconomydb/italy-privacy-authority-fines-foodinho-5-million-euro-for-rider-data-breaches-110198
8. Amsterdam Court of Appeal, drivers v Uber and Ola (4 Apr 2023), Fieldfisher: https://www.fieldfisher.com/en/insights/amsterdam-court-of-appeal-rules-in-favour-of-uber-and-ola-cabs-drivers
9. CJEU C-203/22 on automated decisions and trade secrets, Covington Inside Privacy: https://www.insideprivacy.com/gdpr/cjeu-clarifies-gdpr-rights-on-automated-decision-making-and-trade-secrets/
10. Uber BV v Aslam (19 Feb 2021), UK Supreme Court: https://www.supremecourt.uk/press-summary/uksc-2019-0029.html
11. Seattle App-Based Worker Minimum Payment Ordinance: https://www.seattle.gov/laborstandards/ordinances/app-based-worker-ordinances/app-based-worker-minimum-payment-ordinance
12. Gupta et al., FairFoody: Bringing in Fairness in Food Delivery (AAAI 2022): https://arxiv.org/pdf/2203.08849
13. Joshi et al., FoodMatch (ICDE 2021, Swiggy data): https://arxiv.org/pdf/2008.12905
14. Nair et al., Gigs with Guarantees (WORK4FOOD, IJCAI 2022): https://arxiv.org/pdf/2205.03530
15. Singh, Das and Chakraborty, FairAssign (FAccT 2023): https://www.cse.iitd.ac.in/~abhijnan/papers/singh_FairAssign_FAccT23.pdf
16. Sühr et al., Two-Sided Fairness for Repeated Matchings (KDD 2019): https://lamarr01.cs.tu-dortmund.de/LEHRE/SEMINARE/WS2021/TrustworthyAIMachineLearning/literature/suehr2019.pdf
17. Castro, Ma, Nazerzadeh and Yan, Randomized FIFO Mechanisms (2021): https://arxiv.org/pdf/2111.10706
18. Basık et al., Fair Task Allocation in Crowdsourced Delivery (2018): https://arxiv.org/pdf/1807.02987
19. DoorDash Engineering, Using ML and Optimization to Solve DoorDash's Dispatch Problem (2021): https://careersatdoordash.com/?p=5342
20. DoorDash Help, How to accept an offer: https://help.doordash.com/en-us/dashers/article/how-to-accept-an-order
21. Wolt, Algorithmic transparency: courier partners (2024): https://press.wolt.com/en-WW/237304-algorithmic-transparency-courier-partners/
22. Gojek, How we use machine learning to match drivers and riders: https://blog.gojek.io/how-we-use-machine-learning-to-match-drivers-riders
23. Liang et al., Meituan's real-time intelligent dispatching algorithms (INFORMS Journal on Applied Analytics, 2024): https://pubsonline.informs.org/doi/fpi/10.1287/inte.2023.0084
24. ifeng Tech, Meituan publishes its order-allocation rules (2021): https://tech.ifeng.com/c/8AvaHZwlpMa
25. InfoQ, Predicting time to cook, arrive and deliver at Uber Eats (2019): https://www.infoq.com/articles/uber-eats-time-predictions
26. Grab, How does Grab match trips and orders to partners? (2022, updated 2023): https://www.grab.com/sg/blog/public-policy/how-does-grab-match-trips-and-orders-to-driver-and-delivery-partners/
27. Rest of World, A tiny tweak to Zomato's algorithm (2021): https://restofworld.org/2021/how-a-small-change-to-zomatos-algorithm-created-havoc-for-delivery-riders/
28. UOC, Free-login riders study (2022): https://www.uoc.edu/es/news/2022/004-freelogin-riders-reparto-comida
29. NYC DCWP, Delivery worker pay report (2024): https://www.nyc.gov/site/dca/news/028-24/new-report-shows-mayor-adams-commissioner-mayuga-deliver-delivery-workers-significantly
30. Fairwork India Ratings 2024: https://production.ruralindiaonline.org/uploads/Fairwork_India_Ratings_2024_3978a6c53b.pdf
31. PAIGAM and University of Pennsylvania, Prisoners on Wheels? (2024): https://tgpwu.org/wp-content/uploads/2024/03/Report-Final-Print-1.pdf
32. NDMA heat advisory for gig work (2025), Mongabay India: https://india.mongabay.com/2025/08/gig-work-heats-up-disaster-body-steps-in-with-advisory/
33. Blinkit drops its 10-minute claim after the Labour Minister intervenes (13 Jan 2026), The Week (PTI): https://www.theweek.in/wire-updates/business/2026/01/13/blinkit-drops-10-minute-delivery-claim-after-labour-min-intervenes-swiggy-zepto-may-follow-suit.html
34. Uber, Understanding acceptance and cancellation rates (2025): https://www.uber.com/en-MX/blog/understanding-acceptance-and-cancellation-rates/
