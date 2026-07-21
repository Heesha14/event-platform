require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const trackRouter = require('./routes/track');
const client = require('./clickhouse');

const app = express();
const PORT = process.env.PORT || 4004;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await client.ping();
    res.json({ status: 'ok', service: 'analytics-service', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'analytics-service', db: 'unreachable', message: err.message });
  }
});

app.use('/track', trackRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`analytics-service listening on port ${PORT}`);
});
