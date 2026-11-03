package cn.guihualab.liveai;

import java.util.*;

/** Hardware-head acknowledgements, not acknowledgements at AudioTrack.write(). */
final class PlaybackLedger {
    static final class Chunk {
        final String chunk,run,turn;final int frames;volatile long start=-1,end=-1;volatile boolean complete,cancelled,acked;
        Chunk(String c,String r,String t,int f){chunk=c;run=r;turn=t;frames=f;}
        String turnKey(){return run+":"+turn;}
    }
    static final class Ack {final String action,chunk,run,turn;Ack(String a,Chunk c){action=a;chunk=c.chunk;run=c.run;turn=c.turn;}}
    private final LinkedList<Chunk> chunks=new LinkedList<>();private final Map<String,Chunk> done=new HashMap<>();private final Set<String> completed=new HashSet<>(),cancelled=new HashSet<>();private long written;
    synchronized Chunk enqueue(String chunk,String run,String turn,int frames){Chunk c=new Chunk(chunk,run,turn,frames);chunks.add(c);return c;}
    synchronized void accepted(Chunk c,int frames){if(c.cancelled)return;if(c.start<0)c.start=written;written+=frames;c.end=written;}
    synchronized void written(Chunk c){c.complete=true;}
    synchronized void done(String run,String turn){Chunk marker=new Chunk("",run,turn,0);done.put(marker.turnKey(),marker);}
    synchronized List<Ack> advance(long head){List<Ack> result=new ArrayList<>();for(Iterator<Chunk> i=chunks.iterator();i.hasNext();){Chunk c=i.next();if(c.cancelled){i.remove();continue;}if(c.complete&&head>=c.end){c.acked=true;result.add(new Ack("playback.chunk.completed",c));i.remove();}}
        for(Map.Entry<String,Chunk> e:done.entrySet()){String key=e.getKey();if(completed.contains(key)||cancelled.contains(key))continue;boolean pending=false;for(Chunk c:chunks)if(c.turnKey().equals(key)){pending=true;break;}if(!pending){completed.add(key);result.add(new Ack("playback.completed",e.getValue()));}}return result;}
    synchronized long interrupt(String run,String turn,long head){String key=run+":"+turn;cancelled.add(key);long played=0;boolean found=false;for(Chunk c:chunks)if(c.turnKey().equals(key)){if(!found&&c.start>=0){played=Math.max(0,Math.min(c.frames,head-c.start))*1000/48000;found=true;}c.cancelled=true;}return played;}
    synchronized boolean pending(String key){for(Chunk c:chunks)if(!c.cancelled&&c.turnKey().equals(key))return true;return false;}
    synchronized void resetClock(){written=0;chunks.removeIf(c->c.cancelled);for(Chunk c:chunks){c.start=-1;c.end=-1;c.complete=false;}}
    synchronized void clear(){chunks.clear();done.clear();completed.clear();cancelled.clear();written=0;}
}
