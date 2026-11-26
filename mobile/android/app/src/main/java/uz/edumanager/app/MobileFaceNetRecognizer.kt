package uz.edumanager.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * TensorFlow Lite MobileFaceNet embedding extractor.
 * ML Kit is used strictly for face detection; this TFLite model computes
 * the 192-dimensional face recognition embedding for person identification.
 */
class MobileFaceNetRecognizer(context: Context) {
    private val interpreter: Interpreter
    val inputHeight: Int
    val inputWidth: Int
    val embeddingDim: Int

    init {
        val modelBuffer = loadModelFile(context, "mobilefacenet.tflite")
        val options = Interpreter.Options().apply {
            setNumThreads(4)
        }
        interpreter = Interpreter(modelBuffer, options)
        val inShape = interpreter.getInputTensor(0).shape()
        val outShape = interpreter.getOutputTensor(0).shape()
        inputHeight = if (inShape.size >= 3) inShape[1] else 112
        inputWidth = if (inShape.size >= 3) inShape[2] else 112
        embeddingDim = if (outShape.size >= 2) outShape[1] else 192
    }

    private fun loadModelFile(context: Context, assetName: String): MappedByteBuffer {
        val fileDescriptor = context.assets.openFd(assetName)
        FileInputStream(fileDescriptor.fileDescriptor).use { inputStream ->
            val fileChannel = inputStream.channel
            return fileChannel.map(
                FileChannel.MapMode.READ_ONLY,
                fileDescriptor.startOffset,
                fileDescriptor.declaredLength
            )
        }
    }

    fun extractEmbedding(frameBitmap: Bitmap, boundingBox: Rect): FloatArray {
        val padX = (boundingBox.width() * 0.12f).toInt()
        val padY = (boundingBox.height() * 0.12f).toInt()
        val left = max(0, boundingBox.left - padX)
        val top = max(0, boundingBox.top - padY)
        val right = min(frameBitmap.width, boundingBox.right + padX)
        val bottom = min(frameBitmap.height, boundingBox.bottom + padY)

        val cropWidth = max(1, right - left)
        val cropHeight = max(1, bottom - top)
        val cropped = Bitmap.createBitmap(frameBitmap, left, top, cropWidth, cropHeight)
        val scaled = Bitmap.createScaledBitmap(cropped, inputWidth, inputHeight, true)

        val inputBuffer = ByteBuffer.allocateDirect(4 * inputWidth * inputHeight * 3).apply {
            order(ByteOrder.nativeOrder())
        }

        val pixels = IntArray(inputWidth * inputHeight)
        scaled.getPixels(pixels, 0, inputWidth, 0, 0, inputWidth, inputHeight)

        for (pixel in pixels) {
            val r = ((pixel shr 16) and 0xFF)
            val g = ((pixel shr 8) and 0xFF)
            val b = (pixel and 0xFF)
            inputBuffer.putFloat((r - 127.5f) / 128.0f)
            inputBuffer.putFloat((g - 127.5f) / 128.0f)
            inputBuffer.putFloat((b - 127.5f) / 128.0f)
        }
        inputBuffer.rewind()

        val output = Array(1) { FloatArray(embeddingDim) }
        interpreter.run(inputBuffer, output)
        return l2Normalize(output[0])
    }

    private fun l2Normalize(vec: FloatArray): FloatArray {
        var normSq = 0f
        for (v in vec) normSq += v * v
        val norm = sqrt(normSq)
        if (norm < 1e-6f) return vec
        return FloatArray(vec.size) { idx -> vec[idx] / norm }
    }

    fun close() {
        interpreter.close()
    }
}
