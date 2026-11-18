# Agent Note: Banner renders on first paint

Status: implemented — public banners render in server HTML; the client hides dismissed or expired ones

## Problem

The landing, voice-cloning, and voice-call pages are statically rendered, so
the server cannot read the banner dismissal cookie. `Banner` started hidden on
those pages and appeared after the client read the cookie. That inserted an
80px bar above the header after first paint and pushed the whole page down:
CLS 0.06 on every landing visit while a banner was active, from a single shift
about 250ms after load.

## Decision

`Banner` starts visible on every page. After hydration, one effect hides it when
its dismissal cookie is set or its countdown has expired. Dashboard and public
pages share that path; `inDashboard` affects only layout.

The cookie check only ever hides the banner, so a late result cannot undo a
dismissal made while it was pending. A countdown renders `--` placeholders in
the server HTML, because the server has no visitor clock, and fills in the
digits on the first tick, so its row never appears late.

## Alternatives considered

- **Hide before paint with an inline `<head>` script.** It would read the
  cookie and hide the banner with CSS, giving zero shift for every visitor. It
  adds a script to maintain for a shift that only returning, dismissing visitors
  would see.
- **Read the cookie on the server.** It would make the static pages dynamic and
  cost more in TTFB and caching than it saves in layout shift.
- **Keep the banner hidden until the cookie check.** It avoids a flash for
  visitors who dismissed the banner, but it penalises every first-time visitor,
  who make up most landing traffic.

## Consequences

- First-time visitors: CLS 0 on the landing page with a banner active, measured
  with `agent-browser vitals`.
- Visitors who dismissed the banner see it once in the server HTML and then
  collapse after hydration: CLS about 0.06 for them.
- A banner whose countdown expires after the static build appears in the HTML
  and collapses after hydration until the next deployment regenerates the page.
