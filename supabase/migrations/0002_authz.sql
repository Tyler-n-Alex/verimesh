alter table public.human_gates
  add column if not exists required_tier text not null default 'T1_SINGLE',
  add column if not exists required_quorum smallint not null default 1,
  add column if not exists operators_required jsonb not null default '[]'::jsonb,
  add column if not exists reason text,
  add column if not exists resolved_tx_hash text;

create table if not exists public.human_approvals (
  id bigint generated always as identity primary key,
  gate_id bigint not null references public.human_gates (id) on delete cascade,
  nullifier text not null,
  operator text not null,
  chosen_action text,
  ts bigint not null
);

create unique index if not exists human_approvals_gate_nullifier_idx
  on public.human_approvals (gate_id, nullifier);

create index if not exists human_approvals_nullifier_ts_idx
  on public.human_approvals (nullifier, ts desc);

alter table public.proposals
  add column if not exists auth_tier text;

alter table public.commits
  add column if not exists auth_tier text,
  add column if not exists human_authorized boolean not null default false;

alter table public.human_approvals enable row level security;

create policy "anon_read_human_approvals" on public.human_approvals for select using (true);

alter publication supabase_realtime add table public.human_approvals;
