import express from "express";
import {
  readFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createPublicKey, publicEncrypt, constants as cryptoConstants } from "node:crypto";
import { fileURLToPath } from "node:url";
import { models, verifiedAt } from "./catalog.mjs";
import { authRequest } from "./auth-client.mjs";

const here = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appVersion = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;
const key = readFileSync(
  process.env.MOSS_KEY_FILE || "/etc/liveai/moss.key",
  "utf8",
).trim();
if (!key) throw new Error("MOSS key is empty");
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
app.post(["/api/mobile/bootstrap","/api/browser/bootstrap"], (req, res) => {
  try {
    const pem = req.body?.publicKey;
    if (typeof pem !== "string" || pem.length > 3000) throw fail(400, "设备公钥无效。");
    const publicKey = createPublicKey(pem);
    if (publicKey.asymmetricKeyType !== "rsa" || publicKey.asymmetricKeyDetails.modulusLength < 2048 || publicKey.asymmetricKeyDetails.modulusLength > 4096) throw fail(400, "设备公钥不受支持。");
    const encryptedKey = publicEncrypt({ key: publicKey, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(key)).toString("base64");
    res.json({ encryptedKey, endpoint: "wss://api.mosi.cn/v1/realtime?model=moss-live-1.0", model: "moss-live-1.0" });
  } catch { res.status(400).json({ error: "设备配置请求无效，请重试。" }); }
});
app.post(["/api/images","/api/vision"],(_,res)=>res.status(410).json({error:"请使用官网直连",code:"DIRECT_REQUIRED"}));
// Paid endpoints are blocked before parsing uploads or making any upstream request.
app.post("/api/paid/:kind", (req, res) =>
  res
    .status(403)
    .json({
      error: "请使用直连 APP 的付费工具。",
      code: "PAID_DISABLED",
    }),
);
app.use("/api", (_, res) => res.status(404).json({ error: "接口不存在。" }));
app.get("/direct-install.html",(_,res)=>res.sendFile(join(here,"server/direct-install.html")));
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
server.on("upgrade",async(req,socket)=>{
 try{
  if(new URL(req.url,"http://localhost").pathname!=="/api/live"||req.headers.origin!==origin){socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");return;}
  if(!await authenticated(req)){socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");return;}
  socket.end("HTTP/1.1 410 Gone\r\nConnection: close\r\n\r\n");
 }catch{socket.destroy()}
});
process.on("SIGTERM",()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()});
