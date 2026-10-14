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


def check(answer: str, tool_results: list) -> tuple[bool, list[str]]:
    corpus = _norm(json.dumps(tool_results, ensure_ascii=False))
    missing = [c for c in claims(answer) if _norm(c) not in corpus and _norm(re.sub(r"\D", "", c)) not in corpus]
    return (not missing, missing)
