# Godseed

A pixel-art god sandbox for TikTok LIVE, driven by chat, likes and gifts. Work in progress.

## AI voice (optional)

The game reads gifts, new chiefs, joins, viewer kills and the Final Storm aloud with a local [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) voice. It runs on your own PC; nothing goes to the cloud.

```bash
pip install -r tts/requirements.txt
python tts/server.py            # first start downloads the model (~350 MB)
```

Then open the game as usual. Pick another voice with `?voice=am_michael`, or silence it with `?voice=off`. Without the voice server the game simply stays quiet.

A normal browser tab only plays sound after you click the page once; an OBS browser source plays it right away.
