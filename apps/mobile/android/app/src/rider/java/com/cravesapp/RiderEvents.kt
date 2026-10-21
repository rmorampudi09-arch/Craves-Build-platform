package com.cravesapp

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap

/** Sends rider events to JS through RCTDeviceEventEmitter, when JS is running. */
object RiderEvents {
  /** Set by RiderOnlineModule while the React instance lives; services run without it. */
  @Volatile var react: ReactApplicationContext? = null

  /** Returns false when no React instance is running; params is built only when it is. */
  fun emit(name: String, params: () -> WritableMap): Boolean {
    val context = react ?: return false
    if (!context.hasActiveReactInstance()) return false
    context.emitDeviceEvent(name, params())
    return true
  }
}
