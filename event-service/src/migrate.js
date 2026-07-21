// Simple migration runner: applies schema.sql to the configured database.
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  try {
    await db.query(sql);
    console.log('event-service: schema applied successfully.');
  } catch (err) {
    console.error('event-service: migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.close();
  }
}

migrate();
