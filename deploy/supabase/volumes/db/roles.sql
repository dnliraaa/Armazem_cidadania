-- Roda UMA vez, na primeira inicialização do Postgres (volume de dados vazio).
-- Define as senhas dos roles internos do Supabase com o POSTGRES_PASSWORD do .env.
-- ATENÇÃO: se você trocar o POSTGRES_PASSWORD depois, estes roles continuam com a senha
-- antiga — troque-os com ALTER USER (ver deploy/DEPLOY.md, seção de operação).

\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
