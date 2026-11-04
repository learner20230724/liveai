package cn.guihualab.liveai;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class ToolPolicyTest {
    @Test public void imagePolicyForcesFreeModelOneImageAndNoVisibleWatermark() throws Exception {
        JSONObject body=ToolPolicy.image(new JSONObject().put("prompt","fixture").put("model","moss-image-sft-1.0").put("output_watermark",new JSONObject().put("enabled",true)));
        assertEquals(1,body.getInt("n"));assertFalse(body.getJSONObject("output_watermark").getBoolean("enabled"));assertFalse(body.getBoolean("prompt_enhance"));
        assertThrows(IllegalArgumentException.class,()->ToolPolicy.image(new JSONObject().put("prompt","fixture").put("model","moss-tts-1.5-flash")));
    }
    @Test public void paidAuthorizationRequiresExplicitUnlockExpiresAndNeverSwitchesModel(){AtomicLong time=new AtomicLong(1);PaidAccess access=new PaidAccess(time::get);assertFalse(access.allowed());assertThrows(SecurityException.class,()->ToolPolicy.paidPath("speech","moss-tts-1.5-flash",access.allowed()));access.unlock();assertTrue(access.allowed());assertEquals("/audio/speech",ToolPolicy.paidPath("speech","moss-tts-1.5-flash",access.allowed()));assertThrows(IllegalArgumentException.class,()->ToolPolicy.paidPath("speech","moss-image-sft-1.0",true));time.addAndGet(30*60*1000);assertFalse(access.allowed());access.unlock();access.lock();assertFalse(access.allowed());}
    @Test public void downloadPolicyAcceptsOnlyHttpsOfficialDomains(){assertTrue(ToolPolicy.officialDownload("https://img.mosi.cn/generated.png"));assertFalse(ToolPolicy.officialDownload("https://img.mosi.cn.evil.test/generated.png"));assertFalse(ToolPolicy.officialDownload("https://api.mosi.cn@evil.test/a"));assertFalse(ToolPolicy.officialDownload("file:///etc/passwd"));assertFalse(ToolPolicy.officialDownload("http://img.mosi.cn/a"));}
    @Test public void explicitConcurrencyRejectionsReduceTheProviderWindow(){ImageLimiter limit=new ImageLimiter(10);for(int i=0;i<7;i++)limit.release(true,false);assertEquals(3,limit.capacity());for(int i=0;i<20;i++)limit.release(true,false);assertEquals(1,limit.capacity());}
}
