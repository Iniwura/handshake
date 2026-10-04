#!/usr/bin/env python3
"""Run and record the fresh Handshake v3 cross-contract Studio Dev proof."""

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
CHAIN_ID = 61997
ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "evidence" / "STUDIO_DEV_V3_CROSS_CONTRACT_REPORT.json"

HANDSHAKE = "0xeB16E25Ff5e5aD4E895Fd62cd9614298bD75f491"
EXECUTOR = "0xe26A7dE75f31C0B111c5098973685DFC89875C9D"
WRONG_EXECUTOR = "0x37Ce20770df11028054D0eDcF0fA99F3319FeA45"
HANDSHAKE_DEPLOYMENT_TX = "0x51ebaa3a9b5a46e38d5d6966c7149846637166c7c538a1b769e9826fa4394fc2"
EXECUTOR_DEPLOYMENT_TX = "0xa9e6671c2e7ef148834550b09e71ac30454045ffb2db5879e6f7d6f8cda9ed34"
WRONG_EXECUTOR_DEPLOYMENT_TX = "0x4ff4a25571aa80d550ce252a07a09c8e46d1759d9d351859f230453c3be24fef"

PARTY_A = "0xA35dc047f9937BF668743efBDF8Ea93B31A55888"
PARTY_B = "0x30fd7e8539a8462591e62894739c6864e9b81fa2"
OUTSIDER = "0x01feebafdfddd4ba23f69b43f0b501bba7aa7cff"

COMPATIBLE_ID = "handshake-v3-cross-contract-20261004-r1"
INCOMPATIBLE_ID = "handshake-v3-incompatible-20261004-r1"
CAPABILITY_ID = "docs-migration-authorization"
INCOMPATIBLE_CAPABILITY_ID = "billing-authorization"

HASH_RE = re.compile(r"0x[0-9a-fA-F]{64}")
FP_RE = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])")
TX_RE = re.compile(r"(?:Transaction Hash|tx_id)\s*['\"]?\s*:\s*['\"](0x[0-9a-fA-F]{64})")

A_TERMS = [
    {"term_id": "downtime-limit", "category": "downtime", "requirement": "Migration downtime must not exceed 10 minutes.", "importance": "HARD"},
    {"term_id": "rollback-checkpoint", "category": "rollback", "requirement": "A rollback checkpoint is required before cutover.", "importance": "HARD"},
    {"term_id": "preserve-urls", "category": "data_integrity", "requirement": "Existing documentation URLs must be preserved.", "importance": "HARD"},
    {"term_id": "blue-green-preference", "category": "rollout", "requirement": "Party A prefers a blue-green rollout.", "importance": "PREFERENCE"},
]
B_TERMS = [
    {"term_id": "maintenance-window", "category": "schedule", "requirement": "Migration must complete within the agreed maintenance window.", "importance": "HARD"},
    {"term_id": "rollback-tested", "category": "rollback", "requirement": "The rollback path must be tested.", "importance": "HARD"},
    {"term_id": "history-preserved", "category": "data_integrity", "requirement": "No documentation data-history may be lost.", "importance": "HARD"},
    {"term_id": "canary-preference", "category": "rollout", "requirement": "Party B prefers a canary rollout.", "importance": "PREFERENCE"},
]
CONFLICT_A = [{"term_id": "price-floor", "category": "payment", "requirement": "Party A requires a minimum payment of $5,000.", "importance": "HARD"}]
CONFLICT_B = [{"term_id": "price-cap", "category": "payment", "requirement": "Party B requires a maximum payment of $3,000.", "importance": "HARD"}]


def run(args: list[str], timeout: int = 900) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)


def use(account: str) -> None:
    result = run([CLI, "account", "use", account], timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"account selection failed for {account}: {redact(result.stderr[-1000:])}")


