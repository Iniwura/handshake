from __future__ import annotations

import copy
import io
import json
from pathlib import Path
from typing import Any

import pytest

from gltest.direct import VMContext
from gltest.direct import loader as direct_loader
from gltest.direct import wasi_mock


HANDSHAKE = Path(__file__).resolve().parents[1] / "contracts" / "handshake.py"
EXECUTOR = Path(__file__).resolve().parents[1] / "contracts" / "executor.py"


def install_current_sdk_wasi_compat() -> None:
    """Adapt gltest 0.29's legacy import to the cached Studio Dev SDK namespace."""
    if getattr(wasi_mock, "_current_sdk_compat", False):
        return

    def gl_call_current(data: bytes, /) -> int:
        vm = wasi_mock.get_vm()
        try:
            from genlayer import calldata

            request = calldata.decode(data)
        except Exception as error:
            vm._trace(f"current SDK gl_call decode error: {error}")
            return 2**32 - 1
        response = wasi_mock._handle_gl_call(vm, request)
        if response is None:
            return 2**32 - 1
        from genlayer import calldata

        encoded = response if isinstance(response, bytes) else calldata.encode(response)
        fd_buffers = getattr(wasi_mock._local, "fd_buffers", {})
        fd = getattr(wasi_mock._local, "fd_counter", 100)
        wasi_mock._local.fd_counter = fd + 1
        fd_buffers[fd] = io.BytesIO(encoded)
        wasi_mock._local.fd_buffers = fd_buffers
        return fd

    wasi_mock.gl_call = gl_call_current
    wasi_mock._current_sdk_compat = True


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


def compatible_synthesis() -> dict[str, Any]:
    return {
        "compatibility": "COMPATIBLE",
        "proposed_terms": [
            {"synthesis_id": "downtime", "category": "downtime", "agreement": "Downtime stays within 10 minutes.", "source_terms": [{"party": "A", "term_id": "downtime-limit"}, {"party": "B", "term_id": "maintenance-window"}]},
            {"synthesis_id": "rollback", "category": "rollback", "agreement": "A tested rollback checkpoint is required before cutover.", "source_terms": [{"party": "A", "term_id": "rollback-checkpoint"}, {"party": "B", "term_id": "rollback-tested"}]},
            {"synthesis_id": "integrity", "category": "data_integrity", "agreement": "Existing documentation URLs and history are preserved.", "source_terms": [{"party": "A", "term_id": "preserve-urls"}, {"party": "B", "term_id": "history-preserved"}]},
            {"synthesis_id": "rollout", "category": "rollout", "agreement": "The parties may choose a blue-green or canary rollout.", "source_terms": [{"party": "A", "term_id": "blue-green-preference"}, {"party": "B", "term_id": "canary-preference"}]},
        ],
        "conflicts": [],
        "unresolved_items": [],
    }


def address_type(contract: Any) -> type:
    return __import__(contract.__class__.__module__, fromlist=["Address"]).Address


def key(address: Any) -> str:
    if isinstance(address, bytes):
        address = address_type_from_sdk()(address)
    return address.as_hex.lower()


def address_type_from_sdk() -> type:
    from genlayer.types import Address

    return Address


def invoke(vm: VMContext, function: Any, *args: Any) -> Any:
    """Run a contract call with the target VM as the active WASI context."""
    previous = wasi_mock.get_vm()
    wasi_mock.set_vm(vm)
    vm._refresh_gl_message()
    from genlayer import message
    Address = address_type_from_sdk()
    contract_address = Address(vm._contract_address)
    message.contract_address = contract_address
    if isinstance(getattr(message, "raw", None), dict):
        message.raw["contract_address"] = contract_address
    try:
        return function(*args)
    finally:
        wasi_mock.set_vm(previous)
        previous._refresh_gl_message()
        previous_address = Address(previous._contract_address)
        message.contract_address = previous_address
        if isinstance(getattr(message, "raw", None), dict):
            message.raw["contract_address"] = previous_address


