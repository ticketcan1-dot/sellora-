create table public.plan_entitlements (
 plan text primary key check(plan in ('starter','business','premium')), label text not null,
 products_limit integer not null check(products_limit between 1 and 100000), members_limit integer not null check(members_limit between 1 and 1000),
 ai_daily_limit integer not null check(ai_daily_limit between 0 and 10000), messages_daily_limit integer not null check(messages_daily_limit between 0 and 100000),
 price_mad_minor integer check(price_mad_minor>=0), updated_at timestamptz not null default now()
);
insert into public.plan_entitlements(plan,label,products_limit,members_limit,ai_daily_limit,messages_daily_limit) values('starter','Starter',200,5,50,100),('business','Business',2000,15,500,1000),('premium','Premium',10000,50,2000,5000);
alter table public.plan_entitlements enable row level security;
revoke all on public.plan_entitlements from anon,authenticated;
grant select on public.plan_entitlements to anon,authenticated;
grant all on public.plan_entitlements to service_role;
create policy plans_public on public.plan_entitlements for select to anon,authenticated using(true);
alter table public.subscriptions add column manual_until timestamptz;
alter table public.invitations add column used_at timestamptz;
alter table public.invitations add column revoked_at timestamptz;
alter table public.invitations add column invited_by uuid references auth.users on delete set null;
create table public.billing_requests (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,
 plan text not null references public.plan_entitlements, status text not null default 'pending' check(status in ('pending','handled')),
 actor_id uuid references auth.users on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index one_billing_request on public.billing_requests(organization_id) where status='pending';
alter table public.billing_requests enable row level security;
revoke all on public.billing_requests from anon,authenticated;
grant select on public.billing_requests to authenticated;grant all on public.billing_requests to service_role;
create policy billing_request_read on public.billing_requests for select to authenticated using(private.has_role(organization_id,array['owner','admin']));

create function private.plan_for(_org uuid) returns public.plan_entitlements language sql stable security definer set search_path='' as $$
 select p.* from public.plan_entitlements p where p.plan=coalesce((select plan from public.subscriptions where organization_id=_org),'starter');
$$;
revoke all on function private.plan_for(uuid) from public;
create function private.active_subscription(_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.subscriptions where organization_id=_org and ((status='trial' and trial_ends_at>now()) or (status='manual' and manual_until>now())));
$$;
revoke all on function private.active_subscription(uuid) from public;
create function private.check_plan_capacity() returns trigger language plpgsql security definer set search_path='' as $$
 declare limits public.plan_entitlements;used integer;begin
 perform 1 from public.organizations where id=new.organization_id for update;
 limits=private.plan_for(new.organization_id);
 if tg_table_name='products' then select count(*) into used from public.products where organization_id=new.organization_id;
 if used>=limits.products_limit then raise exception 'Product quota reached';end if;
 else select count(*) into used from public.memberships where organization_id=new.organization_id;
 if used>=limits.members_limit then raise exception 'Member quota reached';end if;end if;return new;
end $$;
create trigger product_capacity before insert on public.products for each row execute function private.check_plan_capacity();
create trigger member_capacity before insert on public.memberships for each row execute function private.check_plan_capacity();
create or replace function public.reserve_ai_usage(org uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare sub public.subscriptions;used integer;event uuid;begin
 perform private.require_staff(org);
 select * into sub from public.subscriptions where organization_id=org for update;
 if not found or not private.active_subscription(org) then raise exception 'Trial expired';end if;
 select count(*) into used from public.usage_events where organization_id=org and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and kind in ('simulation','conversation');
 if used>=sub.ai_daily_limit then raise exception 'Daily quota reached';end if;
 insert into public.usage_events(organization_id,kind) values(org,'simulation') returning id into event;return event;
 end $$;
create function public.list_team(_org uuid) returns table(user_id uuid,email text,role text) language plpgsql stable security definer set search_path='' as $$ begin
 if not private.has_role(_org) then raise exception 'Forbidden' using errcode='42501';end if;
 return query select m.user_id,u.email::text,m.role from public.memberships m join auth.users u on u.id=m.user_id where m.organization_id=_org order by m.created_at;
end $$;
create function public.list_invitations(_org uuid) returns table(id uuid,email text,role text,expires_at timestamptz,used_at timestamptz,revoked_at timestamptz) language plpgsql stable security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 return query select i.id,i.email,i.role,i.expires_at,i.used_at,i.revoked_at from public.invitations i where i.organization_id=_org order by i.created_at desc limit 100;
end $$;
create function public.create_invitation(_org uuid,_email text,_role text,_hash text) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid;limits public.plan_entitlements;reserved integer;begin
 if not private.has_role(_org,array['owner','admin']) or _role not in ('admin','agent','viewer') or (_role='admin' and not private.has_role(_org,array['owner'])) then raise exception 'Forbidden' using errcode='42501';end if;
 if char_length(_email)>254 or _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or _hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation';end if;
 perform 1 from public.organizations where id=_org for update;limits=private.plan_for(_org);
 update public.invitations set revoked_at=now() where organization_id=_org and lower(email)=lower(_email) and used_at is null and revoked_at is null;
 select (select count(*) from public.memberships where organization_id=_org)+(select count(*) from public.invitations where organization_id=_org and used_at is null and revoked_at is null and expires_at>now()) into reserved;
 if reserved>=limits.members_limit then raise exception 'Member quota reached';end if;
 insert into public.invitations(organization_id,email,role,token_hash,expires_at,invited_by) values(_org,lower(trim(_email)),_role,_hash,now()+interval '7 days',auth.uid()) returning id into result;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'invitation.create',result);return result;
end $$;
create function public.accept_invitation(_hash text) returns uuid language plpgsql security definer set search_path='' as $$
 declare invitation public.invitations;account_email text;confirmed timestamptz;begin
 if not private.account_approved() then raise exception 'Account approval required' using errcode='42501';end if;
 select email,email_confirmed_at into account_email,confirmed from auth.users where id=auth.uid();
 select * into invitation from public.invitations where token_hash=_hash;
 if not found then raise exception 'Invitation unavailable';end if;
 perform 1 from public.organizations where id=invitation.organization_id for update;
 select * into invitation from public.invitations where token_hash=_hash for update;
 if not found or invitation.used_at is not null or invitation.revoked_at is not null or invitation.expires_at<=now() or lower(account_email)<>invitation.email or confirmed is null then raise exception 'Invitation unavailable or email mismatch';end if;
 update public.invitations set used_at=now() where id=invitation.id;
 insert into public.memberships(organization_id,user_id,role) values(invitation.organization_id,auth.uid(),invitation.role) on conflict(organization_id,user_id) do nothing;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(invitation.organization_id,auth.uid(),'invitation.accept',invitation.id);return invitation.organization_id;
end $$;
create function public.revoke_invitation(_org uuid,_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 update public.invitations set revoked_at=now() where id=_id and organization_id=_org and used_at is null;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'invitation.revoke',_id);end $$;
create function public.manage_member(_org uuid,_user uuid,_role text) returns void language plpgsql security definer set search_path='' as $$
 declare previous text;begin
 if not private.has_role(_org,array['owner']) then raise exception 'Forbidden' using errcode='42501';end if;
 perform 1 from public.organizations where id=_org for update;
 select role into previous from public.memberships where organization_id=_org and user_id=_user;
 if not found or previous='owner' or _user=auth.uid() or (_role is not null and _role not in ('admin','agent','viewer')) then raise exception 'Invalid member change';end if;
 if _role is null then
 update public.conversations set assigned_to=null where organization_id=_org and assigned_to=_user;
 delete from public.memberships where organization_id=_org and user_id=_user;
 else update public.memberships set role=_role where organization_id=_org and user_id=_user;end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'membership.manage',_user);
