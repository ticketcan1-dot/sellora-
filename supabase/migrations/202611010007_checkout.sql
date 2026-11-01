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
