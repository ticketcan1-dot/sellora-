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
