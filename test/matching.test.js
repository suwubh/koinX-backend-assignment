const test = require("node:test");
const assert = require("node:assert/strict");
const { findBestCandidate, quantityDiffPct } = require("../src/matching/candidateMatcher");

const tolerance = {
  timestampToleranceSeconds: 300,
  quantityTolerancePct: 0.01,
  conflictWindowSeconds: 3600,
  conflictQuantityTolerancePct: 1
};

function tx({ id, transactionId, timestamp, type, asset, quantity }) {
  return {
    _id: id,
    transactionId,
    normalized: {
      timestamp: new Date(timestamp),
      type,
      asset,
      quantity
    }
  };
}

test("matches transfer out from user to transfer in from exchange", () => {
  const userTx = tx({
    id: "user-1",
    timestamp: "2024-03-02T14:45:00Z",
    type: "TRANSFER_OUT",
    asset: "ETH",
    quantity: 1
  });

  const exchangeTx = tx({
    id: "exchange-1",
    timestamp: "2024-03-02T14:45:00Z",
    type: "TRANSFER_IN",
    asset: "ETH",
    quantity: 1
  });

  const candidate = findBestCandidate(userTx, [exchangeTx], tolerance);

  assert.equal(candidate.category, "MATCHED");
  assert.equal(candidate.exchangeTx._id, "exchange-1");
});

test("marks close transaction as conflicting when quantity is outside tolerance", () => {
  const userTx = tx({
    id: "user-1",
    timestamp: "2024-03-06T13:30:00Z",
    type: "BUY",
    asset: "BTC",
    quantity: 0.3
  });

  const exchangeTx = tx({
    id: "exchange-1",
    timestamp: "2024-03-06T13:30:00Z",
    type: "BUY",
    asset: "BTC",
    quantity: 0.3001
  });

  const candidate = findBestCandidate(userTx, [exchangeTx], tolerance);

  assert.equal(candidate.category, "CONFLICTING");
  assert.equal(Number(candidate.deltas.quantityPct.toFixed(4)), 0.0333);
});

test("quantity percentage difference is based on the user row", () => {
  assert.equal(Number(quantityDiffPct(0.3, 0.3001).toFixed(4)), 0.0333);
});

test("uses exact transaction id before proximity matching", () => {
  const userTx = tx({
    id: "user-1",
    transactionId: "shared-123",
    timestamp: "2024-03-06T13:30:00Z",
    type: "BUY",
    asset: "BTC",
    quantity: 0.3
  });

  const sameIdExchangeTx = tx({
    id: "exchange-1",
    transactionId: "shared-123",
    timestamp: "2024-03-06T14:10:00Z",
    type: "BUY",
    asset: "BTC",
    quantity: 0.3
  });

  const closerExchangeTx = tx({
    id: "exchange-2",
    transactionId: "other-123",
    timestamp: "2024-03-06T13:30:00Z",
    type: "BUY",
    asset: "BTC",
    quantity: 0.3
  });

  const candidate = findBestCandidate(
    userTx,
    [closerExchangeTx, sameIdExchangeTx],
    tolerance
  );

  assert.equal(candidate.exchangeTx._id, "exchange-1");
  assert.equal(candidate.category, "CONFLICTING");
  assert.equal(candidate.matchedBy, "transaction_id");
});
