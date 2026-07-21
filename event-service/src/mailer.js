const sgMail = require('@sendgrid/mail');

const { SENDGRID_API_KEY, ALERT_EMAIL_FROM, ALERT_EMAIL_TO } = process.env;

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

// Sends a low-seats alert for an event. No-ops (with a warning) if SendGrid
// isn't configured, so local dev without a SendGrid key doesn't crash.
async function sendLowSeatsAlert(event) {
  if (!SENDGRID_API_KEY || !ALERT_EMAIL_FROM || !ALERT_EMAIL_TO) {
    console.warn('SendGrid is not configured (SENDGRID_API_KEY/ALERT_EMAIL_FROM/ALERT_EMAIL_TO); skipping low-seats alert email.');
    return;
  }

  const msg = {
    to: ALERT_EMAIL_TO,
    from: ALERT_EMAIL_FROM,
    subject: `Low seat availability: ${event.title}`,
    text: `Event "${event.title}" at ${event.venue} has only ${event.seats_available} seat(s) left out of ${event.capacity}.`,
    html: `<p>Event <strong>${event.title}</strong> at ${event.venue} has only <strong>${event.seats_available}</strong> seat(s) left out of ${event.capacity}.</p>`,
  };

  try {
    await sgMail.send(msg);
  } catch (err) {
    console.error('Failed to send low-seats alert email:', err.response?.body || err.message);
  }
}

module.exports = { sendLowSeatsAlert };
