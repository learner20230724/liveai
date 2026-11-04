import express from "express";
import multer from "multer";
import { WebSocketServer, WebSocket } from "ws";
import {
  readFileSync,
  mkdirSync,
  appendFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash, createPublicKey, publicEncrypt, randomInt, constants as cryptoConstants } from "node:crypto";
import { fileURLToPath } from "node:url";
import { models, selectModel, verifiedAt } from "./catalog.mjs";
import { createPermitPool } from "./concurrency.mjs";
import { authRequest } from "./auth-client.mjs";

const here = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appVersion = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;
const key = readFileSync(
  process.env.MOSS_KEY_FILE || "/etc/liveai/moss.key",
  "utf8",
).trim();
if (!key) throw new Error("MOSS key is empty");
const base = "https://api.mosi.cn/v1";
const authBase = process.env.AUTH_BASE || "http://127.0.0.1:4190";
const origin = process.env.PUBLIC_ORIGIN || "https://guihualab.cn";
const paid = process.env.ENABLE_PAID_MODELS === "true";
const state = process.env.LIVEAI_STATE_DIR || "/var/lib/liveai";
mkdirSync(state, { recursive: true, mode: 0o700 });
const statsFile = join(state, "stats.json");
let stats = existsSync(statsFile)
  ? JSON.parse(readFileSync(statsFile, "utf8"))
  : {
      since: new Date().toISOString(),
      requests: 0,
      success: 0,
      failed: 0,
      liveSessions: 0,
      liveSeconds: 0,
      images: 0,
    };
const clean = (value) =>
  String(value).replaceAll(key, "[REDACTED]").slice(0, 1500);
