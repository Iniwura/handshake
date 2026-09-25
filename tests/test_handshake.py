from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest


CONTRACT = Path(__file__).resolve().parents[1] / "contracts" / "handshake.py"


A_REALISTIC = [
    {
        "term_id": "payment-floor",
        "category": "payment",
        "requirement": "Party A requires a minimum payment of $2,000.",
        "importance": "HARD",
    },
    {
        "term_id": "delivery-window",
        "category": "delivery",
        "requirement": "Delivery must occur within 14 days.",
        "importance": "HARD",
    },
    {
        "term_id": "revision-rounds",
        "category": "revisions",
        "requirement": "Two revision rounds are required.",
        "importance": "HARD",
    },
    {
        "term_id": "upfront-preference",
        "category": "payment_schedule",
        "requirement": "Party A prefers 50% upfront.",
        "importance": "PREFERENCE",
    },
]

B_REALISTIC = [
    {
        "term_id": "payment-cap",
        "category": "payment",
        "requirement": "Party B requires a maximum payment of $2,500.",
        "importance": "HARD",
    },
    {
        "term_id": "delivery-cap",
        "category": "delivery",
        "requirement": "Delivery must occur within 21 days.",
        "importance": "HARD",
    },
    {
        "term_id": "revision-minimum",
        "category": "revisions",
        "requirement": "At least two revisions are required.",
        "importance": "HARD",
    },
    {
        "term_id": "milestone-preference",
        "category": "payment_schedule",
        "requirement": "Party B prefers milestone payments.",
        "importance": "PREFERENCE",
    },
]



def address_type(contract):
    return __import__(contract.__class__.__module__, fromlist=["Address"]).Address



def create(contract, direct_vm, alice, bob, negotiation_id="n1"):
    direct_vm.sender = alice
    Address = address_type(contract)
    return contract.create_negotiation(
        negotiation_id,
        Address(alice),
        Address(bob),
    )



def setup_ready(
    direct_deploy,
    direct_vm,
    alice,
    bob,
    negotiation_id="n1",
    party_a_terms=None,
    party_b_terms=None,
):
    contract = direct_deploy(CONTRACT)
    create(contract, direct_vm, alice, bob, negotiation_id)
    direct_vm.sender = alice
    contract.submit_position(
        negotiation_id,
        copy.deepcopy(A_REALISTIC if party_a_terms is None else party_a_terms),
    )
    direct_vm.sender = bob
    contract.submit_position(
        negotiation_id,
        copy.deepcopy(B_REALISTIC if party_b_terms is None else party_b_terms),
    )
    return contract



def compatible_synthesis():
    return {
        "compatibility": "COMPATIBLE",
        "proposed_terms": [
            {
                "synthesis_id": "payment",
                "category": "payment",
                "agreement": "Payment is between $2,000 and $2,500.",
                "source_terms": [
                    {"party": "A", "term_id": "payment-floor"},
                    {"party": "B", "term_id": "payment-cap"},
                ],
            },
            {
                "synthesis_id": "delivery",
                "category": "delivery",
                "agreement": "Delivery occurs within 14 days.",
                "source_terms": [
                    {"party": "A", "term_id": "delivery-window"},
                    {"party": "B", "term_id": "delivery-cap"},
                ],
            },
            {
                "synthesis_id": "revisions",
                "category": "revisions",
                "agreement": "At least two revision rounds are included.",
                "source_terms": [
                    {"party": "A", "term_id": "revision-rounds"},
                    {"party": "B", "term_id": "revision-minimum"},
                ],
            },
            {
                "synthesis_id": "payment-schedule",
                "category": "payment_schedule",
                "agreement": "The parties may use milestone payments while preserving the hard terms.",
                "source_terms": [
                    {"party": "A", "term_id": "upfront-preference"},
                    {"party": "B", "term_id": "milestone-preference"},
                ],
            },
        ],
        "conflicts": [],
        "unresolved_items": [],
    }



