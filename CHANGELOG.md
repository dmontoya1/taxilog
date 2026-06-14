# Changelog

Todos los cambios relevantes de TaxiLog. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [No publicado]

### Añadido
- **Selector de emisoras.** Cada conductor gestiona su lista de emisoras en
  Configuración (catálogo de Madrid + personalizadas). Al registrar un ingreso
  por emisora se elige cuál. Es informativo: la emisora sigue yendo al jefe
  igual que el datáfono, no cambia el cuadre.
- **Tipo de vehículo (gasolina / eléctrico / eurotaxi).** Solo gasolina tiene
  descanso obligatorio (día fijo + paridad de finde). Eléctrico y eurotaxi no:
  el conductor elige libremente qué días descansa. Configurable en ajustes y
  onboarding.
- **Edición de transacciones.** Ingresos y gastos ahora se pueden editar (✏️),
  ya no solo borrar y recrear.
- **Versionado de migraciones con Supabase CLI.** `supabase init` + baseline vía
  `supabase db pull`; los cambios de esquema se crean con `supabase migration new`
  y se aplican con `supabase db push`. SQL pendiente en `supabase/PENDING_MIGRATIONS.md`.
- **CHANGELOG.md** y rama `dev` para probar en local antes de desplegar a `master`.

### Cambiado
- **Jornada de 6:00 a 6:00 (Taxi Madrid).** La fecha por defecto al registrar es
  la jornada vigente: antes de las 06:00 cuenta como el día anterior. Aplica a
  Registro y Gastos. El cuadre no cambia (sigue agrupando por `entry_date`).

### Migraciones de BD pendientes
- `emisoras` — tabla `emisoras` (RLS por usuario) + `income_entries.emisora_id`.
- `vehicle_type` — columna `agreement_configs.vehicle_type` (default `gasoline`).
