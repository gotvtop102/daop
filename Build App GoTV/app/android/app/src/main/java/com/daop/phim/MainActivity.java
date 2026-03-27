package com.daop.phim;

import android.os.Bundle;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.WebSettings;

import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.TrustedWebUtils;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

public class MainActivity extends BridgeActivity {
    private static boolean sTwaLaunched = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Launch TWA only on non-TV devices, once per app start.
        // If TWA cannot be launched, continue with in-app WebView as fallback.
        if (!sTwaLaunched && !isTvDevice() && tryLaunchTwaForServerUrl()) {
            sTwaLaunched = true;
            finish();
            return;
        }

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings ws = this.bridge.getWebView().getSettings();
            ws.setJavaScriptEnabled(true);
            ws.setDomStorageEnabled(true);
            ws.setDatabaseEnabled(true);
            ws.setSupportMultipleWindows(true);
            ws.setJavaScriptCanOpenWindowsAutomatically(true);
            ws.setLoadWithOverviewMode(true);
            ws.setUseWideViewPort(true);
            ws.setBuiltInZoomControls(false);
            ws.setDisplayZoomControls(false);
            ws.setMediaPlaybackRequiresUserGesture(false);
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
    }

    private boolean isTvDevice() {
        try {
            PackageManager pm = getPackageManager();
            return pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                    || pm.hasSystemFeature("android.hardware.type.television");
        } catch (Exception e) {
            return false;
        }
    }

    private String readAssetText(String assetName) {
        try {
            InputStream is = getAssets().open(assetName);
            BufferedReader r = new BufferedReader(new InputStreamReader(is));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            is.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private String getServerUrlFromCapacitorConfig() {
        try {
            String json = readAssetText("capacitor.config.json");
            if (json == null || json.trim().isEmpty()) return null;
            JSONObject o = new JSONObject(json);
            if (!o.has("server")) return null;
            JSONObject server = o.getJSONObject("server");
            if (!server.has("url")) return null;
            String url = server.getString("url");
            if (url == null) return null;
            url = url.trim();
            if (url.isEmpty()) return null;
            if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
            return url;
        } catch (Exception e) {
            return null;
        }
    }

    private boolean tryLaunchTwaForServerUrl() {
        try {
            String url = getServerUrlFromCapacitorConfig();
            if (url == null) return false;
            Uri uri = Uri.parse(url);
            CustomTabsIntent intent = new CustomTabsIntent.Builder().build();
            TrustedWebUtils.launchAsTrustedWebActivity(this, intent, uri);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
