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
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONObject;

public final class MainActivity extends Activity implements CallEvents.Listener {
    private static final int MEDIA_PERMISSION = 20, OPEN_FILE = 21, SAVE_TEXT = 22;
    private WebView web;
    private FrameLayout root;
    private LinearLayout loading;
    private PermissionRequest pendingPermission;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingText;
    private volatile File webRelease;
    private boolean pageReady, resumed, selectingFile;
    private volatile boolean ownDocument;
    private CameraFrames cameraFrames;
    private boolean frontCamera, pendingCamera, pendingNativeStart;
    private String nativePrompt="";
    private static final int CALL_PERMISSION=31, CAMERA_PERMISSION=32;
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
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) { ownDocument=NavigationPolicy.ownDocument(url); }
            @Override public void onPageFinished(WebView view, String url) { ownDocument=NavigationPolicy.ownDocument(url);CookieManager.getInstance().flush(); }
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
        if (state == null && !LiveCallService.active()) files.execute(() -> { WebUpdates.check(getApplicationContext()); runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) startPage(); }); });
        else if (state == null) startPage();
        else { webRelease=WebUpdates.active(this); if (web.restoreState(state)==null) startPage(); else {ownDocument=NavigationPolicy.ownDocument(web.getUrl());loading.setVisibility(View.GONE);} }
    }
    private boolean trusted() { return web != null && ownDocument; }
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
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if (requestCode==MEDIA_PERMISSION) grantMedia();
        if(requestCode==CALL_PERMISSION){if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){pendingNativeStart=true;if(resumed)startNativeCall();}else event(message("error","请在系统设置允许 LiveAI 使用麦克风"));}
        if(requestCode==CAMERA_PERMISSION&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){pendingCamera=true;if(resumed)startCamera();}
    }
    public final class Bridge {
        @JavascriptInterface public void ready() { runOnUiThread(() -> { if (!trusted()) return; pageReady=true; startup.removeCallbacksAndMessages(null); WebUpdates.ready(MainActivity.this); loading.setVisibility(View.GONE); }); }
        @JavascriptInterface public int shellVersion() { return BuildConfig.VERSION_CODE; }
        @JavascriptInterface public int directVersion() { return 1; }
        @JavascriptInterface public String callState() { return LiveCallService.snapshot(); }
        @JavascriptInterface public String history() { if(!trusted())return "[]";String value=new SecureStore(MainActivity.this).get("history");return value.isEmpty()?"[]":value; }
        @JavascriptInterface public String preferences() {
            JSONObject data=new JSONObject();try{SecureStore store=new SecureStore(MainActivity.this);data.put("configured",!store.get("mossKey").isEmpty());data.put("remembered",!store.get("password").isEmpty());data.put("route",getSharedPreferences("call-options",MODE_PRIVATE).getString("route","auto"));data.put("backgroundAllowed",((PowerManager)getSystemService(POWER_SERVICE)).isIgnoringBatteryOptimizations(getPackageName()));data.put("notificationsAllowed",getSystemService(android.app.NotificationManager.class).areNotificationsEnabled());data.put("shellVersion",BuildConfig.VERSION_NAME);}catch(Exception ignored){}return data.toString();
        }
        @JavascriptInterface public void prepareDirect() { if(!trusted())return;files.execute(()->{try{boolean ready=DeviceProvisioning.prepare(new SecureStore(MainActivity.this));event(message("configured",ready?"ready":"login"));}catch(Exception e){event(message("error","无法读取通话配置，请检查网络后重试"));}}); }
        @JavascriptInterface public void configureDirect(String password,boolean remember) { if(!trusted())return;files.execute(()->{try{DeviceProvisioning.loginAndConfigure(new SecureStore(MainActivity.this),password,remember);event(message("configured","ready"));}catch(Exception e){event(message("error",e.getMessage()==null?"登录失败，请重试":e.getMessage()));}}); }
        @JavascriptInterface public void refreshDirect() { if(!trusted())return;files.execute(()->{try{SecureStore store=new SecureStore(MainActivity.this);String password=store.get("password");if(password.isEmpty())DeviceProvisioning.configure(store);else DeviceProvisioning.loginAndConfigure(store,password,true);event(message("configured","ready"));}catch(Exception e){event(message("error","配置刷新失败，请重新输入访问密码"));}}); }
        @JavascriptInterface public void forgetDirect() { if(!trusted())return;runOnUiThread(()->{closeCamera();LiveCallService.end();new SecureStore(MainActivity.this).clearCredentials();CookieManager.getInstance().setCookie(NavigationPolicy.HOME,"liveai_session=; Path=/liveai/; Max-Age=0; Secure; HttpOnly");CookieManager.getInstance().flush();event(message("configured","login"));}); }
        @JavascriptInterface public void startCall(String prompt) { runOnUiThread(()->{if(trusted()&&resumed)requestNativeCall(prompt);}); }
        @JavascriptInterface public void endCall() { runOnUiThread(()->{if(!trusted())return;closeCamera();LiveCallService.end();}); }
        @JavascriptInterface public void muteCall(boolean muted) { if(trusted())LiveCallService.mute(muted); }
        @JavascriptInterface public void audioRoute(String route) { if(trusted()&&route!=null&&route.matches("auto|speaker|earpiece|device:[0-9]+")){getSharedPreferences("call-options",MODE_PRIVATE).edit().putString("route",route).apply();LiveCallService.route(route);} }
        @JavascriptInterface public void toggleCamera() { runOnUiThread(()->{if(!trusted()||!resumed||!LiveCallService.active())return;if(cameraFrames!=null){closeCamera();return;}if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA_PERMISSION);else startCamera();}); }
        @JavascriptInterface public void flipCamera() { runOnUiThread(()->{if(!trusted()||cameraFrames==null)return;frontCamera=!frontCamera;closeCamera();startCamera();}); }
        @JavascriptInterface public void allowBackground() { runOnUiThread(()->{if(!trusted())return;try{startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:"+getPackageName())));}catch(RuntimeException ignored){startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));}}); }
        @JavascriptInterface public void appSettings() { runOnUiThread(()->{if(trusted())startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}); }
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
    private static JSONObject message(String type,String value){JSONObject o=new JSONObject();try{o.put("type",type);o.put("value",value);}catch(Exception ignored){}return o;}
    @Override public void event(JSONObject event){runOnUiThread(()->{if("call".equals(event.optString("type"))&&cameraFrames!=null){JSONObject call=event.optJSONObject("state");if(call!=null&&(call.optString("phase").equals("idle")||call.optString("phase").equals("error")))closeCamera();}if(!resumed||!trusted())return;String json=JSONObject.quote(event.toString()).replace("\u2028","\\u2028").replace("\u2029","\\u2029");web.evaluateJavascript("window.dispatchEvent(new CustomEvent('liveai:native',{detail:JSON.parse("+json+")}))",null);});}
    private void requestNativeCall(String prompt){if(LiveCallService.active()){event(message("refresh","call"));return;}if(new SecureStore(this).get("mossKey").isEmpty()){event(message("error","请先完成登录配置"));return;}nativePrompt=prompt==null?"":prompt;ArrayList<String> required=new ArrayList<>();if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)required.add(Manifest.permission.RECORD_AUDIO);
        android.content.SharedPreferences permissions=getSharedPreferences("asked-permissions",MODE_PRIVATE);
        if(Build.VERSION.SDK_INT>=31&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED&&!permissions.getBoolean("bluetooth",false)){required.add(Manifest.permission.BLUETOOTH_CONNECT);permissions.edit().putBoolean("bluetooth",true).apply();}
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED&&!permissions.getBoolean("notifications",false)){required.add(Manifest.permission.POST_NOTIFICATIONS);permissions.edit().putBoolean("notifications",true).apply();}
        if(required.isEmpty()){pendingNativeStart=true;startNativeCall();}else requestPermissions(required.toArray(new String[0]),CALL_PERMISSION);
    }
    private void startNativeCall(){if(!resumed||!pendingNativeStart)return;pendingNativeStart=false;try{startForegroundService(new Intent(this,LiveCallService.class).setAction(LiveCallService.START).putExtra("prompt",nativePrompt));}catch(RuntimeException e){event(message("error","无法启动通话服务，请检查麦克风和后台运行权限"));}}
    private void startCamera(){pendingCamera=false;if(!resumed||!LiveCallService.active())return;try{cameraFrames=new CameraFrames(this,new CameraFrames.Listener(){public void opened(){LiveCallService.video(true);}public void closed(String error){runOnUiThread(()->{cameraFrames=null;LiveCallService.video(false);event(message("error",error));});}public void frame(byte[] jpeg){LiveCallService.frame(jpeg);if(resumed){JSONObject e=message("preview",android.util.Base64.encodeToString(jpeg,android.util.Base64.NO_WRAP));event(e);}}});int rotation=getWindowManager().getDefaultDisplay().getRotation()*90;cameraFrames.start(frontCamera,rotation);}catch(Exception e){closeCamera();event(message("error","摄像头未能启动，请检查相机权限"));}}
    private void closeCamera(){CameraFrames frames=cameraFrames;cameraFrames=null;if(frames!=null)frames.close();LiveCallService.video(false);}
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data); selectingFile=false;
        if (requestCode==OPEN_FILE && fileCallback!=null) { ValueCallback<Uri[]> callback=fileCallback;fileCallback=null;callback.onReceiveValue(resultCode==RESULT_OK && data!=null && data.getData()!=null?new Uri[]{data.getData()}:null); }
        if (requestCode==SAVE_TEXT) {
            String text=pendingText; pendingText=null;
            if (resultCode!=RESULT_OK || data==null || data.getData()==null || text==null) return;
            Uri uri=data.getData(); files.execute(() -> { try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")) { if(out==null)throw new IOException("Cannot save");out.write(text.getBytes(StandardCharsets.UTF_8));runOnUiThread(() -> toast("文字已保存。")); } catch(Exception e) { runOnUiThread(() -> toast("保存失败，请重试。")); } });
        }
    }
    private void goBack() { if (web.canGoBack()) web.goBack(); else moveTaskToBack(true); }
    // API 33+ uses the OnBackInvokedDispatcher registered above; this hook
    // preserves the API 26-32 path without adding another native dependency.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { if (Build.VERSION.SDK_INT < 33) goBack(); }
    private void openExternal(String url) { if (!NavigationPolicy.external(url)) return; try { startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url))); } catch(RuntimeException e){toast("无法打开浏览器。");} }
    private void toast(String text) { Toast.makeText(this,text,Toast.LENGTH_SHORT).show(); }
    @Override protected void onResume() { super.onResume();resumed=true;web.onResume();CallEvents.listen(this);if(pendingNativeStart)startNativeCall();if(pendingCamera)startCamera();event(message("refresh","call")); }
    @Override protected void onPause() { resumed=false;CallEvents.listen(null);closeCamera();CookieManager.getInstance().flush();super.onPause(); }
    @Override protected void onStop() { web.onPause();super.onStop(); }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state);super.onSaveInstanceState(state); }
    @Override protected void onDestroy() { ownDocument=false;startup.removeCallbacksAndMessages(null);closeCamera();if(pendingPermission!=null)pendingPermission.deny();if(fileCallback!=null)fileCallback.onReceiveValue(null);web.removeJavascriptInterface("LiveAIAndroid");web.destroy();files.shutdown();super.onDestroy(); }
}
