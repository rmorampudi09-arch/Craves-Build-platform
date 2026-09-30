package com.cravesapp

import android.content.Context
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.min

class CravesGlassReflectionView(context: Context) : ReactViewGroup(context) {
  var radiusDp = 999f
  var edgeWidthDp = 5f
  var captureInsetDp = 16f
  var bendDistanceDp = 10f
  private var renderer: RimEffect? = null
  private var failed = false

  init {
    alpha = 0f
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    updateReflection()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateReflection()
  }

  override fun onDetachedFromWindow() {
    if (Build.VERSION.SDK_INT >= 33) setRenderEffect(null)
    renderer = null
    alpha = 0f
    super.onDetachedFromWindow()
  }

  fun updateReflection() {
    if (Build.VERSION.SDK_INT < 33 || !isAttachedToWindow || !isHardwareAccelerated || failed) return
    val density = resources.displayMetrics.density
    val inset = captureInsetDp.coerceAtLeast(0f) * density
    val shapeWidth = width - inset * 2f
    val shapeHeight = height - inset * 2f
    if (shapeWidth <= 0f || shapeHeight <= 0f) {
      alpha = 0f
      return
    }
    try {
      val firstFrame = renderer == null
      val effect = renderer ?: RimEffect().also { renderer = it }
      setRenderEffect(effect.update(
        width.toFloat(), height.toFloat(), inset,
        min(radiusDp.coerceAtLeast(0f) * density, min(shapeWidth, shapeHeight) / 2f),
        min(edgeWidthDp.coerceAtLeast(0.1f) * density, min(shapeWidth, shapeHeight) / 2f),
        min(bendDistanceDp.coerceAtLeast(0f) * density, inset),
      ))
      alpha = 1f
      if (firstFrame) Log.d("CravesGlassReflection", "Live backdrop rim active: ${width}x${height}")
    } catch (error: RuntimeException) {
      failed = true
      renderer = null
      setRenderEffect(null)
      alpha = 0f
      Log.w("CravesGlassReflection", "Rim unavailable; retaining the existing glass fallback", error)
    }
  }
}

// Only the extra backdrop child enters this effect, never the button's text or icons.
@RequiresApi(33)
private class RimEffect {
  private val shader = RuntimeShader(
    """
      uniform shader backdrop;
      uniform float2 captureSize;
      uniform float inset;
      uniform float radius;
      uniform float edgeWidth;
      uniform float bendDistance;

      float roundedDistance(float2 p, float2 halfSize) {
        float2 q = abs(p) - halfSize + radius;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
      }

      half4 main(float2 coord) {
        float2 halfSize = captureSize * 0.5 - inset;
        float2 p = coord - captureSize * 0.5;
        float inside = -roundedDistance(p, halfSize);
        if (inside <= 0.0 || inside >= edgeWidth) return half4(0.0);

        float2 normal = float2(
          roundedDistance(p + float2(0.5, 0.0), halfSize) - roundedDistance(p - float2(0.5, 0.0), halfSize),
          roundedDistance(p + float2(0.0, 0.5), halfSize) - roundedDistance(p - float2(0.0, 0.5), halfSize)
        );
        normal /= max(length(normal), 0.001);
        float curved = 1.0 - inside / edgeWidth;
        float2 samplePoint = coord + normal * bendDistance * curved * curved;
        samplePoint = clamp(samplePoint, float2(0.5), captureSize - 0.5);
        half4 reflected = backdrop.eval(samplePoint);
        float coverage = smoothstep(0.0, 1.0, inside)
          * (1.0 - smoothstep(edgeWidth * 0.65, edgeWidth, inside));
        return reflected * half(coverage * 0.88);
      }
    """.trimIndent()
  )
  fun update(width: Float, height: Float, inset: Float, radius: Float, edge: Float, bend: Float): RenderEffect {
    shader.setFloatUniform("captureSize", width, height)
    shader.setFloatUniform("inset", inset)
    shader.setFloatUniform("radius", radius)
    shader.setFloatUniform("edgeWidth", edge)
    shader.setFloatUniform("bendDistance", bend)
    return RenderEffect.createRuntimeShaderEffect(shader, "backdrop")
  }
}
