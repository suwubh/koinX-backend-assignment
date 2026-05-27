const ReportEntry = require("../models/ReportEntry");
const Transaction = require("../models/Transaction");
const { buildConflictReason, findBestCandidate } = require("./candidateMatcher");

async function reconcileTransactions(runId, tolerance) {
  const [userRows, exchangeRows] = await Promise.all([
    Transaction.find({ runId, source: "user" }).sort({ rowNumber: 1 }).lean(),
    Transaction.find({ runId, source: "exchange" }).sort({ rowNumber: 1 }).lean()
  ]);

  const reportEntries = [];
  const validUsers = userRows.filter((row) => row.valid);
  const validExchanges = exchangeRows.filter((row) => row.valid);
  const unusedExchangeIds = new Set(validExchanges.map((row) => String(row._id)));

  for (const userTx of validUsers) {
    const exchangePool = validExchanges.filter((row) => unusedExchangeIds.has(String(row._id)));
    const candidate = findBestCandidate(userTx, exchangePool, tolerance);

    if (!candidate) {
      reportEntries.push({
        runId,
        category: "UNMATCHED_USER",
        reason: "no exchange transaction found with compatible type and asset",
        userTransaction: userTx._id,
        userRow: userTx.original
      });
      continue;
    }

    unusedExchangeIds.delete(String(candidate.exchangeTx._id));

    const category = candidate.category;
    const reason =
      category === "MATCHED"
        ? "within configured timestamp and quantity tolerance"
        : buildConflictReason(candidate.deltas, tolerance);

    reportEntries.push({
      runId,
      category,
      reason,
      userTransaction: userTx._id,
      exchangeTransaction: candidate.exchangeTx._id,
      userRow: userTx.original,
      exchangeRow: candidate.exchangeTx.original,
      deltas: candidate.deltas
    });
  }

  userRows
    .filter((row) => !row.valid)
    .forEach((row) => {
      reportEntries.push({
        runId,
        category: "UNMATCHED_USER",
        reason: `invalid user row: ${row.issues.join("; ")}`,
        userTransaction: row._id,
        userRow: row.original
      });
    });

  validExchanges
    .filter((row) => unusedExchangeIds.has(String(row._id)))
    .forEach((row) => {
      reportEntries.push({
        runId,
        category: "UNMATCHED_EXCHANGE",
        reason: "no user transaction found with compatible type and asset",
        exchangeTransaction: row._id,
        exchangeRow: row.original
      });
    });

  const invalidExchangeRows = exchangeRows.filter((row) => !row.valid);
  invalidExchangeRows.forEach((row) => {
    reportEntries.push({
      runId,
      category: "UNMATCHED_EXCHANGE",
      reason: `invalid exchange row: ${row.issues.join("; ")}`,
      exchangeTransaction: row._id,
      exchangeRow: row.original
    });
  });

  if (reportEntries.length) {
    await ReportEntry.insertMany(reportEntries);
  }

  await Transaction.updateMany(
    {
      _id: {
        $in: reportEntries
          .filter((entry) => entry.category === "MATCHED" || entry.category === "CONFLICTING")
          .flatMap((entry) => [entry.userTransaction, entry.exchangeTransaction])
          .filter(Boolean)
      }
    },
    { $set: { matched: true } }
  );

  return reportEntries.reduce(
    (counts, entry) => {
      if (entry.category === "MATCHED") counts.matched += 1;
      if (entry.category === "CONFLICTING") counts.conflicting += 1;
      if (entry.category === "UNMATCHED_USER") counts.unmatchedUser += 1;
      if (entry.category === "UNMATCHED_EXCHANGE") counts.unmatchedExchange += 1;
      return counts;
    },
    { matched: 0, conflicting: 0, unmatchedUser: 0, unmatchedExchange: 0 }
  );
}

module.exports = {
  reconcileTransactions
};
