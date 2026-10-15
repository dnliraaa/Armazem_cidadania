-- ============================================================================
-- Endurecimento de permissões — Supabase na NUVEM (supabase.com)
-- ============================================================================
-- Rode UMA vez no SQL Editor do projeto (e de novo depois de criar tabelas/funções novas).
--
-- Por quê: este sistema só acessa o banco pelo backend, com a chave service_role. O frontend
-- usa apenas o login (Auth) e carrega a chave PÚBLICA (anon). Por padrão, a chave anon consegue
-- chamar funções do schema public (ex.: proxima_senha_numero) pela API REST. Este script fecha
-- isso: só a service_role acessa as tabelas e funções de public, inclusive as futuras.
--
-- É o mesmo bloco que deploy/aplicar-migrations.sh aplica no Supabase self-hosted.
-- É seguro rodar de novo (idempotente). O login dos usuários não é afetado (usa o schema auth).
-- ============================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- Faz a API (PostgREST) recarregar o esquema.
notify pgrst, 'reload schema';

-- Conferência (opcional): a service_role precisa continuar com acesso; anon/authenticated não.
--   select grantee, count(*) from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
--   group by grantee;
