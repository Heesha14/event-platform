const express = require('express');
const client = require('../clickhouse');

const router = express.Router();

const EVENT_TYPES = ['event_view', 'ticket_interest', 'registration_started', 'registration_completed'];

// POST /track - record one analytics event
router.post('/', async (req, res, next) => {
  try {
    const { eventType, eventId, sessionId, ticketCount, referrer } = req.body;

    if (!EVENT_TYPES.includes(eventType)) {
      return res.status(400).json({ error: `eventType must be one of: ${EVENT_TYPES.join(', ')}` });
    }
    if (eventId === undefined || !Number.isInteger(Number(eventId)) || Number(eventId) < 0) {
      return res.status(400).json({ error: 'eventId is required and must be a non-negative integer' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required and must be a string' });
    }

    await client.insert({
      table: 'analytics_events',
      values: [{
        event_type: eventType,
        event_id: Number(eventId),
        session_id: sessionId,
        ticket_count: Number.isInteger(Number(ticketCount)) ? Number(ticketCount) : 0,
        referrer: typeof referrer === 'string' ? referrer.slice(0, 2048) : '',
        user_agent: (req.get('user-agent') || '').slice(0, 512),
      }],
      format: 'JSONEachRow',
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /track/:eventId/summary - counts per event_type for one event, for a
// quick sanity check that data is flowing (not a full dashboard).
router.get('/:eventId/summary', async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId < 0) {
      return res.status(400).json({ error: 'eventId must be a non-negative integer' });
    }

    const result = await client.query({
      query: `
        SELECT event_type, count() AS count
        FROM analytics_events
        WHERE event_id = {eventId:UInt32}
        GROUP BY event_type
      `,
      query_params: { eventId },
      format: 'JSONEachRow',
    });
    const rows = await result.json();

    const summary = { eventId, event_view: 0, ticket_interest: 0, registration_started: 0, registration_completed: 0 };
    rows.forEach((row) => {
      summary[row.event_type] = Number(row.count);
    });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
