alter table public.backend_pending_actions add column source_message text unique references public.backend_inbox(provider_id);
alter table public.backend_inbox add column result jsonb;
alter table public.backend_inbox add column asset_id uuid references public.backend_media(id);
create table public.backend_worker_lease(id integer primary key check(id=1),token uuid,expires_at timestamptz not null);
insert into public.backend_worker_lease values(1,null,'1970-01-01');
alter table public.backend_worker_lease enable row level security;
revoke all on public.backend_worker_lease from anon,authenticated;
grant all on public.backend_worker_lease to service_role;
create function public.backend_acquire_worker(p_token uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin update backend_worker_lease set token=p_token,expires_at=now()+interval '5 minutes' where id=1 and expires_at<now(); return found; end $$;
create function public.backend_release_worker(p_token uuid) returns void language sql security definer set search_path=public as $$
 update backend_worker_lease set expires_at=now() where id=1 and token=p_token;
$$;
create function public.backend_prepare_action(p_message text,p_owner uuid,p_sender text,p_kind text,p_id uuid,p_base integer,p_data jsonb)
returns table(action_id uuid,draft_id uuid) language plpgsql security definer set search_path=public as $$
declare action backend_pending_actions; d record;
begin
 perform 1 from backend_inbox where provider_id=p_message for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into action from backend_pending_actions where source_message=p_message;
 if action.id is not null then return query select action.id,action.draft_id;return;end if;
 select * into d from backend_save_draft(p_owner,p_kind,p_id,p_base,p_data);
 insert into backend_pending_actions(owner_id,sender,draft_id,source_message) values(p_owner,p_sender,d.draft_id,p_message) returning * into action;
 return query select action.id,action.draft_id;
end $$;
create function public.backend_confirm_action(p_action uuid,p_owner uuid,p_sender text,p_cancel boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare action backend_pending_actions; result record;
begin
 select * into action from backend_pending_actions where id=p_action and owner_id=p_owner and sender=p_sender for update;
 if action.id is null then raise exception 'NOT_FOUND';end if;
 if action.state='cancelled' then raise exception 'ACTION_CANCELLED';end if;
 if action.state='confirmed' then
  select document_id,published_revision as revision into result from backend_drafts where id=action.draft_id;
  return jsonb_build_object('documentId',result.document_id,'revision',result.revision);
 end if;
 if action.expires_at<now() then raise exception 'ACTION_EXPIRED';end if;
 if p_cancel then
  update backend_pending_actions set state='cancelled' where id=action.id;
  update backend_drafts set state='cancelled' where id=action.draft_id and state='pending';
  return jsonb_build_object('cancelled',true);
 end if;
 select * into result from backend_publish(p_owner,action.draft_id);
 update backend_pending_actions set state='confirmed' where id=action.id;
 return jsonb_build_object('documentId',result.document_id,'revision',result.revision);
end $$;
revoke all on function public.backend_acquire_worker(uuid),public.backend_release_worker(uuid),public.backend_prepare_action(text,uuid,text,text,uuid,integer,jsonb),public.backend_confirm_action(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.backend_acquire_worker(uuid),public.backend_release_worker(uuid),public.backend_prepare_action(text,uuid,text,text,uuid,integer,jsonb),public.backend_confirm_action(uuid,uuid,text,boolean) to service_role;
