package com.cravesapp

import com.cravesapp.RiderOutboxCore.Answer
import com.cravesapp.RiderOutboxCore.Entry
import com.cravesapp.RiderOutboxCore.Kind
import com.cravesapp.RiderOutboxCore.Refusal
import com.cravesapp.RiderOutboxCore.State
import com.cravesapp.RiderOutboxCore.Verdict
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** P2-02a: the native outbox keeps, sends, holds and drops trip steps as the JS queue does (offlineQueue.test.ts). */
class RiderOutboxCoreTest {
  private val now = 1_761_550_000_000L

  private class Memory(var state: State) : RiderOutboxCore.Store {
    var writes = 0

    override fun state() = state

    override fun update(change: (State) -> State) {
      state = change(state)
      writes += 1
    }
  }

  private fun entry(id: String, trip: String = "t1", action: String = "picked-up", rider: String = "r1", deferred: Boolean = false) =
    Entry(id, rider, trip, action, "key-$id", null, null, now - 1_000, -1, -1, null, now - 1_000, deferred = deferred)

  private fun pass(memory: Memory, answers: Map<String, Answer>, riderId: String? = "r1", viaCredential: Boolean = false, skipBackoff: Boolean = false,
                   skipTrip: String? = null, sent: MutableList<String> = mutableListOf()) =
    RiderOutboxCore.pass(memory, riderId, viaCredential, skipBackoff, skipTrip, { now }) {
      sent += it.id
      answers.getValue(it.id)
    }

  @Test
  fun verdictsFollowTheJsQueue() {
    assertEquals(Verdict.RETRY, RiderOutboxCore.verdict(null, false))
    listOf(408, 429, 500, 502, 503, 504, 599).forEach { assertEquals("$it", Verdict.RETRY, RiderOutboxCore.verdict(it, false)) }
    listOf(200, 201, 204).forEach { assertEquals(Verdict.SENT, RiderOutboxCore.verdict(it, true)) }
    assertEquals(Verdict.AUTH, RiderOutboxCore.verdict(401, false))
    assertEquals(Verdict.AUTH, RiderOutboxCore.verdict(401, true))
    // The credential moves only this shift's trips: another trip waits for the app's token, never dropped.
    assertEquals(Verdict.HOLD, RiderOutboxCore.verdict(404, true))
    assertEquals(Verdict.HOLD, RiderOutboxCore.verdict(403, true))
    listOf(400, 403, 404, 409, 422, 423).forEach { assertEquals("$it", Verdict.REFUSED, RiderOutboxCore.verdict(it, false)) }
  }

  @Test
  fun backoffDoublesFromTwoSecondsToAMinute() {
    assertEquals(listOf(2_000L, 4_000L, 8_000L, 16_000L, 32_000L, 60_000L, 60_000L), (1..7).map { RiderOutboxCore.backoffMs(it) })
    assertEquals(60_000L, RiderOutboxCore.backoffMs(500))
  }

  @Test
  fun aStepIsDueAfterItsBackoffOrWhenTheClockWentBack() {
    assertTrue(RiderOutboxCore.due(entry("a").copy(nextAttemptAt = now), now))
    assertFalse(RiderOutboxCore.due(entry("a").copy(nextAttemptAt = now + 30_000), now))
    assertTrue(RiderOutboxCore.due(entry("a").copy(nextAttemptAt = now + 3_600_000), now))
  }

  @Test
  fun theTapsAgeUsesTheMonotonicClockInTheSameBootOnly() {
    val tapped = entry("a").copy(occurredAt = now - 90_000, elapsedMs = 500_000, boot = 7)
    // The wall clock jumped an hour: the same boot still counts 30 s from the monotonic clock.
    assertEquals(30_000L, RiderOutboxCore.sinceTapMs(tapped, now + 3_600_000, 530_000, 7))
    assertEquals(90_000L, RiderOutboxCore.sinceTapMs(tapped, now, 10_000, 8))
    assertEquals(0L, RiderOutboxCore.sinceTapMs(tapped.copy(boot = -1), now - 200_000, 0, -1))
    assertNull(RiderOutboxCore.sinceTapMs(tapped.copy(occurredAt = null), now, 0, 7))
    assertEquals(4_000L + 30_000L, RiderOutboxCore.fixAgeMs(3_999.6, 30_000))
    assertEquals(30_000L, RiderOutboxCore.fixAgeMs(-50.0, 30_000))
    assertNull(RiderOutboxCore.fixAgeMs(Double.NaN, 30_000))
    assertNull(RiderOutboxCore.fixAgeMs(null, 30_000))
  }

  @Test
  fun sendsEachTripInOrderAndAFailureHoldsOnlyItsTrip() {
    val memory = Memory(State(listOf(entry("a1", "t1"), entry("a2", "t1", "arrived-drop"), entry("b1", "t2"), entry("b2", "t2", "arrived-drop"))))
    val sent = mutableListOf<String>()
    val pass = pass(memory, mapOf("a1" to Answer(null), "b1" to Answer(200, trip = "{\"tripId\":\"t2\"}"), "b2" to Answer(200)), sent = sent)
    assertEquals(listOf("a1", "b1", "b2"), sent)
    assertTrue(pass.retrying)
    assertEquals(listOf("a1", "a2"), memory.state.entries.map { it.id })
    val failed = memory.state.entries.first()
    assertEquals(1, failed.attempts)
    assertEquals(now + 2_000, failed.nextAttemptAt)
    assertEquals(listOf(Kind.QUEUED, Kind.SENT, Kind.SENT), pass.results.map { it.kind })
    assertEquals("{\"tripId\":\"t2\"}", pass.results[1].answer?.trip)
    // Each answer was saved before the next step went.
    assertEquals(3, memory.writes)
  }

