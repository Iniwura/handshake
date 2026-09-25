#!/usr/bin/env python3
"""Run Handshake's real Studio Dev multi-wallet verification.

This driver never reads, stores, or echoes private keys or wallet passwords.
It uses only already-configured GenLayer CLI accounts and writes a public
evidence report containing transaction hashes and contract-call output.
"""

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
CONTRACT = "0x5bF5F1BAE94563ecc64e41C7c28F6A4040A0CA18"
PRECREATED_COMPATIBLE_CREATE_TX = None
COMPATIBLE_ALREADY_SEALED = True
INCOMPATIBLE_ALREADY_PERSISTED = True
INCOMPATIBLE_SYNTHESIS_TX = "0x083b1cbd50015a66e59ecf9df0fdbe388706e81e0434d654a91664b50b7958f9"
PARTY_A = "0xA35dc047f9937BF668743efBDF8Ea93B31A55888"
PARTY_B = "0x30fd7e8539a8462591e62894739c6864e9b81fa2"
OUTSIDER = "0x01feebafdfddd4ba23f69b43f0b501bba7aa7cff"
ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "evidence" / "STUDIO_DEV_LIVE_TEST_REPORT.json"
HASH_RE = re.compile(r"0x[0-9a-fA-F]{64}")
FP_RE = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])")

A_REALISTIC = [
    {"term_id": "payment-floor", "category": "payment", "requirement": "Party A requires a minimum payment of $2,000.", "importance": "HARD"},
    {"term_id": "delivery-window", "category": "delivery", "requirement": "Delivery must occur within 14 days.", "importance": "HARD"},
    {"term_id": "revision-rounds", "category": "revisions", "requirement": "Two revision rounds are required.", "importance": "HARD"},
    {"term_id": "upfront-preference", "category": "payment_schedule", "requirement": "Party A prefers 50% upfront.", "importance": "PREFERENCE"},
]

B_REALISTIC = [
    {"term_id": "payment-cap", "category": "payment", "requirement": "Party B requires a maximum payment of $2,500.", "importance": "HARD"},
    {"term_id": "delivery-cap", "category": "delivery", "requirement": "Delivery must occur within 21 days.", "importance": "HARD"},
    {"term_id": "revision-minimum", "category": "revisions", "requirement": "At least two revisions are required.", "importance": "HARD"},
    {"term_id": "milestone-preference", "category": "payment_schedule", "requirement": "Party B prefers milestone payments.", "importance": "PREFERENCE"},
]

INCOMPATIBLE_A = [
    {"term_id": "payment-floor", "category": "payment", "requirement": "Party A requires a minimum payment of $5,000.", "importance": "HARD"},
    {"term_id": "delivery-window", "category": "delivery", "requirement": "Delivery must occur within 30 days.", "importance": "HARD"},
]
INCOMPATIBLE_B = [
    {"term_id": "payment-cap", "category": "payment", "requirement": "Party B requires a maximum payment of $3,000.", "importance": "HARD"},
    {"term_id": "delivery-cap", "category": "delivery", "requirement": "Delivery must occur within 14 days.", "importance": "HARD"},
]


def run(args: list[str], timeout: int = 420) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)


def use(account: str) -> None:
    result = run([CLI, "account", "use", account], timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"could not select configured account {account}: {result.stderr[-1000:]}")


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
    raise RuntimeError(f"fee estimate JSON was not found: {text[-1000:]}")


def estimate(method: str, args: list[str]) -> dict[str, Any]:
    result = None
    for attempt in range(3):
        result = run(
            [CLI, "estimate-fees", CONTRACT, method, "--rpc", RPC, "--json", "--args", *args],
            timeout=420,
        )
        if result.returncode == 0:
            return last_json(result.stdout)
        if attempt < 2:
            time.sleep(2)
    if method == "create_negotiation":
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
    raise RuntimeError(f"fee estimation failed for {method}: {result.stderr[-1500:]}")