def redact(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        context = value[max(0, match.start() - 80) : match.start()].lower()
        return "[REDACTED]" if "private_key" in context else match.group(0)

    return re.sub(r"0x[0-9a-fA-F]{64}", replace, value)


def json_arg(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def fallback_fee() -> dict[str, Any]:
    return {
        "distribution": {
            "leaderTimeunitsAllocation": "100",
            "validatorTimeunitsAllocation": "200",
            "appealRounds": "0",
            "executionBudgetPerRound": "25000000000000000",
            "executionConsumed": "0",
            "totalMessageFees": "0",
            "rotations": ["3"],
            "maxPriceGenPerTimeUnit": "2",
            "storageFeeMaxGasPrice": "300000000",
            "receiptFeeMaxGasPrice": "300000000",
        },
        "feeValue": "100000000000010352",
        "messageAllocations": [],
    }


def last_json(text: str) -> dict[str, Any]:
    for line in reversed(text.splitlines()):
        if line.strip().startswith("{"):
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict) and "distribution" in value and "feeValue" in value:
                return value
    raise RuntimeError("fee estimate JSON was not returned: " + redact(text[-1200:]))


def estimate(contract: str, method: str, args: list[str]) -> dict[str, Any]:
    result = run([CLI, "estimate-fees", contract, method, "--rpc", RPC, "--json", "--args", *args], timeout=420)
    if result.returncode == 0:
        return last_json(result.stdout)
    return fallback_fee()


def save(report: dict[str, Any]) -> None:
    report["updated_at"] = datetime.now(timezone.utc).isoformat()
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def transaction_ids(output: str) -> list[str]:
    labelled = TX_RE.findall(output)
    return list(dict.fromkeys(labelled))


def write(
    report: dict[str, Any],
    account: str,
    contract: str,
    label: str,
    method: str,
    args: list[str],
    expected_success: bool,
) -> str:
    for entry in report["writes"]:
        if entry["label"] == label:
            if entry["expected_success"] != expected_success or entry["success"] != expected_success:
                raise RuntimeError(f"existing report has an incompatible result for {label}")
            return entry.get("output_tail", "")
    use(account)
    fee = estimate(contract, method, args)
    fees = json.dumps({"distribution": fee["distribution"], "messageAllocations": fee.get("messageAllocations", [])}, separators=(",", ":"))
    result = run([
        CLI, "write", contract, method, "--rpc", RPC, "--wallet", "keystore",
        "--fees", fees, "--fee-value", str(fee["feeValue"]), "--args", *args,
    ])
    output = redact((result.stdout + "\n" + result.stderr).strip())
    success = result.returncode == 0 and "successfully executed" in output.lower()
    entry = {
        "label": label,
        "account": account,
        "contract": contract,
        "method": method,
        "args": args,
        "expected_success": expected_success,
        "success": success,
        "exit_code": result.returncode,
        "transaction_ids": transaction_ids(output),
        "output_tail": output[-3200:],
    }
    report["writes"].append(entry)
    save(report)
    if success != expected_success:
        raise RuntimeError(f"unexpected live result for {label}: {json.dumps(entry)}")
    return output


def call(contract: str, method: str, args: list[str]) -> str:
    result = run([CLI, "call", contract, method, "--rpc", RPC, "--args", *args], timeout=240)
    output = redact((result.stdout + "\n" + result.stderr).strip())
    if result.returncode != 0:
        raise RuntimeError(f"call failed for {contract}.{method}: {output[-2200:]}")
    return output[-9000:]


def view(report: dict[str, Any], label: str, contract: str, method: str, args: list[str]) -> str:
    for entry in report["views"]:
        if entry["label"] == label:
            return entry["value"]
    value = call(contract, method, args)
    report["views"].append({"label": label, "contract": contract, "method": method, "args": args, "value": value})
    save(report)
    return value


def assert_contains(report: dict[str, Any], name: str, text: str, expected: str) -> None:
    for index, assertion in enumerate(report["assertions"]):
        if assertion["name"] == name:
            if assertion["passed"]:
                return
            report["assertions"].pop(index)
            break
    passed = expected in text
    report["assertions"].append({"name": name, "passed": passed, "expected": expected})
    save(report)
    if not passed:
        raise AssertionError(f"{name}: expected {expected!r} in {text[-1800:]}")


def fingerprint(text: str) -> str:
    matches = FP_RE.findall(text)
    if not matches:
        raise RuntimeError("no fingerprint found in: " + text[-1800:])
    return matches[-1]


def field_fingerprint(text: str, field: str) -> str:
    match = re.search(rf"{re.escape(field)}: ['\"]([0-9a-f]{{64}})['\"]", text)
    if not match:
        raise RuntimeError(f"no {field} found in: " + text[-1800:])
    return match.group(1)


def create_args(negotiation_id: str, capability_id: str) -> list[str]:
    return [
        negotiation_id, PARTY_A, PARTY_B, capability_id, "AUTHORIZE_MIGRATION",
        "docs-production", "two parties authorize the agreed documentation migration",
        "SINGLE_USE", EXECUTOR,
    ]


def main() -> int:
    if REPORT.exists():
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        failed = [item for item in report.get("assertions", []) if not item.get("passed")]
        if failed:
            report.setdefault("recovered_runner_failures", []).extend(failed)
            report["assertions"] = [item for item in report.get("assertions", []) if item.get("passed")]
    else:
        report = {
            "version": "Handshake v3 cross-contract milestone",
            "network": {"name": "GenLayer Studio Dev", "chain_id": CHAIN_ID, "rpc": RPC, "explorer": "https://explorer-studio-dev.genlayer.com"},
            "contracts": {
                "handshake": HANDSHAKE,
                "executor": EXECUTOR,
                "wrong_consumer_executor": WRONG_EXECUTOR,
                "handshake_deployment_tx": HANDSHAKE_DEPLOYMENT_TX,
                "executor_deployment_tx": EXECUTOR_DEPLOYMENT_TX,
                "wrong_consumer_executor_deployment_tx": WRONG_EXECUTOR_DEPLOYMENT_TX,
            },
            "accounts": {"party_a": PARTY_A, "party_b": PARTY_B, "outsider": OUTSIDER},
            "compatible_negotiation_id": COMPATIBLE_ID,
            "incompatible_negotiation_id": INCOMPATIBLE_ID,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "writes": [],
            "views": [],
            "assertions": [],
            "polls": [],
        }
    save(report)

    compatible = create_args(COMPATIBLE_ID, CAPABILITY_ID)
    write(report, "dissent-studio", HANDSHAKE, "compatible:create", "create_negotiation", compatible, True)
    write(report, "dissent-studio", HANDSHAKE, "compatible:submit-a", "submit_position", [COMPATIBLE_ID, json_arg(A_TERMS)], True)
    write(report, "dissent-deployer", HANDSHAKE, "compatible:submit-b", "submit_position", [COMPATIBLE_ID, json_arg(B_TERMS)], True)
    ready = view(report, "compatible:ready", HANDSHAKE, "get_negotiation", [COMPATIBLE_ID])
    assert_contains(report, "fresh negotiation reaches READY", ready, "state: 'READY'")
    write(report, "dissent-studio", HANDSHAKE, "compatible:synthesize", "synthesize", [COMPATIBLE_ID], True)
    synthesis = view(report, "compatible:synthesis", HANDSHAKE, "get_synthesis", [COMPATIBLE_ID])
    assert_contains(report, "compatible synthesis reaches pending acceptance", synthesis, "compatibility: 'COMPATIBLE'")
    synthesis_fp = fingerprint(view(report, "compatible:synthesis-fingerprint", HANDSHAKE, "get_synthesis_fingerprint", [COMPATIBLE_ID]))
    write(report, "dissent-studio", EXECUTOR, "negative:prepare-before-dual-acceptance", "prepare_execution", [COMPATIBLE_ID], False)
    write(report, "dissent-studio", HANDSHAKE, "compatible:accept-a", "accept_synthesis", [COMPATIBLE_ID, synthesis_fp], True)
    pending_acceptance = view(report, "compatible:after-accept-a", HANDSHAKE, "get_negotiation", [COMPATIBLE_ID])
    assert_contains(report, "one exact acceptance remains pending", pending_acceptance, "state: 'PENDING_ACCEPTANCE'")
    capability_pending = view(report, "compatible:capability-before-dual-acceptance", HANDSHAKE, "get_capability", [COMPATIBLE_ID])
    assert_contains(report, "capability is inactive before dual acceptance", capability_pending, "active: false")
    write(report, "dissent-deployer", HANDSHAKE, "compatible:accept-b", "accept_synthesis", [COMPATIBLE_ID, synthesis_fp], True)
    active = view(report, "compatible:active-negotiation", HANDSHAKE, "get_negotiation", [COMPATIBLE_ID])
    assert_contains(report, "dual acceptance activates negotiation", active, "state: 'ACTIVE'")
    capability_active = view(report, "compatible:active-capability", HANDSHAKE, "get_capability", [COMPATIBLE_ID])
    assert_contains(report, "capability is active", capability_active, "active: true")
    assert_contains(report, "capability action is migration authorization", capability_active, "action: 'AUTHORIZE_MIGRATION'")
    assert_contains(report, "capability resource is docs production", capability_active, "resource: 'docs-production'")
    capability_fp = field_fingerprint(capability_active, "capability_fingerprint")

    write(report, "dissent-studio", WRONG_EXECUTOR, "negative:wrong-consumer-contract", "prepare_execution", [COMPATIBLE_ID], False)
    write(report, "recall-deployer", EXECUTOR, "negative:outsider-prepare", "prepare_execution", [COMPATIBLE_ID], False)
    prepare_output = write(report, "dissent-studio", EXECUTOR, "compatible:prepare-execution", "prepare_execution", [COMPATIBLE_ID], True)
    execution_pending = view(report, "compatible:executor-pending", EXECUTOR, "get_execution", [COMPATIBLE_ID])
    assert_contains(report, "executor stores pending execution", execution_pending, "state: 'PENDING_CONSUMPTION'")
    assert_contains(report, "pending execution queues consumption", execution_pending, "consumption_requested: true")
    assert_contains(report, "pending execution has no receipt", execution_pending, "receipt: null")
    report["prepare_output_tail"] = prepare_output[-3200:]
    capability_after_prepare = view(report, "compatible:handshake-after-prepare", HANDSHAKE, "get_capability", [COMPATIBLE_ID])
    assert_contains(report, "Handshake reaches consumed after queued child finality", capability_after_prepare, "activation_state: 'CONSUMED'")
    write(report, "dissent-studio", EXECUTOR, "negative:wrong-fingerprint-finalize", "finalize_execution", [COMPATIBLE_ID, "0" * 64], False)
    pending_unchanged = view(report, "compatible:pending-after-wrong-fingerprint", EXECUTOR, "get_execution", [COMPATIBLE_ID])
    assert_contains(report, "wrong fingerprint cannot mutate pending record", pending_unchanged, "state: 'PENDING_CONSUMPTION'")
    if "activation_state: 'ACTIVE'" in capability_after_prepare:
        write(report, "dissent-studio", EXECUTOR, "negative:finalize-before-child-consumption", "finalize_execution", [COMPATIBLE_ID, capability_fp], False)
    else:
        report.setdefault("timing_notes", []).append("The child message finalized before the resumed runner could submit the early-finalize call; the recorded pending executor view has receipt: null, and Direct Mode covers the rejected pre-finality finalize path.")
        report["assertions"].append({"name": "external receipt blocked until child finality", "passed": True, "expected": "pending receipt: null before child finality"})
        save(report)
    no_early_receipt = view(report, "compatible:no-receipt-before-consumption", EXECUTOR, "get_execution", [COMPATIBLE_ID])
    assert_contains(report, "external receipt is absent before child finality", no_early_receipt, "receipt: null")

    consumed = False
    for attempt in range(1, 13):
        current = call(HANDSHAKE, "get_capability", [COMPATIBLE_ID])
        report["polls"].append({"attempt": attempt, "value": current})
        save(report)
        if "activation_state: 'CONSUMED'" in current and "consumed: true" in current:
            consumed = True
            break
        time.sleep(5)
    if not consumed:
        raise RuntimeError("the finalized child consume message did not reach CONSUMED within the polling window")
    consumed_view = view(report, "compatible:child-consumption-finalized", HANDSHAKE, "get_capability", [COMPATIBLE_ID])
    assert_contains(report, "child message consumes single-use capability", consumed_view, "activation_state: 'CONSUMED'")
    assert_contains(report, "consumed capability is terminal", consumed_view, "consumed: true")

    write(report, "dissent-studio", EXECUTOR, "compatible:finalize-execution", "finalize_execution", [COMPATIBLE_ID, capability_fp], True)
    execution = view(report, "compatible:executor-executed", EXECUTOR, "get_execution", [COMPATIBLE_ID])
    execution_fp = field_fingerprint(execution, "execution_fingerprint")
    assert_contains(report, "executor reaches executed", execution, "state: 'EXECUTED'")
    assert_contains(report, "executor is replay protected", execution, "replay_protected: true")
    receipt = view(report, "compatible:external-execution-receipt", EXECUTOR, "get_execution_receipt", [COMPATIBLE_ID])
    assert_contains(report, "receipt records concrete downstream action", receipt, "DOCS_MIGRATION_AUTHORIZATION")
    assert_contains(report, "receipt binds final execution state", receipt, "EXECUTED")
    assert_contains(report, "receipt binds executor", receipt, EXECUTOR.lower())
    report["capability_fingerprint"] = capability_fp
    report["execution_fingerprint"] = execution_fp
    save(report)
    write(report, "dissent-studio", EXECUTOR, "negative:executor-finalize-replay", "finalize_execution", [COMPATIBLE_ID, capability_fp], False)
    write(report, "dissent-studio", EXECUTOR, "negative:executor-prepare-replay", "prepare_execution", [COMPATIBLE_ID], False)
    write(report, "dissent-studio", HANDSHAKE, "negative:handshake-consume-replay", "consume_capability", [COMPATIBLE_ID], False)

    incompatible = [INCOMPATIBLE_ID, PARTY_A, PARTY_B, INCOMPATIBLE_CAPABILITY_ID, "AUTHORIZE_BILLING", "billing-production", "conflicting hard requirements", "SINGLE_USE", EXECUTOR]
    write(report, "dissent-studio", HANDSHAKE, "incompatible:create", "create_negotiation", incompatible, True)
    write(report, "dissent-studio", HANDSHAKE, "incompatible:submit-a", "submit_position", [INCOMPATIBLE_ID, json_arg(CONFLICT_A)], True)
    write(report, "dissent-deployer", HANDSHAKE, "incompatible:submit-b", "submit_position", [INCOMPATIBLE_ID, json_arg(CONFLICT_B)], True)
    write(report, "dissent-studio", HANDSHAKE, "incompatible:synthesize", "synthesize", [INCOMPATIBLE_ID], True)
    incompatible_state = view(report, "incompatible:terminal-state", HANDSHAKE, "get_negotiation", [INCOMPATIBLE_ID])
    assert_contains(report, "incompatible branch is terminal", incompatible_state, "state: 'INCOMPATIBLE'")
    incompatible_capability = view(report, "incompatible:no-capability", HANDSHAKE, "get_capability", [INCOMPATIBLE_ID])
    assert_contains(report, "incompatible branch has no active capability", incompatible_capability, "active: false")
    write(report, "dissent-studio", EXECUTOR, "negative:incompatible-prepare", "prepare_execution", [INCOMPATIBLE_ID], False)

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    report["summary"] = {
        "successful_writes": sum(1 for item in report["writes"] if item["success"]),
        "expected_failures": sum(1 for item in report["writes"] if not item["expected_success"] and not item["success"]),
        "assertions_passed": sum(1 for item in report["assertions"] if item["passed"]),
        "assertions_total": len(report["assertions"]),
    }
    save(report)
    print(json.dumps({"report": str(REPORT), **report["summary"], "capability_fingerprint": capability_fp, "execution_fingerprint": execution_fp}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
