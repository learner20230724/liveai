package cn.guihualab.liveai;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

final class SecureStore implements ToolValues {
    private final SharedPreferences prefs;
    private static final String ALIAS="liveai-private-v2";
    SecureStore(Context c){prefs=c.getSharedPreferences("native-private",Context.MODE_PRIVATE);}
    private static synchronized SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return generator.generateKey();
    }
    public synchronized String get(String name){try{String value=prefs.getString(name,"");return value.isEmpty()?"":SecretCipher.decrypt(key(),name,Base64.decode(value,Base64.NO_WRAP));}catch(Exception ignored){return "";}}
    public synchronized void put(String name,String value) throws Exception {if(!prefs.edit().putString(name,Base64.encodeToString(SecretCipher.encrypt(key(),name,value),Base64.NO_WRAP)).commit())throw new IllegalStateException("无法保存加密配置");}
    synchronized void clearCredentials(){prefs.edit().remove("mossKey").remove("password").commit();}
    synchronized void forgetPassword(){prefs.edit().remove("password").commit();}
}
