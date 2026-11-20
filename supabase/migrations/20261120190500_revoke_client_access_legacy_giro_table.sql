-- Restrict the accidental/legacy two-column table from client roles.
-- Keep service_role access for controlled server-side maintenance only.
REVOKE ALL PRIVILEGES ON TABLE public."Giro rápido br" FROM anon, authenticated;