  @Test
  fun aStepWaitingOutItsBackoffWaitsUnlessTheRiderTappedThatTripOrTheNetworkCameBack() {
    val waiting = entry("a1").copy(attempts = 1, nextAttemptAt = now + 10_000)
    val memory = Memory(State(listOf(waiting, entry("a2", action = "arrived-drop"))))
    assertEquals(listOf(Kind.QUEUED), pass(memory, emptyMap()).results.map { it.kind })
    val sent = mutableListOf<String>()
    pass(memory, mapOf("a1" to Answer(200), "a2" to Answer(200)), skipTrip = "t1", sent = sent)
    assertEquals(listOf("a1", "a2"), sent)
    val again = Memory(State(listOf(waiting)))
    pass(again, mapOf("a1" to Answer(200)), skipBackoff = true)
    assertTrue(again.state.entries.isEmpty())
  }

  @Test
  fun aRefusalDropsThatRidersTripAndKeepsTheNoticeButNotAWrongCodeAtTheDoor() {
    val other = entry("x1", rider = "r2")
    val memory = Memory(State(listOf(entry("a1"), entry("a2", action = "arrived-drop"), entry("b1", "t2"), other)))
    val refused = Answer(409, "TRIP_CANCELLED", "This trip was cancelled.")
    val pass = pass(memory, mapOf("a1" to refused, "b1" to Answer(200)))
    assertEquals(listOf("b1" to Kind.SENT, "a1" to Kind.REJECTED, "a2" to Kind.REJECTED).sortedBy { it.first },
      pass.results.map { it.entry.id to it.kind }.sortedBy { it.first })
    assertEquals(listOf(true, false), pass.results.filter { it.kind == Kind.REJECTED }.map { it.answered })
    assertEquals(listOf("x1"), memory.state.entries.map { it.id })
    assertEquals(listOf(Refusal("r1", "t1", "picked-up", 409, "TRIP_CANCELLED", "This trip was cancelled.", null, now)), memory.state.refusals)
    assertFalse(pass.retrying)

    val door = Memory(State(listOf(entry("d1", action = "delivered"))))
    pass(door, mapOf("d1" to Answer(422, "OTP_INVALID", "Wrong code.", 2)))
    assertTrue(door.state.refusals.isEmpty())
    val offline = Memory(State(listOf(entry("d1", action = "delivered", deferred = true))))
    pass(offline, mapOf("d1" to Answer(422, "OTP_INVALID", "Wrong code.", 0)))
    assertEquals(listOf("OTP_INVALID" to 0), offline.state.refusals.map { it.code to it.attemptsLeft })
  }

  @Test
  fun aSentStepClearsItsTripsNoticeAndNoticesStayOnePerTripFiveAtMost() {
    val notices = (1..5).map { Refusal("r1", "t$it", "picked-up", 409, "C", "m", null, now - it) }
    val memory = Memory(State(listOf(entry("a1", "t3")), notices))
    pass(memory, mapOf("a1" to Answer(200)))
    assertEquals(listOf("t1", "t2", "t4", "t5"), memory.state.refusals.map { it.tripId })
    val newest = RiderOutboxCore.withRefusal(notices, Refusal("r1", "t9", "arrived-drop", 409, "C", "m", null, now))
    assertEquals(listOf("t9", "t1", "t2", "t3", "t4"), newest.map { it.tripId })
    assertEquals(listOf("t2", "t1", "t3", "t4", "t5"), RiderOutboxCore.withRefusal(notices, notices[1]).map { it.tripId })
  }

  @Test
  fun aDeadSignInStopsThePassAndCountsNothing() {
    val memory = Memory(State(listOf(entry("a1"), entry("b1", "t2"))))
    val sent = mutableListOf<String>()
    val pass = pass(memory, mapOf("a1" to Answer(401)), sent = sent)
    assertTrue(pass.needsAuth)
    assertEquals(listOf("a1"), sent)
    assertEquals(listOf(0, 0), memory.state.entries.map { it.attempts })
    assertEquals(0, memory.writes)
  }

  @Test
  fun theCredentialSendsEveryRidersStepsAndHoldsOnesTheServerWontMoveForIt() {
    val memory = Memory(State(listOf(entry("a1"), entry("a2", action = "arrived-drop"), entry("x1", "t2", rider = "r2"))))
    val sent = mutableListOf<String>()
    val pass = pass(memory, mapOf("a1" to Answer(404, "TRIP_NOT_FOUND"), "x1" to Answer(200)), riderId = null, viaCredential = true, sent = sent)
    assertEquals(listOf("a1", "x1"), sent)
    assertEquals(listOf("a1", "a2"), memory.state.entries.map { it.id })
    assertTrue(memory.state.refusals.isEmpty())
    assertFalse(pass.retrying)
    // With a token, only that rider's steps go.
    val token = Memory(State(listOf(entry("a1"), entry("x1", "t2", rider = "r2"))))
    val tokenSent = mutableListOf<String>()
    pass(token, mapOf("a1" to Answer(200)), riderId = "r1", sent = tokenSent)
    assertEquals(listOf("a1"), tokenSent)
  }

  @Test
  fun stepsReadAtStartOutlivedTheirTapAndACodeOlderThanADayGoes() {
    val fresh = entry("a1").copy(otpSealed = "sealed", createdAt = now - 60_000)
    val stale = entry("a2").copy(otpSealed = "sealed", createdAt = now - RiderOutboxCore.OTP_KEPT_MS - 1)
    val loaded = RiderOutboxCore.loaded(State(listOf(fresh, stale)), now)
    assertEquals(listOf(true, true), loaded.entries.map { it.deferred })
    assertEquals(listOf("sealed", null), loaded.entries.map { it.otpSealed })
  }
}
