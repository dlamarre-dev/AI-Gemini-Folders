#!/usr/bin/env python3
"""
Native messaging host for the CWS Stats Collector: reads a local file and
returns its text. That is the whole job — the extension downloads a CSV from
the dev console, and an extension cannot read its own download off disk.

Protocol: each message is a 4-byte little-endian length prefix + UTF-8 JSON.
Request {"path": "..."} -> {"ok": true, "content": "..."} or {"ok": false, "error"}.

It used to also serve base64 (chunked, for PNGs) and answer {"cmd": "repo_root"},
both for the Store Listing Publisher, which shared this host. That tool now lives
in its own repo with its own host, so those two features had no caller left.
"""
import json
import struct
import sys


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
        # utf-8-sig strips the BOM that Windows apps sometimes write
        with open(msg["path"], "r", encoding="utf-8-sig") as f:
            send({"ok": True, "content": f.read()})
    except Exception as e:
        send({"ok": False, "error": str(e)})
