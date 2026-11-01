-- Sellora AI : mise à jour unique depuis les migrations 001 à 003 déjà appliquées.
-- Ajoute clients/commandes, équipe, facturation, messagerie officielle et confirmation client.
-- Ne pas utiliser install.sql sur votre base existante. Sauvegarder avant une mise à jour de production.
begin;

-- 202611010004_commerce.sql
alter table public.organizations add column is_active boolean not null default true;
alter table public.organizations add column contact_email text not null default '';
alter table public.organizations add column city text not null default '';
alter table public.organizations add column retention_days integer not null default 365 check(retention_days between 30 and 3650);
alter table public.customers add column city text not null default '';
alter table public.customers add column notes text not null default '';
alter table public.customers add column whatsapp_opt_in_at timestamptz;
alter table public.conversations add column subject text not null default '';
alter table public.conversations add column channel_id uuid;
alter table public.conversations add column external_contact_id text;
alter table public.conversations add column last_inbound_at timestamptz;
alter table public.conversations add column ai_paused boolean not null default false;
alter table public.conversations add foreign key(organization_id,channel_id) references public.channels(organization_id,id);
create unique index conversations_external_unique on public.conversations(organization_id,channel_id,external_contact_id) where not is_simulation;
alter table public.messages add column external_id text;
alter table public.messages add column direction text not null default 'internal' check(direction in ('inbound','outbound','internal'));
alter table public.messages add column delivery_status text not null default 'stored' check(delivery_status in ('stored','queued','sending','sent','delivered','read','failed','unknown'));
create unique index messages_external_unique on public.messages(organization_id,external_id) where external_id is not null;
alter table public.ai_suggestions add column status text not null default 'pending' check(status in ('pending','approved','rejected'));
alter table public.ai_suggestions add column source_message_id uuid;
alter table public.messages add unique(organization_id,id);
alter table public.ai_suggestions add foreign key(organization_id,source_message_id) references public.messages(organization_id,id);
alter table public.orders add column notes text not null default '';
alter table public.orders add column confirmation_evidence text;
alter table public.orders add column confirmed_at timestamptz;
alter table public.orders add column stock_reserved boolean not null default false;
alter table public.orders add column customer_snapshot jsonb not null default '{}';
alter table public.order_items add column variant_name text not null default '';
create table public.order_history (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 order_id uuid not null, previous_status text, next_status text not null, note text not null default '', actor_id uuid references auth.users on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,order_id) references public.orders(organization_id,id) on delete cascade
);
create table public.payment_records (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 order_id uuid not null, amount_minor integer not null check(amount_minor>0), method text not null check(method in ('cod','bank','manual','provider')),
 reference text not null check(char_length(reference) between 3 and 200), provider_verified boolean not null default false,
 actor_id uuid references auth.users on delete set null, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,order_id) references public.orders(organization_id,id) on delete cascade
);
create table public.conversation_notes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 conversation_id uuid not null, content text not null check(char_length(content) between 1 and 4000), actor_id uuid references auth.users on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 title text not null, href text not null, kind text not null, read_by uuid[] not null default '{}',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
do $$ declare t text;begin
 foreach t in array array['order_history','payment_records','conversation_notes','notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using(private.has_role(organization_id))',t);
 execute format('create index on public.%I(organization_id,created_at)',t);
 execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
 end loop;
end $$;
create function private.require_staff(_org uuid) returns void language plpgsql stable security definer set search_path='' as $$ begin
 if not private.has_role(_org,array['owner','admin','agent']) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.organizations where id=_org and is_active) then raise exception 'Shop inactive';end if;
end $$;
revoke all on function private.require_staff(uuid) from public;

create function public.save_customer(_org uuid,_id uuid,_details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid;begin
 perform private.require_staff(_org);
 if char_length(trim(coalesce(_details->>'name','')))<2 or char_length(_details->>'name')>160 or char_length(coalesce(_details->>'phone',''))>40 or char_length(coalesce(_details->>'address',''))>1000 or char_length(coalesce(_details->>'city',''))>100 or char_length(coalesce(_details->>'notes',''))>4000 then raise exception 'Invalid customer';end if;
 if (_details->>'consent')::boolean is distinct from true then raise exception 'Consent required';end if;
 if _id is null then
 insert into public.customers(organization_id,name,phone,address,city,notes,consent_at,whatsapp_opt_in_at) values(_org,trim(_details->>'name'),nullif(_details->>'phone',''),nullif(_details->>'address',''),coalesce(_details->>'city',''),coalesce(_details->>'notes',''),now(),case when (_details->>'whatsapp_opt_in')::boolean then now() else null end) returning id into result;
 else
 update public.customers set name=trim(_details->>'name'),phone=nullif(_details->>'phone',''),address=nullif(_details->>'address',''),city=coalesce(_details->>'city',''),notes=coalesce(_details->>'notes',''),consent_at=coalesce(consent_at,now()),whatsapp_opt_in_at=case when (_details->>'whatsapp_opt_in')::boolean then coalesce(whatsapp_opt_in_at,now()) else null end where organization_id=_org and id=_id returning id into result;
 if result is null then raise exception 'Customer unavailable';end if;
 end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'customer.save',result);return result;