class CrossContractRouter:
    """Small Direct Mode adapter for actual SDK CallContract/EmitInternalMessage ops."""

    def __init__(self, handshake_vm: VMContext, handshake: Any, executor_vm: VMContext):
        self.handshake_vm = handshake_vm
        self.handshake = handshake
        self.executor_vm = executor_vm
        self.messages: list[dict[str, Any]] = []

    def __call__(self, caller_vm: VMContext, request: dict[str, Any]) -> Any:
        if "CallContract" in request:
            call = request["CallContract"]
            target = key(call["address"])
            if target != key(self.handshake_vm._contract_address):
                raise AssertionError("unexpected view target")
            calldata = call["calldata"]
            method = calldata[""]
            args = calldata.get("args", [])
            if method != "get_capability":
                raise AssertionError(f"unexpected view method: {method}")
            caller = self.handshake_vm.sender
            self.handshake_vm.sender = address_type_from_sdk()(caller_vm._contract_address)
            result = invoke(self.handshake_vm, getattr(self.handshake, method), *args)
            self.handshake_vm.sender = caller
            caller_vm._refresh_gl_message()
            from genlayer import calldata
            from genlayer.vm.public_abi import ResultCode

            return bytes((ResultCode.RETURN,)) + calldata.encode(result)

        if "EmitInternalMessage" in request:
            message = request["EmitInternalMessage"]
            assert message["on"] == "finalized"
            calldata = message["calldata"]
            self.messages.append(
                {
                    "target": key(message["address"]),
                    "method": calldata[""],
                    "args": calldata.get("args", []),
                    "sender": key(caller_vm._contract_address),
                }
            )
            return None

        return None

    def finalize(self) -> None:
        assert len(self.messages) == 1
        message = self.messages.pop()
        assert message["target"] == key(self.handshake_vm._contract_address)
        assert message["method"] == "consume_capability"
        assert message["sender"] == key(self.executor_vm._contract_address)
        self.handshake_vm.sender = address_type_from_sdk()(self.executor_vm._contract_address)
        invoke(self.handshake_vm, self.handshake.consume_capability, *message["args"])


def deploy_pair(direct_alice: Any) -> tuple[VMContext, Any, VMContext, Any, CrossContractRouter, Any]:
    install_current_sdk_wasi_compat()
    handshake_vm = VMContext()
    handshake_vm.sender = direct_alice
    executor_vm = VMContext()
    executor_vm.sender = direct_alice
    handshake = direct_loader.deploy_contract(HANDSHAKE, handshake_vm)
    Address = address_type(handshake)
    handshake_address = Address(handshake_vm._contract_address)
    executor = direct_loader.deploy_contract(EXECUTOR, executor_vm, handshake_address)
    executor_address = Address(executor_vm._contract_address)
    router = CrossContractRouter(handshake_vm, handshake, executor_vm)
    executor_vm._gl_call_hook = router
    return handshake_vm, handshake, executor_vm, executor, router, executor_address


def setup_compatible(
    handshake_vm: VMContext,
    handshake: Any,
    executor_address: Any,
    direct_alice: Any,
    direct_bob: Any,
    negotiation_id: str = "v3-compatible",
) -> str:
    Address = address_type(handshake)
    handshake_vm.sender = direct_alice
    invoke(
        handshake_vm,
        handshake.create_negotiation,
        negotiation_id,
        Address(direct_alice),
        Address(direct_bob),
        "docs-migration-authorization-" + negotiation_id,
        "AUTHORIZE_MIGRATION",
        "docs-production",
        "production documentation migration",
        "SINGLE_USE",
        executor_address,
    )
    invoke(handshake_vm, handshake.submit_position, negotiation_id, copy.deepcopy(A_TERMS))
    handshake_vm.sender = direct_bob
    invoke(handshake_vm, handshake.submit_position, negotiation_id, copy.deepcopy(B_TERMS))
    handshake_vm.mock_llm(r"HANDSHAKE_DATA_BEGIN", json.dumps(compatible_synthesis()))
    handshake_vm.mock_llm(
        r"HANDSHAKE_VALIDATION_BEGIN",
        json.dumps({"valid": True, "reason": "independent semantic review"}),
    )
    invoke(handshake_vm, handshake.synthesize, negotiation_id)
    synthesis_fp = invoke(handshake_vm, handshake.get_synthesis_fingerprint, negotiation_id)
    handshake_vm.sender = direct_alice
    invoke(handshake_vm, handshake.accept_synthesis, negotiation_id, synthesis_fp)
    handshake_vm.sender = direct_bob
    invoke(handshake_vm, handshake.accept_synthesis, negotiation_id, synthesis_fp)
    return negotiation_id


