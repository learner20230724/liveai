package cn.guihualab.liveai;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

public class UpdateBundleTest {
    private byte[] zip(String... names) throws Exception {
        ByteArrayOutputStream output=new ByteArrayOutputStream();
        try(ZipOutputStream zip=new ZipOutputStream(output)) { for(String name:names) { zip.putNextEntry(new ZipEntry(name));zip.write("<html>LiveAI test</html>".getBytes("UTF-8"));zip.closeEntry(); } }
        return output.toByteArray();
    }
    private String sha(byte[] bytes) throws Exception {
        StringBuilder value=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))value.append(String.format(Locale.ROOT,"%02x",b&255));return value.toString();
    }
    @Test public void validBundleAndCompatibility() throws Exception {
        byte[] bytes=zip("index.html","assets/app.js");File dir=Files.createTempDirectory("liveai-bundle").toFile();
        try { UpdateBundle.unpack(bytes,sha(bytes),dir);assertTrue(new File(dir,"index.html").isFile());assertTrue(UpdateBundle.compatible(sha(bytes),1,1));assertFalse(UpdateBundle.compatible(sha(bytes),2,1));assertFalse(UpdateBundle.compatible(sha(bytes),0,1));assertFalse(UpdateBundle.compatible("invalid",1,1)); } finally { UpdateBundle.remove(dir); }
    }
    @Test public void checksumMismatchNeverInstalls() throws Exception {
        byte[] bytes=zip("index.html");File dir=Files.createTempDirectory("liveai-bad-sha").toFile();
        try { assertThrows(IOException.class,()->UpdateBundle.unpack(bytes,"0".repeat(64),dir));assertFalse(new File(dir,"index.html").exists()); } finally { UpdateBundle.remove(dir); }
    }
    @Test public void traversalAndMissingEntryAreRejected() throws Exception {
        for(String name:new String[]{"../escape.js","/absolute.js","assets/../../escape.js","assets\\..\\escape.js","assets/only.js"}) {
            byte[] bytes=zip(name);File dir=Files.createTempDirectory("liveai-invalid").toFile();
            try { assertThrows(IOException.class,()->UpdateBundle.unpack(bytes,sha(bytes),dir)); } finally { UpdateBundle.remove(dir); }
        }
    }
}
