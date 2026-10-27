"""Grounding check (FR-AI-04): every time, date, fee, distance, duration and phone number
in an AI answer must match a value in the tool results."""
from __future__ import annotations

import json
import re

PATTERNS = [
    r"\+?\d[\d\- ]{7,}\d",  # phone numbers
    r"\b\d{1,2}:\d{2}\b",  # clock times
    r"₹\s?\d[\d,]*",  # rupee amounts
    r"\b\d+(?:\.\d+)?\s?(?:km|min|minutes|hours|hrs|किमी|मिनट|घंटे)",  # distances and durations
    r"\b\d{1,2}\s(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b",  # dates
    r"\b(?:19|20)\d{2}\b",  # years
]


def _norm(s: str) -> str:
    return re.sub(r"[\s,]", "", s.lower()).replace("minutes", "min").replace("hours", "h").replace("hrs", "h")


def claims(answer: str) -> list[str]:
    out: list[str] = []
    for p in PATTERNS:
        out += [m.group(0) for m in re.finditer(p, answer, flags=re.I)]
    return out


def _found(claim: str, corpus: str) -> bool:
    if _norm(claim) in corpus:
        return True
    # Same number written differently (₹ 250 / 250, 0751 2480011 / 0751-2480011), but only as a whole number:
    # "75" must not match inside a phone number like 0751-2480011.
    # A decimal like 26.9 km: the number itself, as a whole number in the facts.
    num = re.search(r"\d+\.\d+", claim)
    if num and re.search(rf"(?<![\d.]){re.escape(num.group(0))}(?![\d])", corpus):
        return True
    # A distance rounded to the nearest km ("27 km" for 26.9 km of estimated road): within half a km of a distance in the facts.
    if re.search(r"km|किमी", claim, re.I):
        v = float(re.search(r"\d+(?:\.\d+)?", claim).group(0))
        if any(abs(float(x) - v) <= 0.5 for x in re.findall(r'(?:roadkm|kmaway)":(\d+(?:\.\d+)?)', corpus)):
            return True
    digits = re.sub(r"\D", "", claim)
    if not digits:
        return False
    flat = re.sub(r"(?<=\d)[-–]\s?(?=\d)", "", corpus) if len(digits) >= 8 else corpus
    if re.search(rf"(?<!\d){digits}(?!\d)", flat):
        return True
    # A phone written as 0731 262 6326 or +91 731 2626326: the last 10 digits decide.
    if len(digits) >= 10:
        return any(n.endswith(digits[-10:]) for n in re.findall(r"\d{10,}", flat))
    return False


def check(answer: str, tool_results: list) -> tuple[bool, list[str]]:
    corpus = _norm(json.dumps(tool_results, ensure_ascii=False))
    missing = [c for c in claims(answer) if not _found(c, corpus)]
    return (not missing, missing)