end $$;
create function public.create_order(_org uuid,_customer uuid,_conversation uuid,_items jsonb,_delivery integer,_notes text default '') returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid; item jsonb; v public.product_variants; p public.products; c public.customers; thread public.conversations; total bigint:=0;qty integer;simulation boolean:=false;src text:='manual';begin
 perform private.require_staff(_org);
 if _delivery<0 or _delivery>10000000 or char_length(_notes)>4000 or jsonb_typeof(_items)<>'array' or jsonb_array_length(_items) not between 1 and 50 then raise exception 'Invalid order';end if;
 select * into c from public.customers where organization_id=_org and id=_customer;
 if not found or c.consent_at is null or coalesce(c.phone,'')='' or coalesce(c.address,'')='' or c.city='' then raise exception 'Customer name, phone, city, address and consent required';end if;
 if _conversation is not null then
 select * into thread from public.conversations where organization_id=_org and id=_conversation;
 if not found or (thread.customer_id is not null and thread.customer_id<>_customer) then raise exception 'Conversation unavailable';end if;
 simulation=thread.is_simulation;src=thread.source;
 end if;
 if (select count(distinct x->>'variant_id') from jsonb_array_elements(_items) x)<>jsonb_array_length(_items) then raise exception 'Duplicate variants';end if;
 insert into public.orders(organization_id,customer_id,conversation_id,status,source,is_simulation,delivery_minor,notes,customer_snapshot)
 values(_org,_customer,_conversation,'draft',src,simulation,_delivery,_notes,jsonb_build_object('name',c.name,'phone',c.phone,'city',c.city,'address',c.address)) returning id into result;
 for item in select * from jsonb_array_elements(_items) loop
 qty=(item->>'quantity')::integer;if qty not between 1 and 10000 then raise exception 'Invalid quantity';end if;
 select * into v from public.product_variants where organization_id=_org and id=(item->>'variant_id')::uuid;
 if not found then raise exception 'Variant unavailable';end if;
 select * into p from public.products where organization_id=_org and id=v.product_id and status='active';
 if not found then raise exception 'Product inactive';end if;
 if v.stock<qty then raise exception 'Insufficient stock';end if;
 total=total+v.price_minor::bigint*qty;
 insert into public.order_items(organization_id,order_id,variant_id,product_name,variant_name,quantity,unit_price_minor) values(_org,result,v.id,p.name,v.name,qty,v.price_minor);
 end loop;
 if total+_delivery>2000000000 then raise exception 'Order total too large';end if;
 update public.orders set total_minor=(total+_delivery)::integer where id=result;
 insert into public.order_history(organization_id,order_id,next_status,actor_id) values(_org,result,'draft',auth.uid());
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'order.create',result);return result;
end $$;
create function public.transition_order(_org uuid,_order uuid,_status text,_evidence text default '') returns void language plpgsql security definer set search_path='' as $$
 declare o public.orders;item record;v public.product_variants;begin
 perform private.require_staff(_org);
 select * into o from public.orders where organization_id=_org and id=_order for update;
 if not found then raise exception 'Order unavailable';end if;
 if o.status=_status then return;end if;
 if not ((o.status='draft' and _status in ('awaiting_confirmation','cancelled')) or (o.status='awaiting_confirmation' and _status in ('confirmed','cancelled')) or (o.status='confirmed' and _status in ('processing','cancelled')) or (o.status='processing' and _status in ('shipped','cancelled')) or (o.status='shipped' and _status='delivered')) then raise exception 'Invalid order transition';end if;
 if _status='confirmed' then
 if char_length(trim(_evidence)) not between 3 and 2000 then raise exception 'Explicit customer confirmation evidence required';end if;
 if not o.is_simulation then
 for item in select * from public.order_items where organization_id=_org and order_id=_order order by variant_id loop
 select * into v from public.product_variants where organization_id=_org and id=item.variant_id for update;
 if not found or v.stock<item.quantity then raise exception 'Insufficient stock';end if;
 if not exists(select 1 from public.products where organization_id=_org and id=v.product_id and status='active') then raise exception 'Product inactive';end if;
 update public.product_variants set stock=stock-item.quantity where id=v.id;
 end loop;
 end if;
 update public.orders set stock_reserved=not is_simulation,confirmation_evidence=_evidence,confirmed_at=now() where id=_order;
 insert into public.notifications(organization_id,title,href,kind) values(_org,case when o.is_simulation then 'Commande de simulation confirmée' else 'Nouvelle commande confirmée' end,'/app/commandes?id='||_order,'order');
 end if;
 if _status='cancelled' then
 if exists(select 1 from public.payment_records where order_id=_order) then raise exception 'Recorded payment requires accounting review before cancellation';end if;
 if o.stock_reserved then
 -- Lock variants in the same deterministic order used by confirmation.
 for item in select * from public.order_items where organization_id=_org and order_id=_order order by variant_id loop
 perform 1 from public.product_variants where id=item.variant_id for update;
 update public.product_variants set stock=stock+item.quantity where id=item.variant_id and organization_id=_org;
 end loop;
 update public.orders set stock_reserved=false where id=_order;
 end if;
 end if;
 update public.orders set status=_status where id=_order;
 insert into public.order_history(organization_id,order_id,previous_status,next_status,note,actor_id) values(_org,_order,o.status,_status,left(_evidence,2000),auth.uid());
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'order.'||_status,_order);
end $$;
create function public.record_payment(_org uuid,_order uuid,_amount integer,_method text,_reference text) returns void language plpgsql security definer set search_path='' as $$
 declare o public.orders;settled bigint;begin
 if not private.has_role(_org,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into o from public.orders where organization_id=_org and id=_order for update;
 if not found or o.is_simulation or o.status not in ('confirmed','processing','shipped','delivered') then raise exception 'Order not payable';end if;
 select coalesce(sum(amount_minor),0) into settled from public.payment_records where order_id=_order;
 if _amount<=0 or _amount>o.total_minor-settled or _method not in ('cod','bank','manual') or char_length(trim(_reference)) not between 3 and 200 then raise exception 'Invalid payment or missing proof reference';end if;
 insert into public.payment_records(organization_id,order_id,amount_minor,method,reference,actor_id) values(_org,_order,_amount,_method,trim(_reference),auth.uid());
 if settled+_amount=o.total_minor then update public.orders set paid_at=now() where id=_order;end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'payment.manual_record',_order);
