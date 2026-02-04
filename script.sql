/* ============================================================
   SUPABASE (PostgreSQL) — ESQUEMA + RLS + STORAGE POLICIES
   Proyecto: Análisis de sedimento urinario (médico -> pacientes anon -> casos -> visitas -> imágenes -> resultados)

   ✅ Copia y pega TODO en: Supabase > SQL Editor > New query
   ✅ Ejecuta con permisos de propietario (normal en Supabase SQL Editor)
   ============================================================ */


/* ----------------------------
   0) EXTENSIONES (UUID)
---------------------------- */
create extension if not exists "pgcrypto";


/* ----------------------------
   1) PERFIL DEL MÉDICO (TENANCY)
   Cada usuario autenticado (auth.users) tendrá un perfil.
---------------------------- */
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'doctor',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());


/* ---------------------------------------------------------
   2) TABLAS PRINCIPALES (ANONIMIZACIÓN + RELACIONES)
   Regla de oro: TODO lleva doctor_id para aislar datos por médico.
--------------------------------------------------------- */

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,               -- paciente anonimizado: P-0001, etc.
  created_at timestamptz not null default now(),
  unique (doctor_id, code)
);

create index if not exists patients_doctor_id_idx on public.patients(doctor_id);


create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists cases_doctor_id_idx on public.cases(doctor_id);
create index if not exists cases_patient_id_idx on public.cases(patient_id);


create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  visit_date date not null default current_date,
  symptoms text,
  created_at timestamptz not null default now()
);

create index if not exists visits_doctor_id_idx on public.visits(doctor_id);
create index if not exists visits_case_id_idx on public.visits(case_id);


create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  storage_path text not null,        -- ruta en Supabase Storage (NO guardes el archivo aquí)
  original_filename text,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists images_doctor_id_idx on public.images(doctor_id);
create index if not exists images_visit_id_idx on public.images(visit_id);


create table if not exists public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  image_id uuid not null references public.images(id) on delete cascade,
  model_name text not null default 'best.pt',
  counts jsonb not null default '{}'::jsonb,       -- {"erythrocyte": 5, ...}
  detections jsonb not null default '[]'::jsonb,  -- [{bbox, conf, class_name}, ...]
  created_at timestamptz not null default now()
);

create index if not exists analysis_results_doctor_id_idx on public.analysis_results(doctor_id);
create index if not exists analysis_results_image_id_idx on public.analysis_results(image_id);


/* ----------------------------
   3) RLS (Row Level Security)
   “En tu cara”: Aislamiento total por médico (multi-tenant).
   Nadie puede ver/crear/editar/borrar filas que no son suyas.
---------------------------- */
alter table public.patients enable row level security;
alter table public.cases enable row level security;
alter table public.visits enable row level security;
alter table public.images enable row level security;
alter table public.analysis_results enable row level security;


/* ========== PATIENTS RLS ========== */
drop policy if exists "patients_select_own" on public.patients;
create policy "patients_select_own"
on public.patients
for select
to authenticated
using (doctor_id = auth.uid());

drop policy if exists "patients_insert_own" on public.patients;
create policy "patients_insert_own"
on public.patients
for insert
to authenticated
with check (doctor_id = auth.uid());

drop policy if exists "patients_update_own" on public.patients;
create policy "patients_update_own"
on public.patients
for update
to authenticated
using (doctor_id = auth.uid())
with check (doctor_id = auth.uid());

drop policy if exists "patients_delete_own" on public.patients;
create policy "patients_delete_own"
on public.patients
for delete
to authenticated
using (doctor_id = auth.uid());


/* ========== CASES RLS ========== */
drop policy if exists "cases_select_own" on public.cases;
create policy "cases_select_own"
on public.cases
for select
to authenticated
using (doctor_id = auth.uid());

drop policy if exists "cases_insert_own" on public.cases;
create policy "cases_insert_own"
on public.cases
for insert
to authenticated
with check (
  doctor_id = auth.uid()
  and exists (
    select 1 from public.patients p
    where p.id = patient_id and p.doctor_id = auth.uid()
  )
);

drop policy if exists "cases_update_own" on public.cases;
create policy "cases_update_own"
on public.cases
for update
to authenticated
using (doctor_id = auth.uid())
with check (doctor_id = auth.uid());

drop policy if exists "cases_delete_own" on public.cases;
create policy "cases_delete_own"
on public.cases
for delete
to authenticated
using (doctor_id = auth.uid());


/* ========== VISITS RLS ========== */
drop policy if exists "visits_select_own" on public.visits;
create policy "visits_select_own"
on public.visits
for select
to authenticated
using (doctor_id = auth.uid());

drop policy if exists "visits_insert_own" on public.visits;
create policy "visits_insert_own"
on public.visits
for insert
to authenticated
with check (
  doctor_id = auth.uid()
  and exists (
    select 1 from public.cases c
    where c.id = case_id and c.doctor_id = auth.uid()
  )
);

