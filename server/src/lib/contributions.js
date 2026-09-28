/** Pure helpers for merging per-member contributions (DESIGN §2.3.3, BR-16). */

/**
 * Combine contributions from several lines: one entry per member, quantities summed,
 * earliest firstAddedAt kept, ordered by firstAddedAt then memberId.
 */
function mergeContributions(contribs) {
  const byMember = new Map();
  for (const c of contribs) {
    const prev = byMember.get(c.memberId);
    if (!prev) byMember.set(c.memberId, { ...c });
    else {
      prev.quantity += c.quantity;
      if (c.firstAddedAt < prev.firstAddedAt) prev.firstAddedAt = c.firstAddedAt;
    }
  }
  return [...byMember.values()].sort((a, b) => a.firstAddedAt - b.firstAddedAt || a.memberId.localeCompare(b.memberId));
}

/** Trim so Σ quantity ≤ cap, taking from the LATEST contributor first. Returns { kept, capped }. */
function trimToCap(contribs, cap) {
  const list = contribs.map((c) => ({ ...c }));
  let excess = list.reduce((s, c) => s + c.quantity, 0) - cap;
  const capped = excess > 0;
  for (let i = list.length - 1; i >= 0 && excess > 0; i--) {
    const cut = Math.min(list[i].quantity, excess);
    list[i].quantity -= cut;
    excess -= cut;
  }
  return { kept: list.filter((c) => c.quantity > 0), capped };
}

module.exports = { mergeContributions, trimToCap };
