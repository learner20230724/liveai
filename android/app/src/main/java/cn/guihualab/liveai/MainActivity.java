package cn.guihualab.liveai;

import android.Manifest;
import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private static final int MEDIA_PERMISSION = 20, OPEN_FILE = 21, SAVE_TEXT = 22;
    private WebView web;
    private FrameLayout root;
    private LinearLayout loading;
    private PermissionRequest pendingPermission;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingText;
    private volatile File webRelease;
    private boolean pageReady, resumed, selectingFile;
    private final Handler startup = new Handler(Looper.getMainLooper());
    private final ExecutorService files = Executors.newSingleThreadExecutor();

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this); root.setBackgroundColor(0xfff6f8f5); setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom)); return insets;
            });
        } else root.setFitsSystemWindows(true);
        web = new WebView(this); root.addView(web, new FrameLayout.LayoutParams(-1,-1)); web.setBackgroundColor(0xfff6f8f5);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setSafeBrowsingEnabled(true);
        settings.setSupportZoom(true); settings.setBuiltInZoomControls(true); settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true); settings.setLoadWithOverviewMode(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString()+" LiveAI/"+BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new Bridge(),"LiveAIAndroid");
        loading = new LinearLayout(this); loading.setOrientation(LinearLayout.VERTICAL); loading.setGravity(Gravity.CENTER);
        loading.setPadding(30,30,30,30); loading.setBackgroundColor(0xfff6f8f5);
        TextView title = new TextView(this); title.setText("LiveAI\n正在检查页面更新…"); title.setTextSize(19); title.setGravity(Gravity.CENTER); title.setTextColor(0xff21694f); loading.addView(title);
        root.addView(loading,new FrameLayout.LayoutParams(-1,-1));
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String relative = NavigationPolicy.asset(request.getUrl().toString(), request.getMethod());
                if (relative == null) return null;
                try {
                    InputStream input;
                    File selected = webRelease;
                    if (selected == null) input = getAssets().open("web/"+relative);
                    else {
                        File file = new File(selected,relative);
                        if (!file.getCanonicalPath().startsWith(selected.getCanonicalPath()+File.separator)) throw new IOException("Invalid asset");
                        input = new FileInputStream(file);
                    }
                    String mime = relative.endsWith(".js") ? "text/javascript" : relative.endsWith(".css") ? "text/css" : relative.endsWith(".html") ? "text/html" : "application/octet-stream";
                    Map<String,String> headers = new HashMap<>(); headers.put("Cache-Control","no-store");
                    headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://img.mosi.cn; connect-src 'self' wss://guihualab.cn; media-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
                    return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,input);
                } catch (Exception ignored) {
                    return new WebResourceResponse("text/plain","UTF-8",404,"Not found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return true;
                String url = request.getUrl().toString();
                if (NavigationPolicy.ownDocument(url)) return false;
                openExternal(url); return true;
            }
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); if (NavigationPolicy.ownDocument(error.getUrl())) showFailure(); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) showFailure(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { runOnUiThread(() -> requestMedia(request)); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { if (pendingPermission == request) pendingPermission = null; }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trusted()) { callback.onReceiveValue(null); return true; }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback; selectingFile = true;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                try { startActivityForResult(intent,OPEN_FILE); } catch (RuntimeException e) { selectingFile=false; fileCallback.onReceiveValue(null); fileCallback=null; toast("无法打开系统选图。"); }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, android.os.Message result) {
                if (!userGesture || !trusted()) return false;
                WebView target = new WebView(MainActivity.this);
                target.setWebViewClient(new WebViewClient() {
                    @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) { openExternal(url); v.stopLoading(); v.destroy(); }
                });
                ((WebView.WebViewTransport)result.obj).setWebView(target); result.sendToTarget(); return true;
            }
        });
        web.setDownloadListener((url,ua,disposition,mime,length) -> openExternal(url));
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::goBack);
        if (state == null) files.execute(() -> { WebUpdates.check(getApplicationContext()); runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) startPage(); }); });
        else { webRelease=WebUpdates.active(this); if (web.restoreState(state)==null) startPage(); else loading.setVisibility(View.GONE); }
    }
    private boolean trusted() { return web != null && NavigationPolicy.ownDocument(web.getUrl()); }
    private void startPage() {
        webRelease=WebUpdates.active(this); pageReady=false; web.loadUrl(NavigationPolicy.HOME);
        startup.postDelayed(() -> { if (pageReady || isFinishing() || isDestroyed()) return; if (WebUpdates.rollback(this)) startPage(); else showFailure(); },15000);
    }
    private void showFailure() {
        loading.removeAllViews(); loading.setVisibility(View.VISIBLE);
        TextView label=new TextView(this); label.setText("页面暂时未能打开\n可重新加载或使用上个可用版本"); label.setGravity(Gravity.CENTER); label.setTextSize(17); loading.addView(label);
        Button retry=new Button(this); retry.setText("重新打开"); retry.setOnClickListener(v -> { loading.setVisibility(View.GONE); startPage(); }); loading.addView(retry);
    }
    private void requestMedia(PermissionRequest request) {
        if (!trusted() || !resumed || !NavigationPolicy.ownOrigin(request.getOrigin().toString())) { request.deny(); return; }
        if (pendingPermission != null) pendingPermission.deny(); pendingPermission=request;
        ArrayList<String> missing = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission=PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)?Manifest.permission.RECORD_AUDIO:PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)?Manifest.permission.CAMERA:null;
            if (permission != null && checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED) missing.add(permission);
        }
        if (!missing.isEmpty()) requestPermissions(missing.toArray(new String[0]),MEDIA_PERMISSION); else grantMedia();
    }
    private void grantMedia() {
        PermissionRequest request=pendingPermission; pendingPermission=null;
        if (request==null) return;
        if (!trusted() || !NavigationPolicy.ownOrigin(request.getOrigin().toString())) { request.deny(); return; }
        ArrayList<String> granted=new ArrayList<>();
        for (String resource:request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED) granted.add(resource);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) granted.add(resource);
        }
        if (granted.isEmpty()) request.deny(); else request.grant(granted.toArray(new String[0]));
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results) { super.onRequestPermissionsResult(requestCode,permissions,results); if (requestCode==MEDIA_PERMISSION) grantMedia(); }
    public final class Bridge {
        @JavascriptInterface public void ready() { runOnUiThread(() -> { if (!trusted()) return; pageReady=true; startup.removeCallbacksAndMessages(null); WebUpdates.ready(MainActivity.this); loading.setVisibility(View.GONE); }); }
        @JavascriptInterface public int shellVersion() { return BuildConfig.VERSION_CODE; }
        @JavascriptInterface public void saveText(String text,String filename) {
            runOnUiThread(() -> {
                if (!trusted() || text==null || text.length()>2*1024*1024) return;
                if (pendingText!=null) { toast("请先完成上一次文件保存。"); return; }
                pendingText=text; selectingFile=true;
                String safe=(filename==null?"LiveAI.txt":filename).replaceAll("[\\\\/\\p{Cntrl}]","_"); if(safe.length()>100)safe=safe.substring(0,100);
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/plain").putExtra(Intent.EXTRA_TITLE,safe);
                try { startActivityForResult(intent,SAVE_TEXT); } catch (RuntimeException e) { selectingFile=false; pendingText=null; toast("无法打开系统保存窗口。"); }
            });
        }
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data); selectingFile=false;
        if (requestCode==OPEN_FILE && fileCallback!=null) { ValueCallback<Uri[]> callback=fileCallback;fileCallback=null;callback.onReceiveValue(resultCode==RESULT_OK && data!=null && data.getData()!=null?new Uri[]{data.getData()}:null); }
        if (requestCode==SAVE_TEXT) {
            String text=pendingText; pendingText=null;
            if (resultCode!=RESULT_OK || data==null || data.getData()==null || text==null) return;
            Uri uri=data.getData(); files.execute(() -> { try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")) { if(out==null)throw new IOException("Cannot save");out.write(text.getBytes(StandardCharsets.UTF_8));runOnUiThread(() -> toast("文字已保存。")); } catch(Exception e) { runOnUiThread(() -> toast("保存失败，请重试。")); } });
        }
    }
    private void emitPause() { if (trusted()) web.evaluateJavascript("window.dispatchEvent(new Event('liveai:native-pause'))",null); }
    private void goBack() { if (web.canGoBack()) web.goBack(); else new android.app.AlertDialog.Builder(this).setTitle("LiveAI").setItems(new String[]{"返回 LiveAI","重新加载页面","退出"},(d,item) -> { if(item==0){}else if(item==1){emitPause();startPage();}else finish(); }).show(); }
    // API 33+ uses the OnBackInvokedDispatcher registered above; this hook
    // preserves the API 26-32 path without adding another native dependency.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { if (Build.VERSION.SDK_INT < 33) goBack(); }
    private void openExternal(String url) { if (!NavigationPolicy.external(url)) return; try { startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url))); } catch(RuntimeException e){toast("无法打开浏览器。");} }
    private void toast(String text) { Toast.makeText(this,text,Toast.LENGTH_SHORT).show(); }
    @Override protected void onResume() { super.onResume();resumed=true;web.onResume(); }
    @Override protected void onPause() { resumed=false; if(pendingPermission==null && !selectingFile) emitPause();CookieManager.getInstance().flush();super.onPause(); }
    @Override protected void onStop() { if(pendingPermission==null && !selectingFile) { emitPause();web.onPause(); }super.onStop(); }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state);super.onSaveInstanceState(state); }
    @Override protected void onDestroy() { startup.removeCallbacksAndMessages(null);if(pendingPermission!=null)pendingPermission.deny();if(fileCallback!=null)fileCallback.onReceiveValue(null);web.removeJavascriptInterface("LiveAIAndroid");web.destroy();files.shutdown();super.onDestroy(); }
}
