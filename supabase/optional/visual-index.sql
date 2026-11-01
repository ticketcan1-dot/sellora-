-- Optional scaffold: apply only on Supabase when a visual embedding provider is
-- selected and evaluated. This file is intentionally outside auto migrations.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
alter table public.product_images add constraint product_images_org_id_unique unique(organization_id,id);
create table public.catalog_embeddings (
 organization_id uuid not null references public.organizations on delete cascade,
 product_image_id uuid primary key,
 foreign key(organization_id,product_image_id) references public.product_images(organization_id,id) on delete cascade,
 model text not null,
 dimensions integer not null check(dimensions>0),
 embedding extensions.vector not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(extensions.vector_dims(embedding)=dimensions)
);
-- No client policies. A future guarded server adapter must filter by tenant and
-- model/dimensions; never compare vectors across models or tenants.
alter table public.catalog_embeddings enable row level security;
revoke all on public.catalog_embeddings from anon,authenticated;
create index on public.catalog_embeddings(organization_id,model,dimensions);
create trigger touch_updated_at before update on public.catalog_embeddings for each row execute function private.touch_updated_at();
-- Choose a fixed-dimension HNSW index and a calibrated confidence threshold only
-- after the evaluation dataset and embedding provider are validated.
