"""Dishaara assistant API: POST /ask with tool calls and a grounding check (FR-AI-01..11).

The LLM provider is pluggable. With no provider configured, a deterministic writer composes the
answer from tool results, so the endpoint runs locally without any key.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import date as Date
from typing import Callable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import grounding, rules

log = logging.getLogger("dishaara.ai")
app = FastAPI(title="Dishaara assistant")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])


class AskIn(BaseModel):
    question: str
    lang: str = "en"
    today: str | None = None


class AskOut(BaseModel):
    answer: str | None
    grounded: bool
    fallback: bool
    tool_results: list
    events: list[str] = []


def mock_writer(question: str, lang: str, results: list) -> str:
    """Stand-in for the LLM: writes only from tool results, keeping each fact's label (FR-AI-08)."""
    parts = []
    for r in results:
        if r["tool"] == "check_feasibility":
            parts.append(f"{r['section']}: {r['result']['verdict']} on {r['date']} ({'; '.join(r['result']['reasons'])}).")
        if r["tool"] == "get_place" and "payment" in question.lower():
            for u in r["result"]["units"]:
                pay = u["payment"]
                txt = pay.get("t", {}).get(lang) if pay.get("v") else None
                parts.append(f"{u['name'][lang]} payment: {txt} [{pay.get('s')}]" if txt else
                             f"{u['name'][lang]} payment: unavailable ({pay.get('why', {}).get(lang, '')}). Check with the official contact: {r['result']['contact'].get('t', {}).get(lang, 'not listed')}.")
    return " ".join(parts) or "I could not find that place in Dishaara. Try its full name."


WRITER: Callable[[str, str, list], str] = mock_writer  # replaced when an LLM provider is configured


def _date_in(q: str, today: str) -> str:
    m = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", q)
    return m.group(1) if m else today


@app.get("/health")
def health():
    return {"ok": True, "provider": os.getenv("LLM_PROVIDER", "mock")}


@app.post("/ask", response_model=AskOut)
def ask(body: AskIn) -> AskOut:
    today = body.today or Date.today().isoformat()
    q = body.question
    events: list[str] = []
    if rules.uncovered_city(q):  # FR-AI-11, E20
        return AskOut(answer="Not covered yet. Dishaara covers Gwalior only.", grounded=True, fallback=False, tool_results=[])
    if re.search(r"emergency|hospital|police|injur|आपात", q, re.I):  # E18
        return AskOut(answer="For emergencies call 112.", grounded=True, fallback=False, tool_results=[{"emergency": "112"}])

    data = rules.load(today)
    results: list = []
    hits = rules.search_places(data, q)
    results.append({"tool": "search_places", "result": hits})
    day = _date_in(q, today)
    for h in hits[:2]:
        place = rules.get_place(data, h["id"])
        results.append({"tool": "get_place", "result": place})
        for u in place["units"]:
            results.append({"tool": "check_feasibility", "section": u["name"]["en"], "date": day, "result": rules.check_feasibility(data, u, day)})

    for attempt in range(2):  # generate, then regenerate once on failure (FR-AI-04)
        answer = WRITER(q, body.lang, results)
        ok, missing = grounding.check(answer, results)
        events.append(f"attempt {attempt + 1}: grounded={ok} missing={missing}")
        log.info("ask grounding attempt=%s ok=%s missing=%s", attempt + 1, ok, missing)
        if ok:
            return AskOut(answer=answer, grounded=True, fallback=False, tool_results=results, events=events)
    return AskOut(answer=None, grounded=False, fallback=True, tool_results=results, events=events)  # E8: structured only
