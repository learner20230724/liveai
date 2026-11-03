export function nativeShell() {
  const bridge = globalThis.window?.LiveAIAndroid;
  return bridge && typeof bridge.ready === "function" ? bridge : null;
}
export function notifyNativeReady() {
  try { nativeShell()?.ready(); } catch { /* Browser operation remains independent of the shell. */ }
}
