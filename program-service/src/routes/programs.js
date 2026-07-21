const express = require('express');
const db = require('../db');

const router = express.Router();

function toProgramResponse(row) {
  return {
    programId: row.program_id,
    eventId: row.event_id,
    day: row.day,
    track: row.track,
    session: row.session,
    speakerName: row.speaker_name,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateProgramPayload(body, { partial = false } = {}) {
  const errors = [];
  const { eventId, day, track, session, speakerName, startTime, endTime } = body;

  if (!partial || eventId !== undefined) {
    if (eventId === undefined || !Number.isInteger(Number(eventId))) errors.push('eventId is required and must be an integer');
  }
  if (!partial || day !== undefined) {
    if (!day || isNaN(Date.parse(day))) errors.push('day is required and must be a valid date');
  }
  if (!partial || track !== undefined) {
    if (!track || typeof track !== 'string') errors.push('track is required and must be a string');
  }
  if (!partial || session !== undefined) {
    if (!session || typeof session !== 'string') errors.push('session is required and must be a string');
  }
  if (!partial || speakerName !== undefined) {
    if (!speakerName || typeof speakerName !== 'string') errors.push('speakerName is required and must be a string');
  }
  if (!partial || startTime !== undefined) {
    if (!startTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) errors.push('startTime is required in HH:MM or HH:MM:SS format');
  }
  if (!partial || endTime !== undefined) {
    if (!endTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime)) errors.push('endTime is required in HH:MM or HH:MM:SS format');
  }
  return errors;
}

// POST /programs - create a new agenda item
router.post('/', async (req, res, next) => {
  try {
    const errors = validateProgramPayload(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const { eventId, day, track, session, speakerName, startTime, endTime } = req.body;
    const result = await db.query(
      `INSERT INTO programs (event_id, day, track, session, speaker_name, start_time, end_time)
       OUTPUT INSERTED.*
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, day, track, session, speakerName, startTime, endTime]
    );
    res.status(201).json(toProgramResponse(result.rows[0]));
  } catch (err) {
    if (err.number === 547) return res.status(400).json({ error: 'endTime must be after startTime' });
    next(err);
  }
});

// GET /programs - list agenda items, filterable by eventId, day, track
router.get('/', async (req, res, next) => {
  try {
    const { eventId, day, track } = req.query;
    const conditions = [];
    const params = [];

    if (eventId) {
      params.push(eventId);
      conditions.push(`event_id = $${params.length}`);
    }
    if (day) {
      params.push(day);
      conditions.push(`day = $${params.length}`);
    }
    if (track) {
      params.push(track);
      conditions.push(`track = $${params.length}`);
    }

    let query = 'SELECT * FROM programs';
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY day ASC, start_time ASC';

    const result = await db.query(query, params);
    res.json(result.rows.map(toProgramResponse));
  } catch (err) {
    next(err);
  }
});

// GET /programs/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM programs WHERE program_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Program not found' });
    res.json(toProgramResponse(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /programs/:id - partial update supported
router.put('/:id', async (req, res, next) => {
  try {
    const errors = validateProgramPayload(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ errors });

    const existing = await db.query('SELECT * FROM programs WHERE program_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Program not found' });

    const current = existing.rows[0];
    const eventId = req.body.eventId ?? current.event_id;
    const day = req.body.day ?? current.day;
    const track = req.body.track ?? current.track;
    const session = req.body.session ?? current.session;
    const speakerName = req.body.speakerName ?? current.speaker_name;
    const startTime = req.body.startTime ?? current.start_time;
    const endTime = req.body.endTime ?? current.end_time;

    const result = await db.query(
      `UPDATE programs
       SET event_id = $1, day = $2, track = $3, session = $4,
           speaker_name = $5, start_time = $6, end_time = $7, updated_at = SYSDATETIMEOFFSET()
       OUTPUT INSERTED.*
       WHERE program_id = $8`,
      [eventId, day, track, session, speakerName, startTime, endTime, req.params.id]
    );
    res.json(toProgramResponse(result.rows[0]));
  } catch (err) {
    if (err.number === 547) return res.status(400).json({ error: 'endTime must be after startTime' });
    next(err);
  }
});

// DELETE /programs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM programs OUTPUT DELETED.program_id WHERE program_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Program not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
