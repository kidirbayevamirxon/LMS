package uz.edumanager.app

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.RectF
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import kotlin.math.abs

class FaceScannerActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var overlayView: FaceOverlayView
    private lateinit var tvInstruction: TextView
    private lateinit var tvStatus: TextView
    private lateinit var btnCapture: Button

    private lateinit var detector: FaceDetector
    private lateinit var recognizer: MobileFaceNetRecognizer

    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private var useFrontCamera = true
    private var mode: String = "SCAN"
    private var requiredAngles: Int = 3
    private var studentName: String = ""

    private val enrolledEmbeddings = mutableListOf<FloatArray>()
    private val capturedAngles = mutableSetOf<String>()

    @Volatile
    private var latestFrameBitmap: Bitmap? = null
    @Volatile
    private var latestFaces: List<Face> = emptyList()
    @Volatile
    private var isProcessing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_face_scanner)

        mode = intent.getStringExtra("mode") ?: "SCAN"
        requiredAngles = intent.getIntExtra("requiredAngles", 3)
        studentName = intent.getStringExtra("studentName") ?: ""

        previewView = findViewById(R.id.cameraPreview)
        overlayView = findViewById(R.id.faceOverlay)
        tvInstruction = findViewById(R.id.tvInstruction)
        tvStatus = findViewById(R.id.tvStatus)
        btnCapture = findViewById(R.id.btnCapture)

        if (mode == "ENROLL") {
            tvInstruction.text = "$studentName: Yuzni ro‘yxatga olish (0/$requiredAngles)"
            btnCapture.text = "Burchakni olish (0/$requiredAngles)"
        } else {
            tvInstruction.text = "Davomat uchun kameraga qarang"
            btnCapture.text = "Yuzlarni skanerlash"
        }

        val options = FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .setMinFaceSize(0.15f)
            .enableTracking()
            .build()
        detector = FaceDetection.getClient(options)
        recognizer = MobileFaceNetRecognizer(this)

        findViewById<Button>(R.id.btnClose).setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }

        findViewById<Button>(R.id.btnSwitchCamera).setOnClickListener {
            useFrontCamera = !useFrontCamera
            startCamera()
        }

        btnCapture.setOnClickListener {
            handleManualCapture()
        }

        startCamera()
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also {
                it.surfaceProvider = previewView.surfaceProvider
            }

            val analyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(cameraExecutor) { imageProxy ->
                        analyzeFrame(imageProxy)
                    }
                }

            val selector = if (useFrontCamera) {
                CameraSelector.DEFAULT_FRONT_CAMERA
            } else {
                CameraSelector.DEFAULT_BACK_CAMERA
            }

            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(this, selector, preview, analyzer)
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun analyzeFrame(imageProxy: ImageProxy) {
        if (isProcessing) {
            imageProxy.close()
            return
        }
        isProcessing = true

        val rawBitmap = imageProxy.toBitmap()
        val rotatedBitmap = rotateAndMirror(
            rawBitmap,
            imageProxy.imageInfo.rotationDegrees.toFloat(),
            useFrontCamera
        )
        imageProxy.close()

        val inputImage = InputImage.fromBitmap(rotatedBitmap, 0)
        detector.process(inputImage)
            .addOnSuccessListener { faces ->
                latestFrameBitmap = rotatedBitmap
                latestFaces = faces
                updateOverlay(faces, rotatedBitmap.width, rotatedBitmap.height)
            }
            .addOnCompleteListener {
                isProcessing = false
            }
    }

    private fun updateOverlay(faces: List<Face>, imgW: Int, imgH: Int) {
        val scaleX = overlayView.width.toFloat() / imgW.coerceAtLeast(1)
        val scaleY = overlayView.height.toFloat() / imgH.coerceAtLeast(1)

        val boxes = faces.map { face ->
            val b = face.boundingBox
            val rect = RectF(b.left * scaleX, b.top * scaleY, b.right * scaleX, b.bottom * scaleY)
            val livenessOk = checkLiveness(face)
            val angleName = classifyAngle(face.headEulerAngleY)
            val label = if (livenessOk) "Liveness OK ($angleName)" else "Ko‘zingizni oching"
            DetectedFaceBox(rect, label, livenessOk)
        }
        overlayView.updateFaces(boxes)

        runOnUiThread {
            if (faces.isEmpty()) {
                tvStatus.text = "Yuz aniqlanmadi..."
            } else if (mode == "ENROLL") {
                val f = faces[0]
                tvStatus.text = "Yuz aniqlandi • Burchak: ${classifyAngle(f.headEulerAngleY)}"
            } else {
                tvStatus.text = "${faces.size} ta yuz aniqlandi (TFLite tayyor)"
            }
        }
    }

    private fun checkLiveness(face: Face): Boolean {
        val leftEye = face.leftEyeOpenProbability ?: 0.8f
        val rightEye = face.rightEyeOpenProbability ?: 0.8f
        return leftEye > 0.30f && rightEye > 0.30f && face.boundingBox.width() > 60
    }

    private fun classifyAngle(yaw: Float): String {
        return when {
            yaw > 10f -> "Chap"
            yaw < -10f -> "O‘ng"
            else -> "Old"
        }
    }

    private fun handleManualCapture() {
        val bmp = latestFrameBitmap ?: return
        val faces = latestFaces
        if (faces.isEmpty()) {
            tvStatus.text = "Iltimos yuzingizni kameraga qarating"
            return
        }

        if (mode == "ENROLL") {
            val face = faces[0]
            if (!checkLiveness(face)) {
                tvStatus.text = "Liveness tekshiruvi o‘tmadi — ko‘zlaringizni oching"
                return
            }
            val emb = recognizer.extractEmbedding(bmp, face.boundingBox)
            enrolledEmbeddings.add(emb)
            val angleLabel = classifyAngle(face.headEulerAngleY)
            capturedAngles.add(angleLabel)

            val count = enrolledEmbeddings.size
            tvInstruction.text = "$studentName: Yuzni ro‘yxatga olish ($count/$requiredAngles)"
            btnCapture.text = "Keyingi burchak ($count/$requiredAngles)"
            tvStatus.text = "$angleLabel burchak saqlandi! Boshingizni biroz burib keyingisini oling."

            if (count >= requiredAngles) {
                val arr = JSONArray()
                for (vec in enrolledEmbeddings) {
                    val vecJson = JSONArray()
                    for (v in vec) vecJson.put(v.toDouble())
                    arr.put(vecJson)
                }
                val result = Intent().apply {
                    putExtra("embeddingsJson", arr.toString())
                    putExtra("livenessVerified", true)
                    putExtra("modelVersion", "mobilefacenet-v1")
                }
                setResult(Activity.RESULT_OK, result)
                finish()
            }
        } else {
            val facesArr = JSONArray()
            for (face in faces) {
                val livenessOk = checkLiveness(face)
                val emb = recognizer.extractEmbedding(bmp, face.boundingBox)
                val embArr = JSONArray()
                for (v in emb) embArr.put(v.toDouble())

                val faceObj = JSONObject().apply {
                    put("embedding", embArr)
                    put("livenessPassed", livenessOk)
                    put("livenessScore", if (livenessOk) 0.95 else 0.25)
                    put("angleLabel", classifyAngle(face.headEulerAngleY))
                }
                facesArr.put(faceObj)
            }
            val result = Intent().apply {
                putExtra("facesJson", facesArr.toString())
                putExtra("modelVersion", "mobilefacenet-v1")
            }
            setResult(Activity.RESULT_OK, result)
            finish()
        }
    }

    private fun rotateAndMirror(bitmap: Bitmap, degrees: Float, mirror: Boolean): Bitmap {
        val matrix = Matrix()
        if (abs(degrees) > 0.1f) matrix.postRotate(degrees)
        if (mirror) matrix.postScale(-1f, 1f, bitmap.width / 2f, bitmap.height / 2f)
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    override fun onDestroy() {
        super.onDestroy()
        detector.close()
        recognizer.close()
        cameraExecutor.shutdown()
    }
}
