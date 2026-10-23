// Cloudflare Pages Function: POST /api/request-call
//
// 1. Checks the hidden honeypot field (bots fill it in; people never see it).
// 2. Verifies the Cloudflare Turnstile token with Cloudflare.
// 3. Validates the form.
// 4. Creates or updates the contact in ActiveCampaign, fills in custom fields,
//    adds the contact to the list, adds the tag (which starts the automation),
//    and adds a note with every answer so nothing is lost.
//
// Secrets and IDs live in Cloudflare Pages > Settings > Variables and Secrets.
// See README.md for the full list. Nothing secret is in this file.

const BEST_TIMES = ['Morning', 'Afternoon', 'Evening'];
const INTERESTS = ['Custom coaching program', 'Coaching membership', 'Private one-to-one golf school', 'Not sure yet'];
const START_TIMINGS = ['This week', 'This month', 'Just exploring'];
const SCORES = ['Under 80', '80 to 89', '90 to 99', '100 or more', 'New to golf'];

const FALLBACK_MESSAGE = 'We couldn\u2019t send your request. Please call John directly at 407-852-8547.';

export async function onRequestPost(context) {
  const { request, env } = context;
  const wantsJson = (request.headers.get('content-type') || '').includes('application/json');

  let data;
  try {
    data = wantsJson ? await request.json() : Object.fromEntries(await request.formData());
  } catch (e) {
    return respond(wantsJson, 400, false, 'The form didn\u2019t come through. Please try again.');
  }

  // Honeypot: pretend it worked so bots learn nothing.
  if (clean(data.company)) {
    return respond(wantsJson, 200, true);
  }

  // Turnstile check.
  const token = clean(data['cf-turnstile-response'], 2048);
  const human = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, request.headers.get('CF-Connecting-IP'));
  if (!human) {
    return respond(wantsJson, 400, false, 'The security check didn\u2019t pass. Refresh the page and try again.');
  }

  // Validate and tidy the answers.
  const lead = {
    firstName: clean(data.first_name, 60),
    lastName: clean(data.last_name, 60),
    email: clean(data.email, 120).toLowerCase(),
    phone: clean(data.phone, 20),
    bestTime: oneOf(data.best_time, BEST_TIMES),
    interest: oneOf(data.interest, INTERESTS),
    startTiming: oneOf(data.start_timing, START_TIMINGS),
    score: oneOf(data.score, SCORES),
    goal: clean(data.goal, 300),
    consent: data.consent === 'yes' || data.consent === true || data.consent === 'on',
    sourceDomain: clean(data.source_domain, 120),
    landingUrl: clean(data.landing_url, 300),
    referrer: clean(data.referrer, 300),
    utm: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
      .map((k) => (clean(data[k], 100) ? `${k}=${clean(data[k], 100)}` : ''))
      .filter(Boolean)
      .join('&'),
  };

  const problems = [];
  if (!lead.firstName) problems.push('first name');
  if (!lead.lastName) problems.push('last name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) problems.push('email');
  if (lead.phone.replace(/\D/g, '').length < 10) problems.push('mobile phone');
  if (!lead.bestTime) problems.push('best time to call');
  if (!lead.interest) problems.push('what you\u2019re interested in');
  if (!lead.consent) problems.push('permission to contact');
  if (problems.length) {
    return respond(wantsJson, 400, false, `Please check these fields: ${problems.join(", ")}.`);
  }

  // Send to ActiveCampaign.
  try {
    await sendToActiveCampaign(lead, env);
  } catch (err) {
    console.error('ActiveCampaign error:', err && err.message);
    return respond(wantsJson, 502, false, FALLBACK_MESSAGE);
  }

  return respond(wantsJson, 200, true);
}

async function verifyTurnstile(token, secret, ip) {
  if (!token || !secret) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const out = await res.json();
    return out.success === true;
  } catch (e) {
    console.error('Turnstile error:', e && e.message);
    return false;
  }
}

async function sendToActiveCampaign(lead, env) {
  const base = (env.AC_API_URL || '').replace(/\/+$/, '');
  if (!base || !env.AC_API_KEY) throw new Error('ActiveCampaign settings are missing');

  const ac = async (path, payload) => {
    const res = await fetch(`${base}/api/3/${path}`, {
      method: 'POST',
      headers: { 'Api-Token': env.AC_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} returned ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  };

  // Custom fields. Any field ID left blank in the settings is skipped.
  const consentNote = `Yes, ${new Date().toISOString()} via ${lead.sourceDomain || 'landing page'}`;
  const fieldValues = [
    [env.AC_FIELD_BEST_TIME, lead.bestTime],
    [env.AC_FIELD_INTEREST, lead.interest],
    [env.AC_FIELD_START_TIMING, lead.startTiming],
    [env.AC_FIELD_SCORE, lead.score],
    [env.AC_FIELD_GOAL, lead.goal],
    [env.AC_FIELD_SOURCE_DOMAIN, lead.sourceDomain],
    [env.AC_FIELD_UTM, lead.utm],
    [env.AC_FIELD_CONSENT, consentNote],
  ]
    .filter(([id, value]) => id && value)
    .map(([id, value]) => ({ field: String(id), value }));

  const synced = await ac('contact/sync', {
    contact: {
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      fieldValues,
    },
  });
  const contactId = synced && synced.contact && synced.contact.id;
  if (!contactId) throw new Error('No contact ID returned');

  if (env.AC_LIST_ID) {
    await ac('contactLists', { contactList: { list: String(env.AC_LIST_ID), contact: String(contactId), status: 1 } });
  }

  // A note with every answer, so John sees the full picture on the contact record.
  const note = [
    `Call request from ${lead.sourceDomain || 'orlandogolfcoaching.com'}`,
    `Best time to call: ${lead.bestTime}`,
    `Interested in: ${lead.interest}`,
    `Wants to start: ${lead.startTiming || 'not answered'}`,
    `Typical score: ${lead.score || 'not answered'}`,
    `Goal: ${lead.goal || 'not answered'}`,
    `Phone: ${lead.phone}`,
    lead.utm ? `Campaign: ${lead.utm}` : '',
    lead.referrer ? `Referrer: ${lead.referrer}` : '',
    `Consent to contact: ${consentNote}`,
  ].filter(Boolean).join('\n');
  try {
    await ac('notes', { note: { note, relid: String(contactId), reltype: 'Subscriber' } });
  } catch (e) {
    console.error('Note not saved:', e && e.message); // Not fatal: the contact and tag still go through.
  }

  // Tag last: the tag starts the automation, so everything above is already saved.
  if (env.AC_TAG_ID) {
    await ac('contactTags', { contactTag: { contact: String(contactId), tag: String(env.AC_TAG_ID) } });
  }
}

function clean(value, max = 200) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function oneOf(value, allowed) {
  const v = clean(value, 60);
  return allowed.includes(v) ? v : '';
}

function respond(wantsJson, status, ok, message) {
  if (wantsJson) {
    return new Response(JSON.stringify({ ok, message: message || '' }), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  // Without JavaScript the form posts normally, so send the visitor to a page.
  const location = ok ? '/thank-you.html' : '/?form=error#request';
  return new Response(null, { status: 303, headers: { Location: location } });
}
