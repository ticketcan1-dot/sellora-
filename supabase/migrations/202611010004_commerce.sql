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
