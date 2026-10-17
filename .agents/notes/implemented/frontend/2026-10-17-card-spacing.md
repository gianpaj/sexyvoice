# Card spacing

The shared shadcn `Card` owns vertical padding (`py-6`) and spacing
between slots (`gap-6`). `CardHeader` and `CardContent` own horizontal
padding (`px-6`). The generation settings, audio generator, and cloning
form rely on these defaults to avoid doubled vertical padding and
misaligned mobile edges.

`PricingCards` leaves horizontal gutters to callers. The homepage uses
`xl:px-10`; the credits dashboard has no horizontal gutter.

The generation page preserves its credit-balance error branch. Its
successful branch renders `GenerateUI` directly. The outer page container
owns bottom spacing for both the successful and error branches.

The homepage retains the current hero typography, including German mobile
sizing. Generated Next.js type declarations match `main`.

Verification: `pnpm fixall` and `pnpm type-check` pass. Test and hosted
preview results are recorded in the pull request.