def configure_synthesis(direct_vm, result, validation=True):
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r"HANDSHAKE_DATA_BEGIN", json.dumps(result))
    direct_vm.mock_llm(
        r"HANDSHAKE_VALIDATION_BEGIN",
        json.dumps({"valid": validation, "reason": "independent semantic review"}),
    )



def synthesize(contract, direct_vm, result, negotiation_id="n1"):
    configure_synthesis(direct_vm, result)
    return contract.synthesize(negotiation_id)



def test_valid_negotiation_creation_and_fingerprints(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    negotiation_fingerprint = create(contract, direct_vm, direct_alice, direct_bob)
    stored = contract.get_negotiation("n1")
    assert stored["fingerprint"] == negotiation_fingerprint
    assert stored["state"] == "OPEN"
    assert stored["party_a"] != stored["party_b"]
    assert stored["party_a_position"] == []
    assert stored["synthesis_fingerprint"] == ""



def test_same_wallet_cannot_be_both_parties(
    direct_deploy, direct_vm, direct_alice
):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    Address = address_type(contract)
    with pytest.raises(Exception):
        contract.create_negotiation("same", Address(direct_alice), Address(direct_alice))



def test_duplicate_negotiation_id_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    create(contract, direct_vm, direct_alice, direct_bob)
    with pytest.raises(Exception):
        create(contract, direct_vm, direct_alice, direct_bob, "n1")


@pytest.mark.parametrize(
    "negotiation_id",
    ["", "x" * 97, "bad id", "bad/slash", "évidence"],
)
def test_negotiation_id_bounds_and_schema(
    direct_deploy, direct_vm, direct_alice, direct_bob, negotiation_id
):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    Address = address_type(contract)
    with pytest.raises(Exception):
        contract.create_negotiation(
            negotiation_id,
            Address(direct_alice),
            Address(direct_bob),
        )



def test_position_submissions_move_open_to_ready(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    create(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    a_fingerprint = contract.submit_position("n1", copy.deepcopy(A_REALISTIC))
    assert contract.get_negotiation("n1")["state"] == "OPEN"
    direct_vm.sender = direct_bob
    b_fingerprint = contract.submit_position("n1", copy.deepcopy(B_REALISTIC))
    stored = contract.get_negotiation("n1")
    assert stored["state"] == "READY"
    assert stored["party_a_position_fingerprint"] == a_fingerprint
    assert stored["party_b_position_fingerprint"] == b_fingerprint
    assert contract.get_position_fingerprint("n1", "A") == a_fingerprint
    assert contract.get_position_fingerprint("n1", "B") == b_fingerprint



def test_outsider_submission_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy(CONTRACT)
    create(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_charlie
    with pytest.raises(Exception):
        contract.submit_position("n1", copy.deepcopy(A_REALISTIC))
    assert contract.get_negotiation("n1")["state"] == "OPEN"



def test_duplicate_position_rejected_and_immutable(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    create(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    fingerprint = contract.submit_position("n1", copy.deepcopy(A_REALISTIC))
    with pytest.raises(Exception):
        contract.submit_position("n1", copy.deepcopy(B_REALISTIC))
    assert contract.get_position_fingerprint("n1", "A") == fingerprint


@pytest.mark.parametrize(
    "terms",
    [
        [],
        A_REALISTIC[:1] * 17,
        [dict(A_REALISTIC[0], term_id="bad id")],
        [dict(A_REALISTIC[0], requirement="x" * 769)],
        [dict(A_REALISTIC[0], category="bad category")],
        [A_REALISTIC[0], dict(A_REALISTIC[0])],
    ],
)
def test_position_bounds_and_duplicate_term_ids(
    direct_deploy, direct_vm, direct_alice, direct_bob, terms
):
    contract = direct_deploy(CONTRACT)
    create(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.submit_position("n1", copy.deepcopy(terms))
    assert contract.get_negotiation("n1")["party_a_position"] == []



def test_invalid_importance_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    create(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    invalid = [dict(A_REALISTIC[0], importance="OPTIONAL")]
    with pytest.raises(Exception):
        contract.submit_position("n1", invalid)



def test_synthesize_before_both_positions_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    create(contract, direct_vm, direct_alice, direct_bob)
    with pytest.raises(Exception):
        contract.synthesize("n1")
    direct_vm.sender = direct_alice
    contract.submit_position("n1", copy.deepcopy(A_REALISTIC))
    with pytest.raises(Exception):
        contract.synthesize("n1")



def test_compatible_hard_ranges_and_preferences_synthesize(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    result = synthesize(contract, direct_vm, compatible_synthesis())
    assert result["compatibility"] == "COMPATIBLE"
    assert result["conflicts"] == []
    assert result["unresolved_items"] == []
    assert contract.get_negotiation("n1")["state"] == "PENDING_ACCEPTANCE"
    assert contract.get_synthesis("n1")["synthesis_fingerprint"]


@pytest.mark.parametrize(
    "party_a_terms,party_b_terms",
    [
        (
            [
                {
                    "term_id": "price-floor",
                    "category": "payment",
                    "requirement": "Party A requires a minimum payment of $3,000.",
                    "importance": "HARD",
                }
            ],
            [
                {
                    "term_id": "price-cap",
                    "category": "payment",
                    "requirement": "Party B requires a maximum payment of $2,500.",
                    "importance": "HARD",
                }
            ],
        ),
        (
            [
                {
                    "term_id": "ownership-a",
                    "category": "ownership",
                    "requirement": "Party A owns all intellectual property exclusively.",
                    "importance": "HARD",
                }
            ],
            [
                {
                    "term_id": "ownership-b",
                    "category": "ownership",
                    "requirement": "Party B owns all intellectual property exclusively.",
                    "importance": "HARD",
                }
            ],
        ),
    ],
)
def test_hard_conflicts_cannot_return_compatible(
    direct_deploy,
    direct_vm,
    direct_alice,
    direct_bob,
    party_a_terms,
    party_b_terms,
):
    contract = setup_ready(
        direct_deploy,
        direct_vm,
        direct_alice,
        direct_bob,
        party_a_terms=party_a_terms,
        party_b_terms=party_b_terms,
    )
    bad = {
        "compatibility": "COMPATIBLE",
        "proposed_terms": [
            {
                "synthesis_id": "bad",
                "category": party_a_terms[0]["category"],
                "agreement": "Both requirements are accepted as written.",
                "source_terms": [
                    {"party": "A", "term_id": party_a_terms[0]["term_id"]},
                    {"party": "B", "term_id": party_b_terms[0]["term_id"]},
                ],
            }
        ],
        "conflicts": [],
        "unresolved_items": [],
    }
    configure_synthesis(direct_vm, bad)
    with pytest.raises(Exception):
        contract.synthesize("n1")
    assert contract.get_negotiation("n1")["state"] == "READY"



def test_independent_semantic_validator_rejection_leaves_state_unchanged(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    configure_synthesis(direct_vm, compatible_synthesis(), validation=False)
    with pytest.raises(Exception):
        contract.synthesize("n1")
    stored = contract.get_negotiation("n1")
    assert stored["state"] == "READY"
    assert stored["synthesis_fingerprint"] == ""



def test_irreconcilable_hard_scenario_persists_incompatible(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    party_a = [
        {
            "term_id": "price-floor",
            "category": "payment",
            "requirement": "Party A requires a minimum payment of $3,000.",
            "importance": "HARD",
        }
    ]
    party_b = [
        {
            "term_id": "price-cap",
            "category": "payment",
            "requirement": "Party B requires a maximum payment of $2,500.",
            "importance": "HARD",
        }
    ]
    contract = setup_ready(
        direct_deploy,
        direct_vm,
        direct_alice,
        direct_bob,
        party_a_terms=party_a,
        party_b_terms=party_b,
    )
    result = {
        "compatibility": "INCOMPATIBLE",
        "proposed_terms": [],
        "conflicts": [
            {
                "synthesis_id": "price-conflict",
                "description": "The minimum exceeds the maximum.",
                "source_terms": [
                    {"party": "A", "term_id": "price-floor"},
                    {"party": "B", "term_id": "price-cap"},
                ],
            }
        ],
        "unresolved_items": [],
    }
    stored = synthesize(contract, direct_vm, result)
    assert stored["compatibility"] == "INCOMPATIBLE"
    assert contract.get_negotiation("n1")["state"] == "INCOMPATIBLE"
    fingerprint = stored["synthesis_fingerprint"]
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.accept_synthesis("n1", fingerprint)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.accept_synthesis("n1", fingerprint)
    assert contract.get_negotiation("n1")["state"] == "INCOMPATIBLE"


@pytest.mark.parametrize("mutation", ["missing", "extra", "enum"])
def test_malformed_synthesis_schema_and_enums_leave_state_unchanged(
    direct_deploy, direct_vm, direct_alice, direct_bob, mutation
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    bad = compatible_synthesis()
    if mutation == "missing":
        del bad["conflicts"]
    elif mutation == "extra":
        bad["extra"] = True
    else:
        bad["compatibility"] = "MAYBE"
    configure_synthesis(direct_vm, bad)
    with pytest.raises(Exception):
        contract.synthesize("n1")
    stored = contract.get_negotiation("n1")
    assert stored["state"] == "READY"
    assert stored["synthesis_fingerprint"] == ""


@pytest.mark.parametrize("mutation", ["unknown", "wrong-party", "duplicate-id", "invented"])
def test_synthesis_grounding_and_duplicate_validation(
    direct_deploy, direct_vm, direct_alice, direct_bob, mutation
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    bad = compatible_synthesis()
    if mutation == "unknown":
        bad["proposed_terms"][0]["source_terms"][0]["term_id"] = "unknown"
    elif mutation == "wrong-party":
        bad["proposed_terms"][0]["source_terms"][0] = {
            "party": "A",
            "term_id": "payment-cap",
        }
    elif mutation == "duplicate-id":
        duplicate = copy.deepcopy(bad["proposed_terms"][0])
        bad["proposed_terms"].append(duplicate)
    else:
        bad["proposed_terms"][0]["category"] = "penalty"
    configure_synthesis(direct_vm, bad)
    with pytest.raises(Exception):
        contract.synthesize("n1")
    assert contract.get_negotiation("n1")["state"] == "READY"



def test_source_party_aliases_are_canonicalized_and_unknown_values_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    candidate = compatible_synthesis()
    for collection in ("proposed_terms", "conflicts", "unresolved_items"):
        for item in candidate[collection]:
            for source in item["source_terms"]:
                source["party"] = "Party A" if source["party"] == "A" else "b"
    result = synthesize(contract, direct_vm, candidate)
    assert all(
        source["party"] in {"A", "B"}
        for collection in ("proposed_terms", "conflicts", "unresolved_items")
        for item in result[collection]
        for source in item["source_terms"]
    )

    invalid = compatible_synthesis()
    invalid["proposed_terms"][0]["source_terms"][0]["party"] = "C"
    configure_synthesis(direct_vm, invalid)
    with pytest.raises(Exception):
        contract.synthesize("n1")


def test_preferences_cannot_override_hard_requirements(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    party_a = [
        {
            "term_id": "delivery-hard",
            "category": "delivery",
            "requirement": "Delivery must occur within 14 days.",
            "importance": "HARD",
        },
        {
            "term_id": "delivery-preference",
            "category": "delivery",
            "requirement": "Party A prefers delivery within 7 days.",
            "importance": "PREFERENCE",
        },
    ]
    party_b = [
        {
            "term_id": "delivery-b",
            "category": "delivery",
            "requirement": "Delivery must occur within 21 days.",
            "importance": "HARD",
        }
    ]
    contract = setup_ready(
        direct_deploy,
        direct_vm,
        direct_alice,
        direct_bob,
        party_a_terms=party_a,
        party_b_terms=party_b,
    )
    bad = {
        "compatibility": "COMPATIBLE",
        "proposed_terms": [
            {
                "synthesis_id": "hard-delivery",
                "category": "delivery",
                "agreement": "Delivery within 14 days.",
                "source_terms": [
                    {"party": "A", "term_id": "delivery-hard"},
                    {"party": "B", "term_id": "delivery-b"},
                ],
            },
            {
                "synthesis_id": "preference-wins",
                "category": "delivery",
                "agreement": "Delivery within 7 days overrides the hard boundary.",
                "source_terms": [{"party": "A", "term_id": "delivery-preference"}],
            },
        ],
        "conflicts": [],
        "unresolved_items": [],
    }
    configure_synthesis(direct_vm, bad)
    with pytest.raises(Exception):
        contract.synthesize("n1")



def test_failed_synthesis_does_not_mutate_lifecycle_state(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    configure_synthesis(direct_vm, "not-json")
    with pytest.raises(Exception):
        contract.synthesize("n1")
    stored = contract.get_negotiation("n1")
    assert stored["state"] == "READY"
    assert stored["synthesis_fingerprint"] == ""
    assert stored["accepted_a"] is False
    assert stored["accepted_b"] is False



def test_synthesis_is_immutable_and_repeated_synthesis_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    first = synthesize(contract, direct_vm, compatible_synthesis())
    fingerprint = first["synthesis_fingerprint"]
    with pytest.raises(Exception):
        contract.synthesize("n1")
    assert contract.get_synthesis_fingerprint("n1") == fingerprint



def test_outsider_acceptance_and_wrong_fingerprint_rejected(
    direct_deploy, direct_vm, direct_alice, direct_bob, direct_charlie
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    result = synthesize(contract, direct_vm, compatible_synthesis())
    fingerprint = result["synthesis_fingerprint"]
    direct_vm.sender = direct_charlie
    with pytest.raises(Exception):
        contract.accept_synthesis("n1", fingerprint)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.accept_synthesis("n1", "0" * 64)
    assert contract.get_negotiation("n1")["state"] == "PENDING_ACCEPTANCE"



def test_first_acceptance_does_not_seal_and_duplicate_does_not_count_twice(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    fingerprint = synthesize(contract, direct_vm, compatible_synthesis())["synthesis_fingerprint"]
    direct_vm.sender = direct_alice
    assert contract.accept_synthesis("n1", fingerprint) == "PENDING_ACCEPTANCE"
    with pytest.raises(Exception):
        contract.accept_synthesis("n1", fingerprint)
    stored = contract.get_negotiation("n1")
    assert stored["accepted_a"] is True
    assert stored["accepted_b"] is False
    assert stored["state"] == "PENDING_ACCEPTANCE"



def test_second_distinct_acceptance_seals_and_sealed_is_terminal(
    direct_deploy, direct_vm, direct_alice, direct_bob
):
    contract = setup_ready(direct_deploy, direct_vm, direct_alice, direct_bob)
    fingerprint = synthesize(contract, direct_vm, compatible_synthesis())["synthesis_fingerprint"]
    direct_vm.sender = direct_alice
    contract.accept_synthesis("n1", fingerprint)
    direct_vm.sender = direct_bob
    assert contract.accept_synthesis("n1", fingerprint) == "SEALED"
    stored = contract.get_negotiation("n1")
    assert stored["accepted_a"] is True
    assert stored["accepted_b"] is True
    assert stored["state"] == "SEALED"
    with pytest.raises(Exception):
        contract.accept_synthesis("n1", fingerprint)
    with pytest.raises(Exception):
        contract.synthesize("n1")
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        contract.submit_position("n1", copy.deepcopy(A_REALISTIC))
