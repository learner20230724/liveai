package cn.guihualab.liveai;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class PlaybackLedgerTest {
    @Test public void writingOrReceivingDoneDoesNotAcknowledgeUnplayedAudio(){PlaybackLedger ledger=new PlaybackLedger();PlaybackLedger.Chunk c=ledger.enqueue("c","r","t",4800);ledger.done("r","t");assertTrue(ledger.advance(0).isEmpty());ledger.accepted(c,4800);ledger.written(c);assertTrue(ledger.advance(4799).isEmpty());List<PlaybackLedger.Ack> a=ledger.advance(4800);assertEquals(2,a.size());assertEquals("playback.chunk.completed",a.get(0).action);assertEquals("playback.completed",a.get(1).action);assertTrue(ledger.advance(5000).isEmpty());}
    @Test public void interruptionAccountsForCurrentUnacknowledgedChunkOnly(){PlaybackLedger ledger=new PlaybackLedger();PlaybackLedger.Chunk a=ledger.enqueue("a","r","t",4800),b=ledger.enqueue("b","r","t",4800);ledger.accepted(a,4800);ledger.written(a);ledger.accepted(b,4800);ledger.written(b);assertEquals(1,ledger.advance(4800).size());assertEquals(50,ledger.interrupt("r","t",7200));ledger.done("r","t");assertTrue(ledger.advance(9600).isEmpty());assertTrue(b.cancelled);}
    @Test public void cancelledTurnCannotCompleteAndNextTurnStartsAtResetClock(){PlaybackLedger ledger=new PlaybackLedger();PlaybackLedger.Chunk old=ledger.enqueue("a","r","1",4800),next=ledger.enqueue("b","r","2",4800);ledger.accepted(old,2400);ledger.interrupt("r","1",1200);ledger.done("r","1");ledger.resetClock();assertFalse(next.cancelled);ledger.accepted(next,4800);ledger.written(next);ledger.done("r","2");List<PlaybackLedger.Ack> a=ledger.advance(4800);assertEquals(2,a.size());assertEquals("2",a.get(1).turn);}
}
