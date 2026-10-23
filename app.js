// Call-request form for orlandogolfcoaching.com
// Sends the form to /api/request-call (a Cloudflare Pages Function), which checks
// Cloudflare Turnstile and then creates the contact in ActiveCampaign.
(function () {
  var form = document.getElementById('call-form');
  if (!form) return;

  var statusEl = form.querySelector('.form-status');
  var submitBtn = form.querySelector('.button-submit');
  var thanks = document.getElementById('thanks');
  var goal = document.getElementById('goal');
  var goalCount = document.getElementById('goal-count');

  // Fill in where this lead came from.
  var params = new URLSearchParams(window.location.search);
  function setHidden(name, value) {
    var el = form.elements[name];
    if (el) el.value = (value || '').slice(0, 300);
  }
  if (params.get('form') === 'error') {
    statusEl.textContent = 'We couldn\u2019t send your request. Please try again, or call John at 407-852-8547.';
  }
  setHidden('source_domain', window.location.hostname);
  setHidden('landing_url', window.location.href);
  setHidden('referrer', document.referrer);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
    setHidden(k, params.get(k));
  });

  // Character counter for the goal box.
  if (goal && goalCount) {
    var updateCount = function () {
      var left = 300 - goal.value.length;
      goalCount.textContent = left + (left === 1 ? ' character left' : ' characters left');
    };
    goal.addEventListener('input', updateCount);
    updateCount();
  }

  function showError(message) {
    statusEl.textContent = message;
  }

  function markInvalid() {
    var firstBad = null;
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.willValidate || el.type === 'hidden') return;
      var bad = !el.checkValidity();
      if (el.type !== 'radio') el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad && !firstBad) firstBad = el;
    });
    return firstBad;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    showError('');

    var firstBad = markInvalid();
    if (firstBad) {
      showError('Please fill in the highlighted fields, then send your request.');
      firstBad.focus();
      return;
    }

    var data = {};
    new FormData(form).forEach(function (value, key) { data[key] = value; });

    if (!data['cf-turnstile-response']) {
      showError('The security check is still loading. Wait a moment, then send your request again.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending your request';

    fetch('/api/request-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.body.ok) {
          throw new Error(result.body.message || 'We couldn\u2019t send your request. Please call John at 407-852-8547.');
        }
        var first = (data.first_name || '').trim();
        document.getElementById('thanks-title').textContent =
          first ? 'Thanks, ' + first + '. Your request is in.' : 'Thanks. Your request is in.';
        form.hidden = true;
        thanks.hidden = false;
        thanks.focus();

        // Conversion tracking hooks, if analytics is added later.
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'call_requested', interest: data.interest || '' });
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'call_requested', { interest: data.interest || '' });
        }
      })
      .catch(function (err) {
        showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Request my call';
        if (window.turnstile) window.turnstile.reset();
      });
  });
})();
