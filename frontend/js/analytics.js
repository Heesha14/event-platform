/**
 * Minimal client for the Analytics Service. Fires fire-and-forget beacons to
 * /api/analytics/track (reverse-proxied to the analytics-service container).
 * Exposes window.Analytics.track(eventType, payload) for app.js to call.
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/analytics/track';
  var SESSION_KEY = 'analyticsSessionId';

  function getSessionId() {
    try {
      var id = window.localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : 'sess-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        window.localStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage unavailable (e.g. privacy mode) - fall back to a
      // per-page-load id rather than dropping the event entirely.
      return 'no-storage-' + Date.now();
    }
  }

  function track(eventType, payload) {
    var body = JSON.stringify(Object.assign({
      eventType: eventType,
      sessionId: getSessionId(),
      referrer: document.referrer || '',
    }, payload || {}));

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true,
    }).catch(function () { /* analytics failures should never affect the page */ });
  }

  window.Analytics = { track: track };
})();
