alter table public.messages add column occurred_at timestamptz not null default now();
update public.messages set occurred_at=created_at;
create index message_timeline on public.messages(organization_id,conversation_id,occurred_at);
alter table public.channels add column external_account_id text;
alter table public.channels add column business_account_id text;
alter table public.channels add column display_name text not null default '';
alter table public.channels add column last_error text;
create unique index channel_account_unique on public.channels(provider,external_account_id) where external_account_id is not null;
alter table public.ai_settings drop constraint ai_settings_mode_check;
alter table public.ai_settings add constraint ai_settings_mode_check check(mode in ('simulation','suggestion_only','automatic'));
alter table public.ai_suggestions add column catalog_fingerprint text;
alter table public.ai_suggestions add column automatic boolean not null default false;
alter table public.webhook_events add column channel_id uuid;
alter table public.webhook_events add column lease_until timestamptz;
alter table public.webhook_events add column error_code text;
alter table public.webhook_events add foreign key(organization_id,channel_id) references public.channels(organization_id,id) on delete cascade;
create index webhook_due on public.webhook_events(status,next_attempt_at);
create table public.oauth_states (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 user_id uuid not null references auth.users on delete cascade, provider text not null check(provider in ('instagram','whatsapp')),
 token_hash text not null unique,expires_at timestamptz not null default now()+interval '10 minutes', consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.message_outbox (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,
 conversation_id uuid not null,message_id uuid not null,request_id uuid not null,suggestion_id uuid references public.ai_suggestions on delete set null,
 automatic boolean not null default false,actor_id uuid references auth.users on delete set null,status text not null default 'queued' check(status in ('queued','sending','sent','failed','unknown')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_until timestamptz,error_code text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade,
 foreign key(organization_id,message_id) references public.messages(organization_id,id) on delete cascade,
 unique(organization_id,request_id)
);
create table public.email_jobs (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,
 recipient text not null,subject text not null,content text not null,status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_until timestamptz,
 created_at timestamptz not null default now()
);
do $$ declare t text;begin foreach t in array array['oauth_states','message_outbox','email_jobs'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);execute format('create index on public.%I(organization_id)',t);end loop;end $$;
grant select on public.message_outbox to authenticated;
create policy outbox_read on public.message_outbox for select to authenticated using(private.has_role(organization_id));

create function public.consume_oauth_state(_hash text,_user uuid,_provider text) returns uuid language plpgsql security definer set search_path='' as $$
 declare state public.oauth_states;begin
 select * into state from public.oauth_states where token_hash=_hash for update;
 if not found or state.user_id<>_user or state.provider<>_provider or state.expires_at<=now() or state.consumed_at is not null then raise exception 'Invalid OAuth state';end if;
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=state.organization_id and m.user_id=_user and m.role in ('owner','admin') and p.approval_status='approved') then raise exception 'Forbidden';end if;
 update public.oauth_states set consumed_at=now() where id=state.id;return state.organization_id;
 end $$;
create function public.connect_channel(_org uuid,_provider text,_account text,_business text,_name text,_ciphertext text,_expiry timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
 declare channel uuid;begin
 if _provider not in ('instagram','whatsapp') or char_length(_account) not between 1 and 100 or char_length(_ciphertext)<20 then raise exception 'Invalid channel';end if;
 insert into public.channels(organization_id,provider,status,external_account_id,business_account_id,display_name) values(_org,_provider,'connected',_account,_business,left(_name,200))
 on conflict(organization_id,provider) do update set status='connected',external_account_id=excluded.external_account_id,business_account_id=excluded.business_account_id,display_name=excluded.display_name,last_error=null returning id into channel;
 insert into public.channel_credentials(organization_id,channel_id,ciphertext,expires_at) values(_org,channel,_ciphertext,_expiry)
 on conflict(channel_id) do update set ciphertext=excluded.ciphertext,expires_at=excluded.expires_at;
 insert into public.audit_logs(organization_id,action,entity_id) values(_org,'channel.connected',channel);return channel;
 end $$;
create function public.disconnect_channel(_org uuid,_channel uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 update public.channels set status='revoked',last_error=null where organization_id=_org and id=_channel;
 delete from public.channel_credentials where organization_id=_org and channel_id=_channel;
 update public.message_outbox set status='failed',error_code='channel_revoked' where organization_id=_org and status='queued' and conversation_id in(select id from public.conversations where channel_id=_channel);
 insert into public.audit_logs(organization_id,action,entity_id) values(_org,'channel.disconnected',_channel);end $$;
create function public.claim_webhooks(_limit integer default 3) returns setof public.webhook_events language plpgsql security definer set search_path='' as $$ begin
 return query with due as(select id from public.webhook_events where ((status in ('pending','failed') and coalesce(next_attempt_at,now())<=now()) or (status='processing' and lease_until<now())) and attempts<6 order by created_at for update skip locked limit least(greatest(_limit,1),10))
 update public.webhook_events e set status='processing',attempts=e.attempts+1,lease_until=now()+interval '3 minutes' from due where e.id=due.id returning e.*;end $$;
create function public.ingest_meta_event(_event uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare e public.webhook_events;c public.channels;t public.conversations;cust uuid;mid uuid;sender text;received timestamptz;body text;kind text;begin
 select * into e from public.webhook_events where id=_event for update;if not found then raise exception 'Event unavailable';end if;
 select * into c from public.channels where id=e.channel_id and organization_id=e.organization_id and status in ('connected','error');if not found then raise exception 'Channel unavailable';end if;
 kind=e.payload->>'kind';
 if kind='status' then
 insert into public.delivery_receipts(organization_id,external_id,status,occurred_at) values(e.organization_id,e.payload->>'message_id',e.payload->>'delivery_status',(e.payload->>'timestamp')::timestamptz) on conflict(organization_id,external_id,status) do update set occurred_at=greatest(public.delivery_receipts.occurred_at,excluded.occurred_at);
 update public.messages set delivery_status=e.payload->>'delivery_status' where organization_id=e.organization_id and external_id=e.payload->>'message_id'
 and case e.payload->>'delivery_status' when 'read' then 4 when 'delivered' then 3 when 'sent' then 1 when 'failed' then 2 else 0 end>case delivery_status when 'read' then 4 when 'delivered' then 3 when 'sent' then 1 when 'failed' then 2 else 0 end;
 return null;end if;
 sender=e.payload->>'sender';if coalesce(sender,'')='' or char_length(sender)>200 then raise exception 'Invalid sender';end if;
 received=(e.payload->>'timestamp')::timestamptz;
 if received>now()+interval '5 minutes' or received<now()-interval '7 days' then raise exception 'Invalid event timestamp';end if;
 perform pg_advisory_xact_lock(hashtext(e.organization_id::text||':'||c.id::text||':'||sender));
 select * into t from public.conversations where organization_id=e.organization_id and channel_id=c.id and external_contact_id=sender;
 if not found then
 insert into public.customers(organization_id,name,phone) values(e.organization_id,left(coalesce(nullif(e.payload->>'name',''),'Client '||c.provider),160),case when c.provider='whatsapp' then left(sender,40) else null end) returning id into cust;
 insert into public.conversations(organization_id,customer_id,is_simulation,source,channel_id,external_contact_id,subject,last_inbound_at)
 values(e.organization_id,cust,false,c.provider,c.id,sender,'Conversation '||c.provider,received) returning * into t;
 end if;
 body=left(coalesce(e.payload->>'text','[Contenu non pris en charge : reprendre manuellement]'),12000);
 insert into public.messages(organization_id,conversation_id,role,content,external_id,direction,occurred_at) values(e.organization_id,t.id,'user',body,e.payload->>'message_id','inbound',received) on conflict(organization_id,external_id) where external_id is not null do nothing returning id into mid;
 if mid is not null then
 update public.conversations set last_inbound_at=greatest(last_inbound_at,received),status=case when kind='unsupported' then 'human' when status='closed' then 'open' else status end,updated_at=now() where id=t.id;
 insert into public.notifications(organization_id,title,href,kind) values(e.organization_id,'Nouveau message '||c.provider,'/app/conversations?id='||t.id,'message');
 end if;return mid;
 end $$;
create function private.queue_reply(_org uuid,_conversation uuid,_content text,_request uuid,_suggestion uuid,_automatic boolean,_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t public.conversations;channel public.channels;sub public.subscriptions;limits public.plan_entitlements;msg uuid;outbox uuid;used integer;begin
 -- Serialize on the conversation for idempotence and channel-window checks.
 select * into t from public.conversations where organization_id=_org and id=_conversation for update;
 if not found or t.status='closed' then raise exception 'Conversation unavailable';end if;
 select id,message_id into outbox,msg from public.message_outbox where organization_id=_org and request_id=_request;
 if outbox is not null then return jsonb_build_object('outbox_id',outbox,'message_id',msg,'simulation',false);end if;
 if char_length(trim(_content)) not between 1 and 1000 then raise exception 'Message must have 1 to 1000 characters';end if;
 if not exists(select 1 from public.organizations where id=_org and is_active) then raise exception 'Shop inactive';end if;
 if _automatic then
 if not exists(select 1 from public.ai_settings where organization_id=_org and mode='automatic' and not paused) or t.ai_paused or t.status<>'open' then raise exception 'Automatic sending disabled';end if;
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=_org and m.role='owner' and p.approval_status='approved') then raise exception 'Owner approval required';end if;
 if not exists(select 1 from public.ai_suggestions where id=_suggestion and organization_id=_org and conversation_id=_conversation and not needs_human and status='pending' and source_message_id=(select id from public.messages where organization_id=_org and conversation_id=_conversation and role='user' order by occurred_at desc,created_at desc limit 1)) then raise exception 'Suggestion requires human review';end if;
 end if;
 if t.is_simulation then
 if _automatic then raise exception 'No automatic delivery to simulations';end if;
 insert into public.messages(organization_id,conversation_id,role,content,direction,external_id) values(_org,t.id,'human',trim(_content),'internal','simulation:'||_request::text) on conflict(organization_id,external_id) where external_id is not null do update set content=public.messages.content returning id into msg;
 return jsonb_build_object('message_id',msg,'simulation',true);end if;
 select * into channel from public.channels where id=t.channel_id and organization_id=_org and status='connected';if not found then raise exception 'Channel not connected';end if;
 if t.last_inbound_at is null or t.last_inbound_at<=now()-interval '24 hours' then raise exception 'Messaging window closed';end if;
 select * into sub from public.subscriptions where organization_id=_org for update;
 if not private.active_subscription(_org) then raise exception 'Trial expired';end if;
 limits=private.plan_for(_org);
 select count(*) into used from public.messages where organization_id=_org and direction='outbound' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if used>=limits.messages_daily_limit then raise exception 'Message quota reached';end if;
 if (select count(*) from public.message_outbox where organization_id=_org and created_at>now()-interval '1 minute')>=30 then raise exception 'Message rate limit reached';end if;
 if _suggestion is not null and not exists(select 1 from public.ai_suggestions where id=_suggestion and organization_id=_org and conversation_id=t.id and status='pending') then raise exception 'Suggestion unavailable';end if;
 insert into public.messages(organization_id,conversation_id,role,content,direction,delivery_status) values(_org,t.id,case when _suggestion is not null then 'assistant' else 'human' end,trim(_content),'outbound','queued') returning id into msg;
 insert into public.message_outbox(organization_id,conversation_id,message_id,request_id,suggestion_id,automatic,actor_id) values(_org,t.id,msg,_request,_suggestion,_automatic,_actor) returning id into outbox;
 if _suggestion is not null then update public.ai_suggestions set status='approved',automatic=_automatic where id=_suggestion;end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,_actor,case when _automatic then 'message.automatic_queued' else 'message.human_queued' end,msg);
 return jsonb_build_object('outbox_id',outbox,'message_id',msg,'simulation',false);
 end $$;
revoke all on function private.queue_reply(uuid,uuid,text,uuid,uuid,boolean,uuid) from public;
create function public.queue_reply(_org uuid,_conversation uuid,_content text,_request uuid,_suggestion uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform private.require_staff(_org);return private.queue_reply(_org,_conversation,_content,_request,_suggestion,false,auth.uid());end $$;
revoke all on function public.queue_reply(uuid,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.queue_reply(uuid,uuid,text,uuid,uuid) to authenticated;
create function public.queue_automatic_reply(_org uuid,_conversation uuid,_content text,_request uuid,_suggestion uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 return private.queue_reply(_org,_conversation,_content,_request,_suggestion,true,null);end $$;
create function public.claim_outbox(_id uuid default null) returns setof public.message_outbox language plpgsql security definer set search_path='' as $$ begin
 -- An expired sending lease is ambiguous: never blindly resend after a crash.
 update public.messages set delivery_status='unknown' where id in(select message_id from public.message_outbox where status='sending' and lease_until<now());
 update public.message_outbox set status='unknown',error_code='expired_send_lease' where status='sending' and lease_until<now();
 return query with due as(select id from public.message_outbox where status='queued' and next_attempt_at<=now() and (_id is null or id=_id) order by created_at for update skip locked limit 1)
 update public.message_outbox o set status='sending',attempts=o.attempts+1,lease_until=now()+interval '1 minute' from due where o.id=due.id returning o.*;end $$;
create function public.reject_suggestion(_org uuid,_suggestion uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.require_staff(_org);update public.ai_suggestions set status='rejected' where organization_id=_org and id=_suggestion and status='pending';end $$;
revoke all on function public.reject_suggestion(uuid,uuid) from public,anon;grant execute on function public.reject_suggestion(uuid,uuid) to authenticated;
create function public.set_assistant_mode(_org uuid,_mode text,_explicit boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if _mode not in ('simulation','suggestion_only','automatic') then raise exception 'Invalid mode';end if;
 if _mode='automatic' and (not _explicit or not private.active_subscription(_org) or not exists(select 1 from public.channels where organization_id=_org and status='connected')) then raise exception 'Automatic mode requires explicit consent, active rights and a connected channel';end if;
 update public.ai_settings set mode=_mode where organization_id=_org;
 insert into public.audit_logs(organization_id,actor_id,action) values(_org,auth.uid(),'ai_mode.'||_mode);end $$;
revoke all on function public.set_assistant_mode(uuid,text,boolean) from public,anon;grant execute on function public.set_assistant_mode(uuid,text,boolean) to authenticated;
create function public.reserve_background_ai(_org uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare sub public.subscriptions;event uuid;begin
 select * into sub from public.subscriptions where organization_id=_org for update;
 if not private.active_subscription(_org) or not exists(select 1 from public.organizations where id=_org and is_active) then raise exception 'Trial expired';end if;
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=_org and m.role='owner' and p.approval_status='approved') then raise exception 'Owner approval required';end if;
 if (select count(*) from public.usage_events where organization_id=_org and kind in ('simulation','conversation') and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=sub.ai_daily_limit then raise exception 'Daily quota reached';end if;
 insert into public.usage_events(organization_id,kind) values(_org,'conversation') returning id into event;return event;end $$;
-- Worker and OAuth mutation functions are reachable only with server credentials.
do $$ declare f record;begin
 for f in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['consume_oauth_state','connect_channel','disconnect_channel','claim_webhooks','ingest_meta_event','queue_automatic_reply','claim_outbox','reserve_background_ai']) loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated';execute 'grant execute on function '||f.signature||' to service_role';end loop;end $$;
create function private.order_email_notification() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.status='confirmed' and old.status is distinct from new.status and not new.is_simulation then
 insert into public.email_jobs(organization_id,recipient,subject,content)
 select new.organization_id,u.email,'Sellora : commande confirmée','Une commande a été confirmée dans votre boutique. Consultez votre tableau de bord. Référence : '||left(new.id::text,8)
 from public.memberships m join auth.users u on u.id=m.user_id where m.organization_id=new.organization_id and m.role='owner' and u.email is not null;end if;return new;end $$;
create trigger order_email_notification after update on public.orders for each row execute function private.order_email_notification();
create function public.billing_usage(_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('ai_calls',(select count(*) from public.usage_events where organization_id=_org and kind in ('simulation','conversation') and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),'input_tokens',(select coalesce(sum(input_tokens),0) from public.usage_events where organization_id=_org and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),'output_tokens',(select coalesce(sum(output_tokens),0) from public.usage_events where organization_id=_org and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),'messages',(select count(*) from public.messages where organization_id=_org and direction='outbound' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'));
 end $$;
revoke all on function public.billing_usage(uuid) from public,anon;grant execute on function public.billing_usage(uuid) to authenticated;
notify pgrst,'reload schema';
create unique index suggestion_source_unique on public.ai_suggestions(organization_id,source_message_id) where source_message_id is not null;
alter table public.email_jobs add column external_id text;
create function public.claim_email_jobs() returns setof public.email_jobs language plpgsql security definer set search_path='' as $$ begin
 update public.email_jobs set status='failed' where status='sending' and lease_until<now();
 return query with due as(select id from public.email_jobs where status='pending' and next_attempt_at<=now() and attempts<5 order by created_at for update skip locked limit 1)
 update public.email_jobs j set status='sending',attempts=j.attempts+1,lease_until=now()+interval '1 minute' from due where j.id=due.id returning j.*;end $$;
revoke all on function public.claim_email_jobs() from public,anon,authenticated;grant execute on function public.claim_email_jobs() to service_role;
