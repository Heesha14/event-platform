require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const programsRouter = require('./routes/programs');
const db = require('./db');
const { metricsMiddleware, metricsHandler } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 4002;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(metricsMiddleware);

app.get('/metrics', metricsHandler);

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', service: 'program-service', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'program-service', db: 'unreachable', message: err.message });
  }
});

app.use('/programs', programsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`program-service listening on port ${PORT}`);
});
