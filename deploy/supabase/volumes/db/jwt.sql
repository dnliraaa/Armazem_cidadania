-- Roda UMA vez, na primeira inicialização do Postgres: guarda o segredo/expiração do JWT no banco
-- (usados por funções do Supabase que validam tokens).

\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
