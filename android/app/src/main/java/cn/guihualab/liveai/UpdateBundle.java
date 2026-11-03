package cn.guihualab.liveai;

import java.io.*;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Pure Java validation, shared by the shell and host-side regression checks. */
final class UpdateBundle {
    static boolean compatible(String version, int minimum, int shell) {
        return version.matches("[a-f0-9]{64}") && minimum > 0 && minimum <= shell;
    }
    static void unpack(byte[] bytes, String expected, File destination) throws Exception {
        StringBuilder digest = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) digest.append(String.format(Locale.ROOT,"%02x",b & 255));
        if (!expected.matches("[a-f0-9]{64}") || !digest.toString().equals(expected)) throw new IOException("Checksum mismatch");
        String root = destination.getCanonicalPath() + File.separator;
        int files = 0, total = 0;
        java.util.Set<String> names = new java.util.HashSet<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry; byte[] buffer = new byte[16384];
            while ((entry = zip.getNextEntry()) != null) {
                if (++files > 1000 || !names.add(entry.getName())) throw new IOException("Invalid archive entries");
                File file = new File(destination, entry.getName());
                if (entry.getName().startsWith("/") || entry.getName().contains("..") || entry.getName().contains("\\") || !file.getCanonicalPath().startsWith(root)) throw new IOException("Invalid path");
                if (entry.isDirectory()) { if (!file.isDirectory() && !file.mkdirs()) throw new IOException("Cannot create directory"); continue; }
                File parent = file.getParentFile();
                if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create directory");
                try (OutputStream out = new FileOutputStream(file)) {
                    int n; while ((n=zip.read(buffer)) != -1) { total += n; if (total > 32*1024*1024) throw new IOException("Expanded update too large"); out.write(buffer,0,n); }
                }
                zip.closeEntry();
            }
        }
        if (!new File(destination,"index.html").isFile() || new File(destination,"index.html").length() == 0) throw new IOException("Missing entry point");
    }
    static void remove(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) remove(child);
        if (file.exists() && !file.delete()) file.deleteOnExit();
    }
}
