begin;
create schema test;grant usage on schema test to authenticated,service_role;
create function test.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end $$;
create function test.fails(statement text,expected text,label text) returns void language plpgsql as $$ begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then raise notice 'PASS: %',label;return;end if;raise;end;raise exception 'FAIL: %',label;end $$;
insert into auth.users(id,email,email_confirmed_at) values('30000000-0000-4000-8000-000000000001','commerce-a@test.invalid',now()),('30000000-0000-4000-8000-000000000002','commerce-b@test.invalid',now()),('30000000-0000-4000-8000-000000000003','commerce-viewer@test.invalid',now());
update public.profiles set approval_status='approved';
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select public.create_organization('Commerce A') as org \gset
select public.save_product(:'org',null,'{"name":"Bague réelle","status":"active","tags":[]}','[{"sku":"A","name":"Or","price_minor":12500,"stock":3}]') as product \gset
select id as variant from public.product_variants where product_id=:'product' \gset
select test.fails(format('select public.save_customer(%L,null,%L)',:'org','{"name":"Sans consentement","consent":false}'),'Consent required','customer requires consent');
select public.save_customer(:'org',null,'{"name":"Client Test","phone":"0600000000","city":"Casablanca","address":"Adresse de test uniquement","consent":true,"whatsapp_opt_in":false}') as customer \gset
select public.create_order(:'org',:'customer',null,jsonb_build_array(jsonb_build_object('variant_id',:'variant','quantity',2,'unit_price_minor',1)),1500,'Test') as first_order \gset
select public.create_order(:'org',:'customer',null,jsonb_build_array(jsonb_build_object('variant_id',:'variant','quantity',2)),1500,'Test') as second_order \gset
select test.assert((select total_minor=26500 from public.orders where id=:'first_order'),'server ignores forged prices and computes totals');
select test.assert((select stock=3 from public.product_variants where id=:'variant'),'draft does not reserve stock');
select test.fails(format('select public.transition_order(%L,%L,''confirmed'',''Accord'')',:'org',:'first_order'),'Invalid order transition','cannot skip awaiting confirmation');
select public.transition_order(:'org',:'first_order','awaiting_confirmation');
select test.fails(format('select public.transition_order(%L,%L,''confirmed'','''')',:'org',:'first_order'),'Explicit customer','confirmation evidence required');
select public.transition_order(:'org',:'first_order','confirmed','Accord explicite de test');
select test.assert((select stock=1 from public.product_variants where id=:'variant'),'confirmation reserves exact quantity');
select public.transition_order(:'org',:'first_order','confirmed','Double clic');
select test.assert((select stock=1 from public.product_variants where id=:'variant'),'repeated confirmation is idempotent');
select public.transition_order(:'org',:'second_order','awaiting_confirmation');
select test.fails(format('select public.transition_order(%L,%L,''confirmed'',''Accord'')',:'org',:'second_order'),'Insufficient stock','competing draft cannot oversell');
select test.assert((select status='awaiting_confirmation' from public.orders where id=:'second_order'),'failed reservation rolls back status');
select public.transition_order(:'org',:'first_order','cancelled');
select public.transition_order(:'org',:'first_order','cancelled');
select test.assert((select stock=3 from public.product_variants where id=:'variant'),'cancellation restores stock exactly once');
select public.transition_order(:'org',:'second_order','confirmed','Accord explicite reçu');
select public.record_payment(:'org',:'second_order',10000,'cod','recu-test-1');
select test.assert((select paid_at is null from public.orders where id=:'second_order'),'partial receipt does not mark order settled');
select test.fails(format('select public.transition_order(%L,%L,''cancelled'')',:'org',:'second_order'),'Recorded payment','cannot cancel an order with unreviewed settlement');
select test.fails(format('select public.record_payment(%L,%L,10000,''cod'',''recu-test-1'')',:'org',:'second_order'),'duplicate key','receipt reference prevents duplicates');
select test.fails(format('select public.record_payment(%L,%L,999999,''cod'',''too-much'')',:'org',:'second_order'),'Invalid payment','overpayment rejected');
select public.record_payment(:'org',:'second_order',16500,'bank','recu-test-2');
select test.assert((select paid_at is not null from public.orders where id=:'second_order'),'complete documented receipts settle the order');
select test.assert((public.dashboard_metrics(:'org')->>'paid_total')::integer=26500,'dashboard counts only recorded settled amounts');
select public.transition_order(:'org',:'second_order','processing');select public.transition_order(:'org',:'second_order','shipped');select public.transition_order(:'org',:'second_order','delivered');
reset role;
insert into public.conversations(organization_id,is_simulation,source) values(:'org',true,'simulation') returning id as simulation \gset
set local role authenticated;
select public.create_order(:'org',:'customer',:'simulation',jsonb_build_array(jsonb_build_object('variant_id',:'variant','quantity',1)),0,'Simulation') as sim_order \gset
select public.transition_order(:'org',:'sim_order','awaiting_confirmation');select public.transition_order(:'org',:'sim_order','confirmed','Accord simulation');
select test.assert((select stock=1 from public.product_variants where id=:'variant'),'simulation never reserves real stock');
select test.assert((public.dashboard_metrics(:'org')->>'confirmed_orders')::integer=1,'dashboard excludes simulated confirmed orders');
select test.fails(format('select public.record_payment(%L,%L,12500,''cod'',''simulation'')',:'org',:'sim_order'),'Order not payable','simulation cannot record a real receipt');
select test.assert((select count(*)=30 from public.dashboard_series(:'org')),'activity chart always has 30 real days');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select public.create_organization('Commerce B') as other_org \gset
select test.fails(format('select public.transition_order(%L,%L,''processing'')',:'other_org',:'second_order'),'Order unavailable','cross-tenant order transition denied');
select test.assert((select count(*)=0 from public.customers where organization_id=:'org'),'cross-tenant client privacy enforced');
reset role;
insert into public.memberships(organization_id,user_id,role) values(:'org','30000000-0000-4000-8000-000000000003','viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',true);
select test.fails(format('select public.save_customer(%L,null,%L)',:'org','{"name":"Forbidden","consent":true}'),'Forbidden','viewer cannot mutate customer data');
select test.fails(format('select public.record_payment(%L,%L,1,''cod'',''viewer'')',:'org',:'second_order'),'Forbidden','viewer cannot record settlement');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select public.transition_order(:'org',:'sim_order','cancelled');
select public.anonymize_customer(:'org',:'customer');
select test.assert((select phone is null and name='Client anonymisé' from public.customers where id=:'customer'),'customer privacy action removes coordinates');
select public.delete_shop(:'org','Commerce A');
select test.assert((select count(*)=0 from public.orders where organization_id=:'org'),'shop deletion removes financial and conversation rows coherently');
rollback;