def test_cross_contract_prepare_finalize_and_replay_protection(
    direct_vm, direct_alice, direct_bob, direct_charlie
):
    handshake_vm, handshake, executor_vm, executor, router, executor_address = deploy_pair(direct_alice)
    negotiation_id = setup_compatible(
        handshake_vm, handshake, executor_address, direct_alice, direct_bob
    )
    capability = invoke(handshake_vm, handshake.get_capability, negotiation_id)
    assert capability["active"] is True
    assert capability["consumer"] == key(executor_address)

    executor_vm.sender = direct_charlie
    with pytest.raises(Exception, match="declared negotiation party"):
        invoke(executor_vm, executor.prepare_execution, negotiation_id)

    executor_vm.sender = direct_alice
    original_executor_address = executor_vm._contract_address
    executor_vm._contract_address = direct_charlie
    with pytest.raises(Exception, match="different consumer"):
        invoke(executor_vm, executor.prepare_execution, negotiation_id)
    executor_vm._contract_address = original_executor_address

    execution_id = invoke(executor_vm, executor.prepare_execution, negotiation_id)
    pending = invoke(executor_vm, executor.get_execution, negotiation_id)
    assert pending["execution_id"] == execution_id
    assert pending["state"] == "PENDING_CONSUMPTION"
    assert pending["receipt"] is None

    with pytest.raises(Exception, match="does not match"):
        invoke(executor_vm, executor.finalize_execution, negotiation_id, "0" * 64)
    unchanged = invoke(executor_vm, executor.get_execution, negotiation_id)
    assert unchanged["state"] == "PENDING_CONSUMPTION"
    assert unchanged["capability_fingerprint"] == pending["capability_fingerprint"]

    with pytest.raises(Exception, match="has not finalized"):
        invoke(
            executor_vm,
            executor.finalize_execution,
            negotiation_id,
            pending["capability_fingerprint"],
        )
    assert invoke(handshake_vm, handshake.get_capability, negotiation_id)["active"] is True

    router.finalize()
    assert invoke(handshake_vm, handshake.get_capability, negotiation_id)["activation_state"] == "CONSUMED"
    execution_fp = invoke(
        executor_vm,
        executor.finalize_execution,
        negotiation_id,
        pending["capability_fingerprint"],
    )
    receipt = invoke(executor_vm, executor.get_execution_receipt, negotiation_id)
    assert execution_fp == receipt["execution_fingerprint"]
    assert receipt["downstream_action"] == "DOCS_MIGRATION_AUTHORIZATION"
    assert receipt["handshake_address"] == key(handshake_vm._contract_address)
    assert receipt["capability_fingerprint"] == pending["capability_fingerprint"]
    assert receipt["final_execution_state"] == "EXECUTED"

    with pytest.raises(Exception, match="only a pending execution"):
        invoke(executor_vm, executor.finalize_execution, negotiation_id, pending["capability_fingerprint"])
    with pytest.raises(Exception, match="already has"):
        invoke(executor_vm, executor.prepare_execution, negotiation_id)

    executor_vm.sender = address_type(handshake)(executor_vm._contract_address)
    with pytest.raises(Exception, match="active capability"):
        invoke(handshake_vm, handshake.consume_capability, negotiation_id)


def test_cross_contract_fail_closed_before_dual_acceptance_and_for_incompatible(
    direct_vm, direct_alice, direct_bob
):
    handshake_vm, handshake, executor_vm, executor, router, executor_address = deploy_pair(direct_alice)
    Address = address_type(handshake)

    handshake_vm.sender = direct_alice
    invoke(
        handshake_vm,
        handshake.create_negotiation,
        "v3-before-acceptance",
        Address(direct_alice),
        Address(direct_bob),
        "cap-before-acceptance",
        "AUTHORIZE_MIGRATION",
        "docs-production",
        "production documentation migration",
        "SINGLE_USE",
        executor_address,
    )
    executor_vm.sender = direct_alice
    with pytest.raises(Exception, match="ACTIVE"):
        invoke(executor_vm, executor.prepare_execution, "v3-before-acceptance")

    invoke(
        handshake_vm,
        handshake.create_negotiation,
        "v3-incompatible",
        Address(direct_alice),
        Address(direct_bob),
        "cap-incompatible",
        "AUTHORIZE_MIGRATION",
        "docs-production",
        "production documentation migration",
        "SINGLE_USE",
        executor_address,
    )
    invoke(handshake_vm, handshake.submit_position, "v3-incompatible", copy.deepcopy([{
        "term_id": "price-floor", "category": "payment", "requirement": "Party A requires a minimum payment of $5,000.", "importance": "HARD"
    }]))
    handshake_vm.sender = direct_bob
    invoke(handshake_vm, handshake.submit_position, "v3-incompatible", copy.deepcopy([{
        "term_id": "price-cap", "category": "payment", "requirement": "Party B requires a maximum payment of $3,000.", "importance": "HARD"
    }]))
    handshake_vm.mock_llm(r"HANDSHAKE_DATA_BEGIN", json.dumps({
        "compatibility": "INCOMPATIBLE",
        "proposed_terms": [],
        "conflicts": [{"synthesis_id": "price-conflict", "description": "The hard payment bounds conflict.", "source_terms": [{"party": "A", "term_id": "price-floor"}, {"party": "B", "term_id": "price-cap"}]}],
        "unresolved_items": [],
    }))
    handshake_vm.mock_llm(
        r"HANDSHAKE_VALIDATION_BEGIN",
        json.dumps({"valid": True, "reason": "independent semantic review"}),
    )
    invoke(handshake_vm, handshake.synthesize, "v3-incompatible")
    assert invoke(handshake_vm, handshake.get_negotiation, "v3-incompatible")["state"] == "INCOMPATIBLE"
    with pytest.raises(Exception, match="ACTIVE"):
        invoke(executor_vm, executor.prepare_execution, "v3-incompatible")
