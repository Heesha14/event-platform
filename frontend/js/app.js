/**
 * Loads live event details from the Event Service and Program Service,
 * renders them into the page, and wires the register form to the
 * Registration Service.
 *
 * All requests go to same-origin relative paths (/api/events, /api/programs,
 * /api/registrations). In the Kubernetes deployment these are reverse-proxied
 * by the frontend's nginx container to the three backend Services, so there
 * is no CORS configuration to manage and no backend URLs baked into this file.
 *
 * If the APIs are unreachable, the page silently falls back to the original
 * static template content and shows a small banner explaining that.
 */
(function () {
  'use strict';

  var API = {
    events: '/api/events',
    programs: '/api/programs',
    registrations: '/api/registrations',
  };

  var state = {
    event: null,
    programs: [],
  };

  function qs(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function showBanner(message) {
    var banner = document.getElementById('api-status-banner');
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = 'block';
  }

  function formatCurrency(amount) {
    var n = Number(amount);
    if (isNaN(n)) return String(amount);
    return '$' + n.toFixed(2);
  }

  function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    var timeOpts = { hour: 'numeric', minute: '2-digit' };
    return d.toLocaleDateString(undefined, dateOpts) + ' \u00B7 ' + d.toLocaleTimeString(undefined, timeOpts);
  }

  function formatShortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(t) {
    // t is "HH:MM:SS" or "HH:MM" from the API
    if (!t) return '';
    var parts = t.split(':');
    var hours = parseInt(parts[0], 10);
    var minutes = parts[1];
    var suffix = hours >= 12 ? 'PM' : 'AM';
    var hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return hour12 + '.' + minutes + ' ' + suffix;
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          var err = new Error(body.error || ('Request failed with status ' + res.status));
          err.status = res.status;
          err.body = body;
          throw err;
        });
      }
      return res.json();
    });
  }

  // ---- Determine which event to feature -----------------------------------

  function resolveEvent() {
    var eventId = qs('eventId');
    if (eventId) {
      return fetchJson(API.events + '/' + encodeURIComponent(eventId));
    }
    // No eventId in the URL: feature the soonest upcoming event.
    return fetchJson(API.events + '?upcoming=true').then(function (events) {
      if (events && events.length > 0) return events[0];
      // Fall back to any event at all if nothing upcoming is scheduled.
      return fetchJson(API.events).then(function (all) {
        if (all && all.length > 0) return all[0];
        throw new Error('No events found');
      });
    });
  }

  // ---- Rendering ------------------------------------------------------------

  function renderEvent(event) {
    state.event = event;
    document.title = event.title + ' - Event Details';

    var titleEl = document.getElementById('event-title');
    if (titleEl) titleEl.textContent = event.title;

    var datesVenueEl = document.getElementById('event-dates-venue');
    if (datesVenueEl) datesVenueEl.textContent = formatShortDate(event.dateTime) + ' in ' + event.venue;

    var priceEl = document.getElementById('stat-price');
    if (priceEl) priceEl.textContent = formatCurrency(event.ticketPrice) + ' / Ticket';

    var seatsEl = document.getElementById('stat-seats');
    if (seatsEl) seatsEl.textContent = event.seatsAvailable + ' / ' + event.capacity + ' Seats Left';

    var venueTitleEl = document.getElementById('venue-event-title');
    if (venueTitleEl) venueTitleEl.textContent = event.title;

    var venueNameEl = document.getElementById('venue-name');
    if (venueNameEl) venueNameEl.textContent = event.venue;

    var venueDatetimeEl = document.getElementById('venue-datetime');
    if (venueDatetimeEl) venueDatetimeEl.textContent = formatDateTime(event.dateTime);
  }

  function renderProgramCount(count) {
    var el = document.getElementById('stat-programs');
    if (el) el.textContent = count + ' Program' + (count === 1 ? '' : 's');
  }

  function groupProgramsByDay(programs) {
    var byDay = {};
    programs.forEach(function (p) {
      if (!byDay[p.day]) byDay[p.day] = [];
      byDay[p.day].push(p);
    });
    var days = Object.keys(byDay).sort();
    days.forEach(function (day) {
      byDay[day].sort(function (a, b) {
        return (a.startTime || '').localeCompare(b.startTime || '');
      });
    });
    return { days: days, byDay: byDay };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPrograms(programs) {
    state.programs = programs;
    renderProgramCount(programs.length);

    var tabsEl = document.getElementById('program-tabs');
    var contentEl = document.getElementById('program-tab-content');
    var emptyMsg = document.getElementById('program-empty-message');
    if (!tabsEl || !contentEl) return;

    if (!programs || programs.length === 0) {
      tabsEl.innerHTML = '';
      contentEl.innerHTML = '';
      if (emptyMsg) {
        contentEl.appendChild(emptyMsg);
        emptyMsg.style.display = 'block';
      }
      return;
    }

    var grouped = groupProgramsByDay(programs);
    var tabsHtml = '';
    var contentHtml = '';
    var programImages = 9; // program-img1.jpg .. program-img9.jpg available in /images

    grouped.days.forEach(function (day, dayIndex) {
      var tabId = 'day-' + dayIndex;
      var isActive = dayIndex === 0;
      var dayLabel = formatShortDate(day);

      tabsHtml += '<li' + (isActive ? ' class="active"' : '') + '>' +
        '<a href="#' + tabId + '" aria-controls="' + tabId + '" role="tab" data-toggle="tab">' +
        escapeHtml(dayLabel) + '</a></li>';

      var sessionsHtml = grouped.byDay[day].map(function (session, i) {
        var imgNum = ((dayIndex + i) % programImages) + 1;
        var divider = i > 0 ? '<div class="program-divider col-md-12 col-sm-12"></div>' : '';
        return divider +
          '<div class="col-md-2 col-sm-2">' +
            '<img src="images/program-img' + imgNum + '.jpg" class="img-responsive" alt="program">' +
          '</div>' +
          '<div class="col-md-10 col-sm-10">' +
            '<h6>' +
              '<span><i class="fa fa-clock-o"></i> ' + escapeHtml(formatTime(session.startTime)) +
                ' - ' + escapeHtml(formatTime(session.endTime)) + '</span> ' +
              '<span><i class="fa fa-tag"></i> ' + escapeHtml(session.track) + '</span>' +
            '</h6>' +
            '<h3>' + escapeHtml(session.session) + '</h3>' +
            '<h4>By ' + escapeHtml(session.speakerName) + '</h4>' +
          '</div>';
      }).join('');

      contentHtml += '<div role="tabpanel" class="tab-pane' + (isActive ? ' active' : '') + '" id="' + tabId + '">' +
        sessionsHtml + '</div>';
    });

    tabsEl.innerHTML = tabsHtml;
    contentEl.innerHTML = contentHtml;
  }

  function renderSpeakers(programs) {
    var container = document.getElementById('owl-speakers');
    if (!container) return;

    // Build a de-duplicated speaker list (by name) from the program data.
    var seen = {};
    var speakers = [];
    programs.forEach(function (p) {
      if (!seen[p.speakerName]) {
        seen[p.speakerName] = true;
        speakers.push({ name: p.speakerName, role: p.track, session: p.session });
      }
    });

    if (speakers.length === 0) return; // keep the template's default fallback speakers

    var speakerImages = 5; // speakers-img1.jpg .. speakers-img5.jpg available in /images
    var html = speakers.map(function (s, i) {
      var imgNum = (i % speakerImages) + 1;
      return '<div class="item wow fadeInUp col-md-3 col-sm-3">' +
        '<div class="speakers-wrapper">' +
          '<img src="images/speakers-img' + imgNum + '.jpg" class="img-responsive" alt="speakers">' +
          '<div class="speakers-thumb">' +
            '<h3>' + escapeHtml(s.name) + '</h3>' +
            '<h6>' + escapeHtml(s.role) + '</h6>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = html;
    container.removeAttribute('data-default-content');

    // Re-initialize the owl carousel now that its content has changed.
    if (window.jQuery) {
      var $carousel = window.jQuery('#owl-speakers');
      if ($carousel.data('owlCarousel')) {
        $carousel.data('owlCarousel').destroy();
      }
      $carousel.owlCarousel({
        autoPlay: 6000,
        items: 4,
        itemsDesktop: [1199, 2],
        itemsDesktopSmall: [979, 1],
        itemsTablet: [768, 1],
        itemsTabletSmall: [985, 2],
        itemsMobile: [479, 1],
      });
    }
  }

  // ---- Registration form ------------------------------------------------

  function showRegisterMessage(text, isError) {
    var el = document.getElementById('register-message');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    el.style.background = isError ? '#f2dede' : '#dff0d8';
    el.style.color = isError ? '#a94442' : '#3c763d';
    el.style.border = '1px solid ' + (isError ? '#ebccd1' : '#d6e9c6');
  }

  function handleRegisterSubmit(e) {
    e.preventDefault();

    if (!state.event) {
      showRegisterMessage('Event details are still loading — please try again in a moment.', true);
      return;
    }

    var firstName = document.getElementById('reg-firstname').value.trim();
    var lastName = document.getElementById('reg-lastname').value.trim();
    var email = document.getElementById('reg-email').value.trim();
    var ticketCount = parseInt(document.getElementById('reg-ticketcount').value, 10);

    if (!firstName || !lastName || !email || !ticketCount || ticketCount < 1) {
      showRegisterMessage('Please fill in your name, email, and a valid number of tickets.', true);
      return;
    }

    var submitBtn = document.getElementById('reg-submit');
    var originalLabel = submitBtn.value;
    submitBtn.disabled = true;
    submitBtn.value = 'Submitting...';

    if (window.Analytics) {
      window.Analytics.track('registration_started', { eventId: state.event.eventId, ticketCount: ticketCount });
    }

    fetchJson(API.registrations, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: state.event.eventId,
        name: firstName + ' ' + lastName,
        email: email,
        ticketCount: ticketCount,
      }),
    })
      .then(function () {
        showRegisterMessage('You\u2019re registered! A confirmation has been recorded for ' + email + '.', false);
        if (window.Analytics) {
          window.Analytics.track('registration_completed', { eventId: state.event.eventId, ticketCount: ticketCount });
        }
        document.getElementById('register-form').reset();
        document.getElementById('reg-ticketcount').value = 1;
        // Refresh event details so the seats-available stat reflects the new booking.
        return fetchJson(API.events + '/' + state.event.eventId).then(renderEvent);
      })
      .catch(function (err) {
        if (err.status === 409) {
          showRegisterMessage('Sorry — not enough seats are available for that many tickets.', true);
        } else if (err.status === 404) {
          showRegisterMessage('This event could not be found. Please refresh the page.', true);
        } else if (err.body && Array.isArray(err.body.errors)) {
          showRegisterMessage(err.body.errors.join(' '), true);
        } else {
          showRegisterMessage('Something went wrong submitting your registration. Please try again.', true);
        }
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.value = originalLabel;
      });
  }

  // ---- Boot ---------------------------------------------------------------

  function init() {
    var form = document.getElementById('register-form');
    if (form) form.addEventListener('submit', handleRegisterSubmit);

    var ctaRegisterNow = document.getElementById('cta-register-now');
    if (ctaRegisterNow) {
      ctaRegisterNow.addEventListener('click', function () {
        if (state.event && window.Analytics) {
          window.Analytics.track('ticket_interest', { eventId: state.event.eventId });
        }
      });
    }

    resolveEvent()
      .then(function (event) {
        renderEvent(event);
        if (window.Analytics) {
          window.Analytics.track('event_view', { eventId: event.eventId });
        }
        return fetchJson(API.programs + '?eventId=' + encodeURIComponent(event.eventId));
      })
      .then(function (programs) {
        renderPrograms(programs);
        renderSpeakers(programs);
      })
      .catch(function (err) {
        console.error('Failed to load live event data:', err);
        showBanner('Could not load live event data right now — showing example content instead.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
