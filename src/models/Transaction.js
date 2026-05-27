const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    source: { type: String, enum: ["user", "exchange"], required: true, index: true },
    rowNumber: { type: Number, required: true },
    transactionId: { type: String, index: true },
    original: { type: mongoose.Schema.Types.Mixed, required: true },
    normalized: {
      timestamp: { type: Date },
      type: { type: String },
      asset: { type: String },
      quantity: { type: Number },
      priceUsd: { type: Number },
      fee: { type: Number }
    },
    valid: { type: Boolean, required: true, index: true },
    issues: [{ type: String }],
    matched: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

transactionSchema.index({ runId: 1, source: 1, matched: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
