-- Roster Builder — in-app admin RPCs.
--
-- These SECURITY DEFINER functions let an owner manage a roster from the
-- browser without touching the SQL editor. They bypass RLS internally but each
-- one re-checks that the caller is an OWNER of the target roster, so they are
-- safe to expose to authenticated users. auth.users is not directly queryable
-- from the client, so email<->uid resolution happens here.

-- Create a roster owned by the caller. The existing trigger auto-adds the
-- owner membership. Returns the new roster id.
create or replace function public.create_roster(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.rosters (name, owner_id)
  values (coalesce(nullif(trim(p_name), ''), 'Untitled roster'), auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

-- Grant/update a member's role by email. Caller must own the roster and the
-- target user must have signed in at least once (so they exist in auth.users).
create or replace function public.set_member_role(
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
  target_uid uuid;
begin
  if public.roster_role_of(p_roster_id) <> 'owner' then
    raise exception 'Only the roster owner can manage members';
  end if;

  select id into target_uid
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if target_uid is null then
    raise exception 'No user with that email has signed in yet';
  end if;

  insert into public.roster_members (roster_id, user_id, role)
  values (p_roster_id, target_uid, p_role)
  on conflict (roster_id, user_id) do update set role = excluded.role;
end;
$$;

-- Remove a member. Caller must own the roster; the owner cannot remove
-- themselves (prevents orphaning the roster).
create or replace function public.remove_member(
  p_roster_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.roster_role_of(p_roster_id) <> 'owner' then
    raise exception 'Only the roster owner can manage members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'The owner cannot remove themselves';
  end if;

  delete from public.roster_members
  where roster_id = p_roster_id and user_id = p_user_id;
end;
$$;

-- List members of a roster (with email) for the admin UI. Caller must own it.
create or replace function public.list_roster_members(p_roster_id uuid)
returns table (user_id uuid, email text, role public.roster_role)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.roster_role_of(p_roster_id) <> 'owner' then
    raise exception 'Only the roster owner can view members';
  end if;

  return query
  select m.user_id, u.email::text, m.role
  from public.roster_members m
  join auth.users u on u.id = m.user_id
  where m.roster_id = p_roster_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.create_roster(text) to authenticated;
grant execute on function public.set_member_role(uuid, text, public.roster_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.list_roster_members(uuid) to authenticated;
