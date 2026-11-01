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
