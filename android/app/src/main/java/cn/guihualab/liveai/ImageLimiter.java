package cn.guihualab.liveai;
import java.util.function.BooleanSupplier;

/** Learns a lower provider quota from explicit, unaccepted 429 responses only. */
final class ImageLimiter {
    private final int maximum;private int effective,active,successes;private long pausedUntil,lastLimited;
    ImageLimiter(int maximum){this.maximum=maximum;effective=maximum;}
    synchronized boolean acquire(BooleanSupplier cancelled) throws InterruptedException {
        while(!cancelled.getAsBoolean()){
            long now=System.currentTimeMillis();if(active<effective&&now>=pausedUntil){active++;return true;}
            wait(100);
        }return false;
    }
    synchronized void release(boolean limited,boolean accepted){
        active=Math.max(0,active-1);long now=System.currentTimeMillis();
        if(limited){effective=Math.max(1,effective-1);pausedUntil=Math.max(pausedUntil,now+2000);lastLimited=now;successes=0;}
        else if(accepted&&++successes>=20&&now-lastLimited>60000){effective=Math.min(maximum,effective+1);successes=0;}
        notifyAll();
    }
    synchronized int capacity(){return effective;}
}
