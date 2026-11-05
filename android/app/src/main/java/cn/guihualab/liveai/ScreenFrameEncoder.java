package cn.guihualab.liveai;

import android.graphics.Bitmap;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

final class ScreenFrameEncoder {
    static final int MAX_EDGE=960,MAX_BYTES=32768;
    static int[] size(int width,int height) {return size(width,height,MAX_EDGE);}
    static int[] size(int width,int height,int edge) {
        if(width<=0||height<=0)throw new IllegalArgumentException("Invalid screen size");
        double ratio=Math.min(1d,(double)edge/Math.max(width,height));
        return new int[]{Math.max(1,(int)Math.round(width*ratio)),Math.max(1,(int)Math.round(height*ratio))};
    }
    static int[] rgba(ByteBuffer plane,int width,int height,int pixelStride,int rowStride) {
        if(width<1||height<1||pixelStride<4||rowStride<(long)width*pixelStride)throw new IllegalArgumentException("Invalid screen plane");
        int base=plane.position();long last=(long)base+(long)(height-1)*rowStride+(long)(width-1)*pixelStride+3;
        if(last>=plane.limit())throw new IllegalArgumentException("Incomplete screen plane");
        int[] argb=new int[Math.multiplyExact(width,height)];
        for(int y=0;y<height;y++)for(int x=0;x<width;x++){
            int p=base+y*rowStride+x*pixelStride;
            argb[y*width+x]=((plane.get(p+3)&255)<<24)|((plane.get(p)&255)<<16)|((plane.get(p+1)&255)<<8)|(plane.get(p+2)&255);
        }
        return argb;
    }
    static byte[] jpeg(Bitmap bitmap) {return jpeg(bitmap,.6f);}
    static byte[] jpeg(Bitmap bitmap,float initialQuality) {
        Bitmap current=bitmap;ByteArrayOutputStream output=new ByteArrayOutputStream();
        try {
            while(true){
                for(int quality:new int[]{(int)(initialQuality*100),44,30}){
                    output.reset();current.compress(Bitmap.CompressFormat.JPEG,quality,output);
                    if(output.size()<=MAX_BYTES)return output.toByteArray();
                }
                if(Math.max(current.getWidth(),current.getHeight())<=160)return null;
                Bitmap next=Bitmap.createScaledBitmap(current,Math.max(1,current.getWidth()*3/4),Math.max(1,current.getHeight()*3/4),true);
                if(current!=bitmap)current.recycle();current=next;
            }
        } finally {if(current!=bitmap)current.recycle();}
    }
}
