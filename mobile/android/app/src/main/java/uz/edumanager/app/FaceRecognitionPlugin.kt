package uz.edumanager.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray

@CapacitorPlugin(
    name = "FaceRecognition",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera")
    ]
)
class FaceRecognitionPlugin : Plugin() {

    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        val modelExists = try {
            context.assets.open("mobilefacenet.tflite").use { true }
        } catch (_: Exception) {
            false
        }
        val ret = JSObject().apply {
            put("available", true)
            put("modelLoaded", modelExists)
            put("mlKitReady", true)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun enrollFaces(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback")
            return
        }
        launchEnrollActivity(call)
    }

    @PluginMethod
    fun scanFaces(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback")
            return
        }
        launchScanActivity(call)
    }

    @PermissionCallback
    private fun cameraPermissionCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            if (call.methodName == "enrollFaces") {
                launchEnrollActivity(call)
            } else {
                launchScanActivity(call)
            }
        } else {
            call.reject("Kamera ruxsati berilmadi")
        }
    }

    private fun launchEnrollActivity(call: PluginCall) {
        val intent = Intent(context, FaceScannerActivity::class.java).apply {
            putExtra("mode", "ENROLL")
            putExtra("studentName", call.getString("studentName", "O‘quvchi"))
            putExtra("requiredAngles", call.getInt("requiredAngles", 3))
        }
        startActivityForResult(call, intent, "handleEnrollResult")
    }

    private fun launchScanActivity(call: PluginCall) {
        val intent = Intent(context, FaceScannerActivity::class.java).apply {
            putExtra("mode", "SCAN")
        }
        startActivityForResult(call, intent, "handleScanResult")
    }

    @ActivityCallback
    private fun handleEnrollResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("Face ID ro‘yxatga olish bekor qilindi")
            return
        }
        val embeddingsJson = result.data?.getStringExtra("embeddingsJson") ?: "[]"
        val ret = JSObject().apply {
            put("embeddings", JSArray(embeddingsJson))
            put("livenessVerified", result.data?.getBooleanExtra("livenessVerified", true) ?: true)
            put("modelVersion", result.data?.getStringExtra("modelVersion") ?: "mobilefacenet-v1")
        }
        call.resolve(ret)
    }

    @ActivityCallback
    private fun handleScanResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("Yuz skanerlash bekor qilindi")
            return
        }
        val facesJson = result.data?.getStringExtra("facesJson") ?: "[]"
        val ret = JSObject().apply {
            put("faces", JSArray(facesJson))
            put("modelVersion", result.data?.getStringExtra("modelVersion") ?: "mobilefacenet-v1")
        }
        call.resolve(ret)
    }
}
