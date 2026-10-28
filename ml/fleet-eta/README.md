# Craves travel-time model (`ml/fleet-eta`)

Predicts how many minutes a leg of a rider's trip takes: **rider → kitchen** (leg 0) or **kitchen → customer** (leg 1), from where, to where, and when (IST hour and weekday). It is the machine-learning part of rider dispatch, the same idea as Swiggy's and Zomato's first-mile and last-mile ETA models:

- **What riders and chefs see.** With `CRAVES_FLEET_ETA_MODE=live`, the offer shows the predicted minutes for both legs, and the chef's "rider arrives at" time uses the pickup leg. The minutes shown stay between 60 km/h on the straight line and 120 minutes.
- **Ranking.** Only where the dispatch policy says so (its "rank by travel time" rule, which riders get 14 days' notice of), and only with a version whose ranking passed (below): the riders nearest by straight line (up to 50) are ranked by predicted minutes to the kitchen. A rider across a lake, a flyover or a one-way street is no longer "nearest" just because the straight line is short. Fair turns, heading home, test mode and every other rule are unchanged (`docs/riders/DISPATCH.md` §2, "The travel-time model").
- **Fairness.** It predicts roads, never people: no rider, rating, decline or history is a feature, so anyone at the same spot at the same moment gets the same estimate. Training weighs every rider alike and is tested on riders it never saw, so it can't learn who rides fast from where they wait.

Training happens here, in Python (scikit-learn). Production never runs Python: the model is exported as plain JSON trees, which `EtaModel` evaluates in Java, exactly as scikit-learn does:

- integration-service: `in.craves.integration.fleet.eta.EtaModel`;
- the fleet engine: `in.craves.fleetengine.eta.EtaModel`.

Both copies are tested against `testdata/golden.json`, bit for bit.

## The model

- **Algorithm.** `GradientBoostingRegressor` with the absolute-error loss: 200 trees, depth 5, rate 0.05, 80% subsampling, at least 20 legs a leaf. It predicts the median, so a few very slow trips (a puncture, a wrong address) don't drag every estimate up.
- **Features** (`fleet_eta/features.py`, the same order and formulas as `EtaModel.features`):
  - straight-line metres;
  - both ends' latitude and longitude;
  - the bearing's sine and cosine;
  - IST hour and weekday;
  - the leg.
- **Training data** (`training_data.sql`, read-only). Every Craves-fleet trip delivered in the last 90 days, as two legs.
  - The pickup leg is the ride itself: it starts when the rider sets off (the last real fix near where they accepted, just before they first moved 50 m), and ends on arriving at the kitchen. A wait before setting off isn't counted as riding.
  - The drop leg runs from pickup to arriving at the drop.
  - What leaves the database: both ends to 3 decimal places (about 110 m), the straight-line metres and bearing between the exact ends, the start time to the quarter hour, the minutes, the distances today's estimate used (`rule_metres`), and `rider_group`, a number drawn afresh for each rider in every export. No rider, customer, order or trip id; two exports can't be matched.
  - Legs that don't look like real rides are left out: under 15 seconds or over 120 minutes, over 30 km, or over 60 km/h.
- **Every rider counts alike.** A pickup leg weighs 1 over that rider's pickup legs from the same neighbourhood (about 1 km), so a rider who always waits at one spot can't teach the model that the spot is slow or fast.

## How a version is judged

`train` holds out legs the model never trains on, and the model it judges is the model it writes (it isn't trained again on everything):

- a fifth of the riders entirely, when the export knows at least 5 riders;
- the newest fifth of the other riders' legs.

Two verdicts, from those legs:

- **Minutes** (`verdict`): `better` only if the model's minutes are closer to what happened than today's rule (the offer's own distances at 20 km/h) on pickup legs, on drop legs, and on the pickups of the riders it never saw (at least 20). Otherwise `worse`, or `too-few` when there isn't enough to tell. Only a `better` version is written and published: its minutes are what riders and chefs see.
- **Ranking** (`rankingVerdict`): of the pairs of pickup legs to the same kitchen (within 300 m), started within 2 hours of each other, whose real minutes differ by at least half a minute, how often the model puts the rider who really got there first ahead, against today's rule. `better` (at least as often, from 30 pairs), `not-better` or `too-few`. Minutes can be better on average without ranking any better, so only a version whose ranking is `better` may decide who hears first; integration-service reads it from the version's `metrics.heldOutTest.rankingVerdict`.

## Retraining (a person, about monthly)

At least 500 legs are needed: `train` refuses fewer. That is a few weeks of pilot trips.

1. **Export the legs** from a machine that can reach the database, with a read-only role:

   ```
   psql "$FLEET_READONLY_URL" -v ON_ERROR_STOP=1 --csv -f ml/fleet-eta/training_data.sql > legs.csv
   ```

2. **Train** (Python 3.13; `pip install -r ml/fleet-eta/requirements.txt`, from `ml/fleet-eta`):

   ```
   python -m fleet_eta train --legs legs.csv --version eta-YYYYMMDD-a --out eta-YYYYMMDD-a.json
   ```

   It prints the held-out report: minutes wrong (MAE, 90th percentile, bias), the model's against today's rule, overall, per leg and for the riders it never saw, and the ranking. Then, on its own line, `FLEET_ETA_VERDICT minutes=… ranking=…`.
   - Exit 0: the model is written to `--out`.
   - Exit 1: its minutes are worse than today's rule. Nothing is written.
   - Exit 2: too little data to judge it. Nothing is written.

3. **Check it on recent trips** whenever you like, against any later export. Only legs newer than any the version saw are used (exit 2 when there are none):

   ```
   python -m fleet_eta evaluate --legs legs.csv --model eta-YYYYMMDD-a.json
   ```

4. **Publish the version** to the database. It changes nothing by itself. `sql` refuses a version not judged better (`FLEET_ETA_NOT_PUBLISHED`, exit 1). Running the SQL again changes nothing, and a different model under a version already taken is refused:

   ```
   python -m fleet_eta sql --model eta-YYYYMMDD-a.json > eta.sql
   psql "$FLEET_ADMIN_URL" -v ON_ERROR_STOP=1 -f eta.sql
   ```

   Then delete `legs.csv`: it holds trip places and times.

5. **Shadow it.** On integration-service, set:
   - `CRAVES_FLEET_ETA_MODEL_VERSION=eta-YYYYMMDD-a`;
   - `CRAVES_FLEET_ETA_MODE=shadow`.

   This is an app setting, as in `GO-LIVE.md` §8. Nothing riders see changes. `FLEET_ETA_LOADED version=… ranking=…` confirms the load. Then watch `FLEET_ETA_SHADOW` lines: how often the model would offer the order to someone else first (`same=false`), and its predicted minutes.

6. **Go live** with `CRAVES_FLEET_ETA_MODE=live`. Offers and the chef's arrival time then show the model's minutes. Who hears first doesn't change, so no notice is needed for this step.

7. **Rank by it** only with a version whose ranking is `better`, after the rider app release that words the rule, and with 14 days' notice (Telangana Act 21 of 2026, as for fair turns): tick "Rank by travel time" in the console's dispatch policy, with a start at least 14 days away (`GO-LIVE.md` §10). With the fleet engine on, integration-service publishes the version to Redis, and the engine ranks with it.

   **Roll back** by setting `CRAVES_FLEET_ETA_MODE=off`, or the previous version; old rows stay in `fleet_schema.eta_model`.

A version that is missing or can't be read logs `CRAVES_ALERT alert=FLEET_ETA_MODEL_MISSING` or `FLEET_ETA_MODEL_REFUSED`, and dispatch keeps today's rule. A policy that ranks by travel time with no live version allowed to logs `CRAVES_ALERT alert=FLEET_ETA_NOT_RANKING` and ranks by distance.

## Tests

```
cd ml/fleet-eta && python -m unittest discover -s tests
```

- The features match integration-service's distances to the bit, and use IST hours and weekdays.
- The numpy evaluation equals scikit-learn's own predictions exactly.
- Training judges the model on legs and riders it never saw, and keeps the model it judged; it refuses too few legs.
- A rider's usual spot teaches the model nothing about the spot; each rider weighs one in each place they set off from.
- Ranking is judged on riders to the same kitchen at about the same time, apart from the minutes.
- Served minutes stay within what a ride can take.
- Implausible legs are left out, and older exports still read.
- Only a better version is published, and a version already taken is refused.
- The command line writes only a better model and evaluates only newer legs.

`python -m fleet_eta golden` rewrites `testdata/golden.json`: a small model trained on synthetic legs, and 204 rows with the features Python computes and scikit-learn's predictions. The Java `EtaModelTest`s read it.
