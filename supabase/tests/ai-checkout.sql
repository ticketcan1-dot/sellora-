begin;
create schema test;grant usage on schema test to authenticated,service_role;
create function test.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end $$;
create function test.fails(statement text,expected text,label text) returns void language plpgsql as $$ begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then raise notice 'PASS: %',label;return;end if;raise;end;raise exception 'FAIL: %',label;end $$;
insert into auth.users(id,email,email_confirmed_at) values('70000000-0000-4000-8000-000000000001','ai-owner@test.invalid',now());update public.profiles set approval_status='approved';
set local role authenticated;select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select public.create_organization('AI Checkout Test') as org \gset
select public.save_product(:'org',null,'{"name":"Catalogue réel","status":"active","tags":[]}','[{"sku":"AI-QUOTE","name":"Standard","price_minor":10000,"stock":3}]') as product \gset
select id as variant from public.product_variants where product_id=:'product' \gset
reset role;set local role service_role;
insert into public.conversations(organization_id,is_simulation,source) values(:'org',true,'simulation') returning id as conversation \gset
select test.fails(format('select public.create_ai_checkout(%L,%L,%L,1,repeat(''a'',64))',:'org',:'conversation',:'variant'),'AI checkout disabled','AI cannot prepare a sale without merchant activation');
update public.ai_settings set checkout_enabled=true,mode='suggestion_only',checkout_delivery_minor=2500,checkout_cities=array['Rabat','Casablanca'] where organization_id=:'org';
select public.create_ai_checkout(:'org',:'conversation',:'variant',2,repeat('a',64));
select test.assert((public.checkout_preview(repeat('a',64))->>'total_minor')::integer=22500,'AI quote uses backend prices, quantity and merchant delivery fee');
select test.assert((public.checkout_preview(repeat('a',64))->'delivery_cities')='["Rabat","Casablanca"]'::jsonb,'allowed delivery cities are included in the private summary');
select test.fails(format('select public.complete_checkout(repeat(''a'',64),%L)','{"name":"Client Test","phone":"0600000000","city":"Ville non desservie","address":"Adresse de test","consent":true,"agreed":true}'),'Delivery city','AI checkout cannot invent an unsupported delivery area');
select public.complete_checkout(repeat('a',64),'{"name":"Client Test","phone":"0600000000","city":"Rabat","address":"Adresse de test","consent":true,"agreed":true}') as confirmed \gset
select test.assert((select status='confirmed' and is_simulation and paid_at is null from public.orders where id=:'confirmed'),'explicit customer confirmation creates a simulated order, never a false payment');
select test.assert((select stock=3 from public.product_variants where id=:'variant'),'simulated AI checkout never consumes live stock');
select public.create_ai_checkout(:'org',:'conversation',:'variant',1,repeat('b',64));
update public.ai_settings set checkout_delivery_minor=3000 where organization_id=:'org';
select test.fails(format('select public.complete_checkout(repeat(''b'',64),%L)','{"name":"Client Test","phone":"0600000000","city":"Rabat","address":"Adresse de test","consent":true,"agreed":true}'),'Checkout policy changed','delivery policy changes invalidate stale AI offers');
set local role authenticated;
select test.fails(format('select public.create_ai_checkout(%L,%L,%L,1,repeat(''c'',64))',:'org',:'conversation',:'variant'),'permission denied','browser cannot impersonate the AI service');
rollback;
