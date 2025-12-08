const { pool } = require("./db");
const { YEAR_TABLE_MAP, CATEGORY_THRESHOLDS } = require("./config");

const latestYear = Math.max(...Object.keys(YEAR_TABLE_MAP).map((y) => Number(y)));

function categorize(stagePercent) {
  if (stagePercent === null || Number.isNaN(stagePercent) || !Number.isFinite(stagePercent)) {
    return "Unknown";
  }

  const match = CATEGORY_THRESHOLDS.find(({ test }) => test(stagePercent));
  return match ? match.label : "Unknown";
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildDistinctQuery(column, tables, whereClause = "", params = []) {
  const baseQueries = tables.map(
    (table) => `SELECT DISTINCT "${column}" AS value FROM ${table} ${whereClause}`.trim()
  );

  const sql = `
    SELECT DISTINCT value
    FROM (${baseQueries.join(" UNION ")}) AS combined
    WHERE value IS NOT NULL
    ORDER BY value ASC
  `;

  return pool.query(sql, params).then((result) => result.rows.map((row) => row.value));
}

async function getStates() {
  const tables = Object.values(YEAR_TABLE_MAP);
  return buildDistinctQuery("State", tables);
}

async function getDistricts(state) {
  const tables = Object.values(YEAR_TABLE_MAP);
  const whereClause = `WHERE "State" = $1`;
  return buildDistinctQuery("District", tables, whereClause, [state]);
}

async function getBlocks(state, district) {
  const tables = Object.values(YEAR_TABLE_MAP);
  const whereClause = `WHERE "State" = $1 AND "District" = $2`;
  return buildDistinctQuery("Assessment Unit Name", tables, whereClause, [state, district]);
}

async function aggregateByYear({ state, district, block, years }) {
  const selectedYears =
    Array.isArray(years) && years.length ? years : [latestYear];

  const results = [];

  for (const year of selectedYears) {
    const tableName = YEAR_TABLE_MAP[year];
    if (!tableName) {
      const validYears = Object.keys(YEAR_TABLE_MAP).join(", ");
      throw new Error(`Unsupported year ${year}. Valid years: ${validYears}`);
    }

    const conditions = [];
    const params = [];

    if (state) {
      params.push(state);
      conditions.push(`"State" = $${params.length}`);
    }

    if (district) {
      params.push(district);
      conditions.push(`"District" = $${params.length}`);
    }

    if (block) {
      params.push(block);
      conditions.push(`"Assessment Unit Name" = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        SUM("Annual Extractable Ground Water Resource (Ham)") AS annual_extractable,
        SUM("Total Ground Water Extraction (Ham)") AS total_extraction
      FROM ${tableName}
      ${whereClause}
    `;

    const { rows } = await pool.query(sql, params);
    const annualExtractable = parseNumber(rows[0]?.annual_extractable);
    const totalExtraction = parseNumber(rows[0]?.total_extraction);

    let stagePercent = null;
    if (annualExtractable && annualExtractable !== 0 && totalExtraction !== null) {
      stagePercent = (totalExtraction / annualExtractable) * 100;
    }

    results.push({
      year: Number(year),
      annual_extractable: annualExtractable,
      total_extraction: totalExtraction,
      stage_percent: stagePercent !== null ? Number(stagePercent.toFixed(2)) : null,
      categorization: categorize(stagePercent),
    });
  }

  return results;
}

module.exports = {
  getStates,
  getDistricts,
  getBlocks,
  aggregateByYear,
  latestYear,
};
