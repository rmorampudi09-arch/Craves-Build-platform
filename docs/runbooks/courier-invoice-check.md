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
   | `CRAVES_AMOUNT_UNKNOWN` | Craves has the booking but the courier's answer carried no price. Check the line by hand. |
   | `NOT_ON_INVOICE` | Craves recorded a booking in the period that the invoice lacks. `cancelled` and `deliveryStatus` say what became of it; a booking the courier cancelled itself is normal here. |

5. **Raise disputes with the courier yourself,** within its window (Pidge: 7 days; Borzo: ask). A corrected invoice is
   imported under a new reference, for example `INV-1182-R1`; the first import stays as it was.

## Settings

`PUT /api/v1/admin/fleet/courier-billing/settings/{courier}` keeps, per courier: the billing mode, a tax note and
rate, who bears a disputed fee, and two alert thresholds. All of it is a record of what was agreed. The system acts on
none of it, except that a threshold makes it write one alert line when a booking costs more than the per-order amount,
or when a day's bookings with that courier pass the per-day amount. Bookings are never blocked.
