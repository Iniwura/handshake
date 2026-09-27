export type AgreementDraft = {
  id: string;
  partyA: string;
  partyB: string;
  capabilityId: string;
  action: string;
  resource: string;
  scope: string;
  mode: "SINGLE_USE" | "REUSABLE";
  consumer: string;
};

export const WIZARD_STEPS = [
  { index: 0, label: "Agreement", eyebrow: "1 / 4 Agreement" },
  { index: 1, label: "Parties", eyebrow: "2 / 4 Parties" },
  { index: 2, label: "Authorization", eyebrow: "3 / 4 Authorization" },
  { index: 3, label: "Review", eyebrow: "4 / 4 Review" },
] as const;

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function requiredText(value: string): boolean {
  return value.trim().length > 0;
}

function validateAddress(label: string, value: string): string {
  if (!requiredText(value)) return `Enter ${label}'s wallet address.`;
  if (!ADDRESS_PATTERN.test(value.trim())) return `${label} needs a valid wallet address.`;
  return "";
}

function validateBoundedText(label: string, value: string, maximum: number): string {
  if (!requiredText(value)) return `Enter ${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}.`;
  if (value.trim().length > maximum) return `${label} must be ${maximum} characters or fewer.`;
  return "";
}

export function validateWizardStep(step: number, draft: AgreementDraft): string {
  if (step === 0) return validateBoundedText("agreement ID", draft.id, 96);

  if (step === 1) {
    const partyAError = validateAddress("Party A", draft.partyA);
    if (partyAError) return partyAError;
    const partyBError = validateAddress("Party B", draft.partyB);
    if (partyBError) return partyBError;
    if (draft.partyA.trim().toLowerCase() === draft.partyB.trim().toLowerCase()) return "Party A and Party B must be different wallets.";
    return "";
  }

  if (step === 2) {
    const capabilityError = validateBoundedText("capability ID", draft.capabilityId, 96);
    if (capabilityError) return capabilityError;
    const actionError = validateBoundedText("action", draft.action, 160);
    if (actionError) return actionError;
    const resourceError = validateBoundedText("resource", draft.resource, 160);
    if (resourceError) return resourceError;
    const scopeError = validateBoundedText("scope", draft.scope, 320);
    if (scopeError) return scopeError;
    if (draft.mode !== "SINGLE_USE" && draft.mode !== "REUSABLE") return "Choose how this capability can be used.";
    return validateAddress("the configured consumer", draft.consumer);
  }

  return "";
}

export function isValidWizardStep(step: number, draft: AgreementDraft): boolean {
  return validateWizardStep(step, draft) === "";
}
