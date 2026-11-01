begin;
create schema test;
grant usage on schema test to authenticated,anon;
create function test.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end $$;
create function test.denied(statement text,label text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege or check_violation or foreign_key_violation then raise notice 'PASS: %',label;return;end;
 raise exception 'FAIL (not denied): %',label;end $$;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','owner-a@test.invalid'),('10000000-0000-4000-8000-000000000002','owner-b@test.invalid'),('10000000-0000-4000-8000-000000000003','agent@test.invalid'),('10000000-0000-4000-8000-000000000004','viewer@test.invalid'),('10000000-0000-4000-8000-000000000005','admin@test.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.create_organization('Boutique A') as org_a \gset
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.create_organization('Boutique B') as org_b \gset
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select test.assert((select count(*)=1 from public.organizations),'owner sees only own shop');
select test.assert((select count(*)=1 from public.memberships),'membership RLS does not recurse');
select test.denied(format('insert into public.memberships(organization_id,user_id,role) values(%L,%L,''owner'')',:'org_b','10000000-0000-4000-8000-000000000001'),'owner cannot self-promote in another shop');
select public.save_product(:'org_a',null,'{"name":"Bague","status":"active","tags":[]}', '[{"sku":"SKU-A","name":"Or","price_minor":12500,"stock":2}]') as product_a \gset
select id as variant_a from public.product_variants where product_id=:'product_a' \gset
select test.assert((select count(*)=1 from public.products),'owner creates real product');
select test.assert((select price_minor=12500 and stock=2 from public.product_variants where id=:'variant_a'),'price and stock persisted');
select test.denied(format('insert into public.products(organization_id,name) values(%L,''Intrusion'')',:'org_b'),'cross-tenant product insert denied');
select test.denied(format('insert into public.product_variants(organization_id,product_id,sku,name,price_minor,stock) values(%L,%L,''BAD'',''Bad'',1,1)',:'org_a',gen_random_uuid()),'orphan variant denied');
select test.denied(format('insert into public.product_variants(organization_id,product_id,sku,name,price_minor,stock) values(%L,%L,''NEG'',''Negative'',1,-1)',:'org_a',:'product_a'),'negative stock denied in DB');
select test.denied('select * from public.channel_credentials','credential read denied');
select test.denied('select * from public.webhook_events','webhook payload read denied');
select test.denied(format('update public.subscriptions set ai_daily_limit=999 where organization_id=%L',:'org_a'),'quota update not permitted');
insert into storage.objects(bucket_id,name) values('catalog',:'org_a'||'/'||:'product_a'||'/photo.webp');
select test.assert((select count(*)=1 from storage.objects),'owner can read own private image');
select test.denied(format('insert into storage.objects(bucket_id,name) values(''catalog'',%L)',:'org_b'||'/photo.webp'),'cross-shop upload denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select test.assert((select count(*)=0 from public.products),'shop B cannot read shop A products');
select test.assert((select count(*)=0 from storage.objects),'shop B cannot read shop A images');
with modified as(update public.products set name='Hacked' where id=:'product_a' returning *) select test.assert((select count(*)=0 from modified),'cross-shop update has no effect');
with removed as(delete from public.products where id=:'product_a' returning *) select test.assert((select count(*)=0 from removed),'cross-shop delete has no effect');
select public.save_product(:'org_b',null,'{"name":"Collier","status":"active","tags":[]}', '[{"sku":"SKU-A","name":"Argent","price_minor":19000,"stock":0}]') as product_b \gset
select test.assert((select count(*)=1 from public.products),'same SKU allowed in separate shop');
select test.denied(format('insert into public.product_variants(organization_id,product_id,sku,name,price_minor,stock) values(%L,%L,''CROSS'',''Cross'',1,1)',:'org_b',:'product_a'),'composite FK forbids cross-shop product reference');
reset role;
insert into public.memberships(organization_id,user_id,role) values(:'org_a','10000000-0000-4000-8000-000000000003','agent'),(:'org_a','10000000-0000-4000-8000-000000000004','viewer'),(:'org_a','10000000-0000-4000-8000-000000000005','admin');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select test.assert((select count(*)=1 from public.products),'agent reads shop catalog');
select test.denied(format('insert into public.products(organization_id,name) values(%L,''Agent product'')',:'org_a'),'agent cannot edit catalog');
select public.reserve_ai_usage(:'org_a');
select test.assert((select count(*)=0 from public.usage_events),'agent cannot read owner usage log');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select test.assert((select count(*)=1 from public.products),'viewer reads shop catalog');
select test.denied(format('insert into public.products(organization_id,name) values(%L,''Viewer product'')',:'org_a'),'viewer cannot edit catalog');
select test.denied(format('insert into storage.objects(bucket_id,name) values(''catalog'',%L)',:'org_a'||'/viewer.webp'),'viewer cannot upload images');
-- reserve_ai_usage uses an explicit exception for unauthorized roles.
do $$ begin begin perform public.reserve_ai_usage((select organization_id from public.memberships limit 1)); exception when raise_exception then if sqlerrm='Forbidden' then raise notice 'PASS: viewer cannot reserve AI usage';return;else raise;end if;end;raise exception 'FAIL: viewer reserved AI';end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select public.save_product(:'org_a',null,'{"name":"Bracelet","status":"active","tags":[]}', '[{"sku":"ADMIN","name":"Standard","price_minor":10000,"stock":5}]');
select test.assert((select count(*)=2 from public.products),'admin manages catalog');
reset role;
insert into public.conversations(organization_id,is_simulation,source) values(:'org_a',false,'instagram') returning id as real_conversation \gset
insert into public.conversations(organization_id,is_simulation,source) values(:'org_a',true,'simulation');
insert into public.orders(organization_id,conversation_id,status,source,total_minor,paid_at) values(:'org_a',:'real_conversation','confirmed','instagram',12500,null),(:'org_a',:'real_conversation','delivered','instagram',20000,now()),(:'org_a',null,'cancelled','manual',500000,null),(:'org_a',null,'draft','manual',100000,null);
insert into public.orders(organization_id,status,source,is_simulation,total_minor) values(:'org_a','confirmed','simulation',true,999999);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select test.assert((public.dashboard_metrics(:'org_a')->>'confirmed_total')::int=32500,'dashboard excludes simulation, draft and cancelled amounts');
select test.assert((public.dashboard_metrics(:'org_a')->>'paid_total')::int=20000,'dashboard separates confirmed from paid');
select test.assert((public.dashboard_metrics(:'org_a')->>'conversations')::int=1,'dashboard excludes simulated conversations');
select test.assert((public.dashboard_metrics(:'org_a')->>'converted_conversations')::int=1,'conversion deduplicates conversations');
select test.assert(public.dashboard_metrics(:'org_b') is null,'dashboard cannot leak other shop');
select test.assert((select count(*)>0 from public.audit_logs),'sensitive changes are audited');
reset role;
update public.subscriptions set ai_daily_limit=1 where organization_id=:'org_a';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin begin perform public.reserve_ai_usage((select organization_id from public.memberships where user_id=auth.uid())); exception when raise_exception then if sqlerrm='Daily quota reached' then raise notice 'PASS: daily quota enforced';return;else raise;end if;end;raise exception 'FAIL: quota exceeded';end $$;
reset role;
update public.subscriptions set trial_ends_at=now()-interval '1 second' where organization_id=:'org_a';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin begin perform public.reserve_ai_usage((select organization_id from public.memberships where user_id=auth.uid())); exception when raise_exception then if sqlerrm='Trial expired' then raise notice 'PASS: expired trial blocked';return;else raise;end if;end;raise exception 'FAIL: expired trial allowed';end $$;
reset role;
delete from public.organizations where id=:'org_a';
select test.assert((select count(*)=1 from public.organizations where id=:'org_b'),'organization cleanup preserves other tenants');
set local role anon;
select test.denied('select * from public.products','anonymous cannot read products');
select test.denied('select * from public.organizations','anonymous cannot read shops');
select test.denied(format('select public.create_organization(%L)','Anonymous'),'anonymous cannot create shop');
rollback;