function audit(item) {
  appendFileSync(
    join(state, "usage.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), ...item }) + "\n",
    { mode: 0o600 },
  );
  writeFileSync(statsFile + ".tmp", JSON.stringify(stats), { mode: 0o600 });
  renameSync(statsFile + ".tmp", statsFile);
}
const cookie = (req) =>
  (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("liveai_session="))
    ?.slice(15);
const authCookie = (req) => `guihua_share=${cookie(req) || ""}`;
async function authenticated(req) {
  if (!/^[a-f0-9]{64}$/.test(cookie(req) || "")) return false;
  const r = await authRequest(authBase, "/api/share/session", {
    headers: { Cookie: authCookie(req) },
    timeoutMs: 4000,
  });
  return r.status === 200 && r.data.authenticated === true;
}
function fail(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}
function text(value, max = 4000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw fail(400, `请输入 1–${max} 字的内容。`, "INVALID_INPUT");
  return value.trim();
}
async function call(path, body, session, asForm = false) {
  stats.requests++;
  try {
    const r = await fetch(base + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(!asForm ? { "Content-Type": "application/json" } : {}),
      },
      body: asForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(path === "/images/generations" ? 900000 : 150000),
    });
    const data = await r.json();
    if (!r.ok)
      throw fail(
        r.status === 401 ? 502 : r.status,
        clean(data.error?.message || data.message || "MOSS 调用失败。"),
        data.error?.code || "UPSTREAM_ERROR",
      );
    stats.success++;
    if (path === "/images/generations") stats.images++;
    audit({
      model: body.model || body.get?.("model"),
      kind: path,
      status: "success",
      session,
      usage: data.usage || null,
    });
    return data;
  } catch (e) {
    stats.failed++;
    audit({
      kind: path,
      status: "failed",
      session,
      code: e.code || "NETWORK_ERROR",
    });
    throw e;
  }
}
const sessionId = (req) =>
  createHash("sha256")
    .update(cookie(req) || "")
    .digest("hex")
    .slice(0, 16);
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(self), microphone=(self), display-capture=(self)",
  });
  next();
});
// Public documents accept external navigation. Mount the guard on the actual
// API router so path boundaries and case handling match Express routing.
app.use("/api", (req, res, next) => {
  if (req.headers.origin && req.headers.origin !== origin)
    return res.status(403).json({ error: "请在本站页面操作。" });
  if (req.headers["sec-fetch-site"] === "cross-site")
    return res.status(403).json({ error: "不允许跨站请求。" });
  next();
});
app.use(express.json({ limit: "64kb" }));
app.get("/api/health", (_, res) =>
  res.json({ ok: true, service: "LiveAI", version: appVersion }),
);
app.get("/api/session", async (req, res, next) => {
  try {
    res.json({ authenticated: await authenticated(req) });
  } catch (e) {
    next(e);
  }
});
for (const action of ["login", "logout"])
  app.post("/api/" + action, async (req, res, next) => {
    try {
      if (
        action === "login" &&
        (typeof req.body?.password !== "string" ||
          req.body.password.length > 128)
      )
        throw fail(400, "请输入访问密码。");
      const r = await authRequest(authBase, `/api/share/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie(req),
          "X-Real-IP": req.headers["x-real-ip"] || req.socket.remoteAddress,
        },
        body: JSON.stringify(
          action === "login" ? { password: req.body.password } : {},
        ),
        timeoutMs: 6000,
      });
      const c = r.setCookie;
      if (c)
        res.setHeader(
          "Set-Cookie",
          c
            .replace(/^guihua_share=/, "liveai_session=")
            .replace("Path=/api/share", "Path=/liveai/"),
        );
      res.status(r.status).json(r.data);
    } catch (e) {
      next(e);
    }
  });
app.post("/api/paid/unlock", async (req,res,next) => {
  try {
    if (typeof req.body?.password !== "string" || !req.body.password || req.body.password.length > 128) throw fail(400,"请输入访问密码。");
    const result = await authRequest(authBase,"/api/share/login",{method:"POST",headers:{"Content-Type":"application/json","X-Real-IP":req.headers["x-real-ip"] || req.socket.remoteAddress},body:JSON.stringify({password:req.body.password}),timeoutMs:6000});
    if (result.status!==200 || result.data.authenticated!==true) return res.status(result.status===429?429:403).json({error:"访问密码不正确，未解锁付费能力。",code:"PAID_PASSWORD_REQUIRED"});
    if(result.setCookie)res.setHeader("Set-Cookie",result.setCookie.replace(/^guihua_share=/,"liveai_session=").replace("Path=/api/share","Path=/liveai/"));
    res.json({unlocked:true,expiresIn:1800,nativeDirectRequired:true});
  } catch(e){next(e);}
});
app.use("/api", async (req, res, next) => {
  try {
    if (!(await authenticated(req)))
      return res
        .status(401)
        .json({
          error: "请先用规划 Lab 共享密码解锁。",
          code: "AUTH_REQUIRED",
        });
    next();
  } catch (e) {
    next(e);
  }
});
app.get("/api/models", (_, res) =>
  res.json({
    models,
    verifiedAt,
    paidEnabled: paid,
    pricingUrl: "https://platform.moss.cn/en/docs/models/",
  }),
);
app.get("/api/stats", (_, res) => res.json(stats));
// Explicitly authorized native direct mode. Only an authenticated owner can
// provision a device. The API key is encrypted to an ephemeral native RSA key;
// neither the webpage nor the APK/OTA bundle contains or receives plaintext.
app.post("/api/mobile/bootstrap", (req, res) => {
  try {
    const pem = req.body?.publicKey;
    if (typeof pem !== "string" || pem.length > 3000) throw fail(400, "设备公钥无效。");
    const publicKey = createPublicKey(pem);
    if (publicKey.asymmetricKeyType !== "rsa" || publicKey.asymmetricKeyDetails.modulusLength < 2048 || publicKey.asymmetricKeyDetails.modulusLength > 4096) throw fail(400, "设备公钥不受支持。");
    const encryptedKey = publicEncrypt({ key: publicKey, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(key)).toString("base64");
    res.json({ encryptedKey, endpoint: "wss://api.mosi.cn/v1/realtime?model=moss-live-1.0", model: "moss-live-1.0" });
  } catch { res.status(400).json({ error: "设备配置请求无效，请重试。" }); }
});
function limitJobs(pool) {
  return (req, res, next) => {
    const release = pool.acquire(sessionId(req));
    if (!release) return res.status(429).json({error:"已达到并发上限，请等待当前任务完成。",code:"CONCURRENCY_LIMIT"});
    // Keep the permit until upstream work has actually finished, even if the
    // browser disconnects. Releasing on close would allow bypassing the cap.
    res.once("finish",release);res.once("close",()=>{if(!res.locals.upstreamPending)release();}); res.locals.releasePermit = release; next();
  };
}
const imagePermit = limitJobs(createPermitPool(10));
const visionPermit = limitJobs(createPermitPool(4));
app.post("/api/images", imagePermit, async (req, res, next) => {
  res.locals.upstreamPending=true;
  try {
    const model = selectModel(req.body?.model, "image", paid);
    const size = req.body.size || "1024x1024";
    if (!["1024x1024", "1024x1536", "1536x1024", "512x512"].includes(size))
      throw fail(400, "图片尺寸不受支持。");
    res.json(
      await call(
        "/images/generations",
        {
          model: model.id,
          prompt: text(req.body.prompt),
          size,
          n: 1,
          seed: randomInt(281474976710655),
          response_format: "url",
          prompt_enhance: false,
          output_watermark: { enabled: false },
        },
        sessionId(req),
      ),
    );
  } catch (e) {
    next(e);
  } finally { res.locals.releasePermit?.(); }
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 5 },
});
app.post(
  "/api/vision",
  visionPermit,
  upload.single("file"),
  async (req, res, next) => {
    res.locals.upstreamPending=true;
    try {
      const model = selectModel("moss-vl-1.0", "vision", paid);
      const prompt = text(req.body?.prompt);
      if (
        !req.file ||
        !["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)
      )
        throw fail(400, "请上传 JPG、PNG 或 WebP 图片（20 MB 以内）。");
      const form = new FormData();
      form.set(
        "file",
        new Blob([req.file.buffer], { type: req.file.mimetype }),
        req.file.originalname,
      );
      form.set("purpose", "image");
      const file = await call("/files", form, sessionId(req), true);
      try {
        res.json(
          await call(
            "/responses",
            {
              model: model.id,
              input: [
                {
                  role: "user",
                  content: [
                    { type: "input_text", text: prompt },
                    { type: "input_image", file_id: file.id },
                  ],
                },
              ],
            },
            sessionId(req),
          ),
        );
      } finally {
        if (file.id)
          fetch(`${base}/files/${encodeURIComponent(file.id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000),
          }).catch(() => {});
      }
    } catch (e) {
      next(e);
    } finally { res.locals.releasePermit?.(); }
  },
);
// Paid endpoints are blocked before parsing uploads or making any upstream request.
app.post("/api/paid/:kind", (req, res) =>
  res
    .status(403)
    .json({
      error: "付费能力未开放。本服务不自动充值、不回退到付费模型。",
      code: "PAID_DISABLED",
    }),
);
app.use("/api", (_, res) => res.status(404).json({ error: "接口不存在。" }));
app.use("/app-updates", express.static(join(here, "web-updates"), { index: false, dotfiles: "deny", setHeaders: res => res.setHeader("Cache-Control", "no-store") }));
app.use("/downloads", express.static(process.env.LIVEAI_APK_DIRECTORY || "/srv/liveai/apk", { index: false, dotfiles: "deny", setHeaders: (res, path) => { res.setHeader("Cache-Control", "no-store"); if(path.endsWith(".apk")) { res.setHeader("Content-Type", "application/vnd.android.package-archive"); res.setHeader("Content-Disposition", "attachment; filename=\"liveai-android.apk\""); } } }));
app.use(
  express.static(join(here, "dist"), { index: "index.html", dotfiles: "deny" }),
);
app.use((err, req, res, _next) => {
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 502);
  res
    .status(status)
    .json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "文件超过 20 MB。"
          : clean(err.message || "服务暂时不可用，请重试。"),
      code: err.code || "SERVICE_ERROR",
    });
});
const server = app.listen(
  Number(process.env.PORT || 4260),
  process.env.HOST || "127.0.0.1",
  () => console.log("LiveAI ready on loopback"),
);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 2 * 1024 * 1024,
});
server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/api/live" || req.headers.origin !== origin) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (!(await authenticated(req))) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    if (wss.clients.size >= 5) {
      socket.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
      return;
    }
    const id = sessionId(req);
    if ([...wss.clients].some((c) => c.owner === id)) {
      socket.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.owner = id;
      wss.emit("connection", ws, req);
    });
  } catch {
    socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
  }
});
const actions = new Set([
  "attach_session",
  "session.update",
  "mic_state",
  "media.mode",
  "video.state",
  "video.stream_focus",
  "playback.chunk.completed",
  "playback.completed",
  "playback.stopped",
]);
wss.on("connection", (client, req) => {
  const upstream = new WebSocket(
    "wss://api.mosi.cn/v1/realtime?model=moss-live-1.0",
    {
      headers: { Authorization: `Bearer ${key}` },
      handshakeTimeout: 15000,
      maxPayload: 4 * 1024 * 1024,
    },
  );
  let started = 0;
  let closed = false;
  let attached = false;
  const send = (body) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(body));
  };
  const problem = (message, code = "UPSTREAM_ERROR") =>
    send({
      action: "error",
      data: { error: { message: clean(message), code } },
    });
  const shutdown = () => {
    if (closed) return;
    closed = true;
    clearInterval(pulse);
    clearTimeout(maxTime);
    clearTimeout(setupTimer);
    if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    else if (upstream.readyState === WebSocket.OPEN) upstream.close();
    if (started) {
      const seconds = Math.round((Date.now() - started) / 1000);
      stats.liveSeconds += seconds;
      audit({ kind: "live", session: client.owner, seconds, status: "ended" });
    }
    if (client.readyState === WebSocket.OPEN)
      client.close(1000, "Session ended");
  };
  const maxTime = setTimeout(
    () => {
      problem("单次会话已达 30 分钟，请重新开始。", "SESSION_LIMIT");
      shutdown();
    },
    30 * 60 * 1000,
  );
  const setupTimer = setTimeout(() => {
    if (!attached) {
      problem("会话配置超时，请重试。", "SETUP_TIMEOUT");
      shutdown();
    }
  }, 25000);
  client.alive = true;
  client.on("pong", () => {
    client.alive = true;
  });
  const pulse = setInterval(async () => {
    if (!client.alive) {
      client.terminate();
      shutdown();
      return;
    }
    client.alive = false;
    client.ping();
    try {
      if (!(await authenticated(req))) {
        problem("登录已过期，请重新解锁。", "AUTH_REQUIRED");
        shutdown();
      }
    } catch {
      problem("登录验证服务暂时不可用。");
      shutdown();
    }
  }, 30000);
  upstream.on("open", () => send({ action: "proxy.connected" }));
  client.on("message", (data, binary) => {
    if (upstream.readyState !== WebSocket.OPEN) return;
    if (upstream.bufferedAmount > 2 * 1024 * 1024) {
      problem("网络拥塞，请重新开始。", "BACKPRESSURE");
      shutdown();
      return;
    }
    if (!binary) {
      try {
        const msg = JSON.parse(data.toString());
        if (!actions.has(msg.action)) return;
        if (msg.action === "attach_session") {
          if (attached) return;
          msg.memory_scope = "session";
          delete msg.session_id;
          upstream.send(JSON.stringify(msg));
          return;
        }
      } catch {
        return;
      }
    }
    upstream.send(data, { binary });
  });
  upstream.on("message", (data, binary) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.bufferedAmount > 4 * 1024 * 1024) {
      problem("播放连接拥塞，请重新开始。", "BACKPRESSURE");
      shutdown();
      return;
    }
    if (!binary) {
      try {
        const m = JSON.parse(data.toString());
        if (m.action === "session_attached" && !attached) {
          attached = true;
          started = Date.now();
          stats.liveSessions++;
          audit({ kind: "live", session: client.owner, status: "attached" });
        }
      } catch {}
    }
    client.send(binary ? data : cleanLive(data), { binary });
  });
  function cleanLive(data) {
    return data.toString().replaceAll(key, "[REDACTED]");
  }
  upstream.on("unexpected-response", (_, r) => {
    r.resume();
    problem(`MOSS 实时接口拒绝连接（HTTP ${r.statusCode}）。`);
    shutdown();
  });
  upstream.on("error", () => {
    problem("MOSS 实时连接失败，请稍后重试。");
    shutdown();
  });
  upstream.on("close", () => {
    if (!closed) send({ action: "proxy.closed" });
    shutdown();
  });
  client.on("error", shutdown);
  client.on("close", shutdown);
});
process.on("SIGTERM", () => {
  for (const ws of wss.clients) ws.close(1012, "Service restarting");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
});
