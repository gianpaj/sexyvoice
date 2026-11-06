# Subscription credit events

Subscription checkout completion syncs Redis. `invoice.payment_succeeded`
awards credits for initial payments and renewals, using the payment intent ID
as the transaction reference. Top-up checkout payments retain their own credit
insertion path.

The webhook route and tests live under `apps/web/`. The invoice handler retains
the named starter, standard, and pro price variables, first-month discounts,
recurring prices, and payment intent resolution for expanded objects.

Keeping credit insertion in both checkout and invoice handlers was rejected.
Stripe emits both events for the same payment, and subscription checkout
sessions can have a null payment intent. One invoice handler avoids duplicate
pricing and credit insertion logic.

Verification covers checkout with and without a payment intent, expanded
checkout customers, initial invoice payments, discounts, renewals, and the
checkout, invoice, and subscription lifecycle sequence. Database queries and
migrations are outside this change.

Validation against main at 7e29974b passes install, lint, fixall, type checks,
all 138 web test files with 2,030 passing tests and 18 skips, and all 132 script
tests. Tests use two workers and a private Redis 7.2.4 server. The serialized
production build compiles, then stops during page-data collection because R2
environment variables are missing. Main's migrations require user application
before database tests can run.

The commit checks run on the PR diff against main with `lint-staged --diff`.
Its default stash backup fails on main's tracked-directory-to-symlink change
under `.claude/skills/`; the formatter and type-check tasks still run.
