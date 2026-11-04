import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import {generateKeyPairSync,privateDecrypt,constants} from 'node:crypto';
let auth, child, temp, url, keyPath, authPort;
const token = "a".repeat(64);
async function listen(server, port = 0) {
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return server.address().port;
}
before(async () => {
  temp = await mkdtemp(join(tmpdir(), "liveai-test-"));
  keyPath = join(temp, "key");
  await writeFile(keyPath, "test-only-secret-key");
  auth = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/share/login") {
      let raw="";for await (const chunk of req)raw+=chunk;
      if(!["synthetic-test-password","paid-test-password"].includes(JSON.parse(raw||"{}").password)){res.statusCode=403;res.end('{"authenticated":false}');return;}
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
  // Use a real fetch-blocked port so this integration covers production's
  // AUTH_BASE on 4190 instead of hiding the transport bug on a random port.
  authPort = await listen(auth, 6000);
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
test("authentication works on a port blocked by browser-compatible fetch", async () => {
  await assert.rejects(fetch(`http://127.0.0.1:${authPort}/api/share/session`));
  const r = await fetch(url + "/api/session", { headers });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).authenticated, true);
});
test("external navigation can load public documents and static resources", async () => {
  // CI runs before the frontend build, so compare with the route's normal
  // response (200 when built, 404 when absent), rather than changing its assets.
  for (const path of ["/", "/index.html", "/pcm-capture.js"]) {
    const baseline = await fetch(url + path);
    const body = await baseline.text();
    assert.ok([200, 404].includes(baseline.status));
    for (const method of ["GET", "HEAD"]) {
      const r = await fetch(url + path, {
        method,
        headers: {
          "Sec-Fetch-Site": "cross-site",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Dest": "document",
          Origin: "https://external.example",
        },
      });
      assert.equal(r.status, baseline.status);
      if (method === "GET") assert.equal(await r.text(), body);
    }
  }
});
test("external requests to authenticated APIs and login/logout remain forbidden", async () => {
  for (const securityHeaders of [
    { "Sec-Fetch-Site": "cross-site" },
    { Origin: "https://external.example" },
  ]) {
    for (const [path, method] of [["/api/models", "GET"], ["/api/session", "GET"], ["/api/login", "POST"], ["/api/logout", "POST"], ["/API/models", "GET"], ["/Api/login", "POST"]]) {
      const r = await fetch(url + path, {
        method,
        headers: { ...headers, ...securityHeaders },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      assert.equal(r.status, 403);
    }
  }
  const sameOrigin = await fetch(url + "/api/models", {
    headers: { ...headers, Origin: "https://guihualab.cn", "Sec-Fetch-Site": "same-origin" },
  });
  assert.equal(sameOrigin.status, 200);
});
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
test('native owner provisioning encrypts the key to the device and requires authentication',async()=>{
  assert.equal((await fetch(url+'/api/mobile/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const body=JSON.stringify({publicKey:publicKey.export({type:'spki',format:'pem'})});
  const r=await fetch(url+'/api/mobile/bootstrap',{method:'POST',headers,body});assert.equal(r.status,200);const data=await r.json();
  assert.equal(privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(data.encryptedKey,'base64')).toString(),'test-only-secret-key');
  assert.ok(!JSON.stringify(data).includes('test-only-secret-key'));assert.equal(data.endpoint,'wss://api.mosi.cn/v1/realtime?model=moss-live-1.0');
  assert.equal((await fetch(url+'/api/mobile/bootstrap',{method:'POST',headers:{...headers,Origin:'https://foreign.example'},body})).status,403);
});
test("retired relay endpoints reject before issuing upstream requests", async () => {
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
      410,
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

test("paid unlock checks the password without starting any provider operation",async()=>{
  const wrong=await fetch(url+"/api/paid/unlock",{method:"POST",headers,body:JSON.stringify({password:"wrong-fixture"})});assert.equal(wrong.status,403);
  const good=await fetch(url+"/api/paid/unlock",{method:"POST",headers,body:JSON.stringify({password:"paid-test-password"})});assert.equal(good.status,200);const data=await good.json();assert.equal(data.unlocked,true);assert.equal(data.nativeDirectRequired,true);assert.equal(data.expiresIn,1800);
  const foreign=await fetch(url+"/api/paid/unlock",{method:"POST",headers:{...headers,Origin:"https://foreign.example"},body:JSON.stringify({password:"paid-test-password"})});assert.equal(foreign.status,403);
  const stats=await (await fetch(url+"/api/stats",{headers})).json();assert.equal(stats.requests,0);
});
test('browser companion bootstrap shares authenticated encrypted provisioning',async()=>{
 const path=url+'/api/browser/bootstrap';assert.equal((await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const response=await fetch(path,{method:'POST',headers,body:JSON.stringify({publicKey:publicKey.export({type:'spki',format:'pem'})})});assert.equal(response.status,200);const data=await response.json();assert.equal(privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(data.encryptedKey,'base64')).toString(),'test-only-secret-key');
});
test('authenticated legacy WebSocket relay is retired without contacting MOSS',async()=>{
 const status=await new Promise((resolve,reject)=>{const socket=new WebSocket(url.replace('http','ws')+'/api/live',{headers:{...headers,Origin:'https://guihualab.cn'}});socket.on('unexpected-response',(_,r)=>{r.resume();resolve(r.statusCode)});socket.on('error',reject)});assert.equal(status,410);
});