end $$;
create function public.manage_conversation(_org uuid,_conversation uuid,_status text,_assignee uuid,_paused boolean,_customer uuid default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform private.require_staff(_org);
 if _status not in ('open','closed','human') then raise exception 'Invalid status';end if;
 if _assignee is not null and not exists(select 1 from public.memberships where organization_id=_org and user_id=_assignee and role in ('owner','admin','agent')) then raise exception 'Invalid assignee';end if;
 if _customer is not null and not exists(select 1 from public.customers where organization_id=_org and id=_customer) then raise exception 'Invalid customer';end if;
 update public.conversations set status=_status,assigned_to=_assignee,ai_paused=_paused,customer_id=coalesce(_customer,customer_id) where id=_conversation and organization_id=_org;
 if not found then raise exception 'Conversation unavailable';end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'conversation.update',_conversation);
 end $$;
create function public.add_conversation_note(_org uuid,_conversation uuid,_content text) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform private.require_staff(_org);
 if not exists(select 1 from public.conversations where organization_id=_org and id=_conversation) then raise exception 'Conversation unavailable';end if;
 insert into public.conversation_notes(organization_id,conversation_id,content,actor_id) values(_org,_conversation,trim(_content),auth.uid());
 end $$;
create function public.read_notifications(_org uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(_org) then raise exception 'Forbidden' using errcode='42501';end if;
 update public.notifications set read_by=array_append(read_by,auth.uid()) where organization_id=_org and not(auth.uid()=any(read_by));end $$;
-- All mutations are guarded functions. No direct browser DML for orders/PII.
do $$ declare f record;begin
 for f in select p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['save_customer','create_order','transition_order','record_payment','manage_conversation','add_conversation_note','read_notifications']) loop
 execute 'revoke all on function '||f.signature||' from public,anon';
 execute 'grant execute on function '||f.signature||' to authenticated';end loop;
end $$;
notify pgrst,'reload schema';
create unique index payment_receipt_unique on public.payment_records(organization_id,order_id,method,reference);

