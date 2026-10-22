-- ============================================================================
-- Armazém da Cidadania - Tipo de senha "normal" passa a se chamar "geral"
-- ============================================================================
-- O totem agora oferece "Atendimento Geral" e "Atendimento Prioritário", e o
-- código exibido da senha passou de N012 para G012. Aqui o valor gravado em
-- senhas.tipo e senha_contadores.tipo acompanha: 'normal' -> 'geral'.
--
-- ATENÇÃO: rode junto com o deploy do backend que já envia 'geral'. O backend
-- antigo (que envia 'normal') deixa de conseguir gerar senhas depois disto.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

-- Remove o check antigo de senhas.tipo (o nome é gerado pelo Postgres).
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'senhas'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%normal%'
  loop
    execute format('alter table public.senhas drop constraint %I', c.conname);
  end loop;
end $$;

update public.senhas set tipo = 'geral' where tipo = 'normal';
update public.senha_contadores set tipo = 'geral' where tipo = 'normal';

alter table public.senhas
  add constraint senhas_tipo_check check (tipo in ('geral', 'prioritaria'));
