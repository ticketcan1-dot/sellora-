begin;
create schema test;grant usage on schema test to authenticated,service_role;
create function test.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end $$;
create function test.fails(statement text,expected text,label text) returns void language plpgsql as $$ begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then raise notice 'PASS: %',label;return;end if;raise;end;raise exception 'FAIL: %',label;end $$;
insert into auth.users(id,email,email_confirmed_at) values('50000000-0000-4000-8000-000000000001','inbox-owner@test.invalid',now());update public.profiles set approval_status='approved';
set local role authenticated;select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
select public.create_organization('Inbox Test') as org \gset
select public.save_product(:'org',null,'{"name":"Produit test","status":"active","tags":[]}','[{"sku":"CHECKOUT","name":"Standard","price_minor":10000,"stock":4}]') as product \gset
select id as variant from public.product_variants where product_id=:'product' \gset
select test.fails(format('select public.connect_channel(%L,''whatsapp'',''123'',null,''Fake'',''fake-token'',null)',:'org'),'permission denied','browser cannot fabricate a connected channel');
reset role;set local role service_role;
-- Isolated database fixtures only: this transaction rolls back; no provider is called.
select public.connect_channel(:'org','whatsapp','123','456','Test-only channel','encrypted-test-fixture-only',now()+interval '1 day') as channel \gset
insert into public.webhook_events(organization_id,channel_id,provider,external_id,payload) values(:'org',:'channel','whatsapp','inbound-1',jsonb_build_object('kind','message','message_id','m1','sender','212600000000','timestamp',now(),'text','Bonjour')) returning id as event \gset
select public.ingest_meta_event(:'event') as incoming \gset
select public.ingest_meta_event(:'event');
select test.assert((select count(*)=1 from public.messages where organization_id=:'org' and external_id='m1'),'webhook retries cannot duplicate incoming messages');
select conversation_id as conversation from public.messages where id=:'incoming' \gset
set local role authenticated;
select public.queue_reply(:'org',:'conversation','Réponse humaine','50000000-0000-4000-8000-000000000010') as queued \gset
select public.queue_reply(:'org',:'conversation','Double clic','50000000-0000-4000-8000-000000000010');
select test.assert((select count(*)=1 from public.message_outbox where organization_id=:'org'),'outbound request ID prevents double sending');
select test.assert((select delivery_status='queued' from public.messages where id=(:'queued'::jsonb->>'message_id')::uuid),'queued message is not displayed as sent');
select test.fails(format('select public.ingest_meta_event(%L)',:'event'),'permission denied','browser cannot inject a forged incoming webhook');
reset role;set local role service_role;
select count(*) from public.claim_outbox();
update public.message_outbox set lease_until=now()-interval '1 second' where organization_id=:'org';
select count(*) from public.claim_outbox();
select test.assert((select status='unknown' from public.message_outbox where organization_id=:'org'),'expired send lease becomes uncertain, never auto-retried');
insert into public.webhook_events(organization_id,channel_id,provider,external_id,payload) values(:'org',:'channel','whatsapp','receipt-read',jsonb_build_object('kind','status','message_id','provider-m1','timestamp',now(),'delivery_status','read')) returning id as receipt \gset
select public.ingest_meta_event(:'receipt');
update public.messages set external_id='provider-m1',delivery_status='sent' where id=(:'queued'::jsonb->>'message_id')::uuid;
select test.assert((select delivery_status='read' from public.messages where external_id='provider-m1'),'early receipt reconciles once provider ID becomes known');
select test.assert((select status='sent' from public.message_outbox where organization_id=:'org'),'verified read receipt resolves an uncertain outbox state');
insert into public.webhook_events(organization_id,channel_id,provider,external_id,payload) values(:'org',:'channel','whatsapp','receipt-late-sent',jsonb_build_object('kind','status','message_id','provider-m1','timestamp',now(),'delivery_status','sent')) returning id as receipt \gset
select public.ingest_meta_event(:'receipt');
select test.assert((select delivery_status='read' from public.messages where external_id='provider-m1'),'out-of-order status cannot downgrade a read receipt');
update public.conversations set last_inbound_at=now()-interval '25 hours' where id=:'conversation';
set local role authenticated;
select test.fails(format('select public.queue_reply(%L,%L,''Hors fenêtre'',gen_random_uuid())',:'org',:'conversation'),'Messaging window closed','free-text sending blocked outside official window');
reset role;set local role service_role;
update public.conversations set last_inbound_at=now() where id=:'conversation';
insert into public.oauth_states(organization_id,user_id,provider,token_hash) values(:'org','50000000-0000-4000-8000-000000000001','instagram',repeat('f',64));
select public.consume_oauth_state(repeat('f',64),'50000000-0000-4000-8000-000000000001','instagram');
select test.fails('select public.consume_oauth_state(repeat(''f'',64),''50000000-0000-4000-8000-000000000001'',''instagram'')','Invalid OAuth state','OAuth state is single-use and user-bound');
set local role authenticated;
select public.create_checkout_link(:'org',null,jsonb_build_array(jsonb_build_object('variant_id',:'variant','quantity',2)),2500,repeat('a',64));
reset role;set local role service_role;
select test.assert((public.checkout_preview(repeat('a',64))->>'total_minor')::integer=22500,'public checkout displays server-quoted prices and delivery');
select test.assert(public.checkout_preview(repeat('b',64)) is null,'unknown checkout token leaks no shop or customer');
select test.fails(format('select public.complete_checkout(repeat(''a'',64),%L)','{"name":"Client","phone":"0600000000","city":"Rabat","address":"Adresse de test","consent":false,"agreed":true}'),'Explicit consent','checkout cannot confirm without consent');
select public.complete_checkout(repeat('a',64),'{}') where false;
select public.complete_checkout(repeat('a',64),'{"name":"Client Test","phone":"0600000000","city":"Rabat","address":"Adresse de test","consent":true,"agreed":true,"whatsapp_opt_in":false}') as order_id \gset
select public.complete_checkout(repeat('a',64),'{"consent":true}') as repeat_id \gset
select test.assert(:'order_id'=:'repeat_id','customer double-click returns the same confirmed order');
select test.assert((select stock=2 from public.product_variants where id=:'variant'),'customer confirmation reserves stock once');
select test.assert((select status='confirmed' and paid_at is null from public.orders where id=:'order_id'),'customer agreement is not falsely recorded as payment');
select test.assert((select count(*)=1 from public.email_jobs where organization_id=:'org'),'order confirmation queues merchant email without requiring a provider');
select test.assert(not((public.checkout_preview(repeat('a',64)))?'phone'),'public receipt exposes no customer phone');
set local role authenticated;
select public.create_checkout_link(:'org',null,jsonb_build_array(jsonb_build_object('variant_id',:'variant','quantity',1)),0,repeat('c',64));
reset role;set local role service_role;
update public.product_variants set price_minor=11000 where id=:'variant';
select test.fails(format('select public.complete_checkout(repeat(''c'',64),%L)','{"name":"Client Test","phone":"0600000000","city":"Rabat","address":"Adresse de test","consent":true,"agreed":true}'),'Price changed','changed price cannot silently replace customer-agreed amount');
select test.assert((select stock=2 from public.product_variants where id=:'variant'),'failed checkout leaves stock unchanged');
set local role authenticated;
select public.update_shop(:'org','{"name":"Inbox Test","city":"","contact_email":"","retention_days":365,"low_stock_threshold":5,"is_active":false}');
select test.fails(format('select public.queue_reply(%L,%L,''Inactive'',gen_random_uuid())',:'org',:'conversation'),'Shop inactive','disabled shop cannot send new messages');
select public.delete_shop(:'org','Inbox Test');
select test.assert((select count(*)=0 from public.orders where organization_id=:'org'),'shop deletion cleans checkout, outbox and related rows without FK errors');
rollback;
