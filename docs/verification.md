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

## Known upstream limitations

`GET /v1/models` authenticates successfully but omits several officially documented free model IDs. Live and Image SFT work despite that omission. MOSS VL currently fails with `model or version not found`; its entry explicitly reports upstream unavailability. VL Realtime is listed only and is not an implemented alternate protocol in this release. Paid capabilities are catalog entries only and all paid handlers are disabled; no paid inference requests were made.

Machine-readable sanitized results: [browser-verification.json](browser-verification.json). Screenshots contain the actual application with empty or synthetic content, never user conversations.
