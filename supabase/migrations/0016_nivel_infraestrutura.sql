-- ============================================================================
-- Armazém da Cidadania - Nível 'infraestrutura'
-- ============================================================================
-- Funcionário responsável por configurar e deixar rodando os totens e painéis
-- da unidade em que atua. Usa o unidade_id que já existe em `funcionarios`
-- (obrigatório na aplicação para este nível, como em 'recepcao' e 'nucleo').
--
-- Só ajusta a check constraint de `role`, mantendo todos os valores atuais.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

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
  add constraint funcionarios_role_check
  check (role in ('admin', 'atendente', 'recepcao', 'nucleo', 'infraestrutura'));
