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
