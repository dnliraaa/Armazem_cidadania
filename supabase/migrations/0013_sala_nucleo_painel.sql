-- ============================================================================
-- Armazém da Cidadania - Sala do núcleo no Painel de Chamados
-- ============================================================================
-- O Painel passa a mostrar também as chamadas feitas pelos núcleos. Cada
-- chamada de núcleo informa a sala/guichê de onde o funcionário atende.
--
-- Já existentes desde a 0010 (não precisam ser recriados):
--   - atendimentos_pendentes.chamado_em  (quando o núcleo chamou)
--   - status 'em_atendimento' na check constraint de atendimentos_pendentes
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

alter table public.atendimentos_pendentes
  add column if not exists sala text;

comment on column public.atendimentos_pendentes.sala is 'Sala/guichê informado pelo funcionário do núcleo ao chamar o cidadão (exibido no Painel)';

-- O Painel busca as chamadas do dia por unidade, da mais recente para a mais antiga.
create index if not exists atendimentos_pendentes_painel_idx
  on public.atendimentos_pendentes (unidade_id, chamado_em desc);
