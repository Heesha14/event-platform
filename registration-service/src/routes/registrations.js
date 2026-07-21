const express = require('express');
const db = require('../db');
const eventClient = require('../eventClient');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toRegistrationResponse(row) {
  return {
    registrationId: row.registration_id,
    eventId: row.event_id,
    name: row.name,
    email: row.email,
    ticketCount: row.ticket_count,
    timestamp: row.registered_at,
  };
}

function validateRegistrationPayload(body) {
  const errors = [];
  const { eventId, name, email, ticketCount } = body;

  if (eventId === undefined || !Number.isInteger(Number(eventId))) errors.push('eventId is required and must be an integer');
  if (!name || typeof name !== 'string') errors.push('name is required and must be a string');
  if (!email || !EMAIL_REGEX.test(email)) errors.push('email is required and must be a valid email address');
  if (ticketCount === undefined || !Number.isInteger(Number(ticketCount)) || Number(ticketCount) <= 0) {
    errors.push('ticketCount is required and must be a positive integer');
  }
  return errors;
}

// POST /registrations - register an attendee for an event.
// Reserves seats on the Event Service before persisting the registration, so
// overselling is prevented across services.
router.post('/', async (req, res, next) => {
  try {
    const errors = validateRegistrationPayload(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const { eventId, name, email, ticketCount } = req.body;

    // Reserve the seats on the Event Service first.
    const reservation = await eventClient.adjustSeats(eventId, -Number(ticketCount));
    if (!reservation.ok) {
      if (reservation.status === 404) return res.status(404).json({ error: 'Event not found' });
      if (reservation.status === 409) return res.status(409).json({ error: 'Not enough seats available for this event' });
      return res.status(502).json({ error: 'Failed to reserve seats with Event Service', detail: reservation.error });
    }

    try {
      const result = await db.query(
        `INSERT INTO registrations (event_id, name, email, ticket_count)
         OUTPUT INSERTED.*
         VALUES ($1, $2, $3, $4)`,
        [eventId, name, email, ticketCount]
      );
      res.status(201).json(toRegistrationResponse(result.rows[0]));
    } catch (dbErr) {
      // Roll back the seat reservation if saving the registration failed.
      await eventClient.adjustSeats(eventId, Number(ticketCount)).catch(() => {});
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
});

// GET /registrations - list registrations, filterable by eventId or email
router.get('/', async (req, res, next) => {
  try {
    const { eventId, email } = req.query;
    const conditions = [];
    const params = [];

    if (eventId) {
      params.push(eventId);
      conditions.push(`event_id = $${params.length}`);
    }
    if (email) {
      params.push(email);
      conditions.push(`email = $${params.length}`);
    }

    let query = 'SELECT * FROM registrations';
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY registered_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows.map(toRegistrationResponse));
  } catch (err) {
    next(err);
  }
});

// GET /registrations/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM registrations WHERE registration_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });
    res.json(toRegistrationResponse(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /registrations/:id - cancel a registration and release its seats back to the event
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM registrations OUTPUT DELETED.* WHERE registration_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });

    const cancelled = result.rows[0];
    // Best-effort release of seats; registration is already cancelled either way.
    await eventClient.adjustSeats(cancelled.event_id, cancelled.ticket_count).catch((err) => {
      console.error(`Failed to release seats for cancelled registration ${cancelled.registration_id}:`, err.message);
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
