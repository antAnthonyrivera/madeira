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
  category text default '🏔️',
  notes text,
  location text,
  address text,
  lat double precision,
  lng double precision,
  tagged_members jsonb not null default '[]'::jsonb,
  pin_hidden boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  base_currency text default 'EUR',
  created_at timestamptz not null default now()
);

alter table public.activities add column if not exists trip_id uuid references public.trips(id) on delete cascade;
alter table public.activities add column if not exists cost decimal(10,2) default 0;
alter table public.activities add column if not exists category text default '🏔️';
alter table public.activities add column if not exists address text;
alter table public.activities add column if not exists tagged_members jsonb not null default '[]'::jsonb;
alter table public.activities add column if not exists pin_hidden boolean not null default false;

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

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_name text not null,
  created_at timestamptz not null default now(),
  unique (activity_id, user_name)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  from_user text not null default 'Activity tagged',
  activity_id uuid not null references public.activities(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.activities enable row level security;
alter table public.comments enable row level security;
alter table public.notification_actions enable row level security;
alter table public.trips enable row level security;
alter table public.votes enable row level security;
alter table public.notifications enable row level security;

drop policy if exists members_public_all on public.members;
drop policy if exists activities_public_all on public.activities;
drop policy if exists comments_public_all on public.comments;
drop policy if exists notification_actions_public_all on public.notification_actions;
drop policy if exists trips_public_all on public.trips;
drop policy if exists votes_public_all on public.votes;
drop policy if exists notifications_public_all on public.notifications;

create policy members_public_all on public.members for all using (true) with check (true);
create policy activities_public_all on public.activities for all using (true) with check (true);
create policy comments_public_all on public.comments for all using (true) with check (true);
create policy notification_actions_public_all on public.notification_actions for all using (true) with check (true);
create policy trips_public_all on public.trips for all using (true) with check (true);
create policy votes_public_all on public.votes for all using (true) with check (true);
create policy notifications_public_all on public.notifications for all using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.members;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.trips;
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
  alter publication supabase_realtime add table public.votes;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notification_actions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;
