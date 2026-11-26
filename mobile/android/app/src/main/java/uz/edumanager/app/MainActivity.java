package uz.edumanager.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FaceRecognitionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
