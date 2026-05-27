const { areTypesCompatible } = require("../ingestion/normalize");

function secondsBetween(left, right) {
  return Math.abs(left.getTime() - right.getTime()) / 1000;
}

function quantityDiffPct(userQuantity, exchangeQuantity) {
  if (userQuantity === 0) return exchangeQuantity === 0 ? 0 : Infinity;
  return (Math.abs(userQuantity - exchangeQuantity) / Math.abs(userQuantity)) * 100;
}

function getDeltas(userTx, exchangeTx) {
  return {
    timestampSeconds: secondsBetween(
      userTx.normalized.timestamp,
      exchangeTx.normalized.timestamp
    ),
    quantityPct: quantityDiffPct(userTx.normalized.quantity, exchangeTx.normalized.quantity)
  };
}

function canCompare(userTx, exchangeTx) {
  return (
    userTx.normalized.asset === exchangeTx.normalized.asset &&
    areTypesCompatible(userTx.normalized.type, exchangeTx.normalized.type)
  );
}

function scoreCandidate(candidate) {
  return candidate.deltas.timestampSeconds + candidate.deltas.quantityPct * 1000;
}

function findBestCandidate(userTx, exchangePool, tolerance) {
  const comparable = exchangePool
    .filter((exchangeTx) => canCompare(userTx, exchangeTx))
    .map((exchangeTx) => ({
      exchangeTx,
      deltas: getDeltas(userTx, exchangeTx)
    }));

  if (!comparable.length) return null;

  const matched = comparable
    .filter(
      (candidate) =>
        candidate.deltas.timestampSeconds <= tolerance.timestampToleranceSeconds &&
        candidate.deltas.quantityPct <= tolerance.quantityTolerancePct
    )
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));

  if (matched.length) {
    return { ...matched[0], category: "MATCHED" };
  }

  const conflictWindowSeconds = Math.max(tolerance.timestampToleranceSeconds * 6, 3600);
  const conflicting = comparable
    .filter(
      (candidate) =>
        candidate.deltas.timestampSeconds <= conflictWindowSeconds ||
        candidate.deltas.quantityPct <= tolerance.quantityTolerancePct
    )
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));

  if (conflicting.length) {
    return { ...conflicting[0], category: "CONFLICTING" };
  }

  return null;
}

function buildConflictReason(deltas, tolerance) {
  const reasons = [];

  if (deltas.timestampSeconds > tolerance.timestampToleranceSeconds) {
    reasons.push(`timestamp differs by ${Math.round(deltas.timestampSeconds)}s`);
  }

  if (deltas.quantityPct > tolerance.quantityTolerancePct) {
    reasons.push(`quantity differs by ${deltas.quantityPct.toFixed(4)}%`);
  }

  return reasons.join("; ");
}

module.exports = {
  findBestCandidate,
  buildConflictReason,
  getDeltas,
  quantityDiffPct
};
