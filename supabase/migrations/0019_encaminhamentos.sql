-- ============================================================================
-- Armazém da Cidadania - Nova ficha do núcleo: motivo e encaminhamentos
-- ============================================================================
-- "Resolvida" ganha um motivo quando a resposta é não, e o antigo
-- "Houve encaminhamento?" dá lugar a dois tipos:
--   - externo: para serviços externos cadastrados por núcleo (ou "outros");
--   - interno: para outros núcleos, gerando uma nova solicitação na fila deles.
--
-- A coluna antiga `atendimentos.houve_encaminhamento` NÃO é apagada: ela segue
-- valendo para os registros antigos (e o histórico os mostra como "registro antigo").
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) SERVICOS_EXTERNOS (cadastro por núcleo, feito pelo administrador)
-- ----------------------------------------------------------------------------

create table if not exists public.servicos_externos (
  id          uuid primary key default gen_random_uuid(),
  nucleo_id   uuid not null references public.nucleos (id) on delete cascade,
  nome        text not null,
  ativo       boolean not null default true,
  criado_por  uuid references public.funcionarios (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Nome único (case-insensitive) dentro do mesmo núcleo.
create unique index if not exists servicos_externos_nucleo_nome_key
  on public.servicos_externos (nucleo_id, lower(nome));

comment on table public.servicos_externos is 'Serviços externos para os quais um núcleo encaminha o cidadão';

drop trigger if exists set_updated_at on public.servicos_externos;
create trigger set_updated_at
  before update on public.servicos_externos
  for each row execute function public.set_updated_at();

alter table public.servicos_externos enable row level security;

-- ----------------------------------------------------------------------------
-- 2) ATENDIMENTOS: motivo e tipos de encaminhamento
-- ----------------------------------------------------------------------------

alter table public.atendimentos
  add column if not exists motivo_nao_resolvida text,
  add column if not exists houve_encaminhamento_externo boolean,
  add column if not exists encaminhamento_externo_outros text,
  add column if not exists houve_encaminhamento_interno boolean;

comment on column public.atendimentos.motivo_nao_resolvida is 'Explicação do motivo quando a demanda não foi resolvida';
comment on column public.atendimentos.houve_encaminhamento_externo is 'Houve encaminhamento para serviços externos (nulo em registros antigos)';
comment on column public.atendimentos.encaminhamento_externo_outros is 'Descrição livre de serviço externo que não está cadastrado ("Outros")';
comment on column public.atendimentos.houve_encaminhamento_interno is 'Houve encaminhamento para outros núcleos (nulo em registros antigos)';

-- ----------------------------------------------------------------------------
-- 3) Serviços externos escolhidos em cada atendimento
-- ----------------------------------------------------------------------------

create table if not exists public.atendimento_servicos_externos (
  atendimento_id  uuid not null references public.atendimentos (id) on delete cascade,
  servico_id      uuid not null references public.servicos_externos (id),
  primary key (atendimento_id, servico_id)
);

alter table public.atendimento_servicos_externos enable row level security;

-- ----------------------------------------------------------------------------
-- 4) Encaminhamentos internos (para outros núcleos)
-- ----------------------------------------------------------------------------
-- `pendente_gerado_id` é a solicitação criada na fila do núcleo de destino.

create table if not exists public.atendimento_encaminhamentos_internos (
  atendimento_id      uuid not null references public.atendimentos (id) on delete cascade,
  nucleo_destino_id   uuid not null references public.nucleos (id),
  pendente_gerado_id  uuid references public.atendimentos_pendentes (id) on delete set null,
  primary key (atendimento_id, nucleo_destino_id)
);

alter table public.atendimento_encaminhamentos_internos enable row level security;