-- 202611010005_team_billing.sql
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

-- 202611010006_messaging.sql
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

-- 202611010007_checkout.sql
create table public.checkout_links (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,
 created_by uuid not null references auth.users,conversation_id uuid,token_hash text not null unique,
 items jsonb not null,delivery_minor integer not null check(delivery_minor>=0),total_minor integer not null check(total_minor>=0),
 is_simulation boolean not null default false,source text not null,expires_at timestamptz not null default now()+interval '24 hours',
 order_id uuid,created_at timestamptz not null default now(),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id),
 foreign key(organization_id,order_id) references public.orders(organization_id,id)
);
alter table public.checkout_links enable row level security;
revoke all on public.checkout_links from anon,authenticated;
grant all on public.checkout_links to service_role;
create index on public.checkout_links(organization_id,created_at);
create function public.create_checkout_link(_org uuid,_conversation uuid,_items jsonb,_delivery integer,_hash text) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid;item jsonb;v public.product_variants;p public.products;t public.conversations;quoted jsonb:='[]';amount bigint:=0;qty integer;sim boolean:=false;src text:='manual';begin
 perform private.require_staff(_org);
 if _hash !~ '^[a-f0-9]{64}$' or _delivery not between 0 and 10000000 or jsonb_array_length(_items) not between 1 and 50 then raise exception 'Invalid checkout';end if;
 if (select count(distinct x->>'variant_id') from jsonb_array_elements(_items) x)<>jsonb_array_length(_items) then raise exception 'Duplicate variants';end if;
 if _conversation is not null then select * into t from public.conversations where organization_id=_org and id=_conversation;if not found then raise exception 'Conversation unavailable';end if;sim=t.is_simulation;src=t.source;end if;
 for item in select * from jsonb_array_elements(_items) loop
 qty=(item->>'quantity')::integer;if qty not between 1 and 10000 then raise exception 'Invalid quantity';end if;
 select * into v from public.product_variants where organization_id=_org and id=(item->>'variant_id')::uuid;
 if not found or v.stock<qty then raise exception 'Insufficient stock';end if;
 select * into p from public.products where organization_id=_org and id=v.product_id and status='active';if not found then raise exception 'Product inactive';end if;
 amount=amount+v.price_minor::bigint*qty;
 quoted=quoted||jsonb_build_array(jsonb_build_object('variant_id',v.id,'product_name',p.name,'variant_name',v.name,'quantity',qty,'unit_price_minor',v.price_minor));
 end loop;
 if amount+_delivery>2000000000 then raise exception 'Order total too large';end if;
 insert into public.checkout_links(organization_id,created_by,conversation_id,token_hash,items,delivery_minor,total_minor,is_simulation,source) values(_org,auth.uid(),_conversation,_hash,quoted,_delivery,(amount+_delivery)::integer,sim,src) returning id into result;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(_org,auth.uid(),'checkout.create',result);return result;
 end $$;
revoke all on function public.create_checkout_link(uuid,uuid,jsonb,integer,text) from public,anon;
grant execute on function public.create_checkout_link(uuid,uuid,jsonb,integer,text) to authenticated;
create function public.checkout_preview(_hash text) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare link public.checkout_links;o public.orders;shop public.organizations;begin
 select * into link from public.checkout_links where token_hash=_hash;
 if not found then return null;end if;
 select * into shop from public.organizations where id=link.organization_id;if not found or not shop.is_active then return null;end if;
 if link.order_id is not null then
 if link.created_at<now()-interval '30 days' then return null;end if;
 select * into o from public.orders where id=link.order_id and organization_id=link.organization_id;
 return jsonb_build_object('shop',shop.name,'completed',true,'order_id',o.id,'status',o.status,'total_minor',o.total_minor,'is_simulation',o.is_simulation);
 end if;
 if link.expires_at<=now() then return null;end if;
 return jsonb_build_object('shop',shop.name,'completed',false,'items',link.items,'delivery_minor',link.delivery_minor,'total_minor',link.total_minor,'is_simulation',link.is_simulation,'expires_at',link.expires_at);
 end $$;
