#!/usr/bin/env python3.11
"""Build the encrypted survey-responses blob for review.html.

Reads the Google Form responses (exported as a Markdown table or CSV),
sanitizes PII, dedupes repeat submissions, then encrypts the JSON with a
passphrase so it can live in the public repo. review.js decrypts it in the
browser with WebCrypto (PBKDF2-SHA256 + AES-256-GCM).

Usage:
  SURVEY_PASSPHRASE='...' python3.11 tools/build_survey_data.py <responses.md|.csv>

Output: data/survey-responses.enc.json (ciphertext only — safe to commit).
The plaintext is never written to disk.
"""

import base64
import csv
import json
import os
import re
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

PBKDF2_ITERATIONS = 310_000

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
HOUSE_NUMBER_RE = re.compile(r"^\s*\d+\s+")

FIELDS = [
    "ts", "audience", "neighborhood", "frequency", "reasons",
    "sidewalks", "intersections", "avoided", "improvement", "dream", "meeting",
]


def parse_markdown_table(text):
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        if re.match(r"^\|[\s:|-]+\|$", line):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        # Undo the Drive export's Markdown escapes.
        cells = [re.sub(r"\\([!#&_.\\])", r"\1", c) for c in cells]
        rows.append(cells)
    return rows


def parse_csv(path):
    with open(path, newline="", encoding="utf-8") as fh:
        return [row for row in csv.reader(fh)]


def sanitize(rows):
    header, data = rows[0], rows[1:]
    if len(header) != 11:
        sys.exit(f"Expected 11 columns, got {len(header)} — check the export.")

    out, seen = [], set()
    for cells in data:
        if len(cells) != 11:
            sys.exit(f"Malformed row ({len(cells)} cells): {cells[:2]}")
        rec = dict(zip(FIELDS, cells))

        # The contact column becomes a plain yes/no signal; the address stays
        # in the Google Sheet, which remains the only place emails live.
        contact = rec["meeting"]
        rec["meeting"] = bool(
            EMAIL_RE.search(contact) or re.search(r"\byes\b", contact, re.I)
        )

        # Strip volunteered emails and leading house numbers everywhere else.
        for key in FIELDS[:-1]:
            rec[key] = EMAIL_RE.sub("[email removed]", rec[key]).strip()
        rec["neighborhood"] = HOUSE_NUMBER_RE.sub("", rec["neighborhood"])

        # Collapse double-submits: same answers to the substantive questions.
        fingerprint = (
            rec["audience"], rec["neighborhood"].lower(),
            rec["intersections"].lower(), rec["improvement"].lower(),
        )
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        out.append(rec)

    out.reverse()  # newest first
    return out


def encrypt(payload, passphrase):
    salt = os.urandom(16)
    nonce = os.urandom(12)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    key = kdf.derive(passphrase.encode("utf-8"))
    ct = AESGCM(key).encrypt(nonce, json.dumps(payload).encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {
        "v": 1,
        "kdf": "PBKDF2-SHA256",
        "iterations": PBKDF2_ITERATIONS,
        "salt": b64(salt),
        "iv": b64(nonce),
        "ct": b64(ct),
    }


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    passphrase = os.environ.get("SURVEY_PASSPHRASE")
    if not passphrase:
        sys.exit("Set SURVEY_PASSPHRASE in the environment.")

    src = Path(sys.argv[1])
    rows = (
        parse_csv(src) if src.suffix == ".csv"
        else parse_markdown_table(src.read_text(encoding="utf-8"))
    )
    records = sanitize(rows)

    blob = encrypt({"generated": None, "responses": records}, passphrase)
    dest = Path(__file__).resolve().parent.parent / "data" / "survey-responses.enc.json"
    dest.write_text(json.dumps(blob), encoding="utf-8")
    print(f"{len(records)} responses -> {dest.name} "
          f"({len(rows) - 1 - len(records)} duplicate(s) dropped)")


if __name__ == "__main__":
    main()
