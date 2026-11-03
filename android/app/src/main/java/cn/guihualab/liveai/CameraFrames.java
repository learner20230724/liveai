package cn.guihualab.liveai;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.hardware.camera2.*;
import android.media.Image;
import android.media.ImageReader;
import android.os.*;
import android.util.Size;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.*;

/** Native camera conversion: bounded JPEG snapshots; no canvas or JS upload. */
final class CameraFrames {
    interface Listener {void frame(byte[] jpeg);void opened();void closed(String error);}
    private final Context context;private final Listener listener;private HandlerThread thread;private Handler handler;private CameraDevice device;private CameraCaptureSession session;private ImageReader reader;private volatile boolean stopped;private long lastFrame;private int rotate;
    CameraFrames(Context context,Listener listener){this.context=context;this.listener=listener;}
    @SuppressLint("MissingPermission") void start(boolean front,int displayDegrees) throws Exception {
        if(context.checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("相机权限未获允许");
        CameraManager manager=(CameraManager)context.getSystemService(Context.CAMERA_SERVICE);String selected=null;CameraCharacteristics info=null;
        for(String id:manager.getCameraIdList()){CameraCharacteristics c=manager.getCameraCharacteristics(id);Integer face=c.get(CameraCharacteristics.LENS_FACING);if(selected==null||(face!=null&&face==(front?CameraCharacteristics.LENS_FACING_FRONT:CameraCharacteristics.LENS_FACING_BACK))){selected=id;info=c;if(face!=null&&face==(front?CameraCharacteristics.LENS_FACING_FRONT:CameraCharacteristics.LENS_FACING_BACK))break;}}
        if(selected==null||info==null)throw new IllegalStateException("没有可用摄像头");
        Size chosen=null;Size[] choices=info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP).getOutputSizes(ImageFormat.YUV_420_888);
        for(Size size:choices)if(size.getWidth()<=640&&size.getHeight()<=480&&(chosen==null||size.getWidth()*size.getHeight()>chosen.getWidth()*chosen.getHeight()))chosen=size;
        if(chosen==null)chosen=Collections.min(Arrays.asList(choices),Comparator.comparingInt(s->s.getWidth()*s.getHeight()));
        Integer orientation=info.get(CameraCharacteristics.SENSOR_ORIENTATION);rotate=((orientation==null?90:orientation)+(front?displayDegrees:-displayDegrees)+360)%360;
        thread=new HandlerThread("liveai-camera");thread.start();handler=new Handler(thread.getLooper());reader=ImageReader.newInstance(chosen.getWidth(),chosen.getHeight(),ImageFormat.YUV_420_888,2);
        reader.setOnImageAvailableListener(source->{Image image=null;try{image=source.acquireLatestImage();if(image==null||stopped)return;long now=SystemClock.elapsedRealtime();if(now-lastFrame<1000)return;lastFrame=now;byte[] jpeg=encode(image,rotate);if(!stopped)listener.frame(jpeg);}catch(Exception ignored){}finally{if(image!=null)image.close();}},handler);
        manager.openCamera(selected,new CameraDevice.StateCallback(){
            @Override public void onOpened(CameraDevice value){if(stopped){value.close();return;}device=value;try{value.createCaptureSession(Collections.singletonList(reader.getSurface()),new CameraCaptureSession.StateCallback(){
                @Override public void onConfigured(CameraCaptureSession value){if(stopped){value.close();return;}session=value;try{CaptureRequest.Builder request=device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);request.addTarget(reader.getSurface());request.set(CaptureRequest.CONTROL_AF_MODE,CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO);value.setRepeatingRequest(request.build(),null,handler);listener.opened();}catch(Exception e){fail("摄像头启动失败");}}
                @Override public void onConfigureFailed(CameraCaptureSession value){fail("当前摄像头不支持画面采集");}
            },handler);}catch(Exception e){fail("无法打开摄像头画面");}}
            @Override public void onDisconnected(CameraDevice value){value.close();fail("摄像头已断开");}
            @Override public void onError(CameraDevice value,int error){value.close();fail("摄像头被系统或其他应用占用");}
        },handler);
    }
    private void fail(String error){if(stopped)return;close();listener.closed(error);}
    private static byte[] encode(Image image,int rotation) throws Exception {
        int w=image.getWidth(),h=image.getHeight();byte[] data=new byte[w*h*3/2];Image.Plane[] planes=image.getPlanes();
        for(int plane=0;plane<3;plane++){ByteBuffer buffer=planes[plane].getBuffer();int base=buffer.position(),row=planes[plane].getRowStride(),pixel=planes[plane].getPixelStride(),width=plane==0?w:w/2,height=plane==0?h:h/2;for(int y=0;y<height;y++)for(int x=0;x<width;x++){int dest=plane==0?y*w+x:w*h+(y*w/2+x)*2+(plane==1?1:0);data[dest]=buffer.get(base+y*row+x*pixel);}}
        ByteArrayOutputStream first=new ByteArrayOutputStream();new YuvImage(data,ImageFormat.NV21,w,h,null).compressToJpeg(new Rect(0,0,w,h),75,first);byte[] raw=first.toByteArray();Bitmap original=BitmapFactory.decodeByteArray(raw,0,raw.length);Matrix matrix=new Matrix();matrix.postRotate(rotation);Bitmap rotated=Bitmap.createBitmap(original,0,0,w,h,matrix,true);if(rotated!=original)original.recycle();
        float scale=Math.min(1f,480f/Math.max(rotated.getWidth(),rotated.getHeight()));Bitmap small=Bitmap.createScaledBitmap(rotated,Math.max(2,(int)(rotated.getWidth()*scale)),Math.max(2,(int)(rotated.getHeight()*scale)),true);if(small!=rotated)rotated.recycle();ByteArrayOutputStream output=new ByteArrayOutputStream();
        for(int quality:new int[]{58,42,28}){output.reset();small.compress(Bitmap.CompressFormat.JPEG,quality,output);if(output.size()<=28000)break;}small.recycle();return output.toByteArray();
    }
    void close(){stopped=true;try{if(session!=null)session.close();}catch(Exception ignored){}try{if(device!=null)device.close();}catch(Exception ignored){}try{if(reader!=null)reader.close();}catch(Exception ignored){}if(thread!=null)thread.quitSafely();}
}
