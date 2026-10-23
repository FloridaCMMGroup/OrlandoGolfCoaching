# orlandogolfcoaching.com

Landing page #2 for John Hughes Golf: season-long golf coaching programs. Same build as golflessonsinorlando.com (static page, form handler, ActiveCampaign API), with its own list and tag. It runs as a Cloudflare Worker: static files are served from the repo, and `worker.js` sends `/api/request-call` to the form handler, which passes the lead to ActiveCampaign.

## What's in this folder

| File | What it does |
| --- | --- |
| `index.html` | The page: copy, form, thank-you message, search markup (local business and FAQ) |
| `styles.css` | All styling. Brand colors: deep purple, orange, light lavender |
| `app.js` | Form behavior: fills hidden tracking fields, checks required fields, sends the form, shows the thank-you message |
| `functions/api/request-call.js` | Form handler for `/api/request-call`, called from `worker.js`. Checks Turnstile, validates, sends the lead to ActiveCampaign |
| `thank-you.html` | Shown only if a visitor has JavaScript turned off and the form posts normally |
| `privacy.html` | Privacy policy linked from the form |
| `_headers` | Security headers, including a content security policy that allows Turnstile, Google Fonts and Cloudflare Web Analytics |
| `robots.txt`, `sitemap.xml` | Search engine files |
| `favicon.svg` | Placeholder icon. Replace with the John Hughes Golf mark |
| `images/` | Add `hero.jpg` (about 900 x 1100, portrait) and `john-headshot.jpg` (about 480 x 560) |
| `redirects.csv` | orlandogolfcoaching.net, which 301-redirects here, plus www to the bare domain, ready for Cloudflare Bulk Redirects |

No build step. No dependencies.

## Before launch: placeholders to replace

