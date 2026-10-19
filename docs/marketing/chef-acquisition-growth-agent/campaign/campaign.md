# Full-scale chef campaign: 14 to 28 Oct 2026

Owner's call (14 Oct): recruit Hyderabad home chefs as fast as possible, with posts, stories and reels every day. Claude publishes on schedule, and Tenglish goes out now and gets fixed later.

## How it runs

| Part | Who | How |
|---|---|---|
| Feed carousels and images | Claude, automatic | A scheduled routine runs at 11:23 and 20:23 IST, with catch-up runs at 13:23 and 22:23 that publish anything a missed run left undone (added 19 Oct after six runs were lost to session restarts). It publishes the due slots in [schedule.json](schedule.json) through Windsor.ai, logs them in [published.csv](published.csv), and commits. Images are served from this public repo (`assets/`). |
| Stories (ST1, ST2, ST3, ST6, ST7, ST8) | Claude, automatic | Same routine. The API can't add link stickers, so the last frame says "craves.in/chef/application, link in bio". |
| Interactive stories (ST4 poll, ST5 question box, ST9 slider) | Your team, from the app | Post the frames in `assets/ST4`, `assets/ST5` and `assets/ST9` and add the sticker on the blank frame (text is in [stories.json](stories.json)). Add a link sticker on the last frame. Any day works. |
| CHEF comments | Claude, automatic | At every run, Claude replies publicly to new CHEF comments with the apply link, answers questions from the reply bank, hides spam, and logs everything in [replied.csv](replied.csv). It cannot send DMs. |
| Animated reels (no filming) | Claude | `assets/reels/`: "How it works" (live 15 Oct, 01:35), "FSSAI 2026" (live Sat 17, 14:33), "Packaging free + pickup" (Sat 17, 20:23). Built with the motion-reel skill from SAFE claims only. FSSAI and Packaging use "Life of Riley" by Kevin MacLeod (CC BY 4.0, credited in the caption), music only. |
| Reels 1 to 8 | Your team films, then posts | Scripts: [week-1.md](../week-1.md) (Reels 1 to 3) and [reels.md](reels.md) (Reels 4 to 8). Post one a day from Fri 16 Oct, at 11:30 or 20:30, as soon as each is filmed. |
| Boosts | Owner | Order and setup in [reels.md, section B](reels.md#b-boost-plan): C1 and C3 first, then the best reel at 48 hours. Until someone answers DMs within the hour, choose **Profile visits**, not Messages. |
| LEARN | Claude, automatic | Sun 18 Oct 20:23 (early read) and Sun 25 Oct 20:23 (full). Claude pulls the numbers and writes `learn-YYYY-MM-DD.md`. It may add up to 2 new graphics a week built only from SAFE ledger claims. |

## Schedule (IST)

| When | Feed | Story |
|---|---|---|
| Wed 14 Oct, 22:14 | C1 launch carousel (published) | ST1 (published) |
| Thu 15, 11:23 | C3 "Keep these 5 ready" (missed; published Sat 17, 14:36) | ST2 checklist (skipped, late) |
| Thu 15, 20:23 | "FSSAI 2026" reel (missed; published Sat 17, 14:33) | ST3 FSSAI (skipped, late) |
| Fri 16, 11:23 | (missed, moved below) | ST6 packaging and pickup (skipped, late) |
| Fri 16, 20:23 | (missed, moved below) | ST7 your money (skipped, late) |
| Sat 17, 11:23 | (run missed; ran 14:33 to 14:38) | ST8 send to the best cook (published 14:38) |
| Sat 17, 20:23 | "Packaging free + pickup" reel | ST1 |
| Sun 18, 11:23 | C6 FAQ (run missed; published 20:34) | ST2 (skipped, late) |
| Sun 18, 20:23 | LEARN (C3-TE moved to Wed 21, 20:23) | ST3 (published) |
| Mon 19, 11:23 | C5 (run missed; both retries went live at 20:28 and 21:13, so it posted twice) | ST6 (skipped, late) |
| Mon 19, 20:23 | I1 "Comment CHEF" poster (published 21:14) | ST7 (published) |
| Tue 20, 11:23 | C2 "How it works" | ST8 |
| Tue 20, 20:23 | I2 "Packaging free once approved" | ST1 |
| Wed 21, 11:23 | C4 FSSAI 2026 | ST2 |
| Wed 21, 20:23 | C3-TE (Telugu-script test) | ST3 |
| Thu 22 to Wed 28, 11:23 and 20:23 | Team reels, plus any LEARN graphics | One story sequence per slot, rotating ST6, ST7, ST8, ST1, ST2, ST3 |
| Sun 25, 20:23 | Full LEARN | |

The routine turns itself off after the last catch-up run (Wed 28 Oct, 22:23).

## What the team must do

1. **Tonight: change the bio link** to `https://craves.in/chef/application`. Every story and caption now says "link in bio", and Claude can't edit the bio. Use the chef bio from [week-1.md section 2](../week-1.md#2-profile-fix-do-it-before-monday-19-oct).
2. **Boost C1 now** and C3 (it posted Sat 17, 14:36).
3. **Pin C1**, and C3 after it posts.
4. **Optional, 5 minutes on a computer:** switch on the Meta Business Suite comment-to-message automation (week-1.md section 4). Claude can't do this from here. Once it's on, people also get the link by DM.
5. Film and post the reels, and post the three interactive stories.

## Rules the routine follows

- Only SAFE claims from the [claims ledger](../brand.md). No income figures, no fee, Hyderabad only.
- Public replies to CHEF comments contain the link, so they include the word "chef". LEARN leaves out comments from @craves.in_ when counting CHEF comments.
- Keep every JPG under about 200 KB. A 244 KB story frame failed to publish, and the same frame at 174 KB worked. Re-render with [render.py](render.py), which reads text from feed.json or stories.json.
