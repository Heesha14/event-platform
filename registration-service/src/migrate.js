const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  try {
    await db.query(sql);
    console.log('registration-service: schema applied successfully.');
  } catch (err) {
    console.error('registration-service: migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.close();
  }
}

migrate();
