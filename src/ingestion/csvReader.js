const fs = require("fs/promises");
const { parse } = require("csv-parse/sync");

async function readCsv(filePath) {
  const content = await fs.readFile(filePath, "utf8");

  return parse(content, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });
}

module.exports = {
  readCsv
};
