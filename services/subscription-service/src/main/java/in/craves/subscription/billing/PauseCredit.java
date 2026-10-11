package in.craves.subscription.billing;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * Paid days a customer paused are carried forward after the resume.
 * creditStart is null when there is nothing to credit; nextBillingDate is where billing restarts.
 */
public record PauseCredit(LocalDate creditStart, int creditDays, LocalDate nextBillingDate) {

    /**
     * @param paidThrough end (exclusive) of the last PAID cycle, or null if nothing was ever paid
     * @param keptThrough end (exclusive) of the last invoice still standing after the resume, or null
     */
    public static PauseCredit plan(LocalDate pausedOn, LocalDate resumeOn, LocalDate paidThrough, LocalDate keptThrough) {
        LocalDate paidEnd = paidThrough == null ? pausedOn
            : resumeOn.isBefore(paidThrough) ? resumeOn : paidThrough;
        int creditDays = (int) Math.max(0, ChronoUnit.DAYS.between(pausedOn, paidEnd));
        LocalDate start = keptThrough == null || keptThrough.isBefore(resumeOn) ? resumeOn : keptThrough;
        return new PauseCredit(creditDays > 0 ? start : null, creditDays, start.plusDays(creditDays));
    }
}
