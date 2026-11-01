package com.cravesapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** App 1.3.0: an offer counts down to the server's expiresAt on the phone's clock, never past arrival plus expiresInSec. */
class RiderOffersTest {
  private val expiresAt = "2026-11-01T06:10:40.123456Z"
  private val expiresAtMs = 1_793_513_440_123L

  @Test
  fun readsTheServersInstants() {
    assertEquals(expiresAtMs, RiderOffers.isoMs(expiresAt))
    assertEquals(expiresAtMs, RiderOffers.isoMs("2026-11-01T06:10:40.123Z"))
    assertEquals(expiresAtMs - 123, RiderOffers.isoMs("2026-11-01T06:10:40Z"))
    assertEquals(expiresAtMs, RiderOffers.isoMs("2026-11-01T11:40:40.123456789+05:30"))
    assertNull(RiderOffers.isoMs("1793513440"))
    assertNull(RiderOffers.isoMs(""))
    assertNull(RiderOffers.isoMs(null))
  }

  @Test
  fun aLatePushCountsDownLess() {
    // The phone runs 3 s behind the server, and the push landed with 32 s of the server's 40 left.
    val offset = 3_000L
    val arrival = expiresAtMs - offset - 32_000
    assertEquals(arrival + 32_000, RiderOffers.deadlineMs(arrival, 40, expiresAt, offset))
    // Never past arrival plus expiresInSec; without an offset or a readable expiresAt, just that.
    assertEquals(arrival + 10_000, RiderOffers.deadlineMs(arrival, 10, expiresAt, offset))
    assertEquals(arrival + 40_000, RiderOffers.deadlineMs(arrival, 40, expiresAt, null))
    assertEquals(arrival + 40_000, RiderOffers.deadlineMs(arrival, 40, "", offset))
  }

  @Test
  fun takesTheOffsetFromTheDateHeader() {
    // Date says 7 s (whole seconds, so about 7.5 s) at the call's midpoint, 5.5 s by a phone 2 s slow.
    assertEquals(2_000L, RiderOffers.offsetMs(serverDateMs = 7_000, sentAtMs = 5_000, receivedAtMs = 6_000))
  }
}
