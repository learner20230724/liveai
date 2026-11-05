package cn.guihualab.liveai;

import android.content.*;
import android.graphics.*;
import android.hardware.display.*;
import android.media.*;
import android.media.projection.*;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import java.util.concurrent.atomic.AtomicBoolean;

/** Service-owned MediaProjection snapshots; no screen pixels enter JS, storage or the hub. */
final class ScreenFrames implements ScreenCapture {
    private final CallOptions options;private final Context context;private final Listener listener;
    private final HandlerThread thread=new HandlerThread("liveai-screen");
    private final AtomicBoolean closed=new AtomicBoolean();
    private Handler handler;private MediaProjection projection;private VirtualDisplay display;private ImageReader reader;
    private int width,height,density;private long lastFrame;
    private DisplayManager displays;
    private final DisplayManager.DisplayListener displayListener=new DisplayManager.DisplayListener(){
        public void onDisplayAdded(int id){} public void onDisplayRemoved(int id){}
        public void onDisplayChanged(int id){if(Build.VERSION.SDK_INT<34&&id==android.view.Display.DEFAULT_DISPLAY&&!closed.get()){Rect bounds=bounds();resize(bounds.width(),bounds.height());}}
    };
    private final MediaProjection.Callback callback=new MediaProjection.Callback(){
        @Override public void onStop(){release("");}
        @Override public void onCapturedContentResize(int w,int h){resize(w,h);}
    };
    ScreenFrames(Context context,Listener listener){this.context=context.getApplicationContext();this.listener=listener;options=CallOptions.load(context);}
    @Override public void start(int resultCode,Intent consent){
        if(closed.get())return;thread.start();handler=new Handler(thread.getLooper());
        handler.post(()->{
            if(closed.get())return;
            try {
                density=context.getResources().getDisplayMetrics().densityDpi;
                Rect bounds=bounds();int[] initial=ScreenFrameEncoder.size(bounds.width(),bounds.height(),options.screenEdge);width=initial[0];height=initial[1];
                projection=context.getSystemService(MediaProjectionManager.class).getMediaProjection(resultCode,consent);
                if(projection==null)throw new IllegalStateException("Missing projection consent");
                projection.registerCallback(callback,handler);
                reader=createReader(width,height);
                display=projection.createVirtualDisplay("LiveAI screen",width,height,density,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,reader.getSurface(),null,handler);
                if(display==null)throw new IllegalStateException("Missing projection display");
                if(Build.VERSION.SDK_INT<34){displays=context.getSystemService(DisplayManager.class);displays.registerDisplayListener(displayListener,handler);}
                listener.opened();
            } catch(Exception failure){release("屏幕共享未能启动，请重新授权");}
        });
    }
    private Rect bounds(){
        WindowManager manager=context.getSystemService(WindowManager.class);
        if(Build.VERSION.SDK_INT>=30)return manager.getMaximumWindowMetrics().getBounds();
        DisplayMetrics metrics=new DisplayMetrics();manager.getDefaultDisplay().getRealMetrics(metrics);return new Rect(0,0,metrics.widthPixels,metrics.heightPixels);
    }
    private ImageReader createReader(int w,int h){
        ImageReader value=ImageReader.newInstance(w,h,PixelFormat.RGBA_8888,2);
        value.setOnImageAvailableListener(source->{
            Image image=null;Bitmap bitmap=null;
            try {
                image=source.acquireLatestImage();if(image==null||closed.get())return;
                long now=SystemClock.elapsedRealtime();if(now-lastFrame<1000/options.fps||!listener.wantsFrame())return;lastFrame=now;
                Image.Plane plane=image.getPlanes()[0];int w1=image.getWidth(),h1=image.getHeight();
                int[] pixels=ScreenFrameEncoder.rgba(plane.getBuffer(),w1,h1,plane.getPixelStride(),plane.getRowStride());
                bitmap=Bitmap.createBitmap(pixels,w1,h1,Bitmap.Config.ARGB_8888);
                byte[] bytes=ScreenFrameEncoder.jpeg(bitmap,options.quality);
                if(bytes!=null&&!closed.get()&&listener.wantsFrame())listener.frame(bytes);
            }catch(Exception ignored){/* Drop a stale/invalid snapshot while voice continues. */}
            finally{if(bitmap!=null)bitmap.recycle();if(image!=null)image.close();}
        },handler);
        return value;
    }
    private void resize(int w,int h){
        if(closed.get()||display==null)return;
        try{
            int[] size=ScreenFrameEncoder.size(w,h,options.screenEdge);if(width==size[0]&&height==size[1])return;
            ImageReader next=createReader(size[0],size[1]),previous=reader;
            try{display.setSurface(null);display.resize(size[0],size[1],density);display.setSurface(next.getSurface());}
            catch(Exception failure){next.close();throw failure;}
            reader=next;width=size[0];height=size[1];if(previous!=null)previous.close();
        }catch(Exception failure){release("屏幕尺寸变化后共享已停止，请重新开启");}
    }
    @Override public void close(){if(handler==null){closed.set(true);return;}handler.post(()->release(""));}
    private void release(String error){
        if(!closed.compareAndSet(false,true))return;
        if(displays!=null)displays.unregisterDisplayListener(displayListener);
        if(display!=null){display.release();display=null;}
        if(reader!=null){reader.close();reader=null;}
        if(projection!=null){projection.unregisterCallback(callback);projection.stop();projection=null;}
        listener.closed(error);thread.quitSafely();
    }
}
