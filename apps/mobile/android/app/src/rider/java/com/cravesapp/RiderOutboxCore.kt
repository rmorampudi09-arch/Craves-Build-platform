package com.cravesapp

/**
 * The phone's outbox rules without Android, so a JVM test proves them (RiderOutboxCoreTest). Trip steps (P2-02a): which
 * answer sends, keeps, holds or drops a step, the backoff, the tap's age, and one pass over the queue in order per trip,
 * mirroring the JS queue (src/features/rider/domain/offlineQueue.ts, flushFor); RiderOutbox runs them on the file and the
 * network. Unsent fixes (P2-03): which to keep while offline and how many go per call; RiderOnlineService runs those.
 */
object RiderOutboxCore {
  private const val BASE_DELAY_MS = 2_000L
  const val MAX_DELAY_MS = 60_000L
  /** The longest the customer's delivery OTP waits on the phone (decision E1). */
  const val OTP_KEPT_MS = 24 * 60 * 60_000L
  const val MAX_REFUSALS = 5

  /**
   * One trip step waiting for the server. body and fix are JSON object text; body never holds the customer's OTP, which
   * waits in otpSealed. occurredAt is Date.now() at the tap (null for steps saved before 1.1.0); elapsedMs and boot are
   * SystemClock.elapsedRealtime and Settings.Global.BOOT_COUNT then, -1 when unknown (steps moved from the JS queue).
   */
  data class Entry(
    val id: String,
    val riderId: String,
    val tripId: String,
    val action: String,
    val key: String,
    val body: String?,
    val otpSealed: String?,
    val occurredAt: Long?,
    val elapsedMs: Long,
    val boot: Int,
    val fix: String?,
    val createdAt: Long,
    val attempts: Int = 0,
    val nextAttemptAt: Long = 0,
    /** Not sent at the tap, so the rider was told it will sync and may have left: an OTP then goes with capturedOffline. */
    val deferred: Boolean = false,
  )

  /** The server's refusal of a trip's step, kept until the rider dismisses it. status 0: moved from the JS queue, already worded. */
  data class Refusal(
    val riderId: String,
    val tripId: String,
    val action: String,
    val status: Int,
    val code: String,
    val message: String,
    val attemptsLeft: Int?,
    val at: Long,
  )

  data class State(val entries: List<Entry> = emptyList(), val refusals: List<Refusal> = emptyList())

  /** What came back for one step: status null when no answer came (no signal, a timeout); trip (JSON) on a 2xx. */
  data class Answer(
    val status: Int?,
    val code: String = "",
    val message: String = "",
    val attemptsLeft: Int? = null,
    val trip: String? = null,
  )

  enum class Verdict { SENT, RETRY, HOLD, AUTH, REFUSED }

  enum class Kind { SENT, QUEUED, REJECTED }

  /** One step's result in a pass; answered marks the step the server refused (its trip's later steps go with it). */
  data class Result(val entry: Entry, val kind: Kind, val answer: Answer? = null, val answered: Boolean = false)

  /** retrying: a step failed for want of an answer or a server error, so another pass is worth scheduling. */
  data class Pass(val results: List<Result>, val needsAuth: Boolean, val retrying: Boolean)

  /** The stored queue: update applies a change to the current state and saves it before it returns. */
  interface Store {
    fun state(): State

    fun update(change: (State) -> State)
  }

  /**
   * SENT on a 2xx. RETRY (with backoff) without an answer, on 408, 429 and 5xx. AUTH on 401: this sign-in can't send now,
   * so the pass stops and counts nothing. HOLD on 403 or 404 to the shift credential, which moves only this shift's trips:
   * the step waits for the app's token. REFUSED on any other answer: the server's state wins.
   */
  fun verdict(status: Int?, viaCredential: Boolean): Verdict =
    when {
      status == null || status == 408 || status == 429 || status >= 500 -> Verdict.RETRY
      status in 200..299 -> Verdict.SENT
      status == 401 -> Verdict.AUTH
      viaCredential && (status == 403 || status == 404) -> Verdict.HOLD
      else -> Verdict.REFUSED
    }

  /** 2 s, doubling up to 60 s; attempts counts the failure just seen. */
  fun backoffMs(attempts: Int): Long = minOf(MAX_DELAY_MS, BASE_DELAY_MS shl (attempts - 1).coerceIn(0, 6))

  /** Due now, or the phone's clock went back (a wait longer than any backoff). */
  fun due(entry: Entry, now: Long): Boolean = entry.nextAttemptAt <= now || entry.nextAttemptAt - now > MAX_DELAY_MS

  /**
   * How long ago something happened (a tap, a fix): by the monotonic clock within the same boot, so a wrong or changed
   * phone clock doesn't matter (blueprint A6); else by the wall clock. Never negative.
   */
  fun ageMs(atWall: Long, atElapsed: Long, atBoot: Int, nowWall: Long, nowElapsed: Long, nowBoot: Int): Long =
    (if (atBoot >= 0 && atBoot == nowBoot && atElapsed >= 0) nowElapsed - atElapsed else nowWall - atWall).coerceAtLeast(0)

  /** How long ago the rider tapped; null without a tap. */
  fun sinceTapMs(entry: Entry, nowWall: Long, nowElapsed: Long, nowBoot: Int): Long? =
    entry.occurredAt?.let { ageMs(it, entry.elapsedMs, entry.boot, nowWall, nowElapsed, nowBoot) }

