package com.cravesapp

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

@ReactModule(name = CravesGlassReflectionManager.NAME)
class CravesGlassReflectionManager : ReactViewManager() {
  companion object {
    const val NAME = "CravesGlassReflection"
  }

  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup =
    CravesGlassReflectionView(context)

  @ReactProp(name = "blurTargetTag", defaultInt = -1)
  fun setBlurTargetTag(view: ReactViewGroup, value: Int) {
    (view as CravesGlassReflectionView).setCaptureTarget(value)
  }

  @ReactProp(name = "glassRadius", defaultFloat = 999f)
  fun setGlassRadius(view: ReactViewGroup, value: Float) {
    (view as CravesGlassReflectionView).radiusDp = value
  }

  @ReactProp(name = "edgeWidth", defaultFloat = 5f)
  fun setEdgeWidth(view: ReactViewGroup, value: Float) {
    (view as CravesGlassReflectionView).edgeWidthDp = value
  }

  @ReactProp(name = "captureInset", defaultFloat = 16f)
  fun setCaptureInset(view: ReactViewGroup, value: Float) {
    (view as CravesGlassReflectionView).captureInsetDp = value
  }

  @ReactProp(name = "bendDistance", defaultFloat = 10f)
  fun setBendDistance(view: ReactViewGroup, value: Float) {
    (view as CravesGlassReflectionView).bendDistanceDp = value
  }

  override fun onAfterUpdateTransaction(view: ReactViewGroup) {
    super.onAfterUpdateTransaction(view)
    (view as CravesGlassReflectionView).updateReflection()
  }
}
