package cn.guihualab.liveai;

import android.webkit.CookieManager;
import android.util.Base64;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.MGF1ParameterSpec;
import javax.crypto.Cipher;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;

/** Only initial configuration uses the hub. Media never enters this transport. */
final class DeviceProvisioning {
    private static final String API="https://guihualab.cn/liveai/api/";
    private static JSONObject post(String route,JSONObject body) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(API+route).openConnection();c.setRequestMethod("POST");c.setConnectTimeout(12000);c.setReadTimeout(12000);c.setInstanceFollowRedirects(false);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Origin","https://guihualab.cn");String cookie=CookieManager.getInstance().getCookie(API+route);if(cookie!=null)c.setRequestProperty("Cookie",cookie);
        try {
            try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
            int status=c.getResponseCode();String set=c.getHeaderField("Set-Cookie");if(set!=null){storeCookie(set);}
            InputStream input=status>=400?c.getErrorStream():c.getInputStream();if(input==null)throw new IOException("登录服务暂时不可用");ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=input){byte[] chunk=new byte[4096];int n;while((n=in.read(chunk))!=-1){if(bytes.size()+n>32768)throw new IOException("登录响应过大");bytes.write(chunk,0,n);}}
            JSONObject data=new JSONObject(bytes.toString("UTF-8"));if(status!=200)throw new IOException(data.optString("error","配置失败，请检查密码和网络"));return data;
        }finally{c.disconnect();}
    }
    private static void storeCookie(String value) throws Exception {
        CountDownLatch saved=new CountDownLatch(1);AtomicBoolean accepted=new AtomicBoolean();
        new Handler(Looper.getMainLooper()).post(()->CookieManager.getInstance().setCookie(API,value,ok->{accepted.set(ok);CookieManager.getInstance().flush();saved.countDown();}));
        if(!saved.await(6,TimeUnit.SECONDS)||!accepted.get())throw new IOException("登录状态未能保存，请重试");
    }
    static void loginAndConfigure(SecureStore store,String password,boolean remember) throws Exception {
        if(password==null||password.isEmpty()||password.length()>128)throw new IOException("请输入访问密码");
        post("login",new JSONObject().put("password",password));configure(store);
        if(remember)store.put("password",password);else store.forgetPassword();
    }
    static void configure(SecureStore store) throws Exception {
        KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);KeyPair pair=generator.generateKeyPair();String pem="-----BEGIN PUBLIC KEY-----\n"+Base64.encodeToString(pair.getPublic().getEncoded(),Base64.NO_WRAP)+"\n-----END PUBLIC KEY-----";
        JSONObject response=post("mobile/bootstrap",new JSONObject().put("publicKey",pem));
        Cipher cipher=Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");cipher.init(Cipher.DECRYPT_MODE,pair.getPrivate(),new OAEPParameterSpec("SHA-256","MGF1",MGF1ParameterSpec.SHA256,PSource.PSpecified.DEFAULT));String secret=new String(cipher.doFinal(Base64.decode(response.getString("encryptedKey"),Base64.NO_WRAP)),StandardCharsets.UTF_8);
        if(!secret.startsWith("sk-")||secret.length()<20)throw new IOException("通话配置无效");store.put("mossKey",secret);
    }
    static void unlockPaid(String password) throws Exception {if(!post("paid/unlock",new JSONObject().put("password",password)).optBoolean("unlocked"))throw new IOException("未能解锁付费模型");}
    static boolean prepare(SecureStore store) throws Exception {
        if(!store.get("mossKey").isEmpty())return true;
        String password=store.get("password");if(!password.isEmpty()){loginAndConfigure(store,password,true);return true;}
        try{configure(store);return true;}catch(Exception ignored){return false;}
    }
}
