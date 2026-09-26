#!/usr/bin/env python3
"""Fresh Studio Dev v2 lifecycle and adversarial verification for Handshake."""

from __future__ import annotations

import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CLI = "/home/ini/.local/bin/genlayer"
RPC = "https://studio-dev.genlayer.com/api"
CONTRACT = "0xd0cB30DCd57e2395c4CAb2451fa06Ad574241ACE"
PARTY_A = "0xA35dc047f9937BF668743efBDF8Ea93B31A55888"
PARTY_B = "0x30fd7e8539a8462591e62894739c6864e9b81fa2"
OUTSIDER = "0x01feebafdfddd4ba23f69b43f0b501bba7aa7cff"
ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "evidence" / "STUDIO_DEV_LIVE_TEST_REPORT.json"
HASH_RE = re.compile(r"0x[0-9a-fA-F]{64}")
FP_RE = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])")

COMPATIBLE_ID = "handshake-v2-compatible-20260926-r1"
INCOMPATIBLE_ID = "handshake-v2-incompatible-20260926-r1"
OUTSIDER_ID = "handshake-v2-outsider-20260926-r1"
DUPLICATE_ID = "handshake-v2-duplicate-20260926-r1"
PRESYNTHESIS_ID = "handshake-v2-presynthesis-20260926-r1"
CAPABILITY_ID = "docs-migration-authorization"
INCOMPATIBLE_CAPABILITY_ID = "billing-authorization"

A_MIGRATION = [
    {"term_id": "downtime-limit", "category": "downtime", "requirement": "Migration downtime must not exceed 10 minutes.", "importance": "HARD"},
    {"term_id": "rollback-checkpoint", "category": "rollback", "requirement": "A rollback checkpoint is required before cutover.", "importance": "HARD"},
    {"term_id": "preserve-urls", "category": "data_integrity", "requirement": "Existing documentation URLs must be preserved.", "importance": "HARD"},
    {"term_id": "blue-green-preference", "category": "rollout", "requirement": "Party A prefers a blue-green rollout.", "importance": "PREFERENCE"},
]
B_MIGRATION = [
    {"term_id": "maintenance-window", "category": "schedule", "requirement": "Migration must complete within the agreed maintenance window.", "importance": "HARD"},
    {"term_id": "rollback-tested", "category": "rollback", "requirement": "The rollback path must be tested.", "importance": "HARD"},
    {"term_id": "history-preserved", "category": "data_integrity", "requirement": "No documentation data-history may be lost.", "importance": "HARD"},
    {"term_id": "canary-preference", "category": "rollout", "requirement": "Party B prefers a canary rollout.", "importance": "PREFERENCE"},
]
A_CONFLICT = [
    {"term_id": "price-floor", "category": "payment", "requirement": "Party A requires a minimum payment of $5,000.", "importance": "HARD"},
]
B_CONFLICT = [
    {"term_id": "price-cap", "category": "payment", "requirement": "Party B requires a maximum payment of $3,000.", "importance": "HARD"},
]


def run(args: list[str], timeout: int = 420) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)


def use(account: str) -> None:
    result = run([CLI, "account", "use", account], timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"account selection failed for {account}: {result.stderr[-1000:]}")


