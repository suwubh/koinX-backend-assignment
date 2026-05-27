const mongoose = require("mongoose");

const reportEntrySchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ["MATCHED", "CONFLICTING", "UNMATCHED_USER", "UNMATCHED_EXCHANGE"],
      required: true,
      index: true
    },
    reason: { type: String, required: true },
    userTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    exchangeTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    userRow: mongoose.Schema.Types.Mixed,
    exchangeRow: mongoose.Schema.Types.Mixed,
    deltas: {
      timestampSeconds: Number,
      quantityPct: Number
    }
  },
  { timestamps: true }
);

reportEntrySchema.index({ runId: 1, category: 1 });

module.exports = mongoose.model("ReportEntry", reportEntrySchema);