drop policy if exists "visits_update_own" on public.visits;
create policy "visits_update_own"
on public.visits
for update
to authenticated
using (doctor_id = auth.uid())
with check (doctor_id = auth.uid());

drop policy if exists "visits_delete_own" on public.visits;
create policy "visits_delete_own"
on public.visits
for delete
to authenticated
using (doctor_id = auth.uid());


/* ========== IMAGES RLS ========== */
drop policy if exists "images_select_own" on public.images;
create policy "images_select_own"
on public.images
for select
to authenticated
using (doctor_id = auth.uid());

drop policy if exists "images_insert_own" on public.images;
create policy "images_insert_own"
on public.images
for insert
to authenticated
with check (
  doctor_id = auth.uid()
  and exists (
    select 1 from public.visits v
    where v.id = visit_id and v.doctor_id = auth.uid()
  )
);

drop policy if exists "images_update_own" on public.images;
create policy "images_update_own"
on public.images
for update
to authenticated
using (doctor_id = auth.uid())
with check (doctor_id = auth.uid());

drop policy if exists "images_delete_own" on public.images;
create policy "images_delete_own"
on public.images
for delete
to authenticated
using (doctor_id = auth.uid());


/* ========== ANALYSIS_RESULTS RLS ========== */
drop policy if exists "analysis_select_own" on public.analysis_results;
create policy "analysis_select_own"
on public.analysis_results
for select
to authenticated
using (doctor_id = auth.uid());

drop policy if exists "analysis_insert_own" on public.analysis_results;
create policy "analysis_insert_own"
on public.analysis_results
for insert
to authenticated
with check (
  doctor_id = auth.uid()
  and exists (
    select 1 from public.images i
    where i.id = image_id and i.doctor_id = auth.uid()
  )
);

drop policy if exists "analysis_update_own" on public.analysis_results;
create policy "analysis_update_own"
on public.analysis_results
for update
to authenticated
using (doctor_id = auth.uid())
with check (doctor_id = auth.uid());

drop policy if exists "analysis_delete_own" on public.analysis_results;
create policy "analysis_delete_own"
on public.analysis_results
for delete
to authenticated
using (doctor_id = auth.uid());


/* ---------------------------------------------------------
   4) STORAGE (Supabase Storage) — BUCKET + POLICIES
   Recomendación de ruta:  <user_id>/<visit_id>/<filename>
   Ejemplo:  2f...c9/8a...1b/img_001.jpg

   ✅ Esto hace que SOLO el médico dueño (owner) vea/suba/baje archivos.
--------------------------------------------------------- */

-- 4.1 Crear bucket (si no lo creaste en el panel)
-- Nota: en algunos proyectos, esto requiere rol con permisos (SQL Editor lo tiene).
insert into storage.buckets (id, name, public)
values ('urine-images', 'urine-images', false)
on conflict (id) do nothing;

-- 4.2 POLICIES sobre storage.objects
-- Importante: storage.objects tiene columnas: bucket_id, name (path), owner, etc.

-- SELECT: solo puede leer archivos del bucket si es el owner
drop policy if exists "storage_select_own_urine_images" on storage.objects;
create policy "storage_select_own_urine_images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'urine-images'
  and owner = auth.uid()
);

-- INSERT: solo puede subir si el owner es él mismo
drop policy if exists "storage_insert_own_urine_images" on storage.objects;
create policy "storage_insert_own_urine_images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'urine-images'
  and owner = auth.uid()
);

-- UPDATE: solo puede modificar si es el owner
drop policy if exists "storage_update_own_urine_images" on storage.objects;
create policy "storage_update_own_urine_images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'urine-images'
  and owner = auth.uid()
)
with check (
  bucket_id = 'urine-images'
  and owner = auth.uid()
);

-- DELETE: solo puede borrar si es el owner
drop policy if exists "storage_delete_own_urine_images" on storage.objects;
create policy "storage_delete_own_urine_images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'urine-images'
  and owner = auth.uid()
);


/* ---------------------------------------------------------
   5) “PROTIP” EXAMEN: Trigger opcional para autocrear profile
   Esto crea un perfil cuando se registra un usuario en auth.
   (Si no quieres triggers, puedes crearlo desde frontend.)
--------------------------------------------------------- */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


/* ============================================================
   FIN
   Qué le dices al profe:
   - “Usé RLS para aislamiento multi-tenant: cada fila tiene doctor_id
      y las policies validan auth.uid() en SELECT/INSERT/UPDATE/DELETE”
   - “Las imágenes van a Storage por rendimiento; BD solo guarda rutas y metadatos”
   - “Storage también tiene RLS por owner: nadie lee archivos ajenos”
   ============================================================ */
