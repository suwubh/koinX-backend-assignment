# KoinX reconciliation engine

A small Node.js service that imports two transaction CSV exports, stores the rows in MongoDB, reconciles them, and writes a report.

This was built for the KoinX backend assignment. The API reads CSV files from `data/` because the assignment does not ask for file uploads. The default files are:

- `data/user_transactions.csv`
- `data/exchange_transactions.csv`

## Setup

Requirements:

- Node.js 18+
- MongoDB, either local or through Docker

Install dependencies:

```bash
npm install
```

Create your local env file:

```bash
cp .env.example .env
```

Start MongoDB with Docker:

```bash
docker compose up -d
```

Run the API:

```bash
npm run dev
```

The service starts on `http://localhost:3000` unless `PORT` is changed.

## Environment variables

| Name | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Express server port |
| `MONGO_URI` | `mongodb://localhost:27017/koinx_reconciliation` | MongoDB connection string |
| `DATA_DIR` | `./data` | Directory where input CSVs are read |
| `REPORT_DIR` | `./reports` | Directory where generated CSV reports are written |
| `LOG_DIR` | `./logs` | Directory for data quality logs |
| `TIMESTAMP_TOLERANCE_SECONDS` | `300` | Default timestamp tolerance |
| `QUANTITY_TOLERANCE_PCT` | `0.01` | Default quantity tolerance percentage |
| `CONFLICT_WINDOW_SECONDS` | `3600` | Wider time window used to find likely conflicting rows |
| `CONFLICT_QUANTITY_TOLERANCE_PCT` | `1` | Wider quantity tolerance used only for conflict detection |

Request body values on `POST /reconcile` override the env defaults for that run.

## API

### Health check

```http
GET /health
```

Example calls:

```bash
curl -X POST http://localhost:3000/reconcile \
  -H "Content-Type: application/json" \
  -d '{"timestampToleranceSeconds":300,"quantityTolerancePct":0.01}'

curl http://localhost:3000/report/<runId>

curl "http://localhost:3000/report/<runId>?format=csv" -o report.csv

curl http://localhost:3000/report/<runId>/summary

curl http://localhost:3000/report/<runId>/unmatched
```

### Run reconciliation

```http
POST /reconcile
Content-Type: application/json

{
  "timestampToleranceSeconds": 300,
  "quantityTolerancePct": 0.01,
  "conflictWindowSeconds": 3600,
  "conflictQuantityTolerancePct": 1
}
```

Optional fields:

- `userFile`: CSV file name inside `DATA_DIR`
- `exchangeFile`: CSV file name inside `DATA_DIR`

Example response:

```json
{
  "runId": "7b912d75-29fa-4049-a23f-63f3b2b6dd94",
  "status": "completed",
  "counts": {
    "matched": 21,
    "conflicting": 1,
    "unmatchedUser": 4,
    "unmatchedExchange": 3,
    "invalidRows": 4
  },
  "reportCsvUrl": "/report/7b912d75-29fa-4049-a23f-63f3b2b6dd94?format=csv"
}
```

### Get report

```http
GET /report/:runId
```

Use CSV output:

```http
GET /report/:runId?format=csv
```

### Get summary

```http
GET /report/:runId/summary
```

### Get unmatched rows

```http
GET /report/:runId/unmatched
```

## One-shot local run

After MongoDB is running, this command triggers reconciliation without manually calling the API:

```bash
npm run reconcile
```

It prints the API response, including the run id and CSV download route.

## Matching rules

The engine normalizes rows before comparing them:

- If the same `transaction_id` exists in both files, that pair is checked first.
- Asset comparison is case-insensitive.
- Common aliases are mapped, for example `bitcoin` and `XBT` become `BTC`.
- `DEPOSIT` maps to `TRANSFER_IN`.
- `WITHDRAWAL` maps to `TRANSFER_OUT`.
- `TRANSFER_OUT` on the user side can match `TRANSFER_IN` on the exchange side. This handles the opposite-perspective transfer case from the assignment.

A row is `MATCHED` when type, asset, quantity, and timestamp fit within the configured tolerances.

A row is `CONFLICTING` when the engine finds a likely counterpart but quantity, timestamp, type, or asset does not fit the match rules. Exact `transaction_id` matches are considered likely counterparts. Proximity matches use a wider conflict window, defaulting to 1 hour and 1% quantity difference, so unrelated same-asset trades are less likely to be paired by accident.

For this dataset, `USR-012` and `EXC-1012` land in `CONFLICTING` because the BTC quantity differs by about `0.0333%`, above the default match tolerance of `0.01%`.

Rows with invalid data are still stored. They show up in the report as unmatched with the validation reason.

## Data quality handling

Bad rows are inserted into MongoDB with `valid: false` and an `issues` list. The same issues are appended to `logs/data-quality.log`.

Examples from the sample user CSV:

- duplicate `USR-001`
- malformed timestamp on `USR-018`
- negative quantity on `USR-019`
- malformed timestamp and missing type on `USR-024`

For duplicate transaction ids, the first row stays usable and later rows with the same id are marked invalid. That keeps the bad rows visible without throwing away the first import.

## Project structure

```text
src/
  app.js                    Express app and server startup
  auditLog.js               JSON-lines data quality log writer
  config/                   env parsing and defaults
  db/                       Mongo connection
  ingestion/                CSV parsing, normalization, row validation
  matching/                 matching and conflict logic
  models/                   Mongoose schemas
  reports/                  CSV report generation
  routes/                   API routes
scripts/
  run-reconcile.js          CLI helper for a local demo run
test/
  matching.test.js          focused matching tests
```

## Tests

```bash
npm test
```

Current tests cover the matching cases that are easiest to break: opposite transfer direction, quantity tolerance conflicts, and percentage difference math.

## Deploying to Vercel

This repo includes `api/index.js` and `vercel.json`, so Vercel can run the Express app as a serverless API.

Before deploying, create a MongoDB Atlas database. The local Docker database will not be reachable from Vercel.

In Vercel, import the GitHub repo and add these environment variables:

| Name | Value |
| --- | --- |
| `MONGO_URI` | MongoDB Atlas connection string |
| `DATA_DIR` | `./data` |
| `REPORT_DIR` | `/tmp/reports` |
| `LOG_DIR` | `/tmp/logs` |
| `TIMESTAMP_TOLERANCE_SECONDS` | `300` |
| `QUANTITY_TOLERANCE_PCT` | `0.01` |
| `CONFLICT_WINDOW_SECONDS` | `3600` |
| `CONFLICT_QUANTITY_TOLERANCE_PCT` | `1` |

After deployment, check:

```http
GET https://your-vercel-url.vercel.app/health
POST https://your-vercel-url.vercel.app/reconcile
```

On Vercel, generated CSV files and audit logs are written under `/tmp`. They are useful during that function invocation, but they should not be treated as permanent storage. The report APIs read from MongoDB, so `GET /report/:runId` and `GET /report/:runId?format=csv` still work after the temporary files are gone.

## Decisions and tradeoffs

- No auth is included. The assignment API did not mention users or permissions, so adding auth would mostly add noise.
- The input path is local files, not upload. In a real service I would likely support uploads or object storage, but local files keep this assignment easy to run and review.
- Reconciliation runs are immutable. A new `runId` is created for each `POST /reconcile`.
- Duplicate transaction ids are treated as invalid after the first occurrence in the same source file.
- Fee differences are kept in the report but do not affect matching, since the assignment calls out timestamp, quantity, type, and asset as matching fields.
- Report endpoints return the full run without pagination. That is acceptable for this sample-sized assignment, but it is the first thing I would change for larger CSVs.
