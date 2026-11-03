package cn.guihualab.liveai;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

final class SecretCipher {
    static byte[] encrypt(SecretKey key, String name, String value) throws Exception {
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key);c.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        byte[] bytes=c.doFinal(value.getBytes(StandardCharsets.UTF_8)),iv=c.getIV(),out=new byte[iv.length+bytes.length];System.arraycopy(iv,0,out,0,iv.length);System.arraycopy(bytes,0,out,iv.length,bytes.length);return out;
    }
    static String decrypt(SecretKey key,String name,byte[] bytes) throws Exception {
        if(bytes.length<28)throw new IllegalArgumentException("Invalid encrypted data");
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,Arrays.copyOfRange(bytes,0,12)));c.updateAAD(name.getBytes(StandardCharsets.UTF_8));return new String(c.doFinal(Arrays.copyOfRange(bytes,12,bytes.length)),StandardCharsets.UTF_8);
    }
}
