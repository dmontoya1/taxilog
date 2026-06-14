-- Solo gasolina tiene descanso obligatorio; eléctrico/eurotaxi descansan libre.
alter table public.agreement_configs
  add column if not exists vehicle_type text not null default 'gasoline';

alter table public.agreement_configs
  add constraint agreement_configs_vehicle_type_check
  check (vehicle_type in ('gasoline', 'electric', 'eurotaxi'));