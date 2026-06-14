# TaxiLog — Contexto del proyecto para Claude Code

App web PWA para control de ingresos, gastos y cuadre con el jefe para taxistas
en Madrid (España). Construida con Next.js 16 + Supabase + Vercel.

## Stack
- **Frontend:** Next.js 16 (App Router, webpack en build, Turbopack en dev)
- **Base de datos + Auth:** Supabase (Postgres 15 + RLS por fila)
- **Hosting:** Vercel (plan Hobby — NO uso comercial hasta Fase 4)
- **Estilos:** Tailwind CSS v4 + variables CSS custom en `globals.css`
- **Fuentes:** Bricolage Grotesque (display), Figtree (body), IBM Plex Mono (cifras)
- **PDF:** jsPDF + jspdf-autotable (carga diferida solo al exportar)
- **PWA:** Serwist (`@serwist/next`), SW desactivado en dev

## Estructura de carpetas relevante
```
src/
├── app/
│   ├── (auth)/login y register     — páginas públicas
│   ├── (app)/                      — rutas protegidas (guard en layout.tsx)
│   │   ├── registro/               — pantalla principal: carreras del día
│   │   │   └── close-day-sheet.tsx — panel de cierre del día (taxímetro)
│   │   ├── gastos/                 — gastos con % del jefe por categoría
│   │   ├── informes/               — cuadre, desglose, PDF del jefe y detallado
│   │   └── configuracion/          — acuerdo, descansos, prefs informe, odómetro
│   ├── manifest.ts                 — PWA manifest
│   └── sw.ts                       — Service Worker (Serwist)
├── lib/
│   ├── supabase/client.ts server.ts middleware.ts
│   ├── domain/
│   │   ├── rest-days.ts            — lógica pura de días de descanso (con tests)
│   │   └── settlement.ts           — tipos, RPCs, helpers del cuadre
│   └── report/pdf.ts               — constructores de PDF (jefe + detallado)
```

## Reglas de negocio críticas

### Días de descanso
- **Solo aplica a vehículos de gasolina** (`agreement_configs.vehicle_type = 'gasoline'`).
  Eléctrico y eurotaxi NO tienen descanso obligatorio: el conductor elige libremente qué
  días descansa. `isRestDay()` devuelve `false` para esos tipos.
- `weekday_rest` (1-5, ISO): descanso fijo de lunes a viernes. Configurable por conductor.
- Fin de semana: cada día se evalúa POR SEPARADO contra la paridad del DÍA DEL MES.
  - `weekend_work_parity = 'even'`: trabaja los días pares, descansa los impares.
  - Sin desempate: sábado 31 + domingo 1 (ambos impares) → quien trabaja par descansa AMBOS.
- Los descansos no generan cuota para el jefe. La regla solo es una SUGERENCIA en el frontend
  (`isRestDay()`); el descanso real es el flag manual `daily_records.is_rest_day`.
- `is_fee_exempt = true`: día que era de descanso pero se trabajó → sin cuota, con ingresos.

### Jornada de 6:00 a 6:00 (Taxi Madrid)
- La jornada empieza/termina a las 06:00. Las carreras de 00:00 a 06:00 pertenecen al día ANTERIOR.
- `currentWorkday()` en `rest-days.ts` devuelve la jornada vigente; es el valor por defecto de la
  fecha en Registro y Gastos. El usuario puede corregirla a mano. No cambia el cuadre (agrupa por
  `entry_date`/`expense_date`).

### Tipos de ingreso
- `cash` (efectivo): queda para el conductor.
- `card` (datáfono): va al jefe si `card_goes_to_boss = true`.
- `emisora`: carrera por emisora, le llega al jefe igual que datáfono. Se guarda CUÁL emisora
  (`income_entries.emisora_id` → tabla `emisoras`, gestionable por usuario). Es informativo.
- En el cuadre, `card` y `emisora` se agrupan como "recibido por el jefe".

### Fórmula del cuadre
```
balance = boss_due - card_to_boss - boss_expense_share
```
- `balance > 0`: el conductor le paga al jefe.
- `balance < 0`: el jefe devuelve al conductor.
- `card_to_boss = 0` cuando `card_goes_to_boss = false` (el datáfono lo cobra el conductor).
- La lógica vive en Postgres: `settlement_days(date, date)` y `settlement_summary(date, date)`.
- NUNCA recalcular el balance en el frontend; siempre usar las RPCs.

