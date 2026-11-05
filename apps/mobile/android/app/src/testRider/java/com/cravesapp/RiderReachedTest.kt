package com.cravesapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** App 1.3.3 (R-03): the "Reached the kitchen?" question, from fixes alone. */
class RiderReachedTest {
  private val kitchenLat = 17.4483
  private val kitchenLng = 78.3915
  // About 0.00045° of longitude is 48 m here; 0.002° is over 200 m.
  private val atGate = kitchenLng + 0.00045
  private val downTheRoad = kitchenLng + 0.002

  private fun machine() = RiderReached().apply { trip("t1", "TO_KITCHEN", "Lakshmi's Kitchen", kitchenLat, kitchenLng) }

  @Test
  fun asksAfterTwentySecondsWithinFiftyMetres() {
    val m = machine()
    assertNull(m.onFix(kitchenLat, downTheRoad, 6f, 0))
    assertNull(m.onFix(kitchenLat, atGate, 0f, 10_000))
    assertNull(m.onFix(kitchenLat, atGate, 0f, 29_000))
    val prompt = m.onFix(kitchenLat, atGate, 0f, 30_000)
    assertNotNull(prompt)
    assertEquals("Lakshmi's Kitchen", prompt!!.kitchenName)
    assertEquals("t1", prompt.tripId)
    assertEquals(48, prompt.distanceM)
    assertEquals(prompt, m.prompt)
    // Asked once: more fixes don't ask again while the rider hasn't answered.
    assertNull(m.onFix(kitchenLat, atGate, 0f, 60_000))
  }

  @Test
  fun leavingBeforeTwentySecondsStartsOver() {
    val m = machine()
    assertNull(m.onFix(kitchenLat, atGate, 0f, 0))
    assertNull(m.onFix(kitchenLat, downTheRoad, 5f, 15_000))
    assertNull(m.onFix(kitchenLat, atGate, 0f, 20_000))
    assertNull(m.onFix(kitchenLat, atGate, 0f, 39_000))
    assertNotNull(m.onFix(kitchenLat, atGate, 0f, 40_000))
  }

  @Test
  fun notYetWaitsForThePhoneToMoveAndStandStillAgain() {
    val m = machine()
    m.onFix(kitchenLat, atGate, 0f, 0)
    assertNotNull(m.onFix(kitchenLat, atGate, 0f, 20_000))
    m.notYet()
    assertNull(m.prompt)
    // Standing still right after Not yet doesn't ask again.
    assertNull(m.onFix(kitchenLat, atGate, 0f, 45_000))
    assertNull(m.onFix(kitchenLat, atGate, 0.5f, 70_000))
    // Moved (still within 50 m), then still for 20 s: asked again.
    assertNull(m.onFix(kitchenLat, atGate, 3f, 80_000))
    assertNull(m.onFix(kitchenLat, atGate, 0f, 90_000))
    assertNull(m.onFix(kitchenLat, atGate, 0f, 109_000))
    assertNotNull(m.onFix(kitchenLat, atGate, 0f, 110_000))
  }

  @Test
  fun notYetThenLeavingAsksAgainOnAFreshApproach() {
    val m = machine()
    m.onFix(kitchenLat, atGate, 0f, 0)
    assertNotNull(m.onFix(kitchenLat, atGate, 0f, 20_000))
    m.notYet()
    assertNull(m.onFix(kitchenLat, downTheRoad, 7f, 30_000))
    assertNull(m.onFix(kitchenLat, atGate, 0f, 40_000))
    assertNotNull(m.onFix(kitchenLat, atGate, 0f, 60_000))
  }

  @Test
  fun aFixWithoutSpeedCountsAsMoving() {
    val m = machine()
    m.onFix(kitchenLat, atGate, null, 0)
    assertNotNull(m.onFix(kitchenLat, atGate, null, 20_000))
    m.notYet()
    assertNull(m.onFix(kitchenLat, atGate, null, 40_000))
    assertNull(m.onFix(kitchenLat, atGate, null, 80_000))
  }

  @Test
  fun yesOrANewStepEndsTheQuestion() {
    val m = machine()
    m.onFix(kitchenLat, atGate, 0f, 0)
    assertNotNull(m.onFix(kitchenLat, atGate, 0f, 20_000))
    m.done()
    assertNull(m.prompt)
    assertNull(m.onFix(kitchenLat, atGate, 0f, 60_000))
    // AT_KITCHEN, then a new trip to the same kitchen: asked afresh.
    m.trip("t1", "AT_KITCHEN", "Lakshmi's Kitchen", kitchenLat, kitchenLng)
    assertNull(m.onFix(kitchenLat, atGate, 0f, 90_000))
    m.trip("t2", "TO_KITCHEN", "Lakshmi's Kitchen", kitchenLat, kitchenLng)
    assertNull(m.onFix(kitchenLat, atGate, 0f, 100_000))
    assertNotNull(m.onFix(kitchenLat, atGate, 0f, 120_000))
  }

  @Test
  fun neverAsksOffTheKitchenLeg() {
    val m = RiderReached().apply { trip("t1", "PICKED_UP", "Lakshmi's Kitchen", kitchenLat, kitchenLng) }
    assertNull(m.onFix(kitchenLat, atGate, 0f, 0))
    assertNull(m.onFix(kitchenLat, atGate, 0f, 30_000))
    assertNull(RiderReached().onFix(kitchenLat, atGate, 0f, 30_000))
  }

  @Test
  fun measuresMetres() {
    assertEquals(0.0, RiderReached.distanceM(kitchenLat, kitchenLng, kitchenLat, kitchenLng), 0.0)
    assertEquals(111_195.0, RiderReached.distanceM(0.0, 0.0, 1.0, 0.0), 10.0)
  }
}
