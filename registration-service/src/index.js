require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const registrationsRouter = require('./routes/registrations');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4003;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', service: 'registration-service', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'registration-service', db: 'unreachable', message: err.message });
  }
});

app.use('/registrations', registrationsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`registration-service listening on port ${PORT}`);
});
