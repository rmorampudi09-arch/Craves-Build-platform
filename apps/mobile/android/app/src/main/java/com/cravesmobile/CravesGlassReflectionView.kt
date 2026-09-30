package com.cravesapp

import android.content.Context
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.os.Build
import android.util.Log
import android.view.View
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import kotlin.math.min

class CravesGlassReflectionView(context: Context) : ReactViewGroup(context) {
  var radiusDp = 999f
  var edgeWidthDp = 5f
  var captureInsetDp = 16f
  var bendDistanceDp = 10f
  private var renderer: RimEffect? = null
  private var failed = false
  private var targetTag = -1
  private var target: View? = null
  private val targetLocation = IntArray(2)
  private val captureLocation = IntArray(2)
  private val visibleBounds = Rect()
  private var lastX = Int.MIN_VALUE
  private var lastY = Int.MIN_VALUE
  private val drawListener = ViewTreeObserver.OnPreDrawListener {
    if (targetTag > 0 && getGlobalVisibleRect(visibleBounds)) {
      val source = resolveTarget()
      if (source != null) {
        source.getLocationOnScreen(targetLocation)
        getLocationOnScreen(captureLocation)
        val x = captureLocation[0] - targetLocation[0]
        val y = captureLocation[1] - targetLocation[1]
        if (x != lastX || y != lastY || source.isDirty) invalidate()
      }
    }
    true
  }

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(drawListener)
    updateReflection()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateReflection()
  }

  override fun onDetachedFromWindow() {
    if (viewTreeObserver.isAlive) viewTreeObserver.removeOnPreDrawListener(drawListener)
    if (Build.VERSION.SDK_INT >= 33) renderer?.release()
    renderer = null
    target = null
    super.onDetachedFromWindow()
  }

  fun updateReflection() {
    if (Build.VERSION.SDK_INT >= 33) renderer?.geometryChanged()
    invalidate()
  }

  fun setCaptureTarget(tag: Int) {
    if (targetTag == tag) return
    targetTag = tag
    target = null
    lastX = Int.MIN_VALUE
    lastY = Int.MIN_VALUE
    updateReflection()
  }

  private fun resolveTarget(): View? {
    target?.takeIf { it.isAttachedToWindow }?.let { return it }
    if (targetTag <= 0) return null
    return try {
      val reactContext = context as? ReactContext ?: return null
      val source = UIManagerHelper.getUIManagerForReactTag(reactContext, targetTag)?.resolveView(targetTag)
        ?: return null
      // Never capture an ancestor containing this rim: that would create a feedback loop.
      var ancestor: android.view.ViewParent? = this
      while (ancestor != null) {
        if (ancestor === source) return null
        ancestor = ancestor.parent
      }
      source.also { target = it }
    } catch (_: RuntimeException) {
      null
    }
  }

  override fun dispatchDraw(canvas: Canvas) {
    if (Build.VERSION.SDK_INT < 33 || !canvas.isHardwareAccelerated || failed ||
      width <= 0 || height <= 0 || !getGlobalVisibleRect(visibleBounds)) return
    val source = resolveTarget() ?: return
    val density = resources.displayMetrics.density
    val inset = captureInsetDp.coerceAtLeast(0f) * density
    val shapeWidth = width - inset * 2f
    val shapeHeight = height - inset * 2f
    if (shapeWidth <= 0f || shapeHeight <= 0f) return
    try {
      val firstFrame = renderer == null
      val effect = renderer ?: RimEffect().also { renderer = it }
      source.getLocationOnScreen(targetLocation)
      getLocationOnScreen(captureLocation)
      lastX = captureLocation[0] - targetLocation[0]
      lastY = captureLocation[1] - targetLocation[1]
      effect.draw(canvas, source, lastX, lastY, width, height, inset,
        min(radiusDp.coerceAtLeast(0f) * density, min(shapeWidth, shapeHeight) / 2f),
        min(edgeWidthDp.coerceAtLeast(0.1f) * density, min(shapeWidth, shapeHeight) / 2f),
        min(bendDistanceDp.coerceAtLeast(0f) * density, inset),
      )
      if (firstFrame) Log.d("CravesGlassReflection", "Bounded live backdrop rim active: ${width}x${height}")
    } catch (error: RuntimeException) {
      failed = true
      renderer?.release()
      renderer = null
      Log.w("CravesGlassReflection", "Rim unavailable; retaining the existing glass fallback", error)
    }
  }
}

// Only a clipped backdrop enters this effect, never the button's text or icons.
@RequiresApi(33)
private class RimEffect {
  private val capture = RenderNode("Craves bounded glass rim")
  private var geometryDirty = true
  private var sourceWidth = -1
  private var sourceHeight = -1
  private var sourceView: View? = null
  private var captureX = Int.MIN_VALUE
  private var captureY = Int.MIN_VALUE
  private val shader = RuntimeShader(
    """
      uniform shader backdrop;
      uniform float2 captureSize;
      uniform float inset;
      uniform float radius;
      uniform float edgeWidth;
      uniform float bendDistance;

      half4 main(float2 coord) {
        float2 halfSize = captureSize * 0.5 - inset;
        float2 p = coord - captureSize * 0.5;
        float2 q = abs(p) - halfSize + radius;
        float2 corner = max(q, 0.0);
        float cornerLength = length(corner);
        float inside = -(cornerLength + min(max(q.x, q.y), 0.0) - radius);
        if (inside <= 0.0 || inside >= edgeWidth) return half4(0.0);

        float2 normal = cornerLength > 0.001 ? corner / cornerLength
          : (q.x > q.y ? float2(1.0, 0.0) : float2(0.0, 1.0));
        normal *= sign(p);
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
  fun geometryChanged() { geometryDirty = true }

  fun release() {
    capture.discardDisplayList()
    sourceView = null
  }

  fun draw(canvas: Canvas, source: View, x: Int, y: Int, width: Int, height: Int,
    inset: Float, radius: Float, edge: Float, bend: Float) {
    val resize = capture.width != width || capture.height != height
    if (resize || geometryDirty) {
      capture.setPosition(0, 0, width, height)
      shader.setFloatUniform("captureSize", width.toFloat(), height.toFloat())
      shader.setFloatUniform("inset", inset)
      shader.setFloatUniform("radius", radius)
      shader.setFloatUniform("edgeWidth", edge)
      shader.setFloatUniform("bendDistance", bend)
      capture.setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "backdrop"))
      geometryDirty = false
    }
    if (resize || !capture.hasDisplayList() || sourceView !== source || x != captureX || y != captureY ||
      source.width != sourceWidth || source.height != sourceHeight || source.isDirty) {
      val recording = capture.beginRecording(width, height)
      try {
        // Keep the shader input bounded to this capsule, not an entire photo or scene.
        recording.clipRect(0, 0, width, height)
        recording.translate(-x.toFloat(), -y.toFloat())
        source.draw(recording)
      } finally {
        capture.endRecording()
      }
      sourceView = source
      sourceWidth = source.width
      sourceHeight = source.height
      captureX = x
      captureY = y
    }
    canvas.drawRenderNode(capture)
  }
}
