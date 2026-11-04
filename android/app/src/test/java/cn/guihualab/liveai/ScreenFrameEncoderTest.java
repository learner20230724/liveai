package cn.guihualab.liveai;

import android.graphics.*;
import java.nio.ByteBuffer;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=34) @GraphicsMode(GraphicsMode.Mode.NATIVE)
public class ScreenFrameEncoderTest {
    @Test public void rowPaddingPixelStrideAndOffsetDoNotLeakIntoCapturedPixels(){
        ByteBuffer b=ByteBuffer.allocate(40);b.position(3);int[] pixels={0xff123456,0xffabcdef,0xff102030,0xff112233};
        for(int y=0;y<2;y++)for(int x=0;x<2;x++){int p=3+y*18+x*8,c=pixels[y*2+x];b.put(p,(byte)(c>>16));b.put(p+1,(byte)(c>>8));b.put(p+2,(byte)c);b.put(p+3,(byte)(c>>24));}
        assertArrayEquals(pixels,ScreenFrameEncoder.rgba(b,2,2,8,18));assertEquals(3,b.position());
    }
    @Test public void rotationsKeepAspectRatioAndNoOversizedJpegEntersTransport(){
        assertArrayEquals(new int[]{432,960},ScreenFrameEncoder.size(1440,3200));assertArrayEquals(new int[]{960,432},ScreenFrameEncoder.size(3200,1440));
        Bitmap noise=Bitmap.createBitmap(960,432,Bitmap.Config.ARGB_8888);java.util.Random r=new java.util.Random(17);int[] pixels=new int[960*432];for(int i=0;i<pixels.length;i++)pixels[i]=0xff000000|r.nextInt(0xffffff);noise.setPixels(pixels,0,960,0,0,960,432);
        byte[] jpeg=ScreenFrameEncoder.jpeg(noise);assertNotNull(jpeg);assertTrue(jpeg.length<=32768);assertEquals(0xff,jpeg[0]&255);assertEquals(0xd8,jpeg[1]&255);Bitmap decoded=BitmapFactory.decodeByteArray(jpeg,0,jpeg.length);assertNotNull(decoded);assertTrue(decoded.getWidth()<=960);decoded.recycle();noise.recycle();
        Bitmap small=Bitmap.createBitmap(80,80,Bitmap.Config.ARGB_8888);assertNotNull(ScreenFrameEncoder.jpeg(small));small.recycle();
    }
}