### Acuerdo versionado
- Cada cambio de condiciones crea una fila nueva con `valid_from`.
- La fila anterior se cierra con `valid_to = valid_from - 1 día`.
- Cada día se liquida con la config vigente en ESA FECHA. La historia es inmutable.

### Datos del taxímetro
- Son telemetría, NO dinero. No afectan el cuadre bajo ningún concepto.
- `odometer_totals`: acumulado histórico (1 fila por usuario).
- `daily_records.p_*`: lecturas del recibo del taxímetro al cerrar el día.
- El cierre se hace vía RPC `close_day(p_date, a_*)` — los parámetros llevan prefijo `a_`
  para no colisionar con los nombres de columna. NUNCA cambiar ese prefijo.

## Migraciones (Supabase CLI)
Las migraciones se versionan con Supabase CLI: `supabase migration new <nombre>` crea el archivo
en `supabase/migrations/` y `supabase db push` lo aplica al proyecto remoto. NUNCA pegar SQL a
mano en el dashboard. El baseline del esquema histórico se captura con `supabase db pull`.

Historial original (aplicado a mano antes del versionado, documentado para referencia):
1. `0001_initial_schema` — tablas base, RLS, trigger de profiles, settlement_summary v1
2. `0002_income_entries` — tabla income_entries, quita cash_income/card_income de daily_records
3. `0003_settlement_days` — función settlement_days, settlement_summary agrega desde ella
4. `0004_report_config` — card_goes_to_boss en agreement_configs, tabla report_preferences
5. `0005_emisora_odometer` (+ `0005_fix_close_day`) — método emisora, odometer_totals, p_* en
   daily_records, RPC close_day (parámetros con prefijo `a_`)

Pendientes de aplicar vía CLI (SQL en `supabase/PENDING_MIGRATIONS.md`):
- `emisoras` — tabla `emisoras` (RLS por usuario) + `income_entries.emisora_id`.
- `vehicle_type` — columna `agreement_configs.vehicle_type` (`gasoline|electric|eurotaxi`, default `gasoline`).

## Ramas y despliegue
- `master`: rama de producción (Vercel despliega desde aquí).
- `dev`: rama de trabajo. Se prueba en local (`pnpm dev`) y se mergea a `master` solo tras validar.

## Convenciones de código
- TypeScript estricto. Sin `any` explícitos.
- Errores de Supabase SIEMPRE capturados y mostrados al usuario (nunca `await` sin captura).
- La lógica de dinero vive en Postgres. El frontend solo llama RPCs y muestra resultados.
- Parámetros de funciones PL/pgSQL: `a_` para argumentos, `v_` para variables locales.
- Fechas siempre como `YYYY-MM-DD` strings. NUNCA `new Date('YYYY-MM-DD')` — usa `parseLocalDate()` de `rest-days.ts` para evitar problemas de UTC. La fecha por defecto del día es `currentWorkday()` (corte a las 6:00).
- `summarizeDays()` en cliente agrega los mismos datos que Postgres → tabla, resumen y PDF siempre coinciden.

## Diseño visual
- Tema: oscuro siempre (uso nocturno en el taxi). Fondo `#0c0d10`.
- Acento: rojo Madrid `#e2231a` (variable `--amber` por razones históricas — NO renombrar, rompería Tailwind).
- Firma visual: franja diagonal roja en la cabecera (`.checker`).
- Fuente de cifras: IBM Plex Mono con clase `.taximeter`.
- Clase `.btn-amber`: botón principal, rojo con texto blanco.
- Mobile-first real: botones grandes, inputs con `inputMode="decimal"`.

## Estado actual del producto
- **Fase 1-3 completas:** Auth, registro diario (3 métodos), gastos, cuadre, 2 PDFs, PWA, identidad Madrid, Vercel Analytics.
- **Emisoras, jornada 6:00, tipo de vehículo y edición de transacciones:** implementados (rama `dev`).
  Migraciones `emisoras` y `vehicle_type` pendientes de aplicar (ver `supabase/PENDING_MIGRATIONS.md`).
- **Pendiente (Fase 4):** Stripe, trials reales, bloqueo al expirar trial, panel de admin.
- **Deuda técnica:** versionado de migraciones iniciado con Supabase CLI (falta el baseline `db pull`).
- El plan Hobby de Vercel prohíbe uso comercial → pasar a Pro antes de cobrar.

## Variables de entorno necesarias
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Comandos frecuentes
```bash
pnpm dev          # desarrollo (Turbopack, SW desactivado)
pnpm build        # producción (webpack, activa SW)
pnpm test         # 10 tests de reglas de descanso (Vitest)
```