create function public.complete_checkout(_hash text,_details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare link public.checkout_links;item jsonb;v public.product_variants;customer uuid;result uuid;begin
 select * into link from public.checkout_links where token_hash=_hash for update;
 if not found then raise exception 'Checkout unavailable';end if;
 if link.order_id is not null then return link.order_id;end if;
 if link.expires_at<=now() or not exists(select 1 from public.organizations where id=link.organization_id and is_active) then raise exception 'Checkout expired';end if;
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=link.organization_id and m.user_id=link.created_by and m.role in ('owner','admin','agent') and p.approval_status='approved') then raise exception 'Checkout author unavailable';end if;
 if (_details->>'consent')::boolean is distinct from true or (_details->>'agreed')::boolean is distinct from true then raise exception 'Explicit consent and confirmation required';end if;
 if char_length(trim(coalesce(_details->>'name',''))) not between 2 and 160 or char_length(trim(coalesce(_details->>'phone',''))) not between 6 and 40 or char_length(trim(coalesce(_details->>'city',''))) not between 2 and 100 or char_length(trim(coalesce(_details->>'address',''))) not between 5 and 1000 then raise exception 'Complete customer details required';end if;
 for item in select * from jsonb_array_elements(link.items) order by value->>'variant_id' loop
 select * into v from public.product_variants where organization_id=link.organization_id and id=(item->>'variant_id')::uuid for update;
 if not found or v.stock<(item->>'quantity')::integer then raise exception 'Insufficient stock';end if;
 if v.price_minor<>(item->>'unit_price_minor')::integer then raise exception 'Price changed; request a new checkout link';end if;
 if not exists(select 1 from public.products where organization_id=link.organization_id and id=v.product_id and status='active') then raise exception 'Product inactive';end if;
 end loop;
 insert into public.customers(organization_id,name,phone,city,address,consent_at,whatsapp_opt_in_at) values(link.organization_id,trim(_details->>'name'),trim(_details->>'phone'),trim(_details->>'city'),trim(_details->>'address'),now(),case when (_details->>'whatsapp_opt_in')::boolean then now() else null end) returning id into customer;
 insert into public.orders(organization_id,customer_id,conversation_id,status,source,is_simulation,total_minor,delivery_minor,customer_snapshot)
 values(link.organization_id,customer,link.conversation_id,'draft',link.source,link.is_simulation,link.total_minor,link.delivery_minor,jsonb_build_object('name',trim(_details->>'name'),'phone',trim(_details->>'phone'),'city',trim(_details->>'city'),'address',trim(_details->>'address'))) returning id into result;
 for item in select * from jsonb_array_elements(link.items) order by value->>'variant_id' loop
 insert into public.order_items(organization_id,order_id,variant_id,product_name,variant_name,quantity,unit_price_minor) values(link.organization_id,result,(item->>'variant_id')::uuid,item->>'product_name',item->>'variant_name',(item->>'quantity')::integer,(item->>'unit_price_minor')::integer);
 if not link.is_simulation then update public.product_variants set stock=stock-(item->>'quantity')::integer where organization_id=link.organization_id and id=(item->>'variant_id')::uuid;end if;
 end loop;
 update public.orders set status='confirmed',stock_reserved=not link.is_simulation,confirmation_evidence='Accord explicite du client via lien privé',confirmed_at=now() where id=result;
 insert into public.order_history(organization_id,order_id,next_status,note) values(link.organization_id,result,'draft','Récapitulatif privé'),(link.organization_id,result,'awaiting_confirmation','Récapitulatif présenté au client'),(link.organization_id,result,'confirmed','Accord explicite du client via lien privé');
 update public.checkout_links set order_id=result where id=link.id;
 if link.conversation_id is not null then update public.conversations set customer_id=customer where id=link.conversation_id and organization_id=link.organization_id;end if;
 insert into public.notifications(organization_id,title,href,kind) values(link.organization_id,case when link.is_simulation then 'Commande simulée confirmée par lien' else 'Commande confirmée par le client' end,'/app/commandes?id='||result,'order');
 insert into public.audit_logs(organization_id,action,entity_id) values(link.organization_id,'order.customer_confirmed',result);return result;
 end $$;
revoke all on function public.checkout_preview(text),public.complete_checkout(text,jsonb) from public,anon,authenticated;
grant execute on function public.checkout_preview(text),public.complete_checkout(text,jsonb) to service_role;
notify pgrst,'reload schema';

-- 202611010008_operations.sql
create function public.admin_update_plan(_plan text,_details jsonb,_actor text) returns void language plpgsql security definer set search_path='' as $$ begin
 if char_length(_actor)<3 then raise exception 'Invalid administrator';end if;
 update public.plan_entitlements set products_limit=(_details->>'products_limit')::integer,members_limit=(_details->>'members_limit')::integer,ai_daily_limit=(_details->>'ai_daily_limit')::integer,messages_daily_limit=(_details->>'messages_daily_limit')::integer,price_mad_minor=(_details->>'price_mad_minor')::integer,updated_at=now() where plan=_plan;
 if not found then raise exception 'Plan unavailable';end if;
 update public.subscriptions set ai_daily_limit=(_details->>'ai_daily_limit')::integer where plan=_plan;
 insert into public.platform_audit_logs(actor_email,previous_status,next_status) values(_actor,'plan:'||_plan,'limits_updated:'||_details::text);end $$;