  /** The fix's age as sent: its age at the tap plus the time since (stepTap in riderApi.live.ts); null when unknown. */
  fun fixAgeMs(ageAtTapMs: Double?, sinceTapMs: Long): Long? =
    ageAtTapMs?.takeIf { it.isFinite() }?.let { maxOf(0L, Math.round(it)) + sinceTapMs }

  /** A wrong or locked code at the door shows by the code boxes; every other refusal, and a code typed offline, is kept. */
  fun keepRefusal(entry: Entry, code: String): Boolean = entry.deferred || (code != "OTP_INVALID" && code != "OTP_LOCKED")

  /** As read at process start: every step outlived its tap, and a code kept past 24 hours goes (decision E1). */
  fun loaded(state: State, now: Long): State =
    state.copy(
      entries = state.entries.map { it.copy(deferred = true, otpSealed = it.otpSealed.takeIf { _ -> now - it.createdAt <= OTP_KEPT_MS }) },
    )

  /** Unsent fixes (P2-03): one call's worth stays dense; beyond that one per 30 s; an hour (120) at most. */
  const val DENSE_FIXES = 20
  const val FIX_SPACING_MS = 30_000L
  const val MAX_FIXES_KEPT = 120
  /** The server caps a fix's age at an hour (FleetLocationService.MAX_FIX_AGE_MS): an older fix is dropped, never sent. */
  const val MAX_FIX_AGE_MS = 3_600_000L

  /** A new fix takes the newest kept one's place while more than a call's worth waits and that one is within 30 s of the one before. */
  fun replacesNewest(waiting: Int, newestAtMs: Long, beforeNewestAtMs: Long): Boolean =
    waiting >= DENSE_FIXES && newestAtMs - beforeNewestAtMs < FIX_SPACING_MS

  /** The server's maxFixes, 1 to 20; a server that doesn't say takes at most 5 (before P2-03). */
  fun fixesPerCall(maxFixes: Int?): Int = maxFixes?.coerceIn(1, DENSE_FIXES) ?: 5

  /** The server's nextPollSec (P2-04), 5 to 30 s; 10 s when it doesn't say. */
  fun idleUploadMs(nextPollSec: Int?): Long = (nextPollSec?.coerceIn(5, 30) ?: 10) * 1_000L

  /** The refusals with this one first: newest first, one per trip, at most 5. */
  fun withRefusal(refusals: List<Refusal>, refusal: Refusal): List<Refusal> =
    (listOf(refusal) + refusals.filter { it.tripId != refusal.tripId }).take(MAX_REFUSALS)

  /**
   * One pass in order per trip, as the JS queue's flushFor: a trip whose step waits out a backoff, fails, is held or was
   * refused sends nothing more in this pass. riderId: only that rider's steps (the app's token); null: every step (the
   * shift credential, which the server checks). skipBackoff: no step waits out a backoff; skipTrip: that trip's don't.
   * Each answer is stored before the next step goes, so a kill mid-pass sends at most one step again, under its key.
   */
  fun pass(
    store: Store,
    riderId: String?,
    viaCredential: Boolean,
    skipBackoff: Boolean,
    skipTrip: String?,
    now: () -> Long,
    send: (Entry) -> Answer,
  ): Pass {
    val results = ArrayList<Result>()
    val held = HashSet<String>()
    var retrying = false
    for (listed in store.state().entries) {
      if ((riderId != null && listed.riderId != riderId) || listed.tripId in held) continue
      val entry = store.state().entries.firstOrNull { it.id == listed.id } ?: continue
      if (!skipBackoff && skipTrip != entry.tripId && !due(entry, now())) {
        held += entry.tripId
        results += Result(entry, Kind.QUEUED)
        continue
      }
      val answer = send(entry)
      when (verdict(answer.status, viaCredential)) {
        Verdict.SENT -> {
          // A later step of the trip went through, so an earlier refusal of it no longer needs the rider.
          store.update { state ->
            State(state.entries.filter { it.id != entry.id }, state.refusals.filter { it.tripId != entry.tripId })
          }
          results += Result(entry, Kind.SENT, answer)
        }
        Verdict.RETRY -> {
          held += entry.tripId
          retrying = true
          val attempts = entry.attempts + 1
          val nextAttemptAt = now() + backoffMs(attempts)
          store.update { state ->
            state.copy(entries = state.entries.map { if (it.id == entry.id) it.copy(attempts = attempts, nextAttemptAt = nextAttemptAt) else it })
          }
          results += Result(entry, Kind.QUEUED)
        }
        Verdict.HOLD -> {
          held += entry.tripId
          results += Result(entry, Kind.QUEUED)
        }
        Verdict.AUTH -> {
          results += Result(entry, Kind.QUEUED)
          return Pass(results, needsAuth = true, retrying = retrying)
        }
        Verdict.REFUSED -> {
          // The server refused (the trip was cancelled, a wrong code): its state wins, so this trip's queue goes.
          held += entry.tripId
          val dropped = store.state().entries.filter { it.tripId == entry.tripId && it.riderId == entry.riderId }
          val refusal =
            Refusal(entry.riderId, entry.tripId, entry.action, answer.status ?: 0, answer.code, answer.message, answer.attemptsLeft, now())
          store.update { state ->
            State(
              state.entries.filter { kept -> dropped.none { it.id == kept.id } },
              if (keepRefusal(entry, answer.code)) withRefusal(state.refusals, refusal) else state.refusals,
            )
          }
          dropped.forEach { results += Result(it, Kind.REJECTED, answer, answered = it.id == entry.id) }
        }
      }
    }
    return Pass(results, needsAuth = false, retrying = retrying)
  }
}
