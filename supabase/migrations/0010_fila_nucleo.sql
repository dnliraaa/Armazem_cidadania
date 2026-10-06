-- ============================================================================
-- Armazém da Cidadania - Fila do Núcleo (encaminhamento da recepção)
-- ============================================================================
-- A recepção não cria mais um atendimento definitivo: ela ENCAMINHA o cidadão
-- para um núcleo, criando um registro em `atendimentos_pendentes` que espera
-- numa fila própria do núcleo. Só quando o núcleo atende e confirma é que vira
-- um `atendimentos` definitivo.
--
-- Também corrige o que a 0009 deixou em `atendimentos`.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ajustes em ATENDIMENTOS (desfaz o que não faz mais sentido da 0009)
-- ----------------------------------------------------------------------------

-- senha_id passa a viver em atendimentos_pendentes (o vínculo com o
-- atendimento definitivo é via atendimentos.pendente_id).
drop index if exists public.atendimentos_senha_id_idx;
alter table public.atendimentos drop column if exists senha_id;

-- `status` (adicionado na 0009) é mantido para não mexer no que já foi
-- aplicado: atendimentos só nascem quando o núcleo confirma, então o valor é
-- sempre 'concluido' (default). `unidade_id` também é mantido (copiado do
-- pendente na confirmação).

-- nucleo_id volta a ser NOT NULL: atendimentos só existem depois que o núcleo
-- confirma, e todo pendente já nasce com nucleo_id. Se sobraram atendimentos
-- de teste criados pelo fluxo antigo (sem núcleo), o bloco abaixo avisa em vez
-- de apagar dados por conta própria.
do $$
begin
  if exists (select 1 from public.atendimentos where nucleo_id is null) then
    raise exception
      'Existem atendimentos com nucleo_id nulo (criados pelo fluxo antigo da migration 0009). Confira com: select * from public.atendimentos where nucleo_id is null; -- e apague os de teste (delete from public.atendimentos where nucleo_id is null and status = ''encaminhado'';) antes de rodar esta migration de novo.';
  end if;
end $$;

alter table public.atendimentos alter column nucleo_id set not null;

-- demanda_principal_id continua NULLABLE de propósito: hoje um pendente pode
-- ser confirmado só com "outras demandas" (ou com o alerta ignorado), então
-- forçar NOT NULL aqui quebraria a confirmação.

-- ----------------------------------------------------------------------------
-- 2) ATENDIMENTOS_PENDENTES: dados do encaminhamento
-- ----------------------------------------------------------------------------

alter table public.atendimentos_pendentes
  add column if not exists prioridade boolean not null default false,
  add column if not exists senha_id uuid references public.senhas (id) on delete set null,
  add column if not exists unidade_id uuid references public.unidades (id) on delete set null,
  add column if not exists chamado_por uuid references public.funcionarios (id) on delete set null,
  add column if not exists chamado_em timestamptz;

create index if not exists atendimentos_pendentes_fila_idx
  on public.atendimentos_pendentes (nucleo_id, status, created_at);
create index if not exists atendimentos_pendentes_senha_id_idx
  on public.atendimentos_pendentes (senha_id);

comment on column public.atendimentos_pendentes.prioridade is 'true = caso prioritário na fila do núcleo';
comment on column public.atendimentos_pendentes.senha_id is 'Senha da recepção que originou o encaminhamento';
comment on column public.atendimentos_pendentes.unidade_id is 'Unidade de origem (herdada da senha)';
comment on column public.atendimentos_pendentes.chamado_por is 'Funcionário do núcleo que chamou o cidadão (status em_atendimento)';

-- Novo valor de status: 'em_atendimento' = chamado por alguém do núcleo, para
-- dois funcionários não pegarem o mesmo cidadão. Remove a(s) check(s) atual(is)
-- da coluna status (o nome pode variar) e recria com os 4 valores.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any (con.conkey)
    where rel.relname = 'atendimentos_pendentes'
      and con.contype = 'c'
      and att.attname = 'status'
  loop
    execute format('alter table public.atendimentos_pendentes drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.atendimentos_pendentes
  add constraint atendimentos_pendentes_status_check
  check (status in ('pendente_revisao', 'em_atendimento', 'confirmado', 'rejeitado'));

-- ----------------------------------------------------------------------------
-- 3) FUNCIONARIOS: vínculo com núcleo + nível 'nucleo'
-- ----------------------------------------------------------------------------
-- nucleo_id só é obrigatório (na aplicação) quando role = 'nucleo'.

alter table public.funcionarios
  add column if not exists nucleo_id uuid references public.nucleos (id) on delete set null;

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any (con.conkey)
    where rel.relname = 'funcionarios'
      and con.contype = 'c'
      and att.attname = 'role'
  loop
    execute format('alter table public.funcionarios drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.funcionarios
  add constraint funcionarios_role_check check (role in ('admin', 'atendente', 'recepcao', 'nucleo'));
