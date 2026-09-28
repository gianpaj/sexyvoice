-- Anonymous clients do not need access to credit balances. RLS already hides
-- these rows, but removing the table privilege closes the boundary in depth.
REVOKE ALL PRIVILEGES
  ON TABLE public.credits
  FROM anon;

-- Keep authenticated access read-only even if earlier privilege defaults differ.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.credits
  FROM authenticated;
