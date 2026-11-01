package com.cravesapp

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  private var overLockScreen = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    showOverLockScreen(FlavorPackages.showsOverLockScreen(intent))
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    showOverLockScreen(FlavorPackages.showsOverLockScreen(intent))
  }

  override fun onStop() {
    super.onStop()
    // Only while the offer that asked is on screen: once it leaves, the lock screen covers the app again.
    showOverLockScreen(false)
  }

  /** A ringing offer (rider app only, FlavorPackages) shows over the lock screen and wakes it; nothing else does. */
  private fun showOverLockScreen(show: Boolean) {
    if (show == overLockScreen) return
    overLockScreen = show
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(show)
      setTurnScreenOn(show)
    } else {
      @Suppress("DEPRECATION")
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (show) window.addFlags(flags) else window.clearFlags(flags)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "CravesMobile"

  /**
   * Wrap the React Native delegate so Expo modules receive the Android lifecycle hooks they need.
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
    ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {},
    )
}
