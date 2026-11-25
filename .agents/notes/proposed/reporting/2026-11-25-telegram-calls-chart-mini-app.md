# Agent Note: Telegram calls chart Mini App

Status: proposed — built and tested locally, not yet deployed

## Problem

The daily Telegram report shows the calls trend only as text, such as
`📞 Calls: 20 · 47m ↓37% · avg 2m 21s`. The owner wants an actual chart of
calls per day, as close to a real HTML chart as Telegram allows, reachable
from the report.

## Proposal

The report message carries an inline `web_app` button that opens
`/telegram/calls` as a Mini App. The page renders a Recharts bar chart through
the shadcn `ChartContainer`, with 30 days of calls and the report's 14-day
baseline. `calls-chart/route.ts` serves the data and accepts only init data
signed for the admin's Telegram user ID.

- Auth uses Telegram's Mini App init data, not a signed link in the message.
  Each tap carries fresh signed data tied to the user, links never need to
  expire, and the page always shows current data.
- The page reads init data from the URL fragment instead of loading
  `telegram-web-app.js`, which the CSP `script-src` does not allow.
- The bot token comes from the existing `TELEGRAM_WEBHOOK_URL`, so the feature
  adds no environment variable.

## Alternatives considered

- `sendWidget` (inline HTML widget in the message). It is the only way to put a
  live HTML or SVG chart inside a message, but since about 2026-11-13 the
  production Bot API returns `INPUT_MEDIA_WIDGET_NOT_ALLOWED` for ordinary
  bots, even for `<p>hi</p>` in a private chat. Revisit when Telegram opens
  widgets to ordinary bots; see [Widget preview](#widget-preview).
- `sendRichMessage` with a rendered PNG. It works, but the owner rejected it:
  a picture of a chart has no tooltips and no interactivity.
- A Unicode sparkline in the text report. It needs no new surface, but the
  owner rejected it as not a chart.

## Widget preview

The owner approved an inline widget that draws the same data. Telegram's own
runtime, [`TelegramMessenger/widget-sandbox`](https://github.com/TelegramMessenger/widget-sandbox)
v0.6.5, rendered it in light and dark bubbles with no profile diagnostics:
627 B compressed (limit 4096), 39 nodes, 12 ms of JavaScript.

The widget is one SVG with no script. Bars use solid theme colours, not
`opacity`, because the profile limits elements with transparency to 16:

```html
<style>
  body {
    margin: 0;
    padding: 10px 12px;
    font: 13px sans-serif;
    color: var(--tg-theme-text-color);
  }
  .b {
    fill: var(--tg-theme-section-separator-color, #c8c8c8);
  } /* earlier days */
  .y {
    fill: var(--tg-theme-button-color);
  } /* yesterday */
  .a {
    stroke: var(--tg-theme-hint-color);
    stroke-dasharray: 3 3;
  } /* 14d average */
  .t {
    fill: var(--tg-theme-text-color);
    font-size: 10px;
  }
  .h {
    color: var(--tg-theme-hint-color);
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
</style>
<div><b>📞 Calls / day</b> · yesterday 20</div>
<svg viewBox="0 0 300 110" width="100%">
  <!-- one <rect class="b|y" rx="2"> per day for 15 days; yesterday's count as <text class="t"> -->
  <line x1="0" x2="300" class="a" y1="…" y2="…" />
</svg>
<div class="h">
  <span>11-10</span><span>14d avg 22.5</span><span>11-24</span>
</div>
```

Before sending it: build it from `countCallsPerDay` so it excludes internal
users, keep yesterday's label clear of the average line, and send it with
`sendWidget` after the text report, ignoring `INPUT_MEDIA_WIDGET_NOT_ALLOWED`.

## Acceptance criteria

- Tapping the button in the native Telegram app opens the chart with data
  matching the report's Calls section.
- The API returns 401 without init data, with init data for another user, with
  a modified hash, and with init data older than an hour.

## Risks

- Telegram Web cannot open the page while the site CSP sets
  `frame-ancestors 'none'`.
- If `TELEGRAM_WEBHOOK_URL` stops embedding the bot token, the route rejects
  every request.
- `TELEGRAM_ADMIN_CHAT_ID` assumes the report goes to the admin's private
  chat, whose ID equals the admin's user ID.
