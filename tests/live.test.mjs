import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveSession } from "../src/live.js";
import { selectModel } from "../server/catalog.mjs";
globalThis.WebSocket = { OPEN: 1 };
function player() {
  const messages = [],
    nodes = [];
  const session = new LiveSession({
    onState() {},
    onEvent() {},
    onError() {},
    onMedia() {},
  });
  session.ws = {
    readyState: 1,
    send(v) {
      messages.push(JSON.parse(v));
    },
  };
  session.audio = {
    currentTime: 0,
    createBuffer(ch, n, sr) {
      return {
        duration: n / sr,
        getChannelData() {
          return new Float32Array(n);
        },
      };
    },
    createBufferSource() {
      const node = {
        connect() {},
        disconnect() {},
        start(t) {
          this.at = t;
        },
        stop() {
          this.onended?.();
        },
      };
      nodes.push(node);
      return node;
    },
  };
  return { session, messages, nodes };
}
test("never acknowledge chunks until playback really ends; turn ack waits for final chunk", () => {
  const { session, messages, nodes } = player();
  const ctx = { chunk_id: "c1", run_id: "r", turn_id: "t" };
  session.event({ action: "response.audio.context", data: ctx });
  session.play(new Int16Array(4800).buffer);
  session.event({ action: "response.audio.done", data: ctx });
  assert.equal(messages.length, 0);
  nodes[0].onended();
  assert.deepEqual(
    messages.map((m) => m.action),
    ["playback.chunk.completed", "playback.completed"],
  );
  assert.equal(messages[0].chunk_id, "c1");
});
test("interruption cancels queued chunks and reports only elapsed playback of current chunk", () => {
  const { session, messages, nodes } = player();
  for (let i = 0; i < 2; i++) {
    session.contexts.push({ chunk_id: "c" + i, run_id: "r", turn_id: "t" });
    session.play(new Int16Array(48000).buffer);
  }
  session.audio.currentTime = 0.515;
  session.stopPlayback({ run_id: "r", turn_id: "t" });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].action, "playback.stopped");
  assert.equal(messages[0].played_audio_ms, 500);
  assert.equal(
    messages.filter((m) => m.action === "playback.chunk.completed").length,
    0,
  );
});
test("transcripts are full-text replacements, events forwarded without duplication", () => {
  const events = [];
  const session = new LiveSession({
    onState() {},
    onEvent: (m) => events.push(m),
  });
  for (const text of ["你", "你好"])
    session.event({ action: "input.transcript.updated", data: { text } });
  assert.equal(events[1].data.text, "你好");
});
test("paid and unknown model selection never falls back to another model", () => {
  assert.throws(
    () => selectModel("moss-tts-1.5-flash", undefined, false),
    (e) => e.code === "PAID_DISABLED",
  );
  assert.throws(
    () => selectModel("unknown", "image", false),
    (e) => e.code === "INVALID_MODEL",
  );
  assert.equal(selectModel("moss-image-sft-1.0", "image").tier, "free");
});