def json_arg(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def redact(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        context = value[max(0, match.start() - 64):match.start()].lower()
        return "[REDACTED]" if "private_key" in context else match.group(0)
    return re.sub(r"0x[0-9a-fA-F]{64}", replace, value)


def last_json(text: str) -> dict[str, Any]:
    for line in reversed(text.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                return value
    raise RuntimeError(f"fee estimate JSON missing: {redact(text[-1000:])}")


def fallback_fee() -> dict[str, Any]:
    return {
        "distribution": {
            "leaderTimeunitsAllocation": "100",
            "validatorTimeunitsAllocation": "200",
            "appealRounds": "0",
            "executionBudgetPerRound": "94626600000000",
            "executionConsumed": "0",
            "totalMessageFees": "0",
            "rotations": ["3"],
            "maxPriceGenPerTimeUnit": "2",
            "storageFeeMaxGasPrice": "300000000",
            "receiptFeeMaxGasPrice": "300000000",
        },
        "feeValue": "378506400010352",
        "messageAllocations": [],
    }


def estimate(method: str, args: list[str]) -> dict[str, Any]:
    last: subprocess.CompletedProcess[str] | None = None
    for attempt in range(3):
        last = run([CLI, "estimate-fees", CONTRACT, method, "--rpc", RPC, "--json", "--args", *args], timeout=420)
        if last.returncode == 0:
            return last_json(last.stdout)
        if attempt < 2:
            time.sleep(3)
    if method in {"create_negotiation", "consume_capability"}:
        return fallback_fee()
    raise RuntimeError(f"fee estimation failed: {redact((last.stderr if last else '')[-1500:])}")


def write(report: dict[str, Any], account: str, label: str, method: str, args: list[str], expected_success: bool) -> str:
    use(account)
    try:
        fee = estimate(method, args)
    except RuntimeError:
        if expected_success:
            raise
        fee = fallback_fee()
    fees = json.dumps({"distribution": fee["distribution"], "messageAllocations": fee.get("messageAllocations", [])}, separators=(",", ":"))
    result = run([
        CLI, "write", CONTRACT, method, "--rpc", RPC, "--wallet", "keystore",
        "--fees", fees, "--fee-value", str(fee["feeValue"]), "--args", *args,
    ], timeout=900 if method == "synthesize" else 420)
    output = (result.stdout + "\n" + result.stderr).strip()
    success = result.returncode == 0 and "successfully executed" in output.lower()
    tx_hash = HASH_RE.search(output)
    entry = {
        "label": label,
        "account": account,
        "method": method,
        "expected_success": expected_success,
        "success": success,
        "exit_code": result.returncode,
        "tx_hash": tx_hash.group(0) if tx_hash else None,
        "output_tail": redact(output[-2400:]),
    }
    report["writes"].append(entry)
    if success != expected_success:
        raise RuntimeError(f"unexpected live result for {label}: {json.dumps(entry)}")
    return output


def call(method: str, args: list[str]) -> str:
    result = run([CLI, "call", CONTRACT, method, "--rpc", RPC, "--args", *args], timeout=180)
    output = (result.stdout + "\n" + result.stderr).strip()
    if result.returncode != 0:
        raise RuntimeError(f"call failed for {method}: {redact(output[-1800:])}")
    return redact(output[-7000:])


def record_view(report: dict[str, Any], label: str, method: str, args: list[str]) -> str:
    value = call(method, args)
    report["views"].append({"label": label, "method": method, "value": value})
    return value


def fingerprint_from(text: str) -> str:
    matches = FP_RE.findall(text)
    if not matches:
        raise RuntimeError(f"fingerprint missing from {redact(text[-1000:])}")
    return matches[-1]


def assert_contains(report: dict[str, Any], name: str, text: str, expected: str) -> None:
    passed = expected in text
    report["assertions"].append({"name": name, "passed": passed, "expected": expected})
    if not passed:
        raise AssertionError(f"{name}: expected {expected!r} in {text[-1200:]}")


def assert_contains_any(report: dict[str, Any], name: str, text: str, expected: list[str]) -> None:
    passed = any(item in text for item in expected)
    report["assertions"].append({"name": name, "passed": passed, "expected_any": expected})
    if not passed:
        raise AssertionError(f"{name}: expected one of {expected!r} in {text[-1200:]}")


def create_args(negotiation_id: str, capability_id: str, action: str, resource: str) -> list[str]:
    return [
        negotiation_id, PARTY_A, PARTY_B, capability_id, action, resource,
        "two-party authorization for the declared operation", "SINGLE_USE", OUTSIDER,
    ]


def resumed(report: dict[str, Any], account: str, label: str, method: str, output: str) -> None:
    report["writes"].append({
        "label": label,
        "account": account,
        "method": method,
        "expected_success": True,
        "success": True,
        "exit_code": 0,
        "tx_hash": None,
        "resumed": True,
        "output_tail": redact(output[-2400:]),
    })


def ensure_create(report: dict[str, Any], account: str, label: str, args: list[str]) -> None:
    try:
        existing = call("get_negotiation", [args[0]])
    except RuntimeError:
        write(report, account, label, "create_negotiation", args, True)
    else:
        resumed(report, account, label + "-resumed", "create_negotiation", existing)


def ensure_position(report: dict[str, Any], account: str, label: str, negotiation_id: str, terms: list[dict[str, str]]) -> None:
    try:
        existing = call("get_position_fingerprint", [negotiation_id, "A" if account == "dissent-studio" else "B"])
    except RuntimeError:
        submit(report, account, label, negotiation_id, terms)
    else:
        if FP_RE.search(existing):
            resumed(report, account, label + "-resumed", "submit_position", existing)
        else:
            submit(report, account, label, negotiation_id, terms)


def ensure_synthesis(report: dict[str, Any], account: str, label: str, negotiation_id: str) -> None:
    try:
        existing = call("get_synthesis", [negotiation_id])
    except RuntimeError:
        write(report, account, label, "synthesize", [negotiation_id], True)
    else:
        resumed(report, account, label + "-resumed", "synthesize", existing)


def submit(report: dict[str, Any], account: str, label: str, negotiation_id: str, terms: list[dict[str, str]]) -> None:
    write(report, account, label, "submit_position", [negotiation_id, json_arg(terms)], True)


def main() -> int:
    if CONTRACT == "REPLACE_AFTER_DEPLOYMENT":
        raise RuntimeError("set CONTRACT to the newly deployed v2 address before running live tests")
    report: dict[str, Any] = {
        "version": "Handshake v2",
        "network": {"name": "GenLayer Studio Devnet", "chain_id": 61997, "rpc": RPC},
        "contract": CONTRACT,
        "accounts": {"party_a": PARTY_A, "party_b": PARTY_B, "configured_consumer": OUTSIDER, "outsider": "not disclosed"},
        "started_at": datetime.now(timezone.utc).isoformat(),
        "writes": [],
        "views": [],
        "assertions": [],
    }

    compatible_create = create_args(COMPATIBLE_ID, CAPABILITY_ID, "AUTHORIZE_MIGRATION", "docs-production")
    ensure_create(report, "dissent-studio", "compatible:create", compatible_create)
    ensure_position(report, "dissent-studio", "compatible:submit-a", COMPATIBLE_ID, A_MIGRATION)
    ensure_position(report, "dissent-deployer", "compatible:submit-b", COMPATIBLE_ID, B_MIGRATION)
    ready = record_view(report, "compatible:ready", "get_negotiation", [COMPATIBLE_ID])
    assert_contains_any(report, "compatible reaches ready or resumes at pending acceptance", ready, ["state: 'READY'", "state: 'PENDING_ACCEPTANCE'"])
    ensure_synthesis(report, "dissent-studio", "compatible:synthesize", COMPATIBLE_ID)
    synthesis = record_view(report, "compatible:synthesis", "get_synthesis", [COMPATIBLE_ID])
    assert_contains(report, "compatible synthesis reaches acceptance stage", synthesis, "state: 'PENDING_ACCEPTANCE'")
    synthesis_fp = fingerprint_from(record_view(report, "compatible:synthesis-fingerprint", "get_synthesis_fingerprint", [COMPATIBLE_ID]))
    write(report, "recall-deployer", "compatible:outsider-accept", "accept_synthesis", [COMPATIBLE_ID, synthesis_fp], False)
    write(report, "dissent-studio", "compatible:accept-a", "accept_synthesis", [COMPATIBLE_ID, synthesis_fp], True)
    pending = record_view(report, "compatible:after-first-acceptance", "get_negotiation", [COMPATIBLE_ID])
    assert_contains(report, "one acceptance remains pending", pending, "state: 'PENDING_ACCEPTANCE'")
    capability_pending = record_view(report, "compatible:capability-before-dual-acceptance", "get_capability", [COMPATIBLE_ID])
    assert_contains(report, "capability inactive before second acceptance", capability_pending, "active: false")
    write(report, "dissent-studio", "compatible:duplicate-accept-a", "accept_synthesis", [COMPATIBLE_ID, synthesis_fp], False)
    write(report, "dissent-studio", "compatible:preactivation-consume", "consume_capability", [COMPATIBLE_ID], False)
    write(report, "dissent-deployer", "compatible:accept-b", "accept_synthesis", [COMPATIBLE_ID, synthesis_fp], True)
    active = record_view(report, "compatible:active-negotiation", "get_negotiation", [COMPATIBLE_ID])
    assert_contains(report, "dual acceptance activates", active, "state: 'ACTIVE'")
    capability_active = record_view(report, "compatible:active-capability", "get_capability", [COMPATIBLE_ID])
    assert_contains(report, "capability is active", capability_active, "active: true")
    assert_contains(report, "capability id is bound", capability_active, "capability_id: 'docs-migration-authorization'")
    assert_contains(report, "capability action is bound", capability_active, "action: 'AUTHORIZE_MIGRATION'")
    assert_contains(report, "capability resource is bound", capability_active, "resource: 'docs-production'")
    write(report, "recall-deployer", "compatible:authorized-consume", "consume_capability", [COMPATIBLE_ID], True)
    consumed = record_view(report, "compatible:downstream-action-proof", "get_capability", [COMPATIBLE_ID])
    assert_contains(report, "single-use downstream action consumed", consumed, "activation_state: 'CONSUMED'")
    write(report, "recall-deployer", "compatible:replay-consume", "consume_capability", [COMPATIBLE_ID], False)
    write(report, "dissent-studio", "compatible:post-activation-submit", "submit_position", [COMPATIBLE_ID, json_arg(A_MIGRATION)], False)

    incompatible_create = create_args(INCOMPATIBLE_ID, INCOMPATIBLE_CAPABILITY_ID, "AUTHORIZE_BILLING", "billing-production")
    write(report, "dissent-studio", "incompatible:create", "create_negotiation", incompatible_create, True)
    submit(report, "dissent-studio", "incompatible:submit-a", INCOMPATIBLE_ID, A_CONFLICT)
    submit(report, "dissent-deployer", "incompatible:submit-b", INCOMPATIBLE_ID, B_CONFLICT)
    write(report, "dissent-studio", "incompatible:synthesize", "synthesize", [INCOMPATIBLE_ID], True)
    incompatible = record_view(report, "incompatible:terminal-state", "get_negotiation", [INCOMPATIBLE_ID])
    assert_contains(report, "hard conflict is incompatible", incompatible, "state: 'INCOMPATIBLE'")
    incompatible_synthesis = record_view(report, "incompatible:synthesis", "get_synthesis", [INCOMPATIBLE_ID])
    assert_contains(report, "incompatible synthesis is explicit", incompatible_synthesis, "compatibility: 'INCOMPATIBLE'")
    incompatible_capability = record_view(report, "incompatible:no-capability", "get_capability", [INCOMPATIBLE_ID])
    assert_contains(report, "incompatible capability is inactive", incompatible_capability, "active: false")
    write(report, "dissent-studio", "incompatible:accept-rejected", "accept_synthesis", [INCOMPATIBLE_ID, fingerprint_from(record_view(report, "incompatible:synthesis-fingerprint", "get_synthesis_fingerprint", [INCOMPATIBLE_ID]))], False)
    write(report, "recall-deployer", "incompatible:consume-rejected", "consume_capability", [INCOMPATIBLE_ID], False)

    outsider_create = create_args(OUTSIDER_ID, "outsider-test-capability", "TEST_ACTION", "test-resource")
    write(report, "dissent-studio", "negative:outsider-create", "create_negotiation", outsider_create, True)
    write(report, "recall-deployer", "negative:outsider-submit-rejected", "submit_position", [OUTSIDER_ID, json_arg(A_MIGRATION)], False)

    duplicate_create = create_args(DUPLICATE_ID, "duplicate-position-capability", "TEST_ACTION", "test-resource")
    write(report, "dissent-studio", "negative:duplicate-create", "create_negotiation", duplicate_create, True)
    submit(report, "dissent-studio", "negative:duplicate-position-first", DUPLICATE_ID, A_MIGRATION)
    write(report, "dissent-studio", "negative:duplicate-position-second", "submit_position", [DUPLICATE_ID, json_arg(B_MIGRATION)], False)

    presynthesis_create = create_args(PRESYNTHESIS_ID, "presynthesis-capability", "TEST_ACTION", "test-resource")
    write(report, "dissent-studio", "negative:presynthesis-create", "create_negotiation", presynthesis_create, True)
    write(report, "dissent-studio", "negative:presynthesis-rejected", "synthesize", [PRESYNTHESIS_ID], False)

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "report": str(REPORT),
        "contract": CONTRACT,
        "writes": len(report["writes"]),
        "successful_writes": sum(1 for item in report["writes"] if item["success"]),
        "expected_failures": sum(1 for item in report["writes"] if not item["expected_success"] and not item["success"]),
        "assertions": len(report["assertions"]),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
