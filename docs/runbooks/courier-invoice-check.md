# Monthly courier invoice check

For payments or platform admins, once `CRAVES_DELIVERY_COURIER_CHARGE_ENABLED` is on. It compares a courier's invoice
with the prices Craves recorded when it booked. It is a comparison only: nothing is paid, disputed, refunded or
adjusted by the system. Details: `services/integration-service/docs/delivery-orchestration/README.md`, "Courier
charges, invoice import and billing settings".

## Each month (or each invoice)

1. **Get the invoice** from the courier's portal or account manager (Borzo's API has no invoice or statement).
2. **Make the CSV.** One line per booking, with this exact first line:

   ```
   booking_reference,amount,tax,date
   3451201,61.50,11.07,2026-11-02
   ```

   - `booking_reference` is the courier's own booking id (the one Craves shows on the delivery).
   - `amount` in rupees with at most two decimals: no ₹ sign, no commas, no quotes. Use the same basis (with or
     without GST) as the price the courier's app shows for a booking, and note which in the courier's tax note.
   - `tax` and `date` may be empty. If the invoice lists a booking on several lines, add them into one line first.
3. **Import it:** `POST /api/v1/admin/fleet/courier-billing/invoices` with the courier (`borzo` or `pidge`), the
   invoice's own reference, the first and last day it covers (India days), and the CSV text. A refused file names the
   line to fix and stores nothing. Importing the same file twice is harmless.
4. **Read the answer** (also on Pilot health, `courier_invoice_accuracy`):

   | Outcome | What to do |
   |---|---|
   | `MATCHED` | Nothing. |
   | `AMOUNT_DIFFERS` | Look at the delivery: a waiting or return fee is not recorded by Craves yet and shows here. Ask the courier about any difference the delivery's timeline does not explain. |
   | `NOT_IN_CRAVES` | The courier billed a booking Craves has no record of: a booking from before the flag was on, a stray booking, or a billing error. Ask the courier for its details. |
   | `CRAVES_AMOUNT_UNKNOWN` | Craves has the booking but the courier's answer carried no price, or Craves cancelled it without knowing whether a rider was assigned (see Cancels below). Check the line by hand. |
   | `NOT_ON_INVOICE` | Craves recorded a booking in the period that the invoice lacks. `cancelled` and `deliveryStatus` say what became of it; a booking the courier cancelled itself is normal here. |

5. **Raise disputes with the courier yourself,** within its window (Pidge: 7 days; Borzo: ask). A corrected invoice is
   imported under a new reference, for example `INV-1182-R1`; the first import stays as it was.

## Settings

`PUT /api/v1/admin/fleet/courier-billing/settings/{courier}` keeps, per courier: the billing mode, a tax note and
rate, who bears a disputed fee, and two alert thresholds. All of it is a record of what was agreed. The system acts on
none of it, except that a threshold makes it write one alert line when a booking costs more than the per-order amount,
or when a day's bookings with that courier pass the per-day amount. Bookings are never blocked.

### Owner decisions, 19 Nov 2026

Both couriers are paid the same way today: Craves tops up a **prepaid wallet** with Borzo and another with Pidge, and
each courier deducts every order from its own wallet. So, when the flag goes on, save for **both** `borzo` and `pidge`:

| Setting | Value | Why |
|---|---|---|
| `billingMode` | `PREPAID_WALLET` | How both are paid today. |
| `taxNote` | `Wallet deduction as charged; GST per the courier's tax invoice` | The money that leaves Craves is the wallet deduction. |
| `taxRateBps` | empty until checked | Check one wallet line: if the deduction equals the price shown at booking, GST is inside it. Then record the rate the courier's tax invoice states (18 % is `1800`). |
| `disputedFeeBorneBy` | `CRAVES` | A courier's fee is between Craves and the courier: the customer paid a fixed delivery fee and the chef did nothing wrong. |
| `perOrderAlertPaise`, `perDayAlertPaise` | empty for the first week | Set them from the first week's real spend, for example the per-day amount near a day's top-up, so the alert says "top up soon". |

**The "invoice" is the wallet statement.** Export the month's wallet history from each courier's portal and turn every
order deduction into one CSV line (`booking_reference` = the courier's order id, `amount` = the deduction). Top-ups and
refunds to the wallet are not bookings: leave them out. Differences are then read as in the table above, to the paisa.

**Cancels.** Customers cannot cancel an order, but Craves itself cancels a courier booking in four cases: Borzo found no
rider in time and the order moves to Pidge; a Craves rider takes an order a courier also holds; a duplicate booking
made after a lost answer; and ops cancelling a delivery. Craves never records the price the courier shows after a
cancel. It records `0` when it read, just before cancelling, that the courier had no rider assigned (cancelling is free
then on both), and an unknown amount when a rider was assigned or it cannot tell (the fleet's own cancel reads nothing
first). So a free cancel the wallet does not deduct is not listed; one the wallet does deduct is `AMOUNT_DIFFERS`; an
unknown one is `CRAVES_AMOUNT_UNKNOWN`, or `NOT_ON_INVOICE` with no Craves amount when the wallet shows nothing. Read
the deduction on the wallet line: after a rider is assigned a fee may apply (Borzo mentions about ₹40; Pidge's is not
known). Before the flag goes on, still find one such order in each wallet's history to confirm a cancel before a rider
deducts nothing.
