-- ============================================================================
-- Armazém da Cidadania - CPF opcional para o nível 'infraestrutura'
-- ============================================================================
-- Contas de infraestrutura são de aparelhos (totem/painel), não de uma pessoa,
-- então não têm CPF. Para os demais níveis o CPF continua obrigatório (a regra
-- fica na aplicação).
--
-- O índice único `funcionarios_cpf_key` (0001_init.sql) é mantido: em Postgres,
-- um índice único normal aceita vários NULL e continua impedindo CPFs
-- repetidos quando preenchido. O backend grava NULL (nunca string vazia).
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

alter table public.funcionarios alter column cpf drop not null;
