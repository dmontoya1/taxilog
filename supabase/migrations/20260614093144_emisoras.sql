-- Emisoras (radioteléfono) por usuario. Informativas: el ingreso por emisora
-- sigue yendo al jefe igual que el datáfono; no cambia el cuadre.
create table if not exists public.emisoras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.emisoras enable row level security;

create policy "emisoras_select_own" on public.emisoras
  for select using (auth.uid() = user_id);
create policy "emisoras_insert_own" on public.emisoras
  for insert with check (auth.uid() = user_id);
create policy "emisoras_update_own" on public.emisoras
  for update using (auth.uid() = user_id);
create policy "emisoras_delete_own" on public.emisoras
  for delete using (auth.uid() = user_id);

-- Qué emisora originó la carrera (nullable: filas viejas sin identificar).
alter table public.income_entries
  add column if not exists emisora_id uuid references public.emisoras (id) on delete set null;