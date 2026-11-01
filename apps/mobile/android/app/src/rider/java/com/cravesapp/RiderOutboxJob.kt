package com.cravesapp

import android.app.job.JobParameters
import android.app.job.JobService

/**
 * Sends the outbox's waiting trip steps with the shift credential when a network is up and the app isn't running
 * (P2-02c). RiderOutbox schedules it, persisted, so it also runs after a reboot; a force stop cancels it (Android).
 */
class RiderOutboxJob : JobService() {
  override fun onStartJob(params: JobParameters): Boolean {
    RiderOutbox.flushInBackground(this, skipBackoff = true) { retry -> jobFinished(params, retry) }
    return true
  }

  /** The network went before the pass ended: run again when one is back. */
  override fun onStopJob(params: JobParameters): Boolean = true
}
