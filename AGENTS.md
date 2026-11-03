# LiveAI maintenance

- This is the independent MOSS Live workspace at `https://guihualab.cn/liveai/`, not TTYD Hub. Repository: `learner20230724/liveai` (public), branch `main`.
- Never commit or expose the MOSS key, passwords, cookies, user conversations or usage logs. The key lives only in `/etc/liveai/moss.key`; service statistics live in `/var/lib/liveai`.
- Preserve existing Guihua Lab authentication. The isolated auth fixture used for browser QA must never be deployed or used to bypass production authentication.
- Public HTML and assets must accept external link navigation. Apply Origin/Fetch Metadata CSRF restrictions to APIs and retain the independent WebSocket checks. Entry verification must click a link from a different origin, including redirects; same-origin navigation and direct URL requests alone do not cover this case.
- Prioritize `moss-live-1.0`. Do not silently replace its protocol with OpenAI Realtime or classic chat completions. Use the official MOSS docs and verify actual upstream behavior.
- Paid capabilities stay disabled unless the user explicitly requests enabling them. Unknown models are not implicitly free. No automatic retry/fallback to paid models or automatic recharge.
- Verify actual playback completion before sending acknowledgements; preserve interruption accounting, media cleanup, origin checks and microphone/camera consent.
- `npm test` and `npm run build` validate code. `npm run deploy` builds, tests and publishes the server/static release via `liveai.service`; then verify HTTPS assets, anonymous API rejection and the main flow. Physical M153 testing and synthetic browser testing must be reported separately.
- Update the existing LiveAI navigation card and real screenshot in `/home/ubuntu/apps/guihua-lab/` when relevant, preserving unrelated work. Read its publishing guide before changing Caddy; change only the current actual configuration.
- Commit and push only relevant changes to this public repository after checks. Do not create an APK for a browser-only change.
