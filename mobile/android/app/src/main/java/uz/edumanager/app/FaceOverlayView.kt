package uz.edumanager.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

data class DetectedFaceBox(
    val rect: RectF,
    val label: String,
    val livenessOk: Boolean
)

class FaceOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var boxes: List<DetectedFaceBox> = emptyList()

    private val okPaint = Paint().apply {
        color = Color.parseColor("#2DD4BF")
        style = Paint.Style.STROKE
        strokeWidth = 6f
        isAntiAlias = true
    }

    private val warnPaint = Paint().apply {
        color = Color.parseColor("#F59E0B")
        style = Paint.Style.STROKE
        strokeWidth = 6f
        isAntiAlias = true
    }

    private val textPaint = Paint().apply {
        color = Color.WHITE
        textSize = 36f
        isAntiAlias = true
        isFakeBoldText = true
    }

    private val bgPaint = Paint().apply {
        color = Color.parseColor("#AA0F172A")
        style = Paint.Style.FILL
    }

    fun updateFaces(newBoxes: List<DetectedFaceBox>) {
        boxes = newBoxes
        postInvalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        for (box in boxes) {
            val paint = if (box.livenessOk) okPaint else warnPaint
            canvas.drawRoundRect(box.rect, 24f, 24f, paint)
            val labelWidth = textPaint.measureText(box.label) + 24f
            canvas.drawRoundRect(
                box.rect.left,
                box.rect.top - 52f,
                box.rect.left + labelWidth,
                box.rect.top - 6f,
                12f,
                12f,
                bgPaint
            )
            canvas.drawText(box.label, box.rect.left + 12f, box.rect.top - 18f, textPaint)
        }
    }
}
