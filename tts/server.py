"""Local Kokoro voice for Godseed.

Runs on the streaming PC, never in the cloud. The game asks it to speak short lines:
    GET http://127.0.0.1:8880/tts?text=Hello&voice=af_heart  -> audio/wav
    GET http://127.0.0.1:8880/voices                          -> JSON list of voice names

Setup (once):  pip install -r tts/requirements.txt
Run:           python tts/server.py            (downloads the model, ~350 MB, on first start)
Options:       --port 8880  --voice af_heart  --speed 1.0
"""

import argparse
import io
import json
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import soundfile as sf
from kokoro_onnx import Kokoro

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ["kokoro-v1.0.onnx", "voices-v1.0.bin"]
HERE = Path(__file__).parent / "models"
MAX_CHARS = 300  # lines are short announcements; longer input is cut, not refused


def download() -> None:
    HERE.mkdir(exist_ok=True)
    for name in FILES:
        path = HERE / name
        if path.exists() and path.stat().st_size > 0:
            continue
        print(f"Downloading {name} ...", flush=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(MODEL_URL + name, tmp)
        tmp.replace(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8880)
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=1.0)
    args = ap.parse_args()

    download()
    kokoro = Kokoro(str(HERE / FILES[0]), str(HERE / FILES[1]))
    voices = sorted(kokoro.get_voices())
    lock = threading.Lock()  # one synthesis at a time keeps memory flat

    class Handler(BaseHTTPRequestHandler):
        def send(self, code: int, body: bytes, kind: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802 (http.server naming)
            url = urlparse(self.path)
            q = parse_qs(url.query)
            if url.path == "/voices":
                self.send(200, json.dumps(voices).encode(), "application/json")
                return
            if url.path != "/tts":
                self.send(200, b"Godseed voice is running. Try /tts?text=Hello", "text/plain")
                return
            text = (q.get("text") or [""])[0].strip()[:MAX_CHARS]
            voice = (q.get("voice") or [args.voice])[0]
            if not text or voice not in voices:
                self.send(400, b"need ?text= and a known voice", "text/plain")
                return
            try:
                with lock:
                    samples, rate = kokoro.create(text, voice=voice, speed=args.speed, lang="en-us")
            except Exception as e:  # a bad line must never take the server down
                self.send(500, str(e).encode(), "text/plain")
                return
            buf = io.BytesIO()
            sf.write(buf, samples, rate, format="WAV")
            self.send(200, buf.getvalue(), "audio/wav")

        def log_message(self, *_: object) -> None:
            pass  # quiet: the game asks often

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Godseed voice ready on http://127.0.0.1:{args.port} (voice {args.voice})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
