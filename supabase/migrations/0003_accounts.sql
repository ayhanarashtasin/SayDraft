-- Accounts: every row of user data belongs to one signed-in user (Supabase Auth, auth.users).
-- Safe to run again. If rows without an owner exist, it stops and changes nothing (see step 3).
-- The app talks to the database only through its server (service role); row level security stays on
-- with no policies for anon/authenticated, so the public key still cannot read or write anything.

-- 1. Owner columns. They start nullable so an existing database can be checked first.
alter table public.notes        add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.tags         add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.prompts      add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.dictionary   add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.replacements add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.actions      add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.settings     add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- 2. The shared-workspace defaults have no owner. Built-in prompts and the "defaults created" marker
--    are created again for every new account on first use.
delete from public.settings where user_id is null and key = 'default_prompts_initialized';
delete from public.prompts  where user_id is null and builtin_key is not null;

-- 3. Stop, changing nothing, if real data without an owner is left (the whole script is one transaction).
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['notes', 'tags', 'prompts', 'dictionary', 'replacements', 'actions', 'settings'] loop
    execute format('select count(*) from public.%I where user_id is null', t) into n;
    if n > 0 then
      raise exception 'Table % has % row(s) without an owner. Assign them (update ... set user_id = ...) or delete them, then run this migration again.', t, n;
    end if;
  end loop;
end $$;

alter table public.notes        alter column user_id set not null;
alter table public.tags         alter column user_id set not null;
alter table public.prompts      alter column user_id set not null;
alter table public.dictionary   alter column user_id set not null;
alter table public.replacements alter column user_id set not null;
alter table public.actions      alter column user_id set not null;
alter table public.settings     alter column user_id set not null;

-- 4. Uniqueness is per user from now on (two people can both have a tag called "Work").
--    The old global rules are found in the catalog instead of by name, because the first migration
--    may have been applied by hand.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.prompts'::regclass
      and c.contype = 'u'
      and not exists (
        select 1 from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'user_id'
      )
  loop
    execute format('alter table public.prompts drop constraint %I', r.conname);
  end loop;

  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.settings'::regclass
      and c.contype = 'p'
      and not exists (
        select 1 from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'user_id'
      )
  loop
    execute format('alter table public.settings drop constraint %I', r.conname);
  end loop;

  for r in
    select i.indexrelid::regclass::text as index_name
    from pg_index i
    where i.indrelid in ('public.tags'::regclass, 'public.dictionary'::regclass,
                         'public.replacements'::regclass, 'public.prompts'::regclass)
      and i.indisunique
      and not i.indisprimary
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      and not exists (
        select 1 from pg_attribute a
        where a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[]) and a.attname = 'user_id'
      )
  loop
    execute format('drop index %s', r.index_name);
  end loop;
end $$;

create unique index if not exists idx_tags_user_title_lower on public.tags (user_id, lower(title));
create unique index if not exists idx_dictionary_user_word_lower on public.dictionary (user_id, lower(word));
create unique index if not exists idx_replacements_user_find_lower on public.replacements (user_id, lower(find));

do $$
begin
  -- A full constraint, not a partial index: the app's upsert (onConflict) can only target a constraint.
  -- Custom prompts have no builtin_key (null) and never collide.
  if not exists (select 1 from pg_constraint where conrelid = 'public.prompts'::regclass and conname = 'prompts_user_id_builtin_key_key') then
    alter table public.prompts add constraint prompts_user_id_builtin_key_key unique (user_id, builtin_key);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.settings'::regclass and contype = 'p') then
    alter table public.settings add primary key (user_id, key);
  end if;
end $$;

-- 5. Indexes for the new foreign keys and the per-user note lists.
--    (tags, dictionary, replacements, prompts and settings are covered by their unique keys above.)
create index if not exists idx_notes_user_updated on public.notes (user_id, archived, updated_at desc);
create index if not exists idx_notes_user_created on public.notes (user_id, archived, created_at desc);
create index if not exists idx_actions_user on public.actions (user_id);
drop index if exists public.idx_notes_updated;
drop index if exists public.idx_notes_created;

notify pgrst, 'reload schema';
