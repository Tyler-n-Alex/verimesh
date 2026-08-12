create extension if not exists pg_cron;

create or replace function public.prune_telemetry(
  retention_days int default 10,
  batch_size int default 50000
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff bigint;
  removed bigint := 0;
  n int;
begin
  cutoff := (extract(epoch from now()) * 1000
             - retention_days::bigint * 86400000)::bigint;

  loop
    delete from public.telemetry
     where id in (
       select id from public.telemetry where ts < cutoff limit batch_size
     );
    get diagnostics n = row_count;
    exit when n = 0;
    removed := removed + n;
  end loop;

  return removed;
end;
$$;

revoke all on function public.prune_telemetry(int, int) from public, anon, authenticated;

select cron.schedule(
  'telemetry-retention-10d',
  '17 3 * * *',
  $$select public.prune_telemetry(10)$$
);
