package cn.guihualab.liveai;
import cn.guihualab.liveai.sonic.Sonic;
import java.util.Arrays;

/** Streaming speech tempo at fixed 48 kHz output, with original-media accounting. */
final class PcmTempo {
    static final class Batch {final byte[] pcm;final int mediaFrames;Batch(byte[] pcm,int mediaFrames){this.pcm=pcm;this.mediaFrames=mediaFrames;}}
    private final Sonic sonic=new Sonic(48000,1);private long fed,reported;private boolean finished;
    PcmTempo(){sonic.setPitch(1);sonic.setRate(1);sonic.setVolume(1);}
    static float rate(float value){if(!Float.isFinite(value)||value<.5f||value>2)throw new IllegalArgumentException("Unsupported software rate");return value;}
    Batch push(byte[] data,int offset,int bytes,float speed){if(finished||bytes<0||(bytes&1)!=0||offset<0||offset+bytes>data.length)throw new IllegalArgumentException("Invalid PCM");sonic.setSpeed(rate(speed));sonic.writeBytesToStream(Arrays.copyOfRange(data,offset,offset+bytes),bytes);fed+=bytes/2;return drain();}
    Batch finish(float speed){if(finished)return new Batch(new byte[0],0);sonic.setSpeed(rate(speed));sonic.flushStream();finished=true;return drain();}
    private Batch drain(){int available=sonic.samplesAvailable();if(available==0)return new Batch(new byte[0],0);byte[] output=new byte[available*2];int n=sonic.readBytesFromStream(output,output.length);long consumed=fed-sonic.pendingInputSamples();int media=Math.toIntExact(consumed-reported);reported=consumed;return new Batch(n==output.length?output:Arrays.copyOf(output,n),media);}
}
