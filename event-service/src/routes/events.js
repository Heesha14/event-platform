const express = require('express');
const db = require('../db');
const { sendLowSeatsAlert } = require('../mailer');

const router = express.Router();

const LOW_SEATS_THRESHOLD = Number(process.env.LOW_SEATS_THRESHOLD) || 10;

// Fires (or clears) the low-seats email alert for an event based on its
// current seats_available, and persists the alert_sent flag so the email
// only goes out once per dip below the threshold.
async function checkLowSeatsAlert(row) {
  const belowThreshold = row.seats_available < LOW_SEATS_THRESHOLD;

  if (belowThreshold && !row.low_seats_alert_sent) {
    await db.query('UPDATE events SET low_seats_alert_sent = 1 WHERE event_id = $1', [row.event_id]);
    await sendLowSeatsAlert(row);
  } else if (!belowThreshold && row.low_seats_alert_sent) {
    await db.query('UPDATE events SET low_seats_alert_sent = 0 WHERE event_id = $1', [row.event_id]);
  }
}

function toEventResponse(row) {
  return {
    eventId: row.event_id,
    title: row.title,
    venue: row.venue,
    dateTime: row.event_datetime,
    ticketPrice: Number(row.ticket_price),
    capacity: row.capacity,
    seatsAvailable: row.seats_available,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateEventPayload(body, { partial = false } = {}) {
  const errors = [];
  const { title, venue, dateTime, ticketPrice, capacity } = body;

  if (!partial || title !== undefined) {
    if (!title || typeof title !== 'string') errors.push('title is required and must be a string');
  }
  if (!partial || venue !== undefined) {
    if (!venue || typeof venue !== 'string') errors.push('venue is required and must be a string');
  }
  if (!partial || dateTime !== undefined) {
    if (!dateTime || isNaN(Date.parse(dateTime))) errors.push('dateTime is required and must be a valid ISO date');
  }
  if (!partial || ticketPrice !== undefined) {
    if (ticketPrice === undefined || isNaN(Number(ticketPrice)) || Number(ticketPrice) < 0) {
      errors.push('ticketPrice is required and must be a non-negative number');
    }
  }
  if (!partial || capacity !== undefined) {
    if (capacity === undefined || !Number.isInteger(Number(capacity)) || Number(capacity) < 0) {
      errors.push('capacity is required and must be a non-negative integer');
    }
  }
  return errors;
}

// POST /events - create a new event
router.post('/', async (req, res, next) => {
  try {
    const errors = validateEventPayload(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const { title, venue, dateTime, ticketPrice, capacity } = req.body;
    const result = await db.query(
      `INSERT INTO events (title, venue, event_datetime, ticket_price, capacity, seats_available)
       OUTPUT INSERTED.*
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [title, venue, dateTime, ticketPrice, capacity]
    );
    res.status(201).json(toEventResponse(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// GET /events - list all events (supports ?upcoming=true)
router.get('/', async (req, res, next) => {
  try {
    const { upcoming } = req.query;
    let query = 'SELECT * FROM events';
    const params = [];
    if (upcoming === 'true') {
      query += ' WHERE event_datetime >= SYSDATETIMEOFFSET()';
    }
    query += ' ORDER BY event_datetime ASC';
    const result = await db.query(query, params);
    res.json(result.rows.map(toEventResponse));
  } catch (err) {
    next(err);
  }
});

// GET /events/:id - get a single event
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM events WHERE event_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(toEventResponse(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /events/:id - update an event (partial updates allowed)
router.put('/:id', async (req, res, next) => {
  try {
    const errors = validateEventPayload(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ errors });

    const existing = await db.query('SELECT * FROM events WHERE event_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Event not found' });

    const current = existing.rows[0];
    const title = req.body.title ?? current.title;
    const venue = req.body.venue ?? current.venue;
    const dateTime = req.body.dateTime ?? current.event_datetime;
    const ticketPrice = req.body.ticketPrice ?? current.ticket_price;
    const capacity = req.body.capacity ?? current.capacity;

    // If capacity changes, adjust seats_available by the same delta so seats already
    // booked are preserved.
    const capacityDelta = Number(capacity) - Number(current.capacity);
    const seatsAvailable = Math.max(0, Number(current.seats_available) + capacityDelta);

    const result = await db.query(
      `UPDATE events
       SET title = $1, venue = $2, event_datetime = $3, ticket_price = $4,
           capacity = $5, seats_available = $6, updated_at = SYSDATETIMEOFFSET()
       OUTPUT INSERTED.*
       WHERE event_id = $7`,
      [title, venue, dateTime, ticketPrice, capacity, seatsAvailable, req.params.id]
    );
    const updated = result.rows[0];
    checkLowSeatsAlert(updated).catch((err) => console.error('Low-seats alert check failed:', err.message));
    res.json(toEventResponse(updated));
  } catch (err) {
    next(err);
  }
});

// DELETE /events/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM events OUTPUT DELETED.event_id WHERE event_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PATCH /events/:id/seats - reserve or release seats atomically.
// Body: { "delta": -2 } to reserve 2 seats, { "delta": 2 } to release 2 seats.
// This is the internal endpoint the Registration Service calls.
router.patch('/:id/seats', async (req, res, next) => {
  try {
    const { delta } = req.body;
    if (delta === undefined || !Number.isInteger(Number(delta))) {
      return res.status(400).json({ error: 'delta is required and must be an integer' });
    }

    const result = await db.query(
      `UPDATE events
       SET seats_available = seats_available + $1, updated_at = SYSDATETIMEOFFSET()
       OUTPUT INSERTED.*
       WHERE event_id = $2
         AND seats_available + $1 >= 0
         AND seats_available + $1 <= capacity`,
      [delta, req.params.id]
    );

    if (result.rows.length === 0) {
      const check = await db.query('SELECT * FROM events WHERE event_id = $1', [req.params.id]);
      if (check.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
      return res.status(409).json({ error: 'Not enough seats available' });
    }

    const updated = result.rows[0];
    checkLowSeatsAlert(updated).catch((err) => console.error('Low-seats alert check failed:', err.message));
    res.json(toEventResponse(updated));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
