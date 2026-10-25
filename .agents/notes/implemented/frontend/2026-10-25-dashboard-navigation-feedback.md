# Dashboard navigation feedback

## Decision

Dashboard pages have no route-level `loading.tsx`. After a sidebar click,
`DashboardUI` records the page the click leaves and shows `NavigationPending`
(`apps/web/components/navigation-pending.tsx`), a top bar that fades in after
100 ms, until the pathname changes.

A click on the current page clears the bar instead. Next.js still navigates on
a same-URL click, and a new navigation cancels the pending one, so the pathname
would never change to clear it. A server `redirect()` back to the current
pathname also leaves the bar on. Only Credits does that today: with no profile
row it redirects to Generate, so a click from Generate keeps the bar on until
the next navigation.

Rejected: a `useLinkStatus()` spinner inside the clicked link. Below 768px the
sidebar is a drawer that closes and unmounts on click, so phone users never saw
it. One bar outside the sidebar covers every width.

Credits renders its header after the profile lookup and streams
`CreditsBilling` behind `CreditsBillingSkeleton`. Only that section waits for
Stripe.

## Why route skeletons were removed

Once a Suspense fallback shows, React holds the content back until 300 ms after
the fallback appeared (`globalMostRecentFallbackTime + 300` in
`react-dom-client.production.js`). On Vercel, dashboard pages render in
60–180 ms on the server (History occasionally 460 ms), and a click reaches
content in about 250–400 ms. A route skeleton
therefore flashed on every click and delayed content past the 300 ms floor.
It also lowered Generate's Lighthouse LCP.

A skeleton belongs only where the server needs well over 300 ms. On the
dashboard, that is the Stripe part of Credits: four sequential calls of about
650 ms in total.

Rejected: a `loading.tsx` on every dashboard page. It gave instant feedback,
but content arrived later on every fast page.

## Measurement

Three Vercel preview builds of the same branch:

- A: no loaders, with temporary server timing logs
- B: a `loading.tsx` on every page
- C: this decision

A Playwright script logged in, waited 3 s on Generate, clicked each sidebar
link, and recorded when the destination heading appeared. Medians of 5–6
runs, in ms:

| Page     | A content | B content |         C content |
| -------- | --------: | --------: | ----------------: |
| Clone    |       307 |       332 |               270 |
| Call     |       398 |       412 |               412 |
| History  |       359 |       357 |               307 |
| Usage    |       257 |       324 |               285 |
| API Keys |       267 |       319 |               236 |
| Credits  |       967 |       983 | 272 (pricing 955) |

On B, the skeleton showed on every click for 300–960 ms.

Lighthouse 12 desktop, logged in, median of 3 runs:

| Page     | Build | Score |  LCP | Speed Index |
| -------- | ----- | ----: | ---: | ----------: |
| Generate | A     |    98 |  953 |        1311 |
| Generate | B     |    94 | 1556 |        1381 |
| Generate | C     |    99 |  814 |        1007 |
| Clone    | A     |    98 | 1110 |         948 |
| Clone    | B     |    98 |  950 |        1323 |
| Clone    | C     |    99 |  810 |         769 |
| Credits  | A     |    97 |  731 |        1457 |
| Credits  | B     |    99 |  706 |        1063 |
| Credits  | C     |    99 |  718 |        1146 |

These are lab runs from one desktop in Europe. Slow networks and cold
functions push more navigations past 300 ms; the pending bar covers those
without a route fallback. Real-user Core Web Vitals come from Vercel Speed
Insights.

## Verification

`e2e/dashboard-navigation.spec.ts` holds the History request and checks that
the bar reaches full opacity before the URL changes, then hides once the page
renders, at desktop width and at 390px through the drawer. With the click
handler disabled, the test fails. The full Playwright suite passed against a
production E2E build.
