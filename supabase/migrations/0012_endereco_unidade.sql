-- ============================================================================
-- Armazém da Cidadania - Endereço da unidade
-- ============================================================================
-- Campo opcional: as unidades já cadastradas ficam sem endereço até serem editadas.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

alter table public.unidades
  add column if not exists endereco text;

comment on column public.unidades.endereco is 'Endereço da unidade (opcional)';
