#!/usr/bin/env python3
"""
Native messaging host for CWS Stats Collector.
Reads local files and returns their text content.
Protocol: each message is a 4-byte little-endian length prefix + UTF-8 JSON.
"""
import sys
import json
import struct


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
        path = msg["path"]
        # utf-8-sig strips the BOM that Windows apps sometimes write
        with open(path, "r", encoding="utf-8-sig") as f:
            content = f.read()
        send({"ok": True, "content": content})
    except Exception as e:
        send({"ok": False, "error": str(e)})
