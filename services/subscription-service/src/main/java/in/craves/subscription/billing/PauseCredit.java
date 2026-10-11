package in.craves.subscription.billing;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Paid days a customer paused are carried forward after the resume.
 * creditStart is null when there is nothing to credit; nextBillingDate is where billing restarts.
 */
public record PauseCredit(LocalDate creditStart, int creditDays, LocalDate nextBillingDate) {
    /** A PAID billing cycle, end-exclusive. */
    public record Cycle(LocalDate start, LocalDate end) {
    }

    /**
     * @param pausedOn    first day the pause actually stopped a meal
     * @param paidCycles  PAID cycles; only their days inside [pausedOn, resumeOn) are credited, so unpaid gaps are not
     * @param carriedDays days of an earlier pause credit that had not started yet and is laid out again with this one
     * @param keptThrough end (exclusive) of the last invoice still standing after the resume, or null
     */
    public static PauseCredit plan(
        LocalDate pausedOn, LocalDate resumeOn, List<Cycle> paidCycles, int carriedDays, LocalDate keptThrough
    ) {
        long paused = 0;
        for (Cycle cycle : paidCycles) {
            LocalDate from = cycle.start().isAfter(pausedOn) ? cycle.start() : pausedOn;
            LocalDate to = cycle.end().isBefore(resumeOn) ? cycle.end() : resumeOn;
            paused += Math.max(0, ChronoUnit.DAYS.between(from, to));
        }
        int creditDays = Math.toIntExact(paused + carriedDays);
        LocalDate start = keptThrough == null || keptThrough.isBefore(resumeOn) ? resumeOn : keptThrough;
        return new PauseCredit(creditDays > 0 ? start : null, creditDays, start.plusDays(creditDays));
    }
}
