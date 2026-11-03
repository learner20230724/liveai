package cn.guihualab.liveai;
import org.junit.Test;
import static org.junit.Assert.*;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
public class PrivateStateTest {
    @Test public void encryptedPasswordUsesAuthenticatedPerFieldStorage() throws Exception {KeyGenerator generator=KeyGenerator.getInstance("AES");generator.init(256);SecretKey key=generator.generateKey();byte[] one=SecretCipher.encrypt(key,"password","synthetic-private-value"),two=SecretCipher.encrypt(key,"password","synthetic-private-value");assertFalse(java.util.Arrays.equals(one,two));assertFalse(new String(one,StandardCharsets.ISO_8859_1).contains("synthetic-private-value"));assertEquals("synthetic-private-value",SecretCipher.decrypt(key,"password",one));assertThrows(Exception.class,()->SecretCipher.decrypt(key,"mossKey",one));one[one.length-1]^=1;assertThrows(Exception.class,()->SecretCipher.decrypt(key,"password",one));}
    @Test public void duplexHeadsetsOutrankPhoneAndMusicOnlyBluetooth(){assertTrue(RoutePolicy.rank(7)>RoutePolicy.rank(2));assertTrue(RoutePolicy.rank(26)>RoutePolicy.rank(2));assertTrue(RoutePolicy.rank(3)>RoutePolicy.rank(2));assertTrue(RoutePolicy.rank(22)>RoutePolicy.rank(2));assertEquals(0,RoutePolicy.rank(8));assertFalse(RoutePolicy.headset(8));assertEquals("蓝牙耳机麦克风",RoutePolicy.label(7));}
}