revoke all on function public.admin_update_plan(text,jsonb,text) from public,anon,authenticated;grant execute on function public.admin_update_plan(text,jsonb,text) to service_role;
create function public.dashboard_series(_org uuid) returns table(day date,orders bigint,revenue_minor bigint,conversations bigint) language plpgsql stable security invoker set search_path='' as $$ begin
 if not private.has_role(_org) then raise exception 'Forbidden' using errcode='42501';end if;
 return query select d.day::date,
 (select count(*) from public.orders o where o.organization_id=_org and not o.is_simulation and o.status in ('confirmed','processing','shipped','delivered') and (coalesce(o.confirmed_at,o.created_at) at time zone 'Africa/Casablanca')::date=d.day::date),
 (select coalesce(sum(o.total_minor),0) from public.orders o where o.organization_id=_org and not o.is_simulation and o.status in ('confirmed','processing','shipped','delivered') and (coalesce(o.confirmed_at,o.created_at) at time zone 'Africa/Casablanca')::date=d.day::date),
 (select count(*) from public.conversations c where c.organization_id=_org and not c.is_simulation and (c.created_at at time zone 'Africa/Casablanca')::date=d.day::date)
 from generate_series((now() at time zone 'Africa/Casablanca')::date-29,(now() at time zone 'Africa/Casablanca')::date,interval '1 day') d(day) order by d.day;
 end $$;
revoke all on function public.dashboard_series(uuid) from public,anon;grant execute on function public.dashboard_series(uuid) to authenticated;
-- Technical outbox watchdog: ambiguous sends never become automatic retries.
create function public.cleanup_technical_events() returns void language plpgsql security definer set search_path='' as $$ begin
 update public.messages set delivery_status='unknown' where id in(select message_id from public.message_outbox where status='sending' and lease_until<now());
 update public.message_outbox set status='unknown',error_code='expired_send_lease' where status='sending' and lease_until<now();
 update public.webhook_events set payload='{"redacted":true}',status=case when status='completed' then status else 'dead' end where created_at<now()-interval '7 days';
 delete from public.oauth_states where expires_at<now()-interval '1 day';
 delete from public.admin_login_attempts where created_at<now()-interval '1 day';
 delete from public.checkout_links where created_at<now()-interval '30 days';
 delete from public.delivery_receipts where occurred_at<now()-interval '7 days';
 end $$;
revoke all on function public.cleanup_technical_events() from public,anon,authenticated;grant execute on function public.cleanup_technical_events() to service_role;
notify pgrst,'reload schema';
create table public.delivery_receipts (
 organization_id uuid not null references public.organizations on delete cascade,external_id text not null,
 status text not null check(status in ('sent','delivered','read','failed')),occurred_at timestamptz not null,
 primary key(organization_id,external_id,status)
);
alter table public.delivery_receipts enable row level security;
revoke all on public.delivery_receipts from anon,authenticated;grant all on public.delivery_receipts to service_role;
create function private.apply_early_receipt() returns trigger language plpgsql security definer set search_path='' as $$
 declare receipt text;begin
 if new.direction<>'outbound' or new.external_id is null then return new;end if;
 select status into receipt from public.delivery_receipts where organization_id=new.organization_id and external_id=new.external_id order by case status when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 when 'sent' then 1 end desc limit 1;
 if receipt is not null and (case receipt when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 when 'sent' then 1 else 0 end)>(case new.delivery_status when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 when 'sent' then 1 else 0 end) then new.delivery_status=receipt;end if;return new;
 end $$;
create trigger early_receipt before insert or update of external_id on public.messages for each row execute function private.apply_early_receipt();
create function private.sync_receipt_outbox() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.direction='outbound' and new.external_id is not null and new.delivery_status in ('read','delivered','failed') then
 update public.message_outbox set status=case when new.delivery_status='failed' then 'failed' else 'sent' end,lease_until=null,error_code=case when new.delivery_status='failed' then 'provider_delivery_failed' else null end where message_id=new.id;end if;return new;end $$;
