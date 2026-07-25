alter table public.nodes
  add column if not exists kind text not null default 'sim',
  add column if not exists device_label text,
  add column if not exists last_seen_at timestamptz;

alter table public.telemetry
  add column if not exists source text not null default 'sim';

create index if not exists telemetry_source_ts_idx
  on public.telemetry (source, ts desc);

create index if not exists nodes_kind_idx on public.nodes (kind);
