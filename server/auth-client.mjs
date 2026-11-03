import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

// This is a trusted server-to-server integration. Node's browser-compatible
// fetch refuses the existing Sieve port 4190 before making a network request.
// Use the native HTTP client without weakening the browser/API origin policy.
export function authRequest(base, path, { method = "GET", headers = {}, body, timeoutMs = 6000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const request = url.protocol === "http:" ? httpRequest : url.protocol === "https:" ? httpsRequest : null;
    if (!request) return reject(new Error("登录验证服务地址无效。"));
    const req = request(url, { method, headers, signal: AbortSignal.timeout(timeoutMs) }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > 65536) { res.destroy(new Error("登录验证服务返回内容过大。")); return; }
        chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString("utf8")), setCookie: res.headers["set-cookie"]?.[0] });
        } catch { reject(new Error("登录验证服务返回格式无效。")); }
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}
