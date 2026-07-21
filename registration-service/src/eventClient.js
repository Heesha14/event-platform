const axios = require('axios');

const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL || 'http://localhost:4001';

const client = axios.create({
  baseURL: EVENT_SERVICE_URL,
  timeout: 5000,
});

// Fetch an event by ID. Returns null if not found.
async function getEvent(eventId) {
  try {
    const { data } = await client.get(`/events/${eventId}`);
    return data;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw new Error(`Event Service unreachable or errored: ${err.message}`);
  }
}

// Adjust seats_available on the Event Service by `delta` (negative to reserve, positive to release).
// Returns { ok: true, event } on success, or { ok: false, status, error } on failure.
async function adjustSeats(eventId, delta) {
  try {
    const { data } = await client.patch(`/events/${eventId}/seats`, { delta });
    return { ok: true, event: data };
  } catch (err) {
    if (err.response) {
      return { ok: false, status: err.response.status, error: err.response.data?.error || 'Unknown error' };
    }
    throw new Error(`Event Service unreachable or errored: ${err.message}`);
  }
}

module.exports = { getEvent, adjustSeats };
