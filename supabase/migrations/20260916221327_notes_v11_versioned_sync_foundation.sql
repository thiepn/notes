alter table public.notes_sync_records
  add column if not exists version bigint not null default 1;

alter table public.notes_sync_records
  drop constraint if exists notes_sync_records_version_check;

alter table public.notes_sync_records
  add constraint notes_sync_records_version_check check (version >= 1);

create or replace function private.notes_sync_enforce_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_sync_records_enforce_version on public.notes_sync_records;
create trigger notes_sync_records_enforce_version
before insert or update on public.notes_sync_records
for each row
execute function private.notes_sync_enforce_version();

comment on column public.notes_sync_records.version is
  'Server-managed monotonic record version used by Notes optimistic concurrency control.';
