#!/usr/bin/env python3
"""
Native messaging host shared by the CWS Stats Collector and the Store Listing
Publisher. Reads local files and returns their content — text by default,
base64 when the request carries "binary": true (used for PNG screenshots).
Protocol: each message is a 4-byte little-endian length prefix + UTF-8 JSON.

Binary responses are streamed as {"ok", "chunk", "done"} messages: Firefox
kills the connection on any native→extension message over 1 MB, and the
base64 of a marketing screenshot exceeds that.

It also answers {"cmd": "repo_root"} with the absolute path of the repo it
lives in: an extension only knows its moz-extension:// origin, never its path
on disk, so this is how the publisher finds dist/ without a hardcoded path.
"""
import base64
import sys
import json
import struct
from pathlib import Path

BINARY_CHUNK = 256 * 1024  # base64 chars per message, well under the 1 MB cap
# <repo>/tools/stats-collector/native/filereader.py → up 3 levels.
REPO_ROOT = str(Path(__file__).resolve().parents[3])


def send(msg):
    data = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def recv():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        return None
    msg_len = struct.unpack("<I", raw_len)[0]
    if msg_len == 0:
        return None
    return json.loads(sys.stdin.buffer.read(msg_len))


while True:
    msg = recv()
    if msg is None:
        break
    try:
        if msg.get("cmd") == "repo_root":
            send({"ok": True, "repo_root": REPO_ROOT})
            continue
        path = msg["path"]
        if msg.get("binary"):
            with open(path, "rb") as f:
                content = base64.b64encode(f.read()).decode("ascii")
            chunks = [content[i:i + BINARY_CHUNK]
                      for i in range(0, len(content), BINARY_CHUNK)] or [""]
            for idx, chunk in enumerate(chunks):
                send({"ok": True, "chunk": chunk, "done": idx == len(chunks) - 1})
        else:
            # utf-8-sig strips the BOM that Windows apps sometimes write
            with open(path, "r", encoding="utf-8-sig") as f:
                content = f.read()
            send({"ok": True, "content": content})
    except Exception as e:
        send({"ok": False, "error": str(e)})
