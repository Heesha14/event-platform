// Simple migration runner: applies schema.sql to the configured ClickHouse database.
const fs = require('fs');
const path = require('path');
const client = require('./clickhouse');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  try {
    await client.command({ query: sql });
    console.log('analytics-service: schema applied successfully.');
  } catch (err) {
    console.error('analytics-service: migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

migrate();
