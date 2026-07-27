-- Roster Builder — email whitelist / pending invites.
--
-- Lets owners pre-authorize people by email *before* they have ever logged in.
-- An invite is (roster_id, email, role). When a user signs in, any invites
-- matching their email are converted into real roster_members rows and then
-- deleted. Two mechanisms ensure this happens:
--   1. A trigger on auth.users (fires on first signup) — the primary path.
--   2. A claim_my_invites() RPC the client calls on load — covers users who
--      already existed before being invited.

create table if not exists public.roster_invites (
  roster_id   uuid not null references public.rosters (id) on delete cascade,
  email       text not null,
  role        public.roster_role not null default 'viewer',
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (roster_id, email)
);

create index if not exists roster_invites_email_idx on public.roster_invites (lower(email));

grant select, insert, update, delete on public.roster_invites to authenticated;

alter table public.roster_invites enable row level security;

-- Only a roster owner may see/manage that roster's invites.
create policy "invites_all_owner"
  on public.roster_invites for all
  using (public.roster_role_of(roster_id) = 'owner')
  with check (public.roster_role_of(roster_id) = 'owner');

-- Convert every invite matching an email into a membership, then drop those
-- invites. SECURITY DEFINER so it can write memberships regardless of caller.
create or replace function public.claim_invites_for(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null then
    return;
  end if;

  insert into public.roster_members (roster_id, user_id, role)
  select i.roster_id, p_user_id, i.role
  from public.roster_invites i
  where lower(i.email) = lower(p_email)
  on conflict (roster_id, user_id) do update set role = excluded.role;

  delete from public.roster_invites i
  where lower(i.email) = lower(p_email);
end;
$$;

-- Trigger path: claim invites the moment a new auth.users row is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.claim_invites_for(new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RPC path: let the current user claim their own pending invites on app load.
create or replace function public.claim_my_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.claim_invites_for(
    auth.uid(),
    (select email from auth.users where id = auth.uid())
  );
end;
$$;

grant execute on function public.claim_my_invites() to authenticated;

-- List pending (unclaimed) invites for the admin UI. Owner only.
create or replace function public.list_roster_invites(p_roster_id uuid)
returns table (email text, role public.roster_role)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.roster_role_of(p_roster_id) <> 'owner' then
    raise exception 'Only the roster owner can view invites';
  end if;

  return query
  select i.email, i.role
  from public.roster_invites i
  where i.roster_id = p_roster_id
  order by i.created_at asc;
end;
$$;

grant execute on function public.list_roster_invites(uuid) to authenticated;

-- Whitelist an email with a role (owner only). Upserts a pending invite.
create or replace function public.invite_member(
  p_roster_id uuid,
  p_email text,
  p_role public.roster_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_uid uuid;
begin
  if public.roster_role_of(p_roster_id) <> 'owner' then
    raise exception 'Only the roster owner can invite members';
  end if;

  -- If the user already exists, add the membership directly instead of leaving
  -- a pending invite that would never be claimed.
  select id into existing_uid
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if existing_uid is not null then
    insert into public.roster_members (roster_id, user_id, role)
    values (p_roster_id, existing_uid, p_role)
    on conflict (roster_id, user_id) do update set role = excluded.role;
  else
    insert into public.roster_invites (roster_id, email, role, invited_by)
    values (p_roster_id, lower(trim(p_email)), p_role, auth.uid())
    on conflict (roster_id, email) do update set role = excluded.role;
  end if;
end;
$$;

grant execute on function public.invite_member(uuid, text, public.roster_role) to authenticated;

-- Revoke a pending invite (owner only).
create or replace function public.revoke_invite(p_roster_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.roster_role_of(p_roster_id) <> 'owner' then
    raise exception 'Only the roster owner can revoke invites';
  end if;

  delete from public.roster_invites
  where roster_id = p_roster_id and lower(email) = lower(trim(p_email));
end;
$$;

grant execute on function public.revoke_invite(uuid, text) to authenticated;
