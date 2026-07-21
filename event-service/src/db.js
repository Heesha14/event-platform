const sql = require('mssql');
require('dotenv').config();

// Azure SQL Database requires encryption; the local SQL Server container used
// for minikube testing has a self-signed cert, hence DB_TRUST_SERVER_CERT.
const pool = new sql.ConnectionPool({
  server: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 5000,
});

const poolConnect = pool.connect();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL Server connection', err);
});

// Route handlers write Postgres-style positional params ($1, $2, ...); this
// translates them to mssql's named params (@p1, @p2, ...) so callers don't
// need to know which driver is underneath.
async function query(text, params = []) {
  await poolConnect;
  const request = pool.request();
  params.forEach((value, index) => request.input(`p${index + 1}`, value));
  const result = await request.query(text.replace(/\$(\d+)/g, '@p$1'));
  return { rows: result.recordset || [], rowCount: result.rowsAffected[0] };
}

module.exports = {
  query,
  pool,
};
