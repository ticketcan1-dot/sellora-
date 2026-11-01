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
