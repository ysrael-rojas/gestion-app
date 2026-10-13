-- Remove destructive table truncation from API roles for public application tables.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Prevent future postgres-owned public tables from inheriting TRUNCATE for API roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
