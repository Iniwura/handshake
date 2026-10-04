# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

"""Reusable cross-contract capability executor for Handshake v3.

The executor deliberately separates the authorization snapshot from the
downstream receipt.  ``prepare_execution`` performs synchronous IC reads and
queues a finalized internal message to Handshake.  ``finalize_execution`` is
called in a later transaction and can commit the downstream receipt only when
the Handshake view proves that the queued message reached its final state.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, NoReturn

try:
    import genlayer as gl
    from genlayer.types import Address

    _contract_base = gl.contract.Contract
except ImportError:
    from genlayer import gl  # type: ignore[no-redef]
    from genlayer.py.types import Address  # pyright: ignore[reportMissingImports]

    _contract_base = gl.Contract


PENDING_CONSUMPTION = "PENDING_CONSUMPTION"
EXECUTED = "EXECUTED"
SINGLE_USE = "SINGLE_USE"
REUSABLE = "REUSABLE"
ACTIVE = "ACTIVE"
CONSUMED = "CONSUMED"
DOWNSTREAM_ACTION = "DOCS_MIGRATION_AUTHORIZATION"

MAX_NEGOTIATION_ID = 96
MAX_FINGERPRINT = 64


def _error(message: str) -> NoReturn:
    raise gl.vm.UserError(message)


def _identifier(value: Any, field: str, maximum: int) -> str:
    if type(value) is not str or not value.strip():
        _error(field + " must not be empty.")
    value = value.strip()
    if len(value) > maximum or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value):
        _error(field + " must be an ASCII identifier.")
    return value


def _fingerprint(value: Any, field: str) -> str:
    if type(value) is not str or not re.fullmatch(r"[0-9a-f]{64}", value):
        _error(field + " must be a lowercase SHA-256 fingerprint.")
    return value


def _address_key(value: Address) -> str:
    if isinstance(value, bytes):
        value = Address(value)
    return value.as_hex.lower()


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(label: str, value: Any) -> str:
    return hashlib.sha256(_canonical([label, value]).encode("utf-8")).hexdigest()


# The installed Studio Dev SDK exposes this as gl.contract.interface.  The
# fallback keeps the contract source compatible with the newer docs spelling.
try:
    _contract_interface = gl.contract.interface
except AttributeError:
    _contract_interface = gl.contract_interface


@_contract_interface
class HandshakeInterface:
    class View:
        def get_capability(self, negotiation_id: str) -> dict[str, Any]: ...

    class Write:
        def consume_capability(self, negotiation_id: str) -> None: ...


@gl.storage.allow
@dataclass
class ExecutionRecord:
    negotiation_id: str
    handshake_address: str
    executor_address: str
    prepared_by: str
    execution_id: str
    capability_id: str
    capability_fingerprint: str
    action: str
    resource: str
    scope: str
    mode: str
    state: str
    consumption_requested: bool
    execution_fingerprint: str
    receipt_json: str


class HandshakeExecutor(_contract_base):  # pyright: ignore[reportGeneralTypeIssues]
    """A reusable, replay-protected external consumer of Handshake capabilities."""

    handshake_address: str
    executions: gl.storage.TreeMap[str, ExecutionRecord]

    def __init__(self, handshake_address: Address):
        self.handshake_address = _address_key(handshake_address)

    @gl.public.write
    def prepare_execution(self, negotiation_id: str) -> str:
        negotiation_id = _identifier(negotiation_id, "negotiation_id", MAX_NEGOTIATION_ID)
        if self.executions.get(negotiation_id, None) is not None:
            _error("the negotiation already has a local execution record.")

        capability = self._read_capability(negotiation_id)
        self._require_active_capability(capability, negotiation_id)

        sender = _address_key(gl.message.sender_address)
        if sender not in {capability["party_a"], capability["party_b"]}:
            _error("only a declared negotiation party may prepare execution.")

        executor_address = _address_key(gl.message.contract_address)
        if capability["consumer"] != executor_address:
            _error("the Handshake capability is bound to a different consumer.")

        capability_fingerprint = _fingerprint(
            capability["capability_fingerprint"], "capability_fingerprint"
        )
        execution_id = _digest(
            "HANDSHAKE-EXECUTION-V3",
            {
                "handshake_address": self.handshake_address,
                "executor_address": executor_address,
                "negotiation_id": negotiation_id,
                "capability_fingerprint": capability_fingerprint,
            },
        )
        snapshot = self._authorization_snapshot(
            capability,
            negotiation_id,
            capability_fingerprint,
            executor_address,
        )
        self.executions[negotiation_id] = ExecutionRecord(
            negotiation_id=negotiation_id,
            handshake_address=self.handshake_address,
            executor_address=executor_address,
            prepared_by=sender,
            execution_id=execution_id,
            capability_id=snapshot["capability_id"],
            capability_fingerprint=capability_fingerprint,
            action=snapshot["action"],
            resource=snapshot["resource"],
            scope=snapshot["scope"],
            mode=snapshot["mode"],
            state=PENDING_CONSUMPTION,
            consumption_requested=True,
            execution_fingerprint="",
            receipt_json="",
        )

        # Internal writes are asynchronous.  The local record is intentionally
        # PENDING until a later finalize_execution view observes CONSUMED.
        HandshakeInterface(Address(self.handshake_address)).emit(on="finalized").consume_capability(
            negotiation_id
        )
        return execution_id

    @gl.public.write
    def finalize_execution(
        self,
        negotiation_id: str,
        expected_capability_fingerprint: str,
    ) -> str:
        negotiation_id = _identifier(negotiation_id, "negotiation_id", MAX_NEGOTIATION_ID)
        expected_capability_fingerprint = _fingerprint(
            expected_capability_fingerprint, "expected_capability_fingerprint"
        )
        record = self._get_execution(negotiation_id)
        if record.state != PENDING_CONSUMPTION:
            _error("only a pending execution can be finalized.")
        if expected_capability_fingerprint != record.capability_fingerprint:
            _error("finalization fingerprint does not match the immutable pending record.")
        if _address_key(gl.message.sender_address) != record.prepared_by:
            _error("only the preparing negotiation party may finalize execution.")

        capability = self._read_capability(negotiation_id)
        self._require_snapshot(record, capability)
        if record.mode == SINGLE_USE:
            if capability["activation_state"] != CONSUMED or capability["consumed"] is not True:
                _error("Handshake consumption has not finalized.")
        elif record.mode == REUSABLE:
            if capability["activation_state"] != ACTIVE or capability["active"] is not True:
                _error("the reusable Handshake capability is no longer active.")
        else:
            _error("the pending record contains an unsupported mode.")

        execution_fingerprint = _digest(
            "HANDSHAKE-DOWNSTREAM-EXECUTION-V3",
            {
                "handshake_address": record.handshake_address,
                "negotiation_id": record.negotiation_id,
                "capability_id": record.capability_id,
                "capability_fingerprint": record.capability_fingerprint,
                "action": record.action,
                "resource": record.resource,
                "scope": record.scope,
                "mode": record.mode,
                "executor_address": record.executor_address,
                "execution_id": record.execution_id,
                "final_execution_state": EXECUTED,
            },
        )
        receipt = {
            "receipt_type": "HANDSHAKE_DOWNSTREAM_EXECUTION",
            "downstream_action": DOWNSTREAM_ACTION,
            "handshake_address": record.handshake_address,
            "negotiation_id": record.negotiation_id,
            "capability_id": record.capability_id,
            "capability_fingerprint": record.capability_fingerprint,
            "action": record.action,
            "resource": record.resource,
            "scope": record.scope,
            "mode": record.mode,
            "executor_address": record.executor_address,
            "execution_id": record.execution_id,
            "final_execution_state": EXECUTED,
            "execution_fingerprint": execution_fingerprint,
        }
        record.state = EXECUTED
        record.execution_fingerprint = execution_fingerprint
        record.receipt_json = _canonical(receipt)
        self.executions[record.negotiation_id] = record
        return execution_fingerprint

    @gl.public.view
    def get_execution(self, negotiation_id: str) -> dict[str, Any]:
        record = self._get_execution(negotiation_id)
        receipt = json.loads(record.receipt_json) if record.receipt_json else None
        return {
            "negotiation_id": record.negotiation_id,
            "handshake_address": record.handshake_address,
            "executor_address": record.executor_address,
            "prepared_by": record.prepared_by,
            "execution_id": record.execution_id,
            "capability_id": record.capability_id,
            "capability_fingerprint": record.capability_fingerprint,
            "action": record.action,
            "resource": record.resource,
            "scope": record.scope,
            "mode": record.mode,
            "state": record.state,
            "consumption_requested": record.consumption_requested,
            "execution_fingerprint": record.execution_fingerprint,
            "receipt": receipt,
            "replay_protected": record.state == EXECUTED,
        }

    @gl.public.view
    def get_execution_receipt(self, negotiation_id: str) -> dict[str, Any]:
        record = self._get_execution(negotiation_id)
        if not record.receipt_json:
            _error("downstream execution has not been finalized.")
        return json.loads(record.receipt_json)

    @gl.public.view
    def get_handshake_address(self) -> str:
        return self.handshake_address

    def _handshake(self) -> Any:
        return HandshakeInterface(Address(self.handshake_address))

    def _read_capability(self, negotiation_id: str) -> dict[str, Any]:
        return self._handshake().view().get_capability(negotiation_id)

    def _require_active_capability(
        self, capability: dict[str, Any], negotiation_id: str
    ) -> None:
        if capability["negotiation_id"] != negotiation_id:
            _error("the Handshake view returned an incompatible negotiation.")
        if capability["activation_state"] != ACTIVE or capability["active"] is not True:
            _error("only an ACTIVE Handshake capability can be prepared.")
        if capability["consumed"] is not False:
            _error("a consumed capability cannot be prepared again.")
        if capability["mode"] not in {SINGLE_USE, REUSABLE}:
            _error("the Handshake capability mode is unsupported.")

    def _authorization_snapshot(
        self,
        capability: dict[str, Any],
        negotiation_id: str,
        capability_fingerprint: str,
        executor_address: str,
    ) -> dict[str, str]:
        required = {
            "negotiation_id": negotiation_id,
            "capability_id": capability["capability_id"],
            "action": capability["action"],
            "resource": capability["resource"],
            "scope": capability["scope"],
            "mode": capability["mode"],
            "consumer": capability["consumer"],
            "capability_fingerprint": capability_fingerprint,
            "executor_address": executor_address,
        }
        if required["consumer"] != executor_address:
            _error("the configured Handshake consumer is not this executor.")
        return {
            "capability_id": str(required["capability_id"]),
            "action": str(required["action"]),
            "resource": str(required["resource"]),
            "scope": str(required["scope"]),
            "mode": str(required["mode"]),
        }

    def _require_snapshot(
        self, record: ExecutionRecord, capability: dict[str, Any]
    ) -> None:
        expected = {
            "negotiation_id": record.negotiation_id,
            "capability_id": record.capability_id,
            "action": record.action,
            "resource": record.resource,
            "scope": record.scope,
            "mode": record.mode,
            "consumer": record.executor_address,
            "capability_fingerprint": record.capability_fingerprint,
        }
        for key, value in expected.items():
            if capability.get(key) != value:
                _error("Handshake authorization changed after prepare_execution.")

    def _get_execution(self, negotiation_id: str) -> ExecutionRecord:
        record = self.executions.get(negotiation_id, None)
        if record is None:
            _error("unknown execution negotiation ID.")
        return record


del _contract_base
