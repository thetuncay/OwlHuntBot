-- Tehlikeli server-side program çalıştırmayı PUBLIC'ten kaldır (superuser hariç).
-- Migration sonrası tek seferlik: psql -f scripts/postgres-revoke-program.sql
REVOKE pg_execute_server_program FROM PUBLIC;
