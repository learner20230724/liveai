package cn.guihualab.liveai;

import android.content.Context;
import android.content.SharedPreferences;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import java.io.File;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34)
public class WebUpdatesTest {
    @Test public void rejectedOrUnreadyUpdateFallsBackWithoutClearingUserData() {
        Context context=RuntimeEnvironment.getApplication();
        SharedPreferences p=context.getSharedPreferences("web-updates",Context.MODE_PRIVATE);
        SharedPreferences records=context.getSharedPreferences("user-example",Context.MODE_PRIVATE);records.edit().putString("draft","keep original input").commit();
        p.edit().clear().putString("active","b".repeat(64)).putString("healthy","a".repeat(64)).commit();
        assertTrue(WebUpdates.rollback(context));assertEquals("a".repeat(64),p.getString("active",""));assertEquals("b".repeat(64),p.getString("blocked",""));
        assertEquals("keep original input",records.getString("draft",""));assertFalse(WebUpdates.rollback(context));
        WebUpdates.ready(context);assertEquals(p.getString("active",""),p.getString("healthy",""));
    }
    @Test public void channelAndMissingFilesCannotActivateAnotherApp() {
        assertTrue(WebUpdates.channelAllowed("liveai-stable"));assertFalse(WebUpdates.channelAllowed("stable"));assertFalse(WebUpdates.channelAllowed("beta"));assertFalse(WebUpdates.channelAllowed(""));
        Context c=RuntimeEnvironment.getApplication();c.getSharedPreferences("web-updates",Context.MODE_PRIVATE).edit().putString("active","f".repeat(64)).commit();assertNull(WebUpdates.active(c));
    }
}
