import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
let auth, child, temp, url, keyPath;
const token = "a".repeat(64);
async function listen(server) {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return server.address().port;
}
before(async () => {
  temp = await mkdtemp(join(tmpdir(), "liveai-test-"));
  keyPath = join(temp, "key");
  await writeFile(keyPath, "test-only-secret-key");
  auth = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/share/login") {
      res.setHeader(
        "Set-Cookie",
        `guihua_share=${token}; Path=/api/share; HttpOnly; SameSite=Strict; Secure`,
      );
      res.end('{"authenticated":true}');
    } else
      res.end(
        JSON.stringify({
          authenticated: req.headers.cookie === `guihua_share=${token}`,
        }),
      );
  });
  const authPort = await listen(auth);
  const reserve = http.createServer();
  const port = await listen(reserve);
  await new Promise((r) => reserve.close(r));
  url = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      MOSS_KEY_FILE: keyPath,
      LIVEAI_STATE_DIR: temp,
      AUTH_BASE: `http://127.0.0.1:${authPort}`,
      PUBLIC_ORIGIN: "https://guihualab.cn",
    },
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Server did not start: " + output);
});
after(async () => {
  child?.kill("SIGTERM");
  auth?.close();
  await rm(temp, { recursive: true, force: true });
});
const headers = {
  Cookie: `liveai_session=${token}`,
  "Content-Type": "application/json",
};
test("unauthenticated API, paid route, and foreign origins are denied", async () => {
  assert.equal((await fetch(url + "/api/models")).status, 401);
  assert.equal(
    (
      await fetch(url + "/api/paid/speech", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + "/api/session", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
});
test("login forwards authentication and scopes secure cookie to LiveAI", async () => {
  const r = await fetch(url + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"password":"synthetic-test-password"}',
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /liveai_session=/);
  assert.match(r.headers.get("set-cookie"), /Path=\/liveai\//);
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
});
test("catalog reveals no API secret; paid models remain locked", async () => {
  const r = await fetch(url + "/api/models", { headers });
  const body = await r.text();
  assert.ok(!body.includes("test-only-secret-key"));
  const data = JSON.parse(body);
  assert.equal(data.paidEnabled, false);
  assert.equal(data.models.find((m) => m.id === "moss-live-1.0").tier, "free");
});
test("invalid sizes/models fail locally without issuing upstream requests", async () => {
  for (const body of [
    { model: "moss-tts-1.5-flash", prompt: "hello" },
    { model: "moss-image-sft-1.0", prompt: "hello", size: "9000x9000" },
  ])
    assert.equal(
      (
        await fetch(url + "/api/images", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
      ).status,
      400,
    );
  const stats = await (await fetch(url + "/api/stats", { headers })).json();
  assert.equal(stats.requests, 0);
});
test("WebSocket rejects missing auth and foreign Origin before upstream", async () => {
  for (const options of [
    { headers: { Origin: "https://guihualab.cn" } },
    { headers: { ...headers, Origin: "https://evil.example" } },
  ]) {
    const code = await new Promise((resolve, reject) => {
      const ws = new WebSocket(
        url.replace("http", "ws") + "/api/live",
        options,
      );
      ws.on("unexpected-response", (_, r) => {
        r.resume();
        resolve(r.statusCode);
      });
      ws.on("error", reject);
    });
    assert.ok([401, 403].includes(code));
  }
});
