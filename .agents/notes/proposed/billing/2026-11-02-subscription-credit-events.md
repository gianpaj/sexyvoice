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

Install, lint, fixall, type checks, all 36 Stripe tests, all 112 web test files,
and all 72 script tests pass. The serialized production build compiles, then
stops during page-data collection because `STRIPE_SECRET_KEY` is absent.

The commit checks run on the PR diff against main with `lint-staged --diff`.
Its default stash backup fails on main's tracked-directory-to-symlink change
under `.claude/skills/`; the formatter and type-check tasks still run.
