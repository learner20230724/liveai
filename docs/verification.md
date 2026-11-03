# Verification — 2026-11-03

## Automated checks

`npm test`: 9 tests passed. Playback acknowledgements wait until source playback finishes; whole-turn acknowledgements wait for all chunks. Interrupted playback reports actual elapsed time and does not acknowledge cancelled queued chunks. Unknown/paid models never fall back. API authentication, Secure/HttpOnly cookie scoping, Origin checks and unauthenticated WebSocket rejection passed. Invalid sizes and model IDs made zero upstream requests.

`npm run build`: Vite production build passed. Published HTML and both JS/CSS assets returned HTTP 200 over publicly trusted HTTPS at https://guihualab.cn/liveai/. DNS resolved to the intended server. Anonymous model API returned 401. Browser login with an intentionally invalid password was rejected by the actual production authentication service. Successful authentication was tested against an isolated loopback auth fixture; the existing private-area password was neither reset nor bypassed in production.

## Real MOSS inference, browser media simulation

Chromium captured an eSpeak-generated English test phrase through its synthetic microphone device. The actual application captured/resampled PCM, authenticated its WebSocket gateway and called the real MOSS Live service:

- User transcript: “Please introduce yourself in one short sentence.”
- Model replied with a complete self-introduction in English.
- Received 60 PCM audio chunks, acknowledged all 60 after browser playback ended.
- Received `response.ended` with status `completed`.
- One initial speech segment was naturally aborted by the following speech segment; the conversation continued successfully.
- Camera enabled, then disabled; microphone mute/unmute worked. After ending, both tracks were `ended`.
- A second test ended a session with the camera still active: 3 JPEG camera frames and 139 PCM frames were transmitted; all tracks ended.
- Navigating away during a call retained a visible ongoing-call indicator and an end-call control.
- Conversation text appeared in local history and paid models appeared in a separate locked catalog.
- MOSS Image SFT generated a real 512×512 image through the browser UI.
- No browser JavaScript errors in either run.

The QA authentication adapter ran **only on loopback in an isolated process**, never on the production route, and was stopped after verification. The real MOSS API key remained server-side. Synthetic media and this fixture do not prove real microphone/speaker quality, acoustic echo cancellation, Android permission behavior or M153 hardware compatibility.

## Responsive checks

Desktop 1440×1050 and mobile 390×844 screenshots inspected. No mobile horizontal overflow; sidebar fully hidden when closed, opens from the menu and closes on navigation. Browser zoom remains enabled and safe-area padding is present. Screen-share controls use the browser's display-capture API, which depends on browser support; no real desktop screen share or physical phone was available.

The public Guihua Lab card was clicked in Chromium and opened the protected LiveAI login page. The navigation screenshot decoded successfully and the navigation also passed the 390 px overflow check. During release checks, an older hashed JS URL initially returned 404; deployment now retains assets from the previous five releases. The same old URL returned 200 after the new deployment, while anonymous API access remained rejected.

## Known upstream limitations

`GET /v1/models` authenticates successfully but omits several officially documented free model IDs. Live and Image SFT work despite that omission. MOSS VL currently fails with `model or version not found`; its entry explicitly reports upstream unavailability. VL Realtime is listed only and is not an implemented alternate protocol in this release. Paid capabilities are catalog entries only and all paid handlers are disabled; no paid inference requests were made.

Machine-readable sanitized results: [browser-verification.json](browser-verification.json). Screenshots contain the actual application with empty or synthetic content, never user conversations.

## External link entry fix — 2026-11-03

The owner reported `{"error":"不允许跨站请求。"}` when opening the published URL. Before the fix, a normal homepage GET returned 200, but the same homepage GET carrying `Sec-Fetch-Site: cross-site` returned 403 with that exact error. The source of the owner's request was not logged; external navigation reproduces the reported response. This was caused by applying the API Origin/Fetch Metadata guard globally, including the public login document. Earlier browser verification used direct URL and same-origin navigation, so it missed external link entry.

The guard now applies only to `/api` and `/api/*`. Public HTML and static assets can be loaded from external links; API login/logout/session/model checks and the separate authenticated WebSocket Origin guard remain enforced. The regression suite now has 11 passing tests, including external document GET/HEAD, foreign-Origin requests, authenticated cross-site API rejection, and same-origin API acceptance.

The no-slash `/liveai` URL also returned an empty 200 because the Caddy redirect target was parsed as a path matcher. Its handler now uses `redir * /liveai/ 308`. The existing Caddy configuration was read, backed up, incrementally changed and validated; other site handlers and authentication were retained. The matching deployment example is [Caddyfile.snippet](../deploy/Caddyfile.snippet).

## Production authentication transport fix — 2026-11-03

While verifying the owner's requested password, the documented password matched the existing shared-password hash, and the shared service accepted a direct native HTTP login. LiveAI's login proxy returned 502. Reproducing the same request in Node exposed `fetch failed` with cause `bad port`: browser-compatible Node fetch rejects the existing authentication service's port 4190 before opening a connection. Login, logout and authenticated session checks all used that transport. Earlier positive tests used ephemeral ports and the browser QA auth fixture used 4263, so both missed the production-port restriction; anonymous session checks returned false before using the transport and did not reveal it.

The authentication adapter now uses Node's native HTTP/HTTPS client with bounded responses and request timeouts. The shared service, passwords, cookies, API Origin rules and WebSocket authentication are preserved. The integration fixture runs on fetch-blocked port 6000 and explicitly proves that ordinary fetch fails while LiveAI validates the same session successfully. All 12 tests pass. No MOSS inference or paid requests are needed for this fix.

After deployment, Chromium logged in through the actual public UI using the existing owner password. The session endpoint returned 200/authenticated, the model catalog returned 200, reloading retained the session, and logout returned to the password form with an unauthenticated session. There were no browser JavaScript errors. The password and cookies are not included in repository artifacts.