create trigger receipt_outbox after update on public.messages for each row execute function private.sync_receipt_outbox();
create function private.subscription_default_quota() returns trigger language plpgsql security definer set search_path='' as $$ begin
 select ai_daily_limit into new.ai_daily_limit from public.plan_entitlements where plan=new.plan;
 return new;end $$;
create trigger subscription_default_quota before insert on public.subscriptions for each row execute function private.subscription_default_quota();

-- 202611010009_ai_checkout.sql
alter table public.ai_settings add column checkout_enabled boolean not null default false;
alter table public.ai_settings add column checkout_delivery_minor integer not null default 0 check(checkout_delivery_minor between 0 and 10000000);
alter table public.ai_settings add column checkout_cities text[] not null default '{}';
alter table public.checkout_links add column actor_type text not null default 'human' check(actor_type in ('human','assistant'));
alter table public.checkout_links add column delivery_cities text[] not null default '{}';
create function public.create_ai_checkout(_org uuid,_conversation uuid,_variant uuid,_quantity integer,_hash text) returns uuid language plpgsql security definer set search_path='' as $$
 declare settings public.ai_settings;t public.conversations;v public.product_variants;p public.products;owner_id uuid;result uuid;total bigint;begin
 if _quantity not between 1 and 100 or _hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid purchase';end if;
 select * into settings from public.ai_settings where organization_id=_org;
 if not found or not settings.checkout_enabled or settings.paused then raise exception 'AI checkout disabled';end if;
 if not private.active_subscription(_org) or not exists(select 1 from public.organizations where id=_org and is_active) then raise exception 'Trial expired';end if;
 select * into t from public.conversations where organization_id=_org and id=_conversation;
 if not found or t.status<>'open' or t.ai_paused then raise exception 'Human review required';end if;
 if settings.mode='simulation' and not t.is_simulation then raise exception 'AI checkout disabled';end if;
 select m.user_id into owner_id from public.memberships m join public.profiles profile on profile.id=m.user_id where m.organization_id=_org and m.role='owner' and profile.approval_status='approved' limit 1;
 if owner_id is null then raise exception 'Owner approval required';end if;
 select * into v from public.product_variants where organization_id=_org and id=_variant;
 if not found or v.stock<_quantity then raise exception 'Insufficient stock';end if;
 select * into p from public.products where organization_id=_org and id=v.product_id and status='active';if not found then raise exception 'Product inactive';end if;
 total=v.price_minor::bigint*_quantity+settings.checkout_delivery_minor;if total>2000000000 then raise exception 'Order total too large';end if;
 insert into public.checkout_links(organization_id,created_by,conversation_id,token_hash,items,delivery_minor,total_minor,is_simulation,source,actor_type,delivery_cities)
 values(_org,owner_id,t.id,_hash,jsonb_build_array(jsonb_build_object('variant_id',v.id,'product_name',p.name,'variant_name',v.name,'quantity',_quantity,'unit_price_minor',v.price_minor)),settings.checkout_delivery_minor,total::integer,t.is_simulation,t.source,'assistant',settings.checkout_cities) returning id into result;
 insert into public.audit_logs(organization_id,action,entity_id) values(_org,'checkout.ai_proposal',result);return result;
 end $$;
