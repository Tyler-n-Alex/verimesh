create table if not exists public.nodes (
  id text primary key,
  name text not null,
  operator_id text not null,
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision not null default 0,
  status text not null default 'healthy',
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.edges (
  id bigint generated always as identity primary key,
  from_node text not null,
  to_node text not null,
  weight double precision not null default 0
);

create table if not exists public.telemetry (
  id bigint generated always as identity primary key,
  node_id text not null,
  ts bigint not null,
  load double precision,
  temp double precision,
  throughput double precision,
  power double precision,
  mem double precision,
  fan_rpm double precision
);
create index if not exists telemetry_node_ts_idx on public.telemetry (node_id, ts desc);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  ts bigint not null,
  type text not null,
  node_id text,
  message text
);

create table if not exists public.proposals (
  id bigint generated always as identity primary key,
  ts bigint not null,
  node_id text,
  diagnosis text,
  proposed_action text,
  target_nodes jsonb not null default '[]'::jsonb,
  expected_effect text,
  confidence double precision,
  risk_flags jsonb not null default '[]'::jsonb,
  llm_provider text,
  zerog_inference_valid boolean,
  zerog_root text
);

create table if not exists public.verdicts (
  id bigint generated always as identity primary key,
  proposal_id bigint references public.proposals (id) on delete cascade,
  verdict text not null,
  detail text,
  violated jsonb,
  projected jsonb,
  ts bigint not null
);

create table if not exists public.commits (
  id bigint generated always as identity primary key,
  proposal_id bigint references public.proposals (id) on delete cascade,
  applied_action text,
  zerog_root text,
  hedera_tx_id text,
  ts bigint not null
);

create table if not exists public.human_gates (
  id bigint generated always as identity primary key,
  proposal_id bigint references public.proposals (id) on delete cascade,
  status text not null default 'pending',
  world_id_nullifier text,
  chosen_action text,
  ts bigint not null
);

create table if not exists public.balances (
  id bigint generated always as identity primary key,
  node_id text not null,
  balance double precision not null default 0,
  budget_floor double precision not null default 0,
  earn_rate double precision not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists balances_node_idx on public.balances (node_id);

create table if not exists public.settlements (
  id bigint generated always as identity primary key,
  proposal_id bigint references public.proposals (id) on delete set null,
  from_node text not null,
  to_node text not null,
  amount double precision not null,
  reason text,
  hedera_tx_id text,
  ts bigint not null
);

alter table public.nodes enable row level security;
alter table public.edges enable row level security;
alter table public.telemetry enable row level security;
alter table public.events enable row level security;
alter table public.proposals enable row level security;
alter table public.verdicts enable row level security;
alter table public.commits enable row level security;
alter table public.human_gates enable row level security;
alter table public.balances enable row level security;
alter table public.settlements enable row level security;

create policy "anon_read_nodes" on public.nodes for select using (true);
create policy "anon_read_edges" on public.edges for select using (true);
create policy "anon_read_telemetry" on public.telemetry for select using (true);
create policy "anon_read_events" on public.events for select using (true);
create policy "anon_read_proposals" on public.proposals for select using (true);
create policy "anon_read_verdicts" on public.verdicts for select using (true);
create policy "anon_read_commits" on public.commits for select using (true);
create policy "anon_read_human_gates" on public.human_gates for select using (true);
create policy "anon_read_balances" on public.balances for select using (true);
create policy "anon_read_settlements" on public.settlements for select using (true);

alter publication supabase_realtime add table public.nodes;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.proposals;
alter publication supabase_realtime add table public.verdicts;
alter publication supabase_realtime add table public.human_gates;
alter publication supabase_realtime add table public.balances;
alter publication supabase_realtime add table public.settlements;