1. ~~Turnstile site key in `index.html`~~ (done).
2. `images/hero.jpg` and `image## 1. Deploy (Cloudflare Worker)

The Worker is named `orlandogolfcoaching` (set in `wrangler.jsonc`). There is no build step.

- **Automatic:** the Worker is connected to this repo through Workers Builds, so a push to `main` deploys. This needs the Cloudflare Workers and Pages GitHub app to have access to the repo (FloridaCMMGroup > Settings > GitHub Apps).
- **Manual:** from this folder, run `git ship` (push, then deploy) or `npx wrangler deploy`.
- Custom domains: `orlandogolfcoaching.com` and `www.orlandogolfcoaching.com`, under the Worker's Settings > Domains and Routes.

re (nameservers switched at GoDaddy; registration can stay at GoDaddy).

## 2. Turnstile (spam protection)

1. Cloudflare dashboard > Turnstile > Add widget.
2. Hostnames: `orlandogolfcoaching.com` and the `*.pages.dev` preview hostname.
3. Widget mode: Managed. The page uses `data-appearance="interaction-only"`, so most visitors never see it.
4. Put the **site key** in `index.html`. Put the **secret key** in the Worker secret `TURNSTILE_SECRET_KEY` (below).

## 3. ActiveCampaign setup

No ActiveCampaign form is needed. The page has its own form and talks to ActiveCampaign through its API. The list, tag and fields below already exist; only the API URL and key still need to come from ActiveCampaign > Settings > Developer.

**List:** OrlandoGolfCoaching.com Lead List (already created, list ID **12**)

**Tag:** `LP-orlandogolfcoaching` (already created, tag ID **150**). Adding this tag is what starts the automation, so the function adds it last, after every field and the note are saved.

**Custom contact fields** (already created as text fields and available on all lists; IDs are in section 4):

| Field name | Values the form sends |
| --- | --- |
| Best Time to Call | Morning, Afternoon, Evening |
| Lesson Interest | Custom coaching program, Coaching membership, Private one-to-one golf school, Not sure yet |
| Start Timing | This week, This month, Just exploring |
| Typical Score | Under 80, 80 to 89, 90 to 99, 100 or more, New to golf |
| Golf Goal | Free text, up to 300 characters |
| Lead Source Domain | The domain the golfer was on, for example orlandogolfcoaching.com |
| UTM Campaign | Campaign codes from the link, for example utm_source=facebook&utm_campaign=fall |
| Contact Consent | "Yes", the date and time, and the domain |

The function also adds a **note** to the contact with every answer, so John sees everything even if a field ID is missing.

**Automation:** trigger "Tag is added: LP-orlandogolfcoaching". Steps:
1. Send the golfer the confirmation email (copy is in the content doc).
2. Notify John by email (and by text, through ActiveCampaign SMS or an email-to-text address), including Best Time to Call, Lesson Interest and Start Timing.
3. Optional: create a deal in the John Hughes Golf pipeline at the "Call requested" stage.

**Finding IDs:**
- API URL and key: ActiveCampaign > Settings > Developer.
- List ID: open the list; the number is in the address bar.
- Tag ID and field IDs: with the API key, `GET {API_URL}/api/3/tags?search=LP-orlandogolfcoaching` and `GET {API_URL}/api/3/fields`, or look in the address bar when editing them.

## 4. Worker variables (Settings > Variables and Secrets, not the Build section)

The two keys are secrets added in the dashboard. Everything else is already set in `wrangler.jsonc`; the table is for reference.

| Variable | Value | Required |
| --- | --- | --- |
| `TURNSTILE_SECRET_KEY` | from Turnstile | Yes, secret |
| `TURNSTILE_HOSTNAMES` | Leave blank for orlandogolfcoaching.com and www. To test on a preview, list every hostname, comma separated, e.g. `orlandogolfcoaching.com,www.orlandogolfcoaching.com,xyz.pages.dev` | Optional |
| `AC_API_URL` | `https://johnhughesgolf.api-us1.com` | Yes |
| `AC_API_KEY` | from ActiveCampaign | Yes, secret |
| `AC_LIST_ID` | `12` | Yes |
| `AC_TAG_ID` | `150` | Yes |
| `AC_FIELD_BEST_TIME` | `48` | Recommended |
| `AC_FIELD_INTEREST` | `49` | Recommended |
| `AC_FIELD_START_TIMING` | `50` | Recommended |
| `AC_FIELD_SCORE` | `51` | Optional |
| `AC_FIELD_GOAL` | `52` | Optional |
| `AC_FIELD_SOURCE_DOMAIN` | `53` | Recommended |
| `AC_FIELD_UTM` | `54` | Optional |
| `AC_FIELD_CONSENT` | `55` | Recommended |

Any field variable left blank is skipped. Redeploy after changing variables.

## 5. Test end to end

1. Submit the form on the live site with your own details.
2. Check: contact in ActiveCampaign with fields filled in, on the OrlandoGolfCoaching.com Lead List, tagged, with a note.
3. Check: confirmation email arrived, and John's alert arrived.
4. Check a bad submission (wrong email) shows a clear message on the page.
5. If something fails, Cloudflare > the Worker > Observability (or `npx wrangler tail`) shows the reason.

## 6. Redirects

1. Add orlandogolfcoaching.net to Cloudflare and switch its nameservers at GoDaddy.
2. In each zone, add a proxied DNS record so traffic reaches Cloudflare: type `AAAA`, name `@`, value `100::`, proxied. Add the same for `www`.
3. Account Home > Bulk Redirects > create a list from `redirects.csv` (delete the header row if the import rejects it), then create a Bulk Redirect rule that uses the list.
4. Settings in the file: 301, keep query strings (so campaign codes survive), include subdomains (covers www), send every path to the home page.

## 7. Analytics

Turn on Cloudflare Web Analytics for the Worker (no code change; the content security policy already allows it). If you add Google Analytics later, add its domains to `_headers`. The page already fires a `call_requested` event into `dataLayer` and `gtag` when a request goes through.
