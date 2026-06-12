# Cómo integrar estos archivos

Estos archivos son el código de la Fase 1 (MVP). Se copian ENCIMA del proyecto
que creas con create-next-app (paso 5 del README principal).

## Pasos

1. Crea el proyecto base (si no lo hiciste ya):

   ```bash
   pnpm create next-app@latest taxilog --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   cd taxilog
   pnpm add @supabase/supabase-js @supabase/ssr
   pnpm add -D vitest
   ```

2. Copia TODO el contenido de la carpeta `src/` de este zip dentro de `taxilog/src/`,
   sobreescribiendo lo que exista (`layout.tsx`, `page.tsx`, `globals.css`).

3. Borra estos archivos del scaffold base si existen (no los usamos):
   - `src/app/favicon.ico` → puedes dejarlo
   - cualquier `page.module.css`

4. Crea `.env.local` con tus claves de Supabase (paso 4 del README).

5. Añade el script de tests a `package.json`:

   ```json
   "scripts": {
     "test": "vitest run"
   }
   ```

6. Verifica:

   ```bash
   pnpm test     # 10 tests de reglas de descanso en verde
   pnpm dev      # http://localhost:3000
   ```

## Flujo de primera prueba

1. Regístrate en `/register` (con email de prueba).
2. Te lleva a Configuración: pon 100 € fijo, descanso lunes, trabaja el par.
3. Guarda → te lleva a Registro. Mete efectivo y datáfono de hoy y guarda.
4. El balance del mes arriba se actualiza con animación de taxímetro.
5. Añade un gasto de gasolina en la pestaña Gastos.

## Qué incluye

- Auth completa (login, registro, middleware de sesión, rutas protegidas)
- Registro diario con sugerencia de descanso según el acuerdo y día exento
- Gastos con % del jefe precargado por categoría
- Configuración del acuerdo con versionado (cierra el anterior, crea el nuevo)
- Lógica de descansos pura y testeada (`src/lib/domain/rest-days.ts`)
- Cuadre vía RPC `settlement_summary` (la lógica vive en Postgres)
- Tema "taxímetro nocturno": oscuro, ámbar, cifras mono con glow, móvil-first

## Qué NO incluye (Fase 2)

- Pantalla de informes con desglose día a día y selector mes/rango
- Exportación a PDF para el jefe
- PWA instalable
