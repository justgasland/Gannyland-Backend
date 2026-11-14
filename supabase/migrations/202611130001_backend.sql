-- All mutations go through the server with a verified owner; clients cannot call RPCs.
create table public.backend_documents (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('product','category','collection','style','home','store','story','help','calculator')),
 revision integer not null default 0, published jsonb, archived boolean not null default false,
 first_published_at timestamptz, updated_at timestamptz not null default now(),
 check(published is null or jsonb_typeof(published)='object')
);
create unique index product_slug_unique on public.backend_documents((published->>'slug')) where kind='product' and published is not null;
create unique index style_slug_unique on public.backend_documents((published->>'slug')) where kind='style' and published is not null;
create unique index singleton_content on public.backend_documents(kind) where kind in ('home','store','story','help','calculator');
create table public.backend_drafts (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.backend_documents(id), owner_id uuid not null,
 base_revision integer not null, data jsonb not null check(jsonb_typeof(data)='object'), state text not null default 'pending' check(state in ('pending','published','cancelled')),
 published_revision integer, created_at timestamptz not null default now()
);
create table public.backend_revisions (
 document_id uuid references public.backend_documents(id), revision integer not null, data jsonb not null,
 owner_id uuid not null, created_at timestamptz not null default now(), primary key(document_id,revision)
);
create table public.backend_jobs (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('refresh','inbox','reply')), payload jsonb not null,
 dedupe_key text unique, state text not null default 'pending' check(state in ('pending','running','done','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid,
 last_error text, created_at timestamptz not null default now()
);
create index jobs_ready on public.backend_jobs(state,available_at);
create table public.backend_inbox (
 provider_id text primary key, sender text not null, payload jsonb not null, created_at timestamptz not null default now()
);
create table public.backend_pending_actions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, sender text not null, draft_id uuid references public.backend_drafts(id),
 state text not null default 'pending' check(state in ('pending','confirmed','cancelled')), expires_at timestamptz not null default now()+interval '1 hour'
);
create table public.backend_media (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, object_path text not null unique,
 mime text not null, bytes integer not null check(bytes>0 and bytes<=52428800), purpose text not null check(purpose in ('image','texture','video','panorama')),
 state text not null default 'pending' check(state in ('pending','ready')), created_at timestamptz not null default now()
);
create table public.backend_events (
 id uuid primary key default gen_random_uuid(), type text not null check(type='whatsapp_link_click'), product_id uuid, style_id uuid,
 source text not null, created_at timestamptz not null default now()
);
create table public.backend_rate_limits (key text primary key, hits integer not null default 1, window_start timestamptz not null default now());

-- Public projections expose only published, available snapshots. Never return revisions/drafts.
create view public.public_catalogue as select id,revision,first_published_at,published as data from public.backend_documents
 where kind='product' and not archived and published is not null and published->>'availability' in ('in_stock','confirm');
create view public.public_content as select id,kind,revision,published as data from public.backend_documents
 where kind<>'product' and not archived and published is not null;

create function public.backend_save_draft(p_owner uuid,p_kind text,p_id uuid,p_base integer,p_data jsonb)
returns table(draft_id uuid,document_id uuid) language plpgsql security definer set search_path=public as $$
declare target uuid; current_revision integer; actual_kind text; result uuid;
begin
 if p_owner is null then raise exception 'UNAUTHORIZED'; end if;
 if p_id is null then
  if p_base<>0 then raise exception 'REVISION_CONFLICT'; end if;
  insert into backend_documents(kind) values(p_kind) returning id into target;
 else
  select id,revision,kind into target,current_revision,actual_kind from backend_documents where id=p_id for update;
  if target is null then raise exception 'NOT_FOUND'; end if;
  if current_revision<>p_base then raise exception 'REVISION_CONFLICT'; end if;
  if actual_kind<>p_kind then raise exception 'KIND_MISMATCH'; end if;
 end if;
 insert into backend_drafts(document_id,owner_id,base_revision,data) values(target,p_owner,p_base,p_data) returning id into result;
 return query select result,target;
end $$;

create function public.backend_publish(p_owner uuid,p_draft uuid)
returns table(document_id uuid,revision integer) language plpgsql security definer set search_path=public as $$
declare d backend_drafts; rec backend_documents; next_revision integer;
begin
 select * into d from backend_drafts where id=p_draft and owner_id=p_owner for update;
 if d.id is null then raise exception 'NOT_FOUND'; end if;
 if d.state='published' then return query select d.document_id,d.published_revision; return; end if;
 if d.state<>'pending' then raise exception 'ACTION_CANCELLED'; end if;
 select * into rec from backend_documents where id=d.document_id for update;
 if rec.revision<>d.base_revision then raise exception 'REVISION_CONFLICT'; end if;
 next_revision:=rec.revision+1;
 update backend_documents set published=d.data,revision=next_revision,first_published_at=coalesce(first_published_at,now()),updated_at=now() where id=rec.id;
 insert into backend_revisions(document_id,revision,data,owner_id) values(rec.id,next_revision,d.data,p_owner);
 insert into backend_jobs(kind,payload,dedupe_key) values('refresh',jsonb_build_object('documentId',rec.id,'revision',next_revision),'refresh:'||rec.id||':'||next_revision);
 update backend_drafts set state='published',published_revision=next_revision where id=d.id;
 return query select rec.id,next_revision;
end $$;

create function public.backend_claim_jobs(p_limit integer)
returns setof public.backend_jobs language sql security definer set search_path=public as $$
 update backend_jobs set state='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
 where id in (select id from backend_jobs where attempts<5 and available_at<=now() and (state='pending' or (state='running' and lease_until<now())) order by created_at for update skip locked limit least(greatest(p_limit,1),50)) returning *;
$$;
create function public.backend_accept_message(p_id text,p_sender text,p_payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into backend_inbox(provider_id,sender,payload) values(p_id,p_sender,p_payload) on conflict do nothing;
 if found then insert into backend_jobs(kind,payload,dedupe_key) values('inbox',jsonb_build_object('providerId',p_id),'inbox:'||p_id) on conflict do nothing; end if;
end $$;
create function public.backend_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into backend_rate_limits(key) values(p_key) on conflict(key) do update set
 hits=case when backend_rate_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else backend_rate_limits.hits+1 end,
 window_start=case when backend_rate_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else backend_rate_limits.window_start end returning hits into n;
 return n<=p_limit;
end $$;

do $$ declare t text; begin
 foreach t in array array['backend_documents','backend_drafts','backend_revisions','backend_jobs','backend_inbox','backend_pending_actions','backend_media','backend_events','backend_rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.public_catalogue,public.public_content to anon,authenticated,service_role;
revoke all on function public.backend_save_draft(uuid,text,uuid,integer,jsonb),public.backend_publish(uuid,uuid),public.backend_claim_jobs(integer),public.backend_accept_message(text,text,jsonb),public.backend_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.backend_save_draft(uuid,text,uuid,integer,jsonb),public.backend_publish(uuid,uuid),public.backend_claim_jobs(integer),public.backend_accept_message(text,text,jsonb),public.backend_rate_limit(text,integer,integer) to service_role;
