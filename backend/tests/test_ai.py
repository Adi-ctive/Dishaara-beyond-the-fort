from fastapi.testclient import TestClient

from app import grounding, main, rules

client = TestClient(main.app)
TODAY = "2026-10-14"


def test_at03_missing_fact_is_not_invented():
    r = client.post("/ask", json={"question": "Can I pay by card at Jai Vilas Palace? payment", "today": TODAY}).json()
    assert r["grounded"] and "unavailable" in r["answer"]
    assert "UPI" not in r["answer"] and "card" not in r["answer"].lower()
    assert "88271" in r["answer"]  # official contact given


def test_at08_closed_on_weekly_holiday():
    data = rules.load(TODAY)
    gujari = next(u for u in rules.get_place(data, "gwalior-fort")["units"] if u["id"] == "fort-gujari")
    assert rules.check_feasibility(data, gujari, "2026-10-19")["verdict"] == "not feasible"  # Monday


def test_at10_grounding_blocks_ungrounded_time(monkeypatch):
    calls = []

    def bad_writer(q, lang, results):
        calls.append(1)
        return "Jai Vilas opens at 08:15 and costs ₹99."

    monkeypatch.setattr(main, "WRITER", bad_writer)
    r = client.post("/ask", json={"question": "Jai Vilas Palace hours", "today": TODAY}).json()
    assert len(calls) == 2  # regenerated once
    assert r["fallback"] and r["answer"] is None and r["tool_results"]
    assert any("grounded=False" in e for e in r["events"])  # logged


def test_grounding_accepts_values_from_tool_results():
    ok, missing = grounding.check("Fee ₹550, open 10:00 to 18:00", [{"fee": "₹550", "hours": {"open": "10:00", "close": "18:00"}}])
    assert ok, missing


def test_at17_uncovered_city():
    r = client.post("/ask", json={"question": "Plan a day in Jaipur", "today": TODAY}).json()
    assert r["answer"].startswith("Not covered yet") and r["tool_results"] == []
