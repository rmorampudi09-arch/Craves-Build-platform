package com.cravesapp

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * "Reached <kitchen>?" (docs/riders/REDESIGN.md, R-03): while the trip is TO_KITCHEN and the phone has been within 50 m of
 * the kitchen for 20 s, the rider is asked once. Yes posts arrived-pickup (JS); Not yet keeps quiet until the phone moves
 * and then stands still (under 1 m/s) for 20 s again, or leaves and comes back. Pure Kotlin, fed by RiderOnlineService.
 */
class RiderReached(private val nearM: Double = NEAR_M, private val holdMs: Long = HOLD_MS, private val stillMps: Float = STILL_MPS) {
  data class Prompt(val tripId: String, val kitchenName: String, val distanceM: Int)

  private enum class Phase { AWAY, NEAR, PROMPTED, SNOOZED, DONE }

  private var tripId: String? = null
  private var step = ""
  private var kitchenName = ""
  private var kitchenLat = 0.0
  private var kitchenLng = 0.0
  private var phase = Phase.AWAY
  private var nearSinceMs = 0L
  private var movedSinceSnooze = false
  private var stillSinceMs = -1L

  /** The question the rider hasn't answered yet, for a JS that starts after it was asked. */
  @Volatile var prompt: Prompt? = null
    private set

  /** The server's active trip after each upload; a new trip or step starts over. */
  @Synchronized
  fun trip(tripId: String?, step: String, kitchenName: String, lat: Double, lng: Double) {
    if (tripId != this.tripId || step != this.step) {
      phase = Phase.AWAY
      prompt = null
      movedSinceSnooze = false
      stillSinceMs = -1
    }
    this.tripId = tripId
    this.step = step
    this.kitchenName = kitchenName
    kitchenLat = lat
    kitchenLng = lng
  }

  /** Each fix; returns the prompt to show when it is time to ask, else null. speedMps is null when the fix has none. */
  @Synchronized
  fun onFix(lat: Double, lng: Double, speedMps: Float?, atMs: Long): Prompt? {
    val trip = tripId ?: return null
    if (step != "TO_KITCHEN") return null
    val distance = distanceM(lat, lng, kitchenLat, kitchenLng)
    // shortcut: the fix's own error (10 to 30 m between tall buildings) isn't added to the 50 m, so a rider parked across
    // a wide road may not be asked and taps the button instead; upgrade to nearM + accuracy if riders report missed asks.
    val near = distance <= nearM
    when (phase) {
      Phase.AWAY -> if (near) {
        phase = Phase.NEAR
        nearSinceMs = atMs
      }
      Phase.NEAR -> if (!near) {
        phase = Phase.AWAY
      } else if (atMs - nearSinceMs >= holdMs) {
        return ask(trip, distance)
      }
      Phase.SNOOZED -> {
        if (!near) {
          // Left the kitchen: a fresh approach asks again after the usual 20 s.
          phase = Phase.AWAY
          return null
        }
        // shortcut: a fix without a speed counts as moving, so a phone that reports none asks again only after it leaves
        // and comes back; upgrade to speed from the distance between fixes if riders report that.
        val still = speedMps != null && speedMps < stillMps
        if (!still) {
          movedSinceSnooze = true
          stillSinceMs = -1
        } else if (movedSinceSnooze) {
          if (stillSinceMs < 0) stillSinceMs = atMs else if (atMs - stillSinceMs >= holdMs) return ask(trip, distance)
        }
      }
      Phase.PROMPTED, Phase.DONE -> Unit
    }
    return null
  }

  /** Not yet: quiet until the phone moves and stops again. */
  @Synchronized
  fun notYet() {
    if (phase != Phase.PROMPTED) return
    phase = Phase.SNOOZED
    prompt = null
    movedSinceSnooze = false
    stillSinceMs = -1
  }

  /** Yes, or the rider tapped "I've reached" themselves: nothing more for this step. */
  @Synchronized
  fun done() {
    phase = Phase.DONE
    prompt = null
  }

  private fun ask(trip: String, distance: Double): Prompt {
    phase = Phase.PROMPTED
    return Prompt(trip, kitchenName, distance.toInt()).also { prompt = it }
  }

  companion object {
    const val NEAR_M = 50.0
    const val HOLD_MS = 20_000L
    const val STILL_MPS = 1f
    private const val EARTH_M = 6_371_000.0

    /** Haversine, metres. */
    fun distanceM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
      val dLat = Math.toRadians(lat2 - lat1)
      val dLng = Math.toRadians(lng2 - lng1)
      val a = sin(dLat / 2) * sin(dLat / 2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
      return 2 * EARTH_M * atan2(sqrt(a), sqrt(1 - a))
    }
  }
}
