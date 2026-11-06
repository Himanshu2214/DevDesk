package com.slatespace.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareIntentPlugin.class);   // "Share → SLATE·SPACE" (app-local plugin)
        super.onCreate(savedInstanceState);
    }
}
