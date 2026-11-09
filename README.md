# Godseed

A pixel-art god sandbox for TikTok LIVE, driven by chat, likes and gifts. Work in progress.

## AI voice (optional)

The game reads gifts, new chiefs, joins, viewer kills and the Final Storm aloud with a local [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) voice. It runs on your own PC; nothing goes to the cloud.

```bash
pip install -r tts/requirements.txt
python tts/server.py            # first start downloads the model (~350 MB)
```

Then open the game as usual. The default voice is bm_george; pick another with `?voice=am_michael`, or silence it with `?voice=off`. Without the voice server the game simply stays quiet.

A normal browser tab only plays sound after you click the page once; an OBS browser source plays it right away.

## Going live on TikTok

1. Put your TikTok name in `.env` (copy `.env.example`): `TIKTOK_USERNAME=yourname`, without the `@`. `TIKTOK_SIGN_API_KEY` is optional; a free [Euler Stream](https://www.eulerstream.com) key helps when TikTok rate-limits you.
2. Start the voice (optional), then the bridge: `pnpm --filter bridge start`. It logs `tiktok: connected to @yourname` once your LIVE has started, and keeps retrying (5 s up to 60 s) until then. The test panel keeps working alongside it.
3. Build and serve the game: `pnpm --filter game build` and then `pnpm --filter game preview` (serves http://localhost:4173).
4. In OBS: canvas and output 1080x1920. Add a Browser source on `http://localhost:4173`, 1080x1920, custom FPS 60, "Shutdown source when not visible" off. Turn on browser-source hardware acceleration (Settings → Advanced) and use NVENC at 6–8 Mbps. Stream with the key from TikTok LIVE Studio, or capture the window in LIVE Studio.

The dot next to the round clock is green when the bridge and TikTok are both connected. When TikTok drops, the feed says "TikTok chat offline", the NPCs keep playing and the bridge reconnects on its own.

TikTok LIVE has no official API: this uses the unofficial [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) (pinned to 2.5.0) and can break when TikTok changes things.

Before each stream: bridge running with a green dot, `.env` present, and your phone next to you to check that TikTok's own overlay doesn't cover the map (F4 shows the safe zones).
