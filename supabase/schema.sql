-- Registo Cais: esquema inicial para Supabase/Postgres.
-- Os utilizadores novos ficam inativos até validação explícita no painel.

create schema if not exists private;

create table if not exists public.sites (
  id uuid primary key,
  name text not null,
  retention_days integer not null default 90 check (retention_days between 1 and 730),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.sites (id,name,retention_days)
values ('00000000-0000-4000-8000-000000000001','Palácio do Gelo — Cais',90)
on conflict (id) do nothing;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id),
  role text not null default 'guard' check (role in ('guard','centralist','admin')),
  display_name text not null default '',
  employee_number text not null default '',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.movements (
  id text primary key,
  site_id uuid not null references public.sites(id),
  kind text not null check (kind in ('estafetas','viaturas','pessoas')),
  person_name text,
  vehicle_plate text,
  vehicle_persons text,
  company text,
  destination text not null,
  activity text,
  platform text,
  entry_date date not null,
  entry_time time not null,
  entry_at timestamptz not null,
  exit_date date,
  exit_time time,
  exit_at timestamptz,
  status text not null default 'inside' check (status in ('inside','left','unknown')),
  authorization_status text check (authorization_status is null or authorization_status in ('pending','authorized','denied')),
  authorization_date date,
  authorization_time time,
  authorization_at timestamptz,
  guard_name text not null default '',
  guard_number text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '90 days'),
  deleted_at timestamptz,
  constraint movement_identity check (
    (kind='estafetas' and nullif(person_name,'') is not null and nullif(platform,'') is not null)
    or (kind='viaturas' and nullif(vehicle_plate,'') is not null and nullif(vehicle_persons,'') is not null)
    or (kind='pessoas' and nullif(person_name,'') is not null and nullif(company,'') is not null)
  )
);

create index if not exists movements_site_entry_idx on public.movements(site_id,entry_at desc);
create index if not exists movements_site_status_idx on public.movements(site_id,status) where deleted_at is null;
create index if not exists movements_retention_idx on public.movements(retention_until) where deleted_at is null;

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites(id),
  movement_id text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists audit_logs_site_changed_idx on public.audit_logs(site_id,changed_at desc);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(user_id,site_id)
  values(new.id,'00000000-0000-4000-8000-000000000001')
  on conflict(user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.set_movement_metadata()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.updated_at=now();
  new.updated_by=auth.uid();
  if tg_op='INSERT' then
    new.created_by=auth.uid();
    new.updated_by=auth.uid();
    select now() + make_interval(days=>s.retention_days)
      into new.retention_until from public.sites s where s.id=new.site_id;
  else
    new.created_by=old.created_by;
    new.site_id=old.site_id;
    new.retention_until=old.retention_until;
  end if;
  return new;
end;
$$;

revoke all on function private.set_movement_metadata() from public,anon,authenticated;

drop trigger if exists set_movement_metadata on public.movements;
create trigger set_movement_metadata before insert or update on public.movements
for each row execute function private.set_movement_metadata();

create or replace function private.audit_movement()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  source_row public.movements;
begin
  source_row=case when tg_op='DELETE' then old else new end;
  insert into public.audit_logs(site_id,movement_id,action,actor_id,old_data,new_data)
  values(source_row.site_id,source_row.id,tg_op,auth.uid(),case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return source_row;
end;
$$;

revoke all on function private.audit_movement() from public,anon,authenticated;
drop trigger if exists audit_movement on public.movements;
create trigger audit_movement after insert or update or delete on public.movements
for each row execute function private.audit_movement();

alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.movements enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.sites,public.profiles,public.movements,public.audit_logs from anon,authenticated;
grant select on table public.sites,public.profiles,public.movements,public.audit_logs to authenticated;
grant insert,update on table public.movements to authenticated;

drop policy if exists sites_select_own on public.sites;
create policy sites_select_own on public.sites for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.site_id=sites.id and p.active));

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists movements_select_site on public.movements;
create policy movements_select_site on public.movements for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.site_id=movements.site_id and p.active));

drop policy if exists movements_insert_guard on public.movements;
create policy movements_insert_guard on public.movements for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.site_id=movements.site_id and p.active and p.role in ('guard','admin'))
);

drop policy if exists movements_update_authorized on public.movements;
create policy movements_update_authorized on public.movements for update to authenticated
using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.site_id=movements.site_id and p.active and (p.role in ('centralist','admin') or movements.created_by=(select auth.uid())))
)
with check (
  site_id=(select p.site_id from public.profiles p where p.user_id=(select auth.uid()) and p.active)
);

drop policy if exists audit_select_central on public.audit_logs;
create policy audit_select_central on public.audit_logs for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.site_id=audit_logs.site_id and p.active and p.role in ('centralist','admin')));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='movements'
  ) then
    alter publication supabase_realtime add table public.movements;
  end if;
end $$;

comment on table public.movements is 'Movimentos de acesso ao cais, protegidos por RLS e retenção configurável.';
comment on table public.audit_logs is 'Histórico imutável das alterações aos movimentos.';
