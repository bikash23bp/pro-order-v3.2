CREATE EXTENSION IF NOT EXISTS postgres_fdw;

DROP SERVER IF EXISTS audit_src CASCADE;
CREATE SERVER audit_src FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'db.aecaylmfhggcmekzuwcu.supabase.co', port '5432', dbname 'postgres', sslmode 'require', fetch_size '5000');

CREATE USER MAPPING FOR postgres SERVER audit_src
  OPTIONS (user 'postgres', password '@RAZAAmbarish509');

DROP SCHEMA IF EXISTS audit_remote CASCADE;
CREATE SCHEMA audit_remote;
IMPORT FOREIGN SCHEMA public FROM SERVER audit_src INTO audit_remote;

SET session_replication_role = replica;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
      AND EXISTS (SELECT 1 FROM information_schema.tables a
                  WHERE a.table_schema='audit_remote' AND a.table_name=t.table_name)
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', r.table_name);
  END LOOP;
END$$;

DO $$
DECLARE r record; col_list text;
BEGIN
  FOR r IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
      AND EXISTS (SELECT 1 FROM information_schema.tables a
                  WHERE a.table_schema='audit_remote' AND a.table_name=t.table_name)
  LOOP
    SELECT string_agg(quote_ident(c.column_name), ',' ORDER BY c.ordinal_position)
      INTO col_list
      FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=r.table_name
        AND c.is_generated = 'NEVER'
        AND c.is_identity = 'NO'
        AND EXISTS (SELECT 1 FROM information_schema.columns ac
                    WHERE ac.table_schema='audit_remote'
                      AND ac.table_name=r.table_name
                      AND ac.column_name=c.column_name
                      AND ac.is_generated='NEVER');
    IF col_list IS NOT NULL THEN
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM audit_remote.%I',
                     r.table_name, col_list, col_list, r.table_name);
      RAISE NOTICE 'Copied table %', r.table_name;
    END IF;
  END LOOP;
END$$;

RESET session_replication_role;

DROP SCHEMA audit_remote CASCADE;
DROP SERVER audit_src CASCADE;