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

function hasSameTransactionId(userTx, exchangeTx) {
  return Boolean(
    userTx.transactionId &&
      exchangeTx.transactionId &&
      userTx.transactionId === exchangeTx.transactionId
  );
}

function scoreCandidate(candidate) {
  return candidate.deltas.timestampSeconds + candidate.deltas.quantityPct * 1000;
}

function isWithinMatchTolerance(candidate, tolerance) {
  return (
    candidate.deltas.timestampSeconds <= tolerance.timestampToleranceSeconds &&
    candidate.deltas.quantityPct <= tolerance.quantityTolerancePct
  );
}

function isWithinConflictTolerance(candidate, tolerance) {
  return (
    candidate.deltas.timestampSeconds <= tolerance.conflictWindowSeconds &&
    candidate.deltas.quantityPct <= tolerance.conflictQuantityTolerancePct
  );
}

function findBestCandidate(userTx, exchangePool, tolerance) {
  const sameIdCandidate = exchangePool.find((exchangeTx) =>
    hasSameTransactionId(userTx, exchangeTx)
  );

  if (sameIdCandidate) {
    const candidate = {
      exchangeTx: sameIdCandidate,
      deltas: getDeltas(userTx, sameIdCandidate),
      matchedBy: "transaction_id"
    };

    return {
      ...candidate,
      category:
        canCompare(userTx, sameIdCandidate) && isWithinMatchTolerance(candidate, tolerance)
          ? "MATCHED"
          : "CONFLICTING"
    };
  }

  const comparable = exchangePool
    .filter((exchangeTx) => canCompare(userTx, exchangeTx))
    .map((exchangeTx) => ({
      exchangeTx,
      deltas: getDeltas(userTx, exchangeTx),
      matchedBy: "proximity"
    }));

  if (!comparable.length) return null;

  const matched = comparable
    .filter((candidate) => isWithinMatchTolerance(candidate, tolerance))
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));

  if (matched.length) {
    return { ...matched[0], category: "MATCHED" };
  }

  const conflicting = comparable
    .filter((candidate) => isWithinConflictTolerance(candidate, tolerance))
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));

  if (conflicting.length) {
    return { ...conflicting[0], category: "CONFLICTING" };
  }

  return null;
}

function buildConflictReason(entry, tolerance) {
  const { userTx, exchangeTx, deltas, matchedBy } = entry;
  const reasons = [];

  if (matchedBy === "transaction_id") reasons.push("same transaction_id");
  if (userTx && exchangeTx && userTx.normalized.asset !== exchangeTx.normalized.asset) {
    reasons.push(`asset differs (${userTx.normalized.asset} vs ${exchangeTx.normalized.asset})`);
  }
  if (
    userTx &&
    exchangeTx &&
    !areTypesCompatible(userTx.normalized.type, exchangeTx.normalized.type)
  ) {
    reasons.push(`type differs (${userTx.normalized.type} vs ${exchangeTx.normalized.type})`);
  }
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
