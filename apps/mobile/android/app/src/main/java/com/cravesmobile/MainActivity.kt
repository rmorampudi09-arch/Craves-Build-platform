package com.cravesapp

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  // True only when Android rebuilds the app from Recents after killing it in the background;
  // a fresh launch (app swiped away or never opened) has no saved state.
  private var restoredFromRecents = false

  override fun onCreate(savedInstanceState: Bundle?) {
    restoredFromRecents = savedInstanceState != null
    super.onCreate(null)
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
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle =
          Bundle().apply { putBoolean("restoredFromRecents", restoredFromRecents) }
      },
    )
}
