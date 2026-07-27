-- Roster Builder — initial schema + RBAC via Row-Level Security.
--
-- Storage model (first iteration): each roster is a single JSONB document that
-- mirrors the app's in-memory working object. Access is scoped by a membership
-- table that also carries the user's role. RLS enforces access in the database
-- regardless of client behavior; the frontend's permission flags are only for
-- fast UI gating.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rosters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Untitled roster',
  document    jsonb not null default '{}'::jsonb,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create type public.roster_role as enum ('owner', 'editor', 'viewer');

create table if not exists public.roster_members (
  roster_id   uuid not null references public.rosters (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.roster_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (roster_id, user_id)
);

create index if not exists roster_members_user_idx on public.roster_members (user_id);

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- RLS decides *which rows* a caller may touch, but the API roles still need
-- base table privileges or PostgREST returns "permission denied for table".
-- `authenticated` = signed-in users; `anon` gets nothing here (login required).
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.rosters to authenticated;
grant select, insert, update, delete on public.roster_members to authenticated;

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER to avoid RLS recursion)
--
-- Policies on roster_members cannot themselves SELECT from roster_members
-- (infinite recursion). These definer functions read membership with RLS
-- bypassed and are the single source of truth used by the policies below.
-- ---------------------------------------------------------------------------

create or replace function public.is_roster_member(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.roster_members m
    where m.roster_id = target and m.user_id = auth.uid()
  );
$$;

create or replace function public.roster_role_of(target uuid)
returns public.roster_role
language sql
security definer
set search_path = public
stable
as $$
  select m.role from public.roster_members m
  where m.roster_id = target and m.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.rosters enable row level security;
alter table public.roster_members enable row level security;

-- rosters: members can read; only owner/editor can update the document.
create policy "rosters_select_members"
  on public.rosters for select
  using (public.is_roster_member(id));

create policy "rosters_update_editors"
  on public.rosters for update
  using (public.roster_role_of(id) in ('owner', 'editor'))
  with check (public.roster_role_of(id) in ('owner', 'editor'));

-- rosters: an authenticated user may create a roster they own.
create policy "rosters_insert_owner"
  on public.rosters for insert
  with check (owner_id = auth.uid());

-- rosters: only the owner may delete.
create policy "rosters_delete_owner"
  on public.rosters for delete
  using (owner_id = auth.uid());

-- roster_members: a user can see membership rows for rosters they belong to.
create policy "members_select_own_rosters"
  on public.roster_members for select
  using (public.is_roster_member(roster_id));

-- roster_members: only an owner may add/change/remove members.
create policy "members_write_owner"
  on public.roster_members for all
  using (public.roster_role_of(roster_id) = 'owner')
  with check (public.roster_role_of(roster_id) = 'owner');

-- ---------------------------------------------------------------------------
-- On roster creation, make the creator an owner member automatically.
-- ---------------------------------------------------------------------------

create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roster_members (roster_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger rosters_add_owner_membership
  after insert on public.rosters
  for each row execute function public.add_owner_membership();
