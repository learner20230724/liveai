package cn.guihualab.liveai;

import java.util.function.LongSupplier;

/** Process-local authorization; initial login alone never unlocks paid models. */
final class PaidAccess {
    private final LongSupplier clock;
    private long until;
    PaidAccess(LongSupplier clock){this.clock=clock;}
    synchronized void unlock(){until=clock.getAsLong()+30*60*1000L;}
    synchronized void lock(){until=0;}
    synchronized boolean allowed(){return until>clock.getAsLong();}
    synchronized long remaining(){return Math.max(0,until-clock.getAsLong());}
}
