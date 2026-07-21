require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const eventsRouter = require('./routes/events');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4001;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', service: 'event-service', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'event-service', db: 'unreachable', message: err.message });
  }
});

app.use('/events', eventsRouter);

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
  console.log(`event-service listening on port ${PORT}`);
});
