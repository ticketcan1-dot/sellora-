-- Sellora AI: installation initiale sur un projet sans tables Sellora.
-- Généré depuis supabase/migrations ; aucune clé incluse.
begin;

-- 202611010001_foundation.sql
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 display_name text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 2 and 100),
 currency text not null default 'MAD' check (currency='MAD'), low_stock_threshold integer not null default 5 check(low_stock_threshold>=0),
 onboarding_step integer not null default 1 check(onboarding_step between 1 and 4), onboarding_completed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 user_id uuid not null references auth.users on delete cascade, role text not null check(role in ('owner','admin','agent','viewer')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,user_id)
);
create function private.has_role(org uuid, roles text[] default array['owner','admin','agent','viewer']) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where organization_id=org and user_id=(select auth.uid()) and role=any(roles));
$$;
revoke all on function private.has_role(uuid,text[]) from public;
grant execute on function private.has_role(uuid,text[]) to authenticated;

create table public.invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 email text not null, role text not null check(role in ('admin','agent','viewer')), token_hash text not null unique,
 expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 name text not null check(char_length(name) between 2 and 160), description_fr text not null default '', description_ar text not null default '',
 category text not null default '', tags text[] not null default '{}', visual_attributes text not null default '', delivery_rules text not null default '',
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.product_variants (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 product_id uuid not null, sku text not null check(char_length(sku) between 1 and 80), name text not null default 'Standard',
 color text not null default '', size text not null default '', material text not null default '',
 price_minor integer not null check(price_minor>=0), stock integer not null check(stock>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,product_id) references public.products(organization_id,id) on delete cascade,
 unique(organization_id,sku), unique(organization_id,id)
);
create table public.product_images (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 product_id uuid not null, path text not null unique, alt text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,product_id) references public.products(organization_id,id) on delete cascade,
 check(split_part(path,'/',1)=organization_id::text)
);
create table public.ai_settings (
 organization_id uuid primary key references public.organizations on delete cascade,
 name text not null default 'Sellora', tone text not null default 'chaleureux' check(tone in ('chaleureux','professionnel','concis')),
 address text not null default 'vous' check(address in ('vous','tu')), language text not null default 'auto' check(language in ('auto','fr','ar','darija')),
 emoji boolean not null default false, hours text not null default '', delivery text not null default '', returns text not null default '',
 cod boolean not null default false, discounts text not null default '', faq text not null default '', instructions text not null default '',
 escalation text not null default 'Contactez la boutique pour une confirmation.', paused boolean not null default false,
 mode text not null default 'simulation' check(mode='simulation'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.channels (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 provider text not null check(provider in ('instagram','whatsapp')), status text not null default 'non_configured' check(status in ('non_configured','pending_approval','connected','error','revoked')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,provider)
);
create table public.channel_credentials (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 channel_id uuid not null unique, ciphertext text not null, expires_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.channels add unique(organization_id,id);
alter table public.channel_credentials add foreign key(organization_id,channel_id) references public.channels(organization_id,id) on delete cascade;
create table public.social_media_assets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 provider text not null check(provider in ('instagram','whatsapp')), external_id text not null, product_id uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,product_id) references public.products(organization_id,id) on delete cascade,
 unique(organization_id,provider,external_id,product_id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 name text not null, phone text, address text, consent_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 customer_id uuid, is_simulation boolean not null default true, source text not null default 'simulation' check(source in ('simulation','instagram','whatsapp')),
 status text not null default 'open' check(status in ('open','closed','human')), assigned_to uuid references auth.users on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id), check(is_simulation=(source='simulation'))
);
create table public.messages (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 conversation_id uuid not null, role text not null check(role in ('user','assistant','human')), content text not null check(char_length(content)<=12000),
 image_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade
);
create table public.ai_suggestions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 conversation_id uuid not null, content text not null, product_ids uuid[] not null default '{}', needs_human boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 customer_id uuid, conversation_id uuid, status text not null default 'draft' check(status in ('draft','awaiting_confirmation','confirmed','processing','shipped','delivered','cancelled')),
 source text not null check(source in ('manual','instagram','whatsapp','simulation')), is_simulation boolean not null default false,
 total_minor integer not null default 0 check(total_minor>=0), delivery_minor integer not null default 0 check(delivery_minor>=0), paid_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id), check(is_simulation=(source='simulation'))
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 order_id uuid not null, variant_id uuid, product_name text not null, quantity integer not null check(quantity>0), unit_price_minor integer not null check(unit_price_minor>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,order_id) references public.orders(organization_id,id) on delete cascade,
 foreign key(organization_id,variant_id) references public.product_variants(organization_id,id)
);
create table public.subscriptions (
 organization_id uuid primary key references public.organizations on delete cascade, plan text not null default 'starter' check(plan in ('starter','business','premium')),
 activated_at timestamptz not null default now(), trial_ends_at timestamptz not null default(now()+interval '7 days'),
 status text not null default 'trial' check(status in ('trial','manual','expired')), ai_daily_limit integer not null default 50 check(ai_daily_limit between 0 and 10000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.usage_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 kind text not null, input_tokens integer not null default 0 check(input_tokens>=0), output_tokens integer not null default 0 check(output_tokens>=0),
 status text not null default 'reserved' check(status in ('reserved','completed','failed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.webhook_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 provider text not null, external_id text not null, status text not null default 'pending', attempts integer not null default 0,
 next_attempt_at timestamptz, payload jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(provider,external_id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 actor_id uuid references auth.users on delete set null, action text not null, entity_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if exists(select 1 from public.organizations where id=coalesce(new.organization_id,old.organization_id)) then
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(coalesce(new.organization_id,old.organization_id),auth.uid(),tg_table_name||'.'||lower(tg_op),coalesce(new.id,old.id));
 end if;
 return coalesce(new,old);
 end $$;

do $$ declare t text; begin
 foreach t in array array['profiles','organizations','memberships','invitations','products','product_variants','product_images','ai_settings','channels','channel_credentials','social_media_assets','customers','conversations','messages','ai_suggestions','orders','order_items','subscriptions','usage_events','webhook_events','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
 if t not in ('profiles','organizations') then
 execute format('create index on public.%I(organization_id)',t);
 end if;
 end loop;
 foreach t in array array['products','product_variants','product_images','memberships'] loop
 execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
 end loop;
end $$;
create index on public.products using gin(to_tsvector('simple',name||' '||description_fr||' '||description_ar));
create index on public.messages(conversation_id,created_at);
create index on public.usage_events(organization_id,created_at);
create index on public.orders(organization_id,status) where not is_simulation;

grant select on public.profiles,public.organizations,public.memberships,public.products,public.product_variants,public.product_images,public.social_media_assets,public.ai_settings,public.channels,public.customers,public.conversations,public.messages,public.ai_suggestions,public.orders,public.order_items,public.subscriptions,public.usage_events,public.audit_logs to authenticated;
grant update on public.profiles,public.organizations to authenticated;
grant insert,update,delete on public.products,public.product_variants,public.product_images,public.social_media_assets,public.ai_settings to authenticated;

create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy org_read on public.organizations for select to authenticated using(private.has_role(id));
create policy org_update on public.organizations for update to authenticated using(private.has_role(id,array['owner','admin'])) with check(private.has_role(id,array['owner','admin']));
create policy member_read on public.memberships for select to authenticated using(private.has_role(organization_id));
-- Membership writes are exclusively controlled RPCs; clients cannot promote themselves.

do $$ declare t text; begin
 foreach t in array array['products','product_variants','product_images','social_media_assets','ai_settings'] loop
 execute format('create policy tenant_read on public.%I for select to authenticated using(private.has_role(organization_id))',t);
 execute format('create policy manager_insert on public.%I for insert to authenticated with check(private.has_role(organization_id,array[''owner'',''admin'']))',t);
 execute format('create policy manager_update on public.%I for update to authenticated using(private.has_role(organization_id,array[''owner'',''admin''])) with check(private.has_role(organization_id,array[''owner'',''admin'']))',t);
 execute format('create policy manager_delete on public.%I for delete to authenticated using(private.has_role(organization_id,array[''owner'',''admin'']))',t);
 end loop;
 foreach t in array array['channels','subscriptions','usage_events','audit_logs'] loop
 execute format('create policy tenant_read on public.%I for select to authenticated using(private.has_role(organization_id,array[''owner'',''admin'']))',t);
 end loop;
 foreach t in array array['customers','conversations','messages','ai_suggestions','orders','order_items'] loop
 execute format('create policy staff_read on public.%I for select to authenticated using(private.has_role(organization_id))',t);
 end loop;
end $$;
-- No browser access policies for credentials, invitations or webhook payloads.
revoke all on public.channel_credentials,public.webhook_events,public.invitations from anon,authenticated;

create function public.create_organization(shop_name text) returns uuid language plpgsql security definer set search_path='' as $$
 declare org uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.organizations(name) values(trim(shop_name)) returning id into org;
 insert into public.memberships(organization_id,user_id,role) values(org,auth.uid(),'owner');
 insert into public.ai_settings(organization_id) values(org);
 insert into public.subscriptions(organization_id) values(org);
 return org;
 end $$;
revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;

create function public.save_product(org uuid, product uuid, details jsonb, variants jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
 declare pid uuid; item jsonb; begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Forbidden'; end if;
 if jsonb_array_length(variants)<1 or jsonb_array_length(variants)>100 then raise exception 'Invalid variants'; end if;
 if product is null then
 insert into public.products(organization_id,name,description_fr,description_ar,category,status,tags,visual_attributes,delivery_rules)
 values(org,details->>'name',coalesce(details->>'description_fr',''),coalesce(details->>'description_ar',''),coalesce(details->>'category',''),details->>'status',array(select jsonb_array_elements_text(details->'tags')),coalesce(details->>'visual_attributes',''),coalesce(details->>'delivery_rules','')) returning id into pid;
 else
 update public.products set name=details->>'name',description_fr=details->>'description_fr',description_ar=details->>'description_ar',category=details->>'category',status=details->>'status',tags=array(select jsonb_array_elements_text(details->'tags')),visual_attributes=details->>'visual_attributes',delivery_rules=details->>'delivery_rules'
 where organization_id=org and id=product returning id into pid;
 if pid is null then raise exception 'Product unavailable'; end if;
 end if;
 for item in select * from jsonb_array_elements(variants) loop
 if item->>'id' is not null then
 update public.product_variants set sku=item->>'sku',name=item->>'name',price_minor=(item->>'price_minor')::integer,stock=(item->>'stock')::integer,color=coalesce(item->>'color',''),size=coalesce(item->>'size',''),material=coalesce(item->>'material','')
 where id=(item->>'id')::uuid and organization_id=org and product_id=pid;
 if not found then raise exception 'Variant unavailable'; end if;
 else
 insert into public.product_variants(organization_id,product_id,sku,name,price_minor,stock,color,size,material) values(org,pid,item->>'sku',item->>'name',(item->>'price_minor')::integer,(item->>'stock')::integer,coalesce(item->>'color',''),coalesce(item->>'size',''),coalesce(item->>'material',''));
 end if;
 end loop;
 return pid;
 end $$;
revoke all on function public.save_product(uuid,uuid,jsonb,jsonb) from public;
grant execute on function public.save_product(uuid,uuid,jsonb,jsonb) to authenticated;

create function public.reserve_ai_usage(org uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare sub public.subscriptions; used integer; event uuid; begin
 if not private.has_role(org,array['owner','admin','agent']) then raise exception 'Forbidden'; end if;
 select * into sub from public.subscriptions where organization_id=org for update;
 if not found or sub.status='expired' or (sub.status='trial' and sub.trial_ends_at<=now()) then raise exception 'Trial expired'; end if;
 select count(*) into used from public.usage_events where organization_id=org and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if used>=sub.ai_daily_limit then raise exception 'Daily quota reached'; end if;
 insert into public.usage_events(organization_id,kind) values(org,'simulation') returning id into event;
 return event;
 end $$;
revoke all on function public.reserve_ai_usage(uuid) from public;
grant execute on function public.reserve_ai_usage(uuid) to authenticated;

create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id) values(new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('catalog','catalog',false,5242880,array['image/jpeg','image/png','image/webp']),('simulation','simulation',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy image_read on storage.objects for select to authenticated using(bucket_id='catalog' and private.has_role((storage.foldername(name))[1]::uuid));
create policy image_upload on storage.objects for insert to authenticated with check(bucket_id='catalog' and private.has_role((storage.foldername(name))[1]::uuid,array['owner','admin']));
create policy image_delete on storage.objects for delete to authenticated using(bucket_id='catalog' and private.has_role((storage.foldername(name))[1]::uuid,array['owner','admin']));
-- Simulation images are uploaded/read by the guarded server only, with short-lived URLs.

-- 202611010002_metrics.sql
create function public.dashboard_metrics(org uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'active_products',(select count(*) from public.products where organization_id=org and status='active'),
 'in_stock',(select count(*) from public.product_variants where organization_id=org and stock>0),
 'conversations',(select count(*) from public.conversations where organization_id=org and not is_simulation),
 'confirmed_orders',(select count(*) from public.orders where organization_id=org and not is_simulation and status in ('confirmed','processing','shipped','delivered')),
 'confirmed_total',coalesce((select sum(total_minor) from public.orders where organization_id=org and not is_simulation and status in ('confirmed','processing','shipped','delivered')),0),
 'paid_total',coalesce((select sum(total_minor) from public.orders where organization_id=org and not is_simulation and paid_at is not null and status in ('confirmed','processing','shipped','delivered')),0),
 'converted_conversations',(select count(distinct conversation_id) from public.orders where organization_id=org and not is_simulation and conversation_id is not null and status in ('confirmed','processing','shipped','delivered'))
 ) where private.has_role(org);
$$;
revoke all on function public.dashboard_metrics(uuid) from public;
grant execute on function public.dashboard_metrics(uuid) to authenticated;
create function private.audit_settings_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.audit_logs(organization_id,actor_id,action) values(new.organization_id,auth.uid(),'ai_settings.update'); return new; end $$;
create trigger audit_settings after update on public.ai_settings for each row execute function private.audit_settings_change();

-- 202611010003_account_approval.sql
-- Existing and new accounts require an explicit platform-admin approval.
alter table public.profiles add column approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected'));
alter table public.profiles add column reviewed_at timestamptz;
-- A user may edit their display name, never their own approval state.
revoke update on public.profiles from authenticated;
grant update(display_name) on public.profiles to authenticated;

create function private.account_approved() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and approval_status='approved');
$$;
revoke all on function private.account_approved() from public;
grant execute on function private.account_approved() to authenticated;
create or replace function private.has_role(org uuid, roles text[] default array['owner','admin','agent','viewer']) returns boolean
 language sql stable security definer set search_path='' as $$
 select private.account_approved() and exists(select 1 from public.memberships where organization_id=org and user_id=(select auth.uid()) and role=any(roles));
$$;
create or replace function public.create_organization(shop_name text) returns uuid language plpgsql security definer set search_path='' as $$
 declare org uuid; begin
 if auth.uid() is null or not private.account_approved() then raise exception 'Account approval required' using errcode='42501';end if;
 insert into public.organizations(name) values(trim(shop_name)) returning id into org;
 insert into public.memberships(organization_id,user_id,role) values(org,auth.uid(),'owner');
 insert into public.ai_settings(organization_id) values(org);
 insert into public.subscriptions(organization_id) values(org);
 return org;
 end $$;

create table public.platform_audit_logs (
 id uuid primary key default gen_random_uuid(), actor_email text not null,
 target_user_id uuid references auth.users on delete set null, previous_status text not null, next_status text not null,
 created_at timestamptz not null default now()
);
create table public.admin_login_attempts (
 id bigint generated always as identity primary key, ip_hash text not null, created_at timestamptz not null default now()
);
create index on public.admin_login_attempts(created_at);
create index on public.admin_login_attempts(ip_hash,created_at);
alter table public.platform_audit_logs enable row level security;
alter table public.admin_login_attempts enable row level security;
revoke all on public.platform_audit_logs,public.admin_login_attempts from anon,authenticated;
grant all on public.platform_audit_logs,public.admin_login_attempts to service_role;
grant usage,select on sequence public.admin_login_attempts_id_seq to service_role;

create function public.reserve_admin_login(attempt_ip_hash text) returns boolean language plpgsql security definer set search_path='' as $$
 begin
 if char_length(attempt_ip_hash)<>64 then return false;end if;
 perform pg_advisory_xact_lock(812374019);
 delete from public.admin_login_attempts where created_at<now()-interval '1 day';
 if (select count(*) from public.admin_login_attempts where created_at>now()-interval '15 minutes')>=100
 or (select count(*) from public.admin_login_attempts where ip_hash=attempt_ip_hash and created_at>now()-interval '15 minutes')>=10 then return false;end if;
 insert into public.admin_login_attempts(ip_hash) values(attempt_ip_hash);
 return true;
 end $$;
revoke all on function public.reserve_admin_login(text) from public,anon,authenticated;
grant execute on function public.reserve_admin_login(text) to service_role;

create function public.set_account_approval(target uuid,new_status text,admin_email text) returns void language plpgsql security definer set search_path='' as $$
 declare previous text;begin
 if new_status not in ('approved','rejected','pending') or coalesce(admin_email,'')='' then raise exception 'Invalid approval';end if;
 select approval_status into previous from public.profiles where id=target for update;
 if not found then raise exception 'Account unavailable';end if;
 if previous=new_status then return;end if;
 update public.profiles set approval_status=new_status,reviewed_at=now() where id=target;
 insert into public.platform_audit_logs(actor_email,target_user_id,previous_status,next_status) values(admin_email,target,previous,new_status);
 end $$;
revoke all on function public.set_account_approval(uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_account_approval(uuid,text,text) to service_role;

create function public.admin_list_accounts(status_filter text default null,search_text text default '',page_number integer default 1)
 returns table(user_id uuid,email text,approval_status text,email_confirmed_at timestamptz,created_at timestamptz,reviewed_at timestamptz,total_count bigint)
 language sql stable security definer set search_path='' as $$
 select p.id,u.email::text,p.approval_status,u.email_confirmed_at,u.created_at,p.reviewed_at,count(*) over()
 from public.profiles p join auth.users u on u.id=p.id
 where (status_filter is null or p.approval_status=status_filter)
 and (coalesce(search_text,'')='' or strpos(lower(coalesce(u.email,'')),lower(left(search_text,200)))>0)
 order by p.created_at desc,p.id limit 50 offset (least(greatest(page_number,1),100000)-1)*50;
$$;
revoke all on function public.admin_list_accounts(text,text,integer) from public,anon,authenticated;
grant execute on function public.admin_list_accounts(text,text,integer) to service_role;
notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
commit;