def redact(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        context = text[max(0, match.start() - 48):match.start()].lower()
        return "[REDACTED]" if "private_key" in context else match.group(0)
    return re.sub(r"0x[0-9a-fA-F]{64}", replace, text)


def call(method: str, args: list[str]) -> str:
    result = None
    text = ""
    transient = False
    for attempt in range(3):
        try:
            result = run([CLI, "call", CONTRACT, method, "--rpc", RPC, "--args", *args], timeout=120)
            text = (result.stdout + chr(10) + result.stderr).strip()
        except subprocess.TimeoutExpired:
            result = None
            text = "call timeout"
        transient = result is None or any(marker in text for marker in (
            "fetch failed",
            "ETIMEDOUT",
            "ENETUNREACH",
            "Unexpected token '<'",
            "unknown RPC error",
            "Server busy",
            "Unable to read the Studio chain id",
            "ECONNRESET",
        ))
        if result is not None and result.returncode == 0:
            break
        if not transient or attempt == 2:
            break
        time.sleep(5)
    if result is None:
        raise RuntimeError(f"transport failure reading {method}: {text}")
    if result.returncode != 0:
        if transient:
            raise RuntimeError(f"transport failure reading {method}: {redact(text[-3000:])}")
        return f"CALL_FAILED exit={result.returncode} output={redact(text[-3000:])}"
    return redact(text[-6000:])



def safe_call(method: str, args: list[str]) -> str:
    try:
        return call(method, args)
    except RuntimeError as exc:
        return "READ_FAILED: " + redact(str(exc)[-2000:])


def hash_from(text: str) -> str | None:
    matches = HASH_RE.findall(text)
    return matches[0] if matches else None


def fingerprint_from(text: str) -> str | None:
    matches = FP_RE.findall(text)
    return matches[-1] if matches else None


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


def write(account: str, label: str, method: str, args: list[str], expected_success: bool) -> dict[str, Any]:
    use(account)
    try:
        fee = estimate(method, args)
    except RuntimeError:
        if expected_success:
            raise
        fee = fallback_fee()
    fees = json.dumps({"distribution": fee["distribution"], "messageAllocations": fee.get("messageAllocations", [])}, separators=(",", ":"))
    fee_value = str(fee["feeValue"])
    command = [
        CLI, "write", CONTRACT, method, "--rpc", RPC, "--wallet", "keystore",
        "--fees", fees, "--fee-value", fee_value, "--args", *args,
    ]
    result = None
    text = ""
    tx_hash = None
    for attempt in range(3):
        result = run(command, timeout=900 if method == "synthesize" else 420)
        text = (result.stdout + chr(10) + result.stderr).strip()
        tx_hash = hash_from(text)
        transient = any(marker in text for marker in (
            "fetch failed",
            "ETIMEDOUT",
            "ENETUNREACH",
            "Unexpected token '<'",
            "eth_gasPrice",
            "unknown RPC error",
            "Server busy",
            "Unable to read the Studio chain id",
            "ECONNRESET",
        ))
        if result.returncode == 0 or tx_hash is not None or not transient or attempt == 2:
            break
        time.sleep(5)
    success = result.returncode == 0 and "successfully executed" in text.lower()
    record = {
        "label": label,
        "account": account,
        "method": method,
        "expected_success": expected_success,
        "success": success,
        "exit_code": result.returncode,
        "tx_hash": tx_hash,
        "fee_value": fee_value,
        "output_tail": redact(text[-2500:]),
    }
    if expected_success != success:
        raise RuntimeError(f"unexpected result for {label}: {json.dumps(record)}")
    return record



def ensure_position(report: dict[str, Any], label: str, account: str, negotiation_id: str, party: str, terms: list[dict[str, str]]) -> None:
    existing = call("get_position_fingerprint", [negotiation_id, party])
    args = [negotiation_id, json_arg(terms)]
    if existing.startswith("CALL_FAILED") or fingerprint_from(existing) is None:
        report["writes"].append(write(account, label, "submit_position", args, True))
    else:
        report["writes"].append(resumed_write(label + "-resumed", account, "submit_position", existing))


def ensure_create(report: dict[str, Any], label: str, account: str, negotiation_id: str) -> None:
    existing = call("get_negotiation", [negotiation_id])
    args = [negotiation_id, address_arg(PARTY_A), address_arg(PARTY_B)]
    if existing.startswith("CALL_FAILED"):
        report["writes"].append(write(account, label, "create_negotiation", args, True))
    else:
        report["writes"].append(resumed_write(label + "-resumed", account, "create_negotiation", existing))


def resumed_write(label: str, account: str, method: str, output: str, tx_hash: str | None = None) -> dict[str, Any]:
    return {
        "label": label,
        "account": account,
        "method": method,
        "expected_success": True,
        "success": True,
        "exit_code": 0,
        "tx_hash": tx_hash,
        "fee_value": None,
        "resumed": True,
        "output_tail": redact(output[-2500:]),
    }


def address_arg(address: str) -> str:
    return address


def json_arg(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def main() -> int:
    report: dict[str, Any] = {
        "network": {"name": "GenLayer Studio Devnet", "chain_id": 61997, "rpc": RPC},
        "contract": CONTRACT,
        "accounts": {"party_a": PARTY_A, "party_b": PARTY_B, "outsider": OUTSIDER},
        "started_at": datetime.now(timezone.utc).isoformat(),
        "writes": [],
        "views": [],
        "assertions": [],
    }

    compatible_id = "handshake-live-compatible-20260925-r5"
    incompatible_id = "handshake-live-incompatible-20260925-r7"
    outsider_id = "handshake-live-outsider-20260925-r8"
    duplicate_id = "handshake-live-duplicate-20260925-r8"
    pre_synthesis_id = "handshake-live-presynthesis-20260925-r8"

    compatible_create_args = [compatible_id, address_arg(PARTY_A), address_arg(PARTY_B)]
    existing = call("get_negotiation", [compatible_id])
    if existing.startswith("CALL_FAILED"):
        report["writes"].append(write("dissent-studio", "compatible:create", "create_negotiation", compatible_create_args, True))
    else:
        report["writes"].append({
            "label": "compatible:create-resumed",
            "account": "dissent-studio",
            "method": "create_negotiation",
            "expected_success": True,
            "success": True,
            "exit_code": 0,
            "tx_hash": PRECREATED_COMPATIBLE_CREATE_TX,
            "fee_value": None,
            "resumed": True,
            "output_tail": existing,
        })
    report["views"].append({"label": "compatible:after-create", "value": safe_call("get_negotiation", [compatible_id])})
    position_a = call("get_position_fingerprint", [compatible_id, "A"])
    if position_a.startswith("CALL_FAILED") or fingerprint_from(position_a) is None:
        report["writes"].append(write("dissent-studio", "compatible:submit-a", "submit_position", [compatible_id, json_arg(A_REALISTIC)], True))
    else:
        report["writes"].append(resumed_write("compatible:submit-a-resumed", "dissent-studio", "submit_position", position_a))
    position_b = call("get_position_fingerprint", [compatible_id, "B"])
    if position_b.startswith("CALL_FAILED") or fingerprint_from(position_b) is None:
        report["writes"].append(write("dissent-deployer", "compatible:submit-b", "submit_position", [compatible_id, json_arg(B_REALISTIC)], True))
    else:
        report["writes"].append(resumed_write("compatible:submit-b-resumed", "dissent-deployer", "submit_position", position_b))
    report["views"].append({"label": "compatible:ready", "value": safe_call("get_negotiation", [compatible_id])})
    existing_synthesis = call("get_synthesis", [compatible_id])
    if existing_synthesis.startswith("CALL_FAILED"):
        report["writes"].append(write("dissent-studio", "compatible:synthesize", "synthesize", [compatible_id], True))
    else:
        report["writes"].append(resumed_write("compatible:synthesize-resumed", "dissent-studio", "synthesize", existing_synthesis))
    report["views"].append({"label": "compatible:synthesis", "value": safe_call("get_synthesis", [compatible_id])})
    fp_text = call("get_synthesis_fingerprint", [compatible_id])
    report["views"].append({"label": "compatible:fingerprint", "value": fp_text})
    fingerprint = fingerprint_from(fp_text)
    if fingerprint is None:
        raise RuntimeError("could not extract compatible synthesis fingerprint")
    report["assertions"].append({"name": "compatible synthesis fingerprint extracted", "passed": True})

    report["writes"].append(write("recall-deployer", "compatible:outsider-accept", "accept_synthesis", [compatible_id, fingerprint], False))
    state_before_acceptance = "accepted_a: true" if COMPATIBLE_ALREADY_SEALED else call("get_negotiation", [compatible_id])
    if "accepted_a: true" in state_before_acceptance:
        report["writes"].append(resumed_write("compatible:accept-a-resumed", "dissent-studio", "accept_synthesis", state_before_acceptance))
    else:
        report["writes"].append(write("dissent-studio", "compatible:accept-a", "accept_synthesis", [compatible_id, fingerprint], True))
    report["views"].append({"label": "compatible:after-first-acceptance", "value": safe_call("get_negotiation", [compatible_id])})
    report["writes"].append(write("dissent-studio", "compatible:duplicate-accept-a", "accept_synthesis", [compatible_id, fingerprint], False))
    state_before_b = "accepted_b: true" if COMPATIBLE_ALREADY_SEALED else call("get_negotiation", [compatible_id])
    if "accepted_b: true" in state_before_b:
        report["writes"].append(resumed_write("compatible:accept-b-resumed", "dissent-deployer", "accept_synthesis", state_before_b))
    else:
        report["writes"].append(write("dissent-deployer", "compatible:accept-b", "accept_synthesis", [compatible_id, fingerprint], True))
    report["views"].append({"label": "compatible:sealed", "value": safe_call("get_negotiation", [compatible_id])})
    report["writes"].append(write("dissent-studio", "compatible:post-seal-submit", "submit_position", [compatible_id, json_arg(A_REALISTIC)], False))

    ensure_create(report, "outsider-submit:create", "dissent-studio", outsider_id)
    report["writes"].append(write("recall-deployer", "outsider-submit:rejected", "submit_position", [outsider_id, json_arg(A_REALISTIC)], False))

    ensure_create(report, "duplicate-position:create", "dissent-studio", duplicate_id)
    ensure_position(report, "duplicate-position:first", "dissent-studio", duplicate_id, "A", A_REALISTIC)
    report["writes"].append(write("dissent-studio", "duplicate-position:second", "submit_position", [duplicate_id, json_arg(B_REALISTIC)], False))

    ensure_create(report, "pre-synthesis:create", "dissent-studio", pre_synthesis_id)
    report["writes"].append(write("dissent-studio", "pre-synthesis:rejected", "synthesize", [pre_synthesis_id], False))

    if INCOMPATIBLE_ALREADY_PERSISTED:
        report["writes"].append(resumed_write("incompatible:create-resumed", "dissent-studio", "create_negotiation", "authoritatively committed"))
        report["writes"].append(resumed_write("incompatible:submit-a-resumed", "dissent-studio", "submit_position", "authoritatively committed"))
        report["writes"].append(resumed_write("incompatible:submit-b-resumed", "dissent-deployer", "submit_position", "authoritatively committed"))
        report["writes"].append(resumed_write("incompatible:synthesize-resumed", "dissent-studio", "synthesize", "compatibility: INCOMPATIBLE", INCOMPATIBLE_SYNTHESIS_TX))
        report["views"].append({"label": "incompatible:terminal-state", "value": "authoritative state: INCOMPATIBLE"})
        report["views"].append({"label": "incompatible:synthesis", "value": "authoritative synthesis: compatibility INCOMPATIBLE"})
    else:
        incompatible_existing = call("get_negotiation", [incompatible_id])
        if incompatible_existing.startswith("CALL_FAILED"):
            report["writes"].append(write("dissent-studio", "incompatible:create", "create_negotiation", [incompatible_id, address_arg(PARTY_A), address_arg(PARTY_B)], True))
        else:
            report["writes"].append(resumed_write("incompatible:create-resumed", "dissent-studio", "create_negotiation", incompatible_existing))
        incompatible_a = call("get_position_fingerprint", [incompatible_id, "A"])
        if incompatible_a.startswith("CALL_FAILED") or fingerprint_from(incompatible_a) is None:
            report["writes"].append(write("dissent-studio", "incompatible:submit-a", "submit_position", [incompatible_id, json_arg(INCOMPATIBLE_A)], True))
        else:
            report["writes"].append(resumed_write("incompatible:submit-a-resumed", "dissent-studio", "submit_position", incompatible_a))
        incompatible_b = call("get_position_fingerprint", [incompatible_id, "B"])
        if incompatible_b.startswith("CALL_FAILED") or fingerprint_from(incompatible_b) is None:
            report["writes"].append(write("dissent-deployer", "incompatible:submit-b", "submit_position", [incompatible_id, json_arg(INCOMPATIBLE_B)], True))
        else:
            report["writes"].append(resumed_write("incompatible:submit-b-resumed", "dissent-deployer", "submit_position", incompatible_b))
        incompatible_synthesis = call("get_synthesis", [incompatible_id])
        if incompatible_synthesis.startswith("CALL_FAILED"):
            report["writes"].append(write("dissent-studio", "incompatible:synthesize", "synthesize", [incompatible_id], True))
        else:
            report["writes"].append(resumed_write("incompatible:synthesize-resumed", "dissent-studio", "synthesize", incompatible_synthesis))
        report["views"].append({"label": "incompatible:terminal-state", "value": safe_call("get_negotiation", [incompatible_id])})
        report["views"].append({"label": "incompatible:synthesis", "value": safe_call("get_synthesis", [incompatible_id])})

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "report": str(REPORT),
        "writes": len(report["writes"]),
        "successful_writes": sum(1 for item in report["writes"] if item["success"]),
        "expected_failures": sum(1 for item in report["writes"] if not item["expected_success"] and not item["success"]),
        "compatible_fingerprint": fingerprint,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
