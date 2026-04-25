create extension if not exists pgcrypto;

create table if not exists public.members (
  name text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  day date not null,
  time text not null,
  notes text,
  location text,
  lat double precision,
  lng double precision,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_actions (
  id bigint generated always as identity primary key,
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_name text not null,
  acted_at timestamptz not null default now(),
  unique (comment_id, user_name)
);

alter table public.members enable row level security;
alter table public.activities enable row level security;
alter table public.comments enable row level security;
alter table public.notification_actions enable row level security;

drop policy if exists members_public_all on public.members;
drop policy if exists activities_public_all on public.activities;
drop policy if exists comments_public_all on public.comments;
drop policy if exists notification_actions_public_all on public.notification_actions;

create policy members_public_all on public.members for all using (true) with check (true);
create policy activities_public_all on public.activities for all using (true) with check (true);
create policy comments_public_all on public.comments for all using (true) with check (true);
create policy notification_actions_public_all on public.notification_actions for all using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.members;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.activities;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.comments;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notification_actions;
exception
  when duplicate_object then null;
end $$;