end $$;
create function public.transfer_ownership(_org uuid,_user uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner']) or _user=auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 perform 1 from public.organizations where id=_org for update;
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=_org and m.user_id=_user and p.approval_status='approved') then raise exception 'Approved member required';end if;
 update public.memberships set role='admin' where organization_id=_org and role='owner';
 update public.memberships set role='owner' where organization_id=_org and user_id=_user;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'ownership.transfer',_user);end $$;
create function public.update_shop(_org uuid,_details jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if not private.has_role(_org,array['owner']) and ((_details->>'is_active')::boolean is distinct from (select is_active from public.organizations where id=_org)) then raise exception 'Only owner can change activation';end if;
 if char_length(coalesce(_details->>'contact_email',''))>254 or char_length(coalesce(_details->>'city',''))>100 then raise exception 'Invalid settings';end if;
 update public.organizations set name=trim(_details->>'name'),contact_email=coalesce(_details->>'contact_email',''),city=coalesce(_details->>'city',''),retention_days=(_details->>'retention_days')::integer,low_stock_threshold=(_details->>'low_stock_threshold')::integer,is_active=(_details->>'is_active')::boolean where id=_org;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'organization.update',_org);end $$;
-- Prevent bypassing update_shop's ownership checks through the Data API.
revoke update on public.organizations from authenticated;
grant update(onboarding_step,onboarding_completed) on public.organizations to authenticated;
create function public.delete_shop(_org uuid,_confirmation text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner']) or not exists(select 1 from public.organizations where id=_org and name=_confirmation) then raise exception 'Owner and exact confirmation required' using errcode='42501';end if;
 -- Channel credentials and all tenant rows are removed through cascading FKs.
 delete from public.organizations where id=_org;end $$;
create function public.request_plan(_org uuid,_plan text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into public.billing_requests(organization_id,plan,actor_id) values(_org,_plan,auth.uid()) on conflict(organization_id) where status='pending' do update set plan=excluded.plan,updated_at=now();end $$;
create function public.admin_activate_plan(_org uuid,_plan text,_days integer,_actor text) returns void language plpgsql security definer set search_path='' as $$
 declare limits public.plan_entitlements;begin
 if _days not between 0 and 365 or char_length(_actor)<3 then raise exception 'Invalid activation';end if;
 select * into limits from public.plan_entitlements where plan=_plan;if not found then raise exception 'Invalid plan';end if;
 update public.subscriptions set plan=_plan,status=case when _days=0 then 'expired' else 'manual' end,manual_until=now()+make_interval(days=>_days),ai_daily_limit=limits.ai_daily_limit where organization_id=_org;
 if not found then raise exception 'Subscription unavailable';end if;
 update public.billing_requests set status='handled',updated_at=now() where organization_id=_org and status='pending';
 insert into public.platform_audit_logs(actor_email,previous_status,next_status) values(_actor,'subscription',_org::text||':'||_plan||':'||_days::text);
 insert into public.notifications(organization_id,title,href,kind) values(_org,'Droits mis à jour manuellement par l’administrateur','/app/facturation','billing');end $$;
create function public.anonymize_customer(_org uuid,_customer uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if exists(select 1 from public.orders where organization_id=_org and customer_id=_customer and status not in ('delivered','cancelled')) then raise exception 'Open orders require customer details';end if;
 update public.customers set name='Client anonymisé',phone=null,address=null,city='',notes='',whatsapp_opt_in_at=null where organization_id=_org and id=_customer;
 if not found then raise exception 'Customer unavailable';end if;
 update public.orders set customer_snapshot='{"anonymized":true}' where organization_id=_org and customer_id=_customer;
 update public.conversations set external_contact_id=null,status='closed',ai_paused=true,last_inbound_at=null where organization_id=_org and customer_id=_customer;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'customer.anonymize',_customer);end $$;
create function public.apply_retention(_org uuid) returns integer language plpgsql security definer set search_path='' as $$
 declare cutoff timestamptz;affected integer;begin
 if not private.has_role(_org,array['owner']) then raise exception 'Forbidden' using errcode='42501';end if;
 select now()-make_interval(days=>retention_days) into cutoff from public.organizations where id=_org;
 update public.messages set content='[Message effacé selon la politique de conservation]',image_path=null where organization_id=_org and created_at<cutoff and conversation_id in(select id from public.conversations where organization_id=_org and status='closed');get diagnostics affected=row_count;
 update public.ai_suggestions set content='[Suggestion effacée]' where organization_id=_org and created_at<cutoff;
 delete from public.conversation_notes where organization_id=_org and created_at<cutoff;
 insert into public.audit_logs(organization_id,actor_id,action) values(_org,auth.uid(),'retention.apply');return affected;end $$;
do $$ declare f record;begin
 for f in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['list_team','list_invitations','create_invitation','accept_invitation','revoke_invitation','manage_member','transfer_ownership','update_shop','delete_shop','request_plan','anonymize_customer','apply_retention']) loop
 execute 'revoke all on function '||f.signature||' from public,anon';execute 'grant execute on function '||f.signature||' to authenticated';end loop;
end $$;
revoke all on function public.admin_activate_plan(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_activate_plan(uuid,text,integer,text) to service_role;
notify pgrst,'reload schema';
create function public.log_export(_org uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into public.audit_logs(organization_id,actor_id,action) values(_org,auth.uid(),'organization.export');end $$;
revoke all on function public.log_export(uuid) from public,anon;
grant execute on function public.log_export(uuid) to authenticated;
