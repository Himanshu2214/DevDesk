package com.slatespace.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * "Share → SLATE·SPACE" from another app (Gmail, Teams, WhatsApp, a browser): hands the shared text and subject to the
 * web app, which opens a new ticket with them (src/lib/share.ts). The intent filter is in AndroidManifest.xml.
 * A share that starts the app is kept until the web app asks for it (getShared); a share while the app is open arrives
 * as a "shared" event.
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {
    private JSObject pending;

    @Override
    public void load() {
        pending = read(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject shared = read(intent);
        if (shared != null) notifyListeners("shared", shared, true);
    }

    /** the shared text once, then it is gone (a rotation or a restart does not open it again) */
    @PluginMethod
    public void getShared(PluginCall call) {
        JSObject result = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(result);
    }

    private static JSObject read(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if ((text == null || text.trim().isEmpty()) && (subject == null || subject.trim().isEmpty())) return null;
        JSObject shared = new JSObject();
        shared.put("text", text == null ? "" : text);
        shared.put("subject", subject == null ? "" : subject);
        intent.setAction(Intent.ACTION_MAIN);   // handled
        return shared;
    }
}
