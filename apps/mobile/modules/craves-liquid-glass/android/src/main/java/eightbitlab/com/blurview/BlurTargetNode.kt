package eightbitlab.com.blurview

import android.graphics.RenderNode

// BlurTarget keeps its recorded backdrop package-private; living in its package lets the glass reuse it.
internal fun BlurTarget.recordedNode(): RenderNode? = renderNode
