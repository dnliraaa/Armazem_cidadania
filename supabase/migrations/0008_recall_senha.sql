-- ============================================================================
-- Armazém da Cidadania - Segunda chance para senha que não compareceu
-- ============================================================================
-- Antes: "Não compareceu" descartava a senha na hora (status 'perdida').
-- Agora: a 1ª vez que isso acontece, a senha volta pra fila marcada para
-- rechamada (só pode ser sugerida de novo depois que pelo menos uma outra
-- senha for chamada no meio) e é oferecida como prioridade máxima na
-- rechamada. Só na 2ª vez que "não compareceu" é que ela é descartada de
-- verdade.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

alter table public.senhas
  add column if not exists tentativas int not null default 0,
  add column if not exists aguardando_recall boolean not null default false,
  add column if not exists recall_liberado boolean not null default false;

comment on column public.senhas.tentativas is 'Quantas vezes a senha já foi chamada (sucesso ou não)';
comment on column public.senhas.aguardando_recall is 'true = levou "não compareceu" na 1ª tentativa e está esperando ser rechamada';
comment on column public.senhas.recall_liberado is 'true = já passou pelo menos uma chamada de outra senha desde que entrou em aguardando_recall (pode ser sugerida de novo)';
