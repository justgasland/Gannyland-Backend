-- Stable arrival order for one-owner conversation processing.
alter table public.backend_jobs add column sequence bigint generated always as identity;
alter table public.backend_inbox add column sequence bigint generated always as identity;
create index backend_jobs_sequence on public.backend_jobs(sequence);
revoke select on public.public_content from anon,authenticated;
create or replace function public.backend_claim_jobs(p_limit integer)
returns setof public.backend_jobs language plpgsql security definer set search_path=public as $$
begin
 update backend_jobs set state='failed',last_error='LEASE_EXPIRED_AFTER_FINAL_ATTEMPT',lease_until=null
 where state='running' and attempts>=5 and lease_until<now();
 return query update backend_jobs set state='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
 where id in (
  select j.id from backend_jobs j where j.attempts<5 and j.available_at<=now()
  and (j.state='pending' or (j.state='running' and j.lease_until<now()))
  and (j.kind<>'inbox' or not exists(select 1 from backend_jobs earlier where earlier.kind='inbox' and earlier.sequence<j.sequence and earlier.state<>'done'))
  order by j.sequence for update skip locked limit least(greatest(p_limit,1),50)
 ) returning *;
end $$;
alter table public.backend_revisions add column archived boolean not null default false;
create function public.backend_set_archived(p_owner uuid,p_id uuid,p_expected integer,p_archived boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d backend_documents; n integer;
begin
 if p_owner is null then raise exception 'UNAUTHORIZED';end if;
 select * into d from backend_documents where id=p_id for update;
 if d.id is null or d.published is null then raise exception 'NOT_FOUND';end if;
 if d.revision<>p_expected then raise exception 'REVISION_CONFLICT';end if;
 if d.archived=p_archived then return jsonb_build_object('document_id',d.id,'revision',d.revision);end if;
 n:=d.revision+1;
 update backend_documents set archived=p_archived,revision=n,updated_at=now() where id=d.id;
 insert into backend_revisions(document_id,revision,data,owner_id,archived) values(d.id,n,d.published,p_owner,p_archived);
 insert into backend_jobs(kind,payload,dedupe_key) values('refresh',jsonb_build_object('documentId',d.id,'revision',n),'refresh:'||d.id||':'||n);
 return jsonb_build_object('document_id',d.id,'revision',n);
end $$;
create function public.backend_undo(p_owner uuid,p_id uuid,p_expected integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d backend_documents; previous backend_revisions; n integer;
begin
 if p_owner is null then raise exception 'UNAUTHORIZED';end if;
 select * into d from backend_documents where id=p_id for update;
 if d.id is null then raise exception 'NOT_FOUND';end if;
 if d.revision<>p_expected then raise exception 'REVISION_CONFLICT';end if;
 select * into previous from backend_revisions where document_id=p_id and revision=p_expected-1;
 if previous.document_id is null then raise exception 'INVALID_UNDO';end if;
 n:=d.revision+1;
 update backend_documents set published=previous.data,archived=previous.archived,revision=n,updated_at=now() where id=d.id;
 insert into backend_revisions(document_id,revision,data,owner_id,archived) values(d.id,n,previous.data,p_owner,previous.archived);
 insert into backend_jobs(kind,payload,dedupe_key) values('refresh',jsonb_build_object('documentId',d.id,'revision',n),'refresh:'||d.id||':'||n);
 return jsonb_build_object('document_id',d.id,'revision',n);
end $$;
-- Do not allow editing archived records to accidentally bypass restore semantics.
create function public.backend_protect_archived_publish() returns trigger language plpgsql set search_path=public as $$
begin
 if old.archived and new.archived and new.published is distinct from old.published then raise exception 'INVALID_RESTORE_FIRST';end if;
 return new;
end $$;
create trigger protect_archived_publish before update on public.backend_documents for each row execute function public.backend_protect_archived_publish();
revoke all on function public.backend_set_archived(uuid,uuid,integer,boolean),public.backend_undo(uuid,uuid,integer),public.backend_protect_archived_publish() from public,anon,authenticated;
grant execute on function public.backend_set_archived(uuid,uuid,integer,boolean),public.backend_undo(uuid,uuid,integer) to service_role;
