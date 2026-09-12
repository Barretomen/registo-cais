-- Visualizações operacionais legíveis. Mantêm o RLS da tabela base.

-- A primeira versão da tabela foi criada sem identificador. O cliente já envia
-- este campo; completar os registos antigos torna saídas e autorizações seguras.
alter table public.movements add column if not exists id text;
alter table public.movements replica identity full;
alter table public.movements disable trigger set_movement_metadata;
alter table public.movements disable trigger audit_movement;
update public.movements set id = gen_random_uuid()::text where id is null;
alter table public.movements enable trigger set_movement_metadata;
alter table public.movements enable trigger audit_movement;
alter table public.movements alter column id set default gen_random_uuid()::text;
alter table public.movements alter column id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.movements'::regclass and contype = 'p'
  ) then
    alter table public.movements add constraint movements_pkey primary key (id);
  end if;
end $$;
alter table public.movements replica identity default;

create or replace view public.movements_feed
with (security_invoker = true)
as
select
  id,
  site_id,
  entry_at,
  coalesce(exit_at::text, '—') as exit_at,
  case kind when 'estafetas' then 'Estafeta' when 'viaturas' then 'Viatura' else 'Pessoa' end as tipo,
  coalesce(vehicle_plate, person_name, '—') as identificacao,
  coalesce(vehicle_persons, activity, platform, '—') as detalhes,
  coalesce(company, platform, '—') as empresa_ou_plataforma,
  destination as destino,
  case status when 'inside' then 'Dentro' when 'left' then 'Saiu' else 'Sem saída' end as estado,
  case authorization_status when 'pending' then 'Por autorizar' when 'authorized' then 'Autorizado' when 'denied' then 'Não autorizado' else '—' end as autorizacao,
  coalesce(guard_name, '—') as vigilante
from public.movements
where deleted_at is null
order by entry_at desc;

create or replace view public.movements_estafetas
with (security_invoker = true)
as select id, site_id, person_name as nome, platform as plataforma, destination as destino, entry_at as entrada, exit_at as saida, status as estado, guard_name as vigilante
from public.movements where kind = 'estafetas' and deleted_at is null order by entry_at desc;

create or replace view public.movements_viaturas
with (security_invoker = true)
as select id, site_id, vehicle_plate as matricula, vehicle_persons as pessoas, company as empresa, destination as destino, entry_at as entrada, exit_at as saida, status as estado, guard_name as vigilante
from public.movements where kind = 'viaturas' and deleted_at is null order by entry_at desc;

create or replace view public.movements_pessoas
with (security_invoker = true)
as select id, site_id, person_name as nome, company as empresa, activity as atividade, destination as destino, entry_at as entrada, exit_at as saida, authorization_status as autorizacao, status as estado, guard_name as vigilante
from public.movements where kind = 'pessoas' and deleted_at is null order by entry_at desc;

revoke all on public.movements_feed, public.movements_estafetas, public.movements_viaturas, public.movements_pessoas from anon, authenticated;
grant select on public.movements_feed, public.movements_estafetas, public.movements_viaturas, public.movements_pessoas to authenticated;

-- Esta função já existia no projeto; o evento continua a funcionar, mas deixa de ser invocável pela API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
