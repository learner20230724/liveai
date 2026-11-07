package cn.guihualab.liveai;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Complete, verified releases; the original HTTPS storage origin never changes. */
final class WebUpdates {
    static final int SHELL_VERSION = BuildConfig.VERSION_CODE;
    private static final String ENDPOINT = BuildConfig.WEB_UPDATE_ENDPOINT;
    static boolean channelAllowed(String channel) {
        return BuildConfig.WEB_UPDATE_CHANNEL.equals(channel);
    }
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("web-updates",Context.MODE_PRIVATE); }
    private static File release(Context c,String version) { return new File(c.getFilesDir(),"web-releases/"+version); }
    static File active(Context c) {
        String version=prefs(c).getString("active","");
        if (!version.matches("[a-f0-9]{64}")) return null;
        File root=release(c,version);
        return new File(root,"index.html").isFile()?root:null;
    }
    static void ready(Context c) {
        SharedPreferences p=prefs(c);
        String active=p.getString("active","");
        p.edit().putString("healthy",active).commit();
    }
    static boolean rollback(Context c) {
        SharedPreferences p=prefs(c);
        String current=p.getString("active",""), healthy=p.getString("healthy","");
        if (current.equals(healthy)) return false;
        p.edit().putString("blocked",current).putString("active",healthy).commit();
        return true;
    }
    static void shellChanged(Context c) {
        SharedPreferences p=prefs(c);
        if(p.getInt("bundled-shell",0)<SHELL_VERSION)p.edit().remove("active").remove("healthy").remove("blocked").putInt("bundled-shell",SHELL_VERSION).commit();
    }
    static boolean notOlderThanBundled(String version) {
        try {
            if(version==null||!version.matches("[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}"))return false;
            String[] candidate=version.split("\\."),bundled=BuildConfig.VERSION_NAME.split("\\.");
            for(int i=0;i<3;i++){int n=Integer.parseInt(candidate[i]),b=Integer.parseInt(bundled[i]);if(n!=b)return n>b;}return true;
        }catch(Exception invalid){return false;}
    }
    static void check(Context c) {
        shellChanged(c);
        rollback(c);
        SharedPreferences p=prefs(c);
        String current=p.getString("active",""), healthy=p.getString("healthy","");
        try {
            JSONObject manifest=new JSONObject(new String(download("latest.json?t="+System.currentTimeMillis(),16384),StandardCharsets.UTF_8));
            if(!channelAllowed(manifest.optString("channel"))||!notOlderThanBundled(manifest.optString("version"))) return;
            String version=manifest.getString("sha256");
            if (!UpdateBundle.compatible(version,manifest.getInt("minShellVersion"),SHELL_VERSION)) return;
            if (version.equals(current) || version.equals(p.getString("blocked",""))) return;
            byte[] bytes=download(version+".zip",12*1024*1024);
            File staging=release(c,version+".staging"), target=release(c,version);
            UpdateBundle.remove(staging);
            if (!staging.mkdirs()) throw new IOException("Cannot stage update");
            try {
                UpdateBundle.unpack(bytes,version,staging);
                UpdateBundle.remove(target);
                if (!staging.renameTo(target)) throw new IOException("Cannot commit update");
                if (!p.edit().putString("active",version).commit()) throw new IOException("Cannot activate update");
                File[] old=target.getParentFile().listFiles();
                if(old!=null) for(File f:old) if(!f.getName().equals(version) && !f.getName().equals(healthy)) UpdateBundle.remove(f);
            } finally { UpdateBundle.remove(staging); }
        } catch(Exception ignored) { /* The bundled or last healthy release remains usable offline. */ }
    }
    private static byte[] download(String path,int limit) throws IOException {
        HttpURLConnection c=(HttpURLConnection)new URL(ENDPOINT+path).openConnection();
        c.setConnectTimeout(3000);c.setReadTimeout(6000);c.setUseCaches(false);c.setInstanceFollowRedirects(false);
        try {
            if(c.getResponseCode()!=200) throw new IOException("Update unavailable");
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[16384];int n;
                while((n=in.read(buffer))!=-1) { if(out.size()+n>limit) throw new IOException("Update too large");out.write(buffer,0,n); }
                return out.toByteArray();
            }
        } finally { c.disconnect(); }
    }
}
