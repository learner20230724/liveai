package cn.guihualab.liveai;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import java.io.*;

/** Uses MediaStore directly, including atomic pending rows on Android 10+. */
final class GallerySave {
    static Uri save(Context context,File image,String filename) throws Exception {
        if(Build.VERSION.SDK_INT<29&&context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("请允许保存图片到相册");
        ContentResolver resolver=context.getContentResolver();ContentValues values=new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME,filename.replaceAll("[\\\\/\\p{Cntrl}]","_"));values.put(MediaStore.Images.Media.MIME_TYPE,"image/png");
        if(Build.VERSION.SDK_INT>=29){values.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/LiveAI");values.put(MediaStore.Images.Media.IS_PENDING,1);}
        Uri collection=Build.VERSION.SDK_INT>=29?MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY):MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        Uri uri=resolver.insert(collection,values);if(uri==null)throw new IOException("系统相册暂时不可用");
        try{
            try(InputStream in=new FileInputStream(image);OutputStream out=resolver.openOutputStream(uri,"w")){if(out==null)throw new IOException("无法写入相册");MossHttp.copy(in,out,32L*1024*1024);}
            if(Build.VERSION.SDK_INT>=29){ContentValues ready=new ContentValues();ready.put(MediaStore.Images.Media.IS_PENDING,0);if(resolver.update(uri,ready,null,null)<1)throw new IOException("相册条目未能发布");}
            return uri;
        }catch(Exception e){resolver.delete(uri,null,null);throw e;}
    }
}
