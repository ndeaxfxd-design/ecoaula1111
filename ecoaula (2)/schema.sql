-- EcoAula | Encuesta con botones e indicadores de actividad: 7 preguntas base.
-- Ejecutar una sola vez en Supabase > SQL Editor (proyecto nuevo).
-- Si ya tenías otra versión, esta usa la tabla nueva encuestas_v2, sin borrar datos anteriores.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.encuestas_v2 (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_id uuid not null unique references auth.users(id) on delete cascade,
  codigo_alumno text not null check (codigo_alumno ~ '^[A-Z0-9_-]{3,20}$'),
  grupo text not null check (char_length(btrim(grupo)) between 2 and 40),
  instrumento_version text not null default 'eco7_indicadores_v1',
  respuestas jsonb not null check (jsonb_typeof(respuestas) = 'object'),
  indicadores jsonb not null check (jsonb_typeof(indicadores) = 'object'),
  constraint unico_codigo_grupo_v2 unique (grupo, codigo_alumno)
);

revoke all on public.admin_users from anon, authenticated;
revoke all on public.encuestas_v2 from anon, authenticated;
grant select, insert on public.encuestas_v2 to authenticated;

alter table public.admin_users enable row level security;
alter table public.encuestas_v2 enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id=(select auth.uid()))
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,true)=false;
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Estudiante inserta su respuesta" on public.encuestas_v2;
create policy "Estudiante inserta su respuesta" on public.encuestas_v2
  for insert to authenticated
  with check (student_id=(select auth.uid())
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=true);

drop policy if exists "Docente lee encuestas" on public.encuestas_v2;
create policy "Docente lee encuestas" on public.encuestas_v2
  for select to authenticated using ((select public.is_admin()));

-- Después del primer ingreso del docente con correo, autorizarlo manualmente:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email='DOCENTE@EJEMPLO.COM'
-- on conflict do nothing;

-- NOTAS:
-- 1. La clave PUBLICABLE se coloca en config.js. Nunca la SERVICE_ROLE.
-- 2. Activa Anonymous Sign-ins y Email Auth para este proyecto.
-- 3. Los estudiantes NO pueden leer registros; solamente insertar una respuesta.
-- 4. Un código puede ser suplantado: asigna códigos y supervisa su uso.
-- 5. Protege el sitio contra bots antes de difundirlo ampliamente.
