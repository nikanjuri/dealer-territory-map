type DealerIdentity = {
  dealer: string;
  pincode: string;
  address?: string | null;
};

export function normalizeDealerIdentityText(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function dealerIdentitiesMatch(
  candidate: DealerIdentity,
  existing: DealerIdentity,
) {
  if (
    normalizeDealerIdentityText(candidate.dealer) !==
    normalizeDealerIdentityText(existing.dealer)
  ) {
    return false;
  }

  if (candidate.pincode === existing.pincode) return true;

  const candidateAddress = candidate.address
    ? normalizeDealerIdentityText(candidate.address)
    : "";
  const existingAddress = existing.address
    ? normalizeDealerIdentityText(existing.address)
    : "";
  return Boolean(candidateAddress && candidateAddress === existingAddress);
}
