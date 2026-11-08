# pgvector schema compatibility

Production installs pgvector in `public`; local Supabase installs it in
`extensions`. The memory embedding column uses the installed extension's type.
A fixed `extensions.vector` signature prevents the dual-scope migration from
running against production.

The pending dual-scope migration resolves the extension namespace through
`pg_extension` and quotes it with `format` for the RPC argument type, cosine
operators, drop signature, and execution grants. The function retains an empty
search path and fully qualified table references. Missing pgvector produces an
explicit prerequisite error before dropping the function.

Relocating the extension is rejected because other database consumers may rely
on its schema. The migration preserves the extension and stored embeddings.

Validation applied the exact migration with Supabase db push to two disposable
local databases, starting from the six-column RPC. Both the public and
extensions installations passed all 23 memory assertions. Both databases were
removed. The complete local pgTAP suite passed 74 assertions; route tests passed
88 cases; scoped fixall and workspace type checks passed. Production diagnostics
read only extension, type, column, and function metadata.