revoke all on function public.create_ai_checkout(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.create_ai_checkout(uuid,uuid,uuid,integer,text) to service_role;

create or replace function public.checkout_preview(_hash text) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare link public.checkout_links;o public.orders;shop public.organizations;begin
 select * into link from public.checkout_links where token_hash=_hash;
 if not found then return null;end if;
 select * into shop from public.organizations where id=link.organization_id;if not found or not shop.is_active then return null;end if;
 if link.order_id is not null then
 if link.created_at<now()-interval '30 days' then return null;end if;
 select * into o from public.orders where id=link.order_id and organization_id=link.organization_id;
 return jsonb_build_object('shop',shop.name,'completed',true,'order_id',o.id,'status',o.status,'total_minor',o.total_minor,'is_simulation',o.is_simulation);
 end if;
 if link.expires_at<=now() then return null;end if;
 return jsonb_build_object('shop',shop.name,'completed',false,'items',link.items,'delivery_minor',link.delivery_minor,'total_minor',link.total_minor,'is_simulation',link.is_simulation,'expires_at',link.expires_at,'delivery_cities',link.delivery_cities);
 end $$;
create or replace function public.complete_checkout(_hash text,_details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare link public.checkout_links;item jsonb;v public.product_variants;customer uuid;result uuid;begin
 select * into link from public.checkout_links where token_hash=_hash for update;
 if not found then raise exception 'Checkout unavailable';end if;
 if link.order_id is not null then return link.order_id;end if;
 if link.expires_at<=now() or not exists(select 1 from public.organizations where id=link.organization_id and is_active) then raise exception 'Checkout expired';end if;
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=link.organization_id and m.user_id=link.created_by and m.role in ('owner','admin','agent') and p.approval_status='approved') then raise exception 'Checkout author unavailable';end if;
 if link.actor_type='assistant' then
 if not exists(select 1 from public.ai_settings where organization_id=link.organization_id and checkout_enabled and checkout_delivery_minor=link.delivery_minor and checkout_cities=link.delivery_cities) then raise exception 'Checkout policy changed';end if;
 if cardinality(link.delivery_cities)>0 and not exists(select 1 from unnest(link.delivery_cities) city where lower(trim(city))=lower(trim(_details->>'city'))) then raise exception 'Delivery city not supported';end if;
 end if;
 if (_details->>'consent')::boolean is distinct from true or (_details->>'agreed')::boolean is distinct from true then raise exception 'Explicit consent and confirmation required';end if;
 if char_length(trim(coalesce(_details->>'name',''))) not between 2 and 160 or char_length(trim(coalesce(_details->>'phone',''))) not between 6 and 40 or char_length(trim(coalesce(_details->>'city',''))) not between 2 and 100 or char_length(trim(coalesce(_details->>'address',''))) not between 5 and 1000 then raise exception 'Complete customer details required';end if;
 for item in select * from jsonb_array_elements(link.items) order by value->>'variant_id' loop
 select * into v from public.product_variants where organization_id=link.organization_id and id=(item->>'variant_id')::uuid for update;
 if not found or v.stock<(item->>'quantity')::integer then raise exception 'Insufficient stock';end if;
 if v.price_minor<>(item->>'unit_price_minor')::integer then raise exception 'Price changed; request a new checkout link';end if;
 if not exists(select 1 from public.products where organization_id=link.organization_id and id=v.product_id and status='active') then raise exception 'Product inactive';end if;
 end loop;
 insert into public.customers(organization_id,name,phone,city,address,consent_at,whatsapp_opt_in_at) values(link.organization_id,trim(_details->>'name'),trim(_details->>'phone'),trim(_details->>'city'),trim(_details->>'address'),now(),case when (_details->>'whatsapp_opt_in')::boolean then now() else null end) returning id into customer;
 insert into public.orders(organization_id,customer_id,conversation_id,status,source,is_simulation,total_minor,delivery_minor,customer_snapshot)
 values(link.organization_id,customer,link.conversation_id,'draft',link.source,link.is_simulation,link.total_minor,link.delivery_minor,jsonb_build_object('name',trim(_details->>'name'),'phone',trim(_details->>'phone'),'city',trim(_details->>'city'),'address',trim(_details->>'address'))) returning id into result;
 for item in select * from jsonb_array_elements(link.items) order by value->>'variant_id' loop
 insert into public.order_items(organization_id,order_id,variant_id,product_name,variant_name,quantity,unit_price_minor) values(link.organization_id,result,(item->>'variant_id')::uuid,item->>'product_name',item->>'variant_name',(item->>'quantity')::integer,(item->>'unit_price_minor')::integer);
 if not link.is_simulation then update public.product_variants set stock=stock-(item->>'quantity')::integer where organization_id=link.organization_id and id=(item->>'variant_id')::uuid;end if;
 end loop;
 update public.orders set status='confirmed',stock_reserved=not link.is_simulation,confirmation_evidence='Accord explicite du client via lien privé',confirmed_at=now() where id=result;
 insert into public.order_history(organization_id,order_id,next_status,note) values(link.organization_id,result,'draft','Récapitulatif privé'),(link.organization_id,result,'awaiting_confirmation','Récapitulatif présenté au client'),(link.organization_id,result,'confirmed','Accord explicite du client via lien privé');
 update public.checkout_links set order_id=result where id=link.id;
 if link.conversation_id is not null then update public.conversations set customer_id=customer where id=link.conversation_id and organization_id=link.organization_id;end if;
 insert into public.notifications(organization_id,title,href,kind) values(link.organization_id,case when link.is_simulation then 'Commande simulée confirmée par lien' else 'Commande confirmée par le client' end,'/app/commandes?id='||result,'order');
 insert into public.audit_logs(organization_id,action,entity_id) values(link.organization_id,'order.customer_confirmed',result);return result;
 end $$;

notify pgrst,'reload schema';

notify pgrst, 'reload schema';
commit;
