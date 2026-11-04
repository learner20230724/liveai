package cn.guihualab.liveai;

import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowContentResolver;
import java.io.*;
import java.nio.file.Files;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class GallerySaveTest {
    public static final class Provider extends ContentProvider {
        ContentValues inserted,updated;Uri collection;File target;boolean fail,failPublish;int deletes;
        public boolean onCreate(){return true;}public String getType(Uri u){return "image/png";}public Cursor query(Uri u,String[] p,String s,String[] a,String sort){return null;}
        public Uri insert(Uri u,ContentValues v){inserted=new ContentValues(v);collection=u;return ContentUris.withAppendedId(u,1);}
        public int update(Uri u,ContentValues v,String s,String[] a){updated=new ContentValues(v);return failPublish?0:1;}public int delete(Uri u,String s,String[] a){deletes++;return 1;}
        public ParcelFileDescriptor openFile(Uri u,String mode)throws FileNotFoundException {if(fail)throw new FileNotFoundException("fixture failure");return ParcelFileDescriptor.open(target,ParcelFileDescriptor.MODE_CREATE|ParcelFileDescriptor.MODE_TRUNCATE|ParcelFileDescriptor.MODE_READ_WRITE);}
    }
    @Test public void savingCopiesExactOriginalIntoPicturesAndPublishesPendingRow() throws Exception {
        File source=File.createTempFile("gallery-source",".png"),target=File.createTempFile("gallery-target",".png");byte[] bytes={-119,80,78,71,13,10,26,10};Files.write(source.toPath(),bytes);Provider provider=new Provider();provider.target=target;android.content.pm.ProviderInfo info=new android.content.pm.ProviderInfo();info.authority="media";info.applicationInfo=RuntimeEnvironment.getApplication().getApplicationInfo();provider.attachInfo(RuntimeEnvironment.getApplication(),info);ShadowContentResolver.registerProviderInternal("media",provider);
        Uri uri=GallerySave.save(RuntimeEnvironment.getApplication(),source,"fixture.png");assertEquals("content",uri.getScheme());assertEquals("/external_primary/images/media",provider.collection.getPath());assertEquals("Pictures/LiveAI",provider.inserted.getAsString(MediaStore.Images.Media.RELATIVE_PATH));assertEquals(Integer.valueOf(1),provider.inserted.getAsInteger(MediaStore.Images.Media.IS_PENDING));assertEquals(Integer.valueOf(0),provider.updated.getAsInteger(MediaStore.Images.Media.IS_PENDING));assertArrayEquals(bytes,Files.readAllBytes(target.toPath()));assertEquals(0,provider.deletes);
    }
    @Test public void failedWriteRemovesIncompleteGalleryEntry() throws Exception {File source=File.createTempFile("gallery-source",".png");Provider provider=new Provider();provider.fail=true;android.content.pm.ProviderInfo info=new android.content.pm.ProviderInfo();info.authority="media";info.applicationInfo=RuntimeEnvironment.getApplication().getApplicationInfo();provider.attachInfo(RuntimeEnvironment.getApplication(),info);ShadowContentResolver.registerProviderInternal("media",provider);assertThrows(Exception.class,()->GallerySave.save(RuntimeEnvironment.getApplication(),source,"fixture.png"));assertEquals(1,provider.deletes);assertNull(provider.updated);}
    @Test public void cachedMediaRangeReturnsOnlyRequestedBytes() throws Exception {File file=File.createTempFile("native-audio",".mp3");Files.write(file.toPath(),new byte[]{1,2,3,4,5});android.webkit.WebResourceResponse response=NativeOutputResponse.open(file,"bytes=1-3",false);assertEquals(206,response.getStatusCode());assertEquals("bytes 1-3/5",response.getResponseHeaders().get("Content-Range"));assertArrayEquals(new byte[]{2,3,4},response.getData().readAllBytes());}
}
