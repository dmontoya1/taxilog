drop extension if exists "pg_net";


  create table "public"."agreement_configs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "fee_type" text not null,
    "fee_value" numeric(10,2) not null,
    "weekday_rest" smallint not null default 1,
    "weekend_work_parity" text not null default 'even'::text,
    "valid_from" date not null,
    "valid_to" date,
    "created_at" timestamp with time zone not null default now(),
    "card_goes_to_boss" boolean not null default true
      );


alter table "public"."agreement_configs" enable row level security;


  create table "public"."daily_records" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "work_date" date not null,
    "is_rest_day" boolean not null default false,
    "is_fee_exempt" boolean not null default false,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "day_closed" boolean not null default false,
    "p_num_servicios" integer,
    "p_carreras" numeric(10,2),
    "p_suplementos" numeric(10,2),
    "p_dist_total" numeric(10,1),
    "p_dist_ocupado" numeric(10,1),
    "p_dist_libre" numeric(10,1),
    "p_dist_off" numeric(10,1),
    "p_tiempo_ocupado" integer,
    "p_tiempo_on" integer
      );


alter table "public"."daily_records" enable row level security;


  create table "public"."expense_categories" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "default_boss_share" numeric(5,2) not null default 0
      );


alter table "public"."expense_categories" enable row level security;


  create table "public"."expenses" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "expense_date" date not null,
    "category_id" uuid,
    "amount" numeric(10,2) not null,
    "boss_share" numeric(5,2) not null default 0,
    "notes" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."expenses" enable row level security;


  create table "public"."income_entries" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "entry_date" date not null,
    "method" text not null,
    "amount" numeric(10,2) not null,
    "notes" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."income_entries" enable row level security;


  create table "public"."odometer_totals" (
    "user_id" uuid not null,
    "total_carreras" numeric(12,2) not null default 0,
    "total_suplementos" numeric(12,2) not null default 0,
    "dist_total" numeric(12,1) not null default 0,
    "dist_ocupado" numeric(12,1) not null default 0,
    "dist_libre" numeric(12,1) not null default 0,
    "dist_off" numeric(12,1) not null default 0,
    "tiempo_ocupado" bigint not null default 0,
    "tiempo_on" bigint not null default 0,
    "num_servicios" bigint not null default 0,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."odometer_totals" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "full_name" text,
    "subscription_status" text not null default 'trial'::text,
    "trial_ends_at" timestamp with time zone not null default (now() + '30 days'::interval),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."profiles" enable row level security;


  create table "public"."report_preferences" (
    "user_id" uuid not null,
    "show_cash" boolean not null default true,
    "show_expenses" boolean not null default true,
    "show_rest_days" boolean not null default true,
    "signature_name" text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."report_preferences" enable row level security;

CREATE UNIQUE INDEX agreement_configs_pkey ON public.agreement_configs USING btree (id);

CREATE UNIQUE INDEX daily_records_pkey ON public.daily_records USING btree (id);

CREATE UNIQUE INDEX daily_records_user_id_work_date_key ON public.daily_records USING btree (user_id, work_date);

CREATE UNIQUE INDEX expense_categories_pkey ON public.expense_categories USING btree (id);

CREATE UNIQUE INDEX expense_categories_user_id_name_key ON public.expense_categories USING btree (user_id, name);

CREATE UNIQUE INDEX expenses_pkey ON public.expenses USING btree (id);

CREATE INDEX idx_agreement_lookup ON public.agreement_configs USING btree (user_id, valid_from DESC);

CREATE INDEX idx_daily_records_range ON public.daily_records USING btree (user_id, work_date);

CREATE INDEX idx_expenses_range ON public.expenses USING btree (user_id, expense_date);

CREATE INDEX idx_income_entries_range ON public.income_entries USING btree (user_id, entry_date);

CREATE UNIQUE INDEX income_entries_pkey ON public.income_entries USING btree (id);

CREATE UNIQUE INDEX odometer_totals_pkey ON public.odometer_totals USING btree (user_id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX report_preferences_pkey ON public.report_preferences USING btree (user_id);

alter table "public"."agreement_configs" add constraint "agreement_configs_pkey" PRIMARY KEY using index "agreement_configs_pkey";

alter table "public"."daily_records" add constraint "daily_records_pkey" PRIMARY KEY using index "daily_records_pkey";

alter table "public"."expense_categories" add constraint "expense_categories_pkey" PRIMARY KEY using index "expense_categories_pkey";

alter table "public"."expenses" add constraint "expenses_pkey" PRIMARY KEY using index "expenses_pkey";

alter table "public"."income_entries" add constraint "income_entries_pkey" PRIMARY KEY using index "income_entries_pkey";

alter table "public"."odometer_totals" add constraint "odometer_totals_pkey" PRIMARY KEY using index "odometer_totals_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."report_preferences" add constraint "report_preferences_pkey" PRIMARY KEY using index "report_preferences_pkey";

alter table "public"."agreement_configs" add constraint "agreement_configs_fee_type_check" CHECK ((fee_type = ANY (ARRAY['fixed'::text, 'percentage'::text]))) not valid;

alter table "public"."agreement_configs" validate constraint "agreement_configs_fee_type_check";

alter table "public"."agreement_configs" add constraint "agreement_configs_fee_value_check" CHECK ((fee_value >= (0)::numeric)) not valid;

alter table "public"."agreement_configs" validate constraint "agreement_configs_fee_value_check";

alter table "public"."agreement_configs" add constraint "agreement_configs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."agreement_configs" validate constraint "agreement_configs_user_id_fkey";

alter table "public"."agreement_configs" add constraint "agreement_configs_weekday_rest_check" CHECK (((weekday_rest >= 1) AND (weekday_rest <= 5))) not valid;

alter table "public"."agreement_configs" validate constraint "agreement_configs_weekday_rest_check";

alter table "public"."agreement_configs" add constraint "agreement_configs_weekend_work_parity_check" CHECK ((weekend_work_parity = ANY (ARRAY['even'::text, 'odd'::text]))) not valid;

alter table "public"."agreement_configs" validate constraint "agreement_configs_weekend_work_parity_check";

alter table "public"."daily_records" add constraint "daily_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."daily_records" validate constraint "daily_records_user_id_fkey";

alter table "public"."daily_records" add constraint "daily_records_user_id_work_date_key" UNIQUE using index "daily_records_user_id_work_date_key";

alter table "public"."expense_categories" add constraint "expense_categories_default_boss_share_check" CHECK (((default_boss_share >= (0)::numeric) AND (default_boss_share <= (100)::numeric))) not valid;

alter table "public"."expense_categories" validate constraint "expense_categories_default_boss_share_check";

alter table "public"."expense_categories" add constraint "expense_categories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."expense_categories" validate constraint "expense_categories_user_id_fkey";

alter table "public"."expense_categories" add constraint "expense_categories_user_id_name_key" UNIQUE using index "expense_categories_user_id_name_key";

alter table "public"."expenses" add constraint "expenses_amount_check" CHECK ((amount > (0)::numeric)) not valid;

alter table "public"."expenses" validate constraint "expenses_amount_check";

alter table "public"."expenses" add constraint "expenses_boss_share_check" CHECK (((boss_share >= (0)::numeric) AND (boss_share <= (100)::numeric))) not valid;

alter table "public"."expenses" validate constraint "expenses_boss_share_check";

alter table "public"."expenses" add constraint "expenses_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.expense_categories(id) ON DELETE SET NULL not valid;

alter table "public"."expenses" validate constraint "expenses_category_id_fkey";

alter table "public"."expenses" add constraint "expenses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."expenses" validate constraint "expenses_user_id_fkey";

alter table "public"."income_entries" add constraint "income_entries_amount_check" CHECK ((amount > (0)::numeric)) not valid;

alter table "public"."income_entries" validate constraint "income_entries_amount_check";

alter table "public"."income_entries" add constraint "income_entries_method_check" CHECK ((method = ANY (ARRAY['cash'::text, 'card'::text, 'emisora'::text]))) not valid;

alter table "public"."income_entries" validate constraint "income_entries_method_check";

alter table "public"."income_entries" add constraint "income_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."income_entries" validate constraint "income_entries_user_id_fkey";

alter table "public"."odometer_totals" add constraint "odometer_totals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."odometer_totals" validate constraint "odometer_totals_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_subscription_status_check" CHECK ((subscription_status = ANY (ARRAY['trial'::text, 'active'::text, 'expired'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_subscription_status_check";

alter table "public"."report_preferences" add constraint "report_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."report_preferences" validate constraint "report_preferences_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.close_day(p_date date, a_num_servicios integer, a_carreras numeric, a_suplementos numeric, a_dist_total numeric, a_dist_ocupado numeric, a_dist_libre numeric, a_dist_off numeric, a_tiempo_ocupado integer, a_tiempo_on integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid := auth.uid();
  v_was_closed boolean := false;
  v_old_ns int; v_old_ca numeric; v_old_su numeric;
  v_old_dt numeric; v_old_doc numeric; v_old_dl numeric; v_old_doff numeric;
  v_old_toc int; v_old_ton int;
begin
  -- Lectura previa (para revertir si ya estaba cerrado)
  select day_closed, p_num_servicios, p_carreras, p_suplementos,
         p_dist_total, p_dist_ocupado, p_dist_libre, p_dist_off,
         p_tiempo_ocupado, p_tiempo_on
    into v_was_closed, v_old_ns, v_old_ca, v_old_su,
         v_old_dt, v_old_doc, v_old_dl, v_old_doff,
         v_old_toc, v_old_ton
    from public.daily_records
    where user_id = v_uid and work_date = p_date;

  -- Asegura fila de acumulado
  insert into public.odometer_totals (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- Si ya estaba cerrado, revierte las lecturas anteriores del acumulado
  if coalesce(v_was_closed, false) then
    update public.odometer_totals set
      total_carreras    = total_carreras    - coalesce(v_old_ca, 0),
      total_suplementos = total_suplementos - coalesce(v_old_su, 0),
      dist_total        = dist_total        - coalesce(v_old_dt, 0),
      dist_ocupado      = dist_ocupado      - coalesce(v_old_doc, 0),
      dist_libre        = dist_libre        - coalesce(v_old_dl, 0),
      dist_off          = dist_off          - coalesce(v_old_doff, 0),
      tiempo_ocupado    = tiempo_ocupado    - coalesce(v_old_toc, 0),
      tiempo_on         = tiempo_on         - coalesce(v_old_ton, 0),
      num_servicios     = num_servicios     - coalesce(v_old_ns, 0)
    where user_id = v_uid;
  end if;

  -- Guarda las lecturas del día
  update public.daily_records set
    day_closed       = true,
    p_num_servicios  = a_num_servicios,
    p_carreras       = a_carreras,
    p_suplementos    = a_suplementos,
    p_dist_total     = a_dist_total,
    p_dist_ocupado   = a_dist_ocupado,
    p_dist_libre     = a_dist_libre,
    p_dist_off       = a_dist_off,
    p_tiempo_ocupado = a_tiempo_ocupado,
    p_tiempo_on      = a_tiempo_on
  where user_id = v_uid and work_date = p_date;

  -- Si no existía el registro del día, créalo
  if not found then
    insert into public.daily_records (
      user_id, work_date, day_closed,
      p_num_servicios, p_carreras, p_suplementos,
      p_dist_total, p_dist_ocupado, p_dist_libre, p_dist_off,
      p_tiempo_ocupado, p_tiempo_on
    ) values (
      v_uid, p_date, true,
      a_num_servicios, a_carreras, a_suplementos,
      a_dist_total, a_dist_ocupado, a_dist_libre, a_dist_off,
      a_tiempo_ocupado, a_tiempo_on
    );
  end if;

  -- Suma las nuevas lecturas al acumulado
  update public.odometer_totals set
    total_carreras    = total_carreras    + coalesce(a_carreras, 0),
    total_suplementos = total_suplementos + coalesce(a_suplementos, 0),
    dist_total        = dist_total        + coalesce(a_dist_total, 0),
    dist_ocupado      = dist_ocupado      + coalesce(a_dist_ocupado, 0),
    dist_libre        = dist_libre        + coalesce(a_dist_libre, 0),
    dist_off          = dist_off          + coalesce(a_dist_off, 0),
    tiempo_ocupado    = tiempo_ocupado    + coalesce(a_tiempo_ocupado, 0),
    tiempo_on         = tiempo_on         + coalesce(a_tiempo_on, 0),
    num_servicios     = num_servicios     + coalesce(a_num_servicios, 0),
    updated_at        = now()
  where user_id = v_uid;
end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.settlement_days(p_from date, p_to date)
 RETURNS TABLE(d date, cash numeric, card numeric, card_to_boss numeric, gross numeric, expense_total numeric, boss_expense_share numeric, is_rest boolean, is_exempt boolean, boss_fee numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with income as (
    select
      entry_date as d,
      coalesce(sum(amount) filter (where method = 'cash'), 0) as cash,
      -- datáfono y emisora se agrupan: ambos los recibe el jefe directamente
      coalesce(sum(amount) filter (where method in ('card', 'emisora')), 0) as card
    from public.income_entries
    where user_id = auth.uid() and entry_date between p_from and p_to
    group by entry_date
  ),
  flags as (
    select work_date as d, is_rest_day, is_fee_exempt
    from public.daily_records
    where user_id = auth.uid() and work_date between p_from and p_to
  ),
  exp as (
    select
      expense_date as d,
      sum(amount) as expense_total,
      sum(amount * boss_share / 100) as boss_expense_share
    from public.expenses
    where user_id = auth.uid() and expense_date between p_from and p_to
    group by expense_date
  ),
  days as (
    select
      coalesce(i.d, f.d, e.d)              as d,
      coalesce(i.cash, 0)                  as cash,
      coalesce(i.card, 0)                  as card,
      coalesce(i.cash, 0) + coalesce(i.card, 0) as gross,
      coalesce(e.expense_total, 0)         as expense_total,
      coalesce(e.boss_expense_share, 0)    as boss_expense_share,
      coalesce(f.is_rest_day, false)       as is_rest,
      coalesce(f.is_fee_exempt, false)     as is_exempt,
      (i.d is not null or (f.d is not null and not f.is_rest_day)) as worked
    from income i
    full join flags f on f.d = i.d
    full join exp e on e.d = coalesce(i.d, f.d)
  )
  select
    days.d,
    days.cash,
    days.card,
    case when coalesce(a.card_goes_to_boss, true) then days.card else 0 end as card_to_boss,
    days.gross,
    days.expense_total,
    round(days.boss_expense_share, 2),
    days.is_rest,
    days.is_exempt,
    round(
      case
        when days.is_rest or days.is_exempt then 0
        when a.fee_type = 'fixed' and days.worked then a.fee_value
        when a.fee_type = 'percentage' then days.gross * a.fee_value / 100
        else 0
      end, 2) as boss_fee
  from days
  left join public.agreement_configs a
    on a.user_id = auth.uid()
   and days.d >= a.valid_from
   and (a.valid_to is null or days.d <= a.valid_to)
  order by days.d;
$function$
;

CREATE OR REPLACE FUNCTION public.settlement_summary(p_from date, p_to date)
 RETURNS TABLE(total_cash numeric, total_card numeric, total_gross numeric, boss_due numeric, boss_received numeric, boss_expense_share numeric, balance numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select
    coalesce(sum(cash), 0),
    coalesce(sum(card), 0),
    coalesce(sum(gross), 0),
    round(coalesce(sum(boss_fee), 0), 2),
    coalesce(sum(card_to_boss), 0),
    round(coalesce(sum(boss_expense_share), 0), 2),
    round(
      coalesce(sum(boss_fee), 0)
      - coalesce(sum(card_to_boss), 0)
      - coalesce(sum(boss_expense_share), 0), 2)
  from public.settlement_days(p_from, p_to);
$function$
;

grant delete on table "public"."agreement_configs" to "anon";

grant insert on table "public"."agreement_configs" to "anon";

grant references on table "public"."agreement_configs" to "anon";

grant select on table "public"."agreement_configs" to "anon";

grant trigger on table "public"."agreement_configs" to "anon";

grant truncate on table "public"."agreement_configs" to "anon";

grant update on table "public"."agreement_configs" to "anon";

grant delete on table "public"."agreement_configs" to "authenticated";

grant insert on table "public"."agreement_configs" to "authenticated";

grant references on table "public"."agreement_configs" to "authenticated";

grant select on table "public"."agreement_configs" to "authenticated";

grant trigger on table "public"."agreement_configs" to "authenticated";

grant truncate on table "public"."agreement_configs" to "authenticated";

grant update on table "public"."agreement_configs" to "authenticated";

grant delete on table "public"."agreement_configs" to "service_role";

grant insert on table "public"."agreement_configs" to "service_role";

grant references on table "public"."agreement_configs" to "service_role";

grant select on table "public"."agreement_configs" to "service_role";

grant trigger on table "public"."agreement_configs" to "service_role";

grant truncate on table "public"."agreement_configs" to "service_role";

grant update on table "public"."agreement_configs" to "service_role";

grant delete on table "public"."daily_records" to "anon";

grant insert on table "public"."daily_records" to "anon";

grant references on table "public"."daily_records" to "anon";

grant select on table "public"."daily_records" to "anon";

grant trigger on table "public"."daily_records" to "anon";

grant truncate on table "public"."daily_records" to "anon";

grant update on table "public"."daily_records" to "anon";

grant delete on table "public"."daily_records" to "authenticated";

grant insert on table "public"."daily_records" to "authenticated";

grant references on table "public"."daily_records" to "authenticated";

grant select on table "public"."daily_records" to "authenticated";

grant trigger on table "public"."daily_records" to "authenticated";

grant truncate on table "public"."daily_records" to "authenticated";

grant update on table "public"."daily_records" to "authenticated";

grant delete on table "public"."daily_records" to "service_role";

grant insert on table "public"."daily_records" to "service_role";

grant references on table "public"."daily_records" to "service_role";

grant select on table "public"."daily_records" to "service_role";

grant trigger on table "public"."daily_records" to "service_role";

grant truncate on table "public"."daily_records" to "service_role";

grant update on table "public"."daily_records" to "service_role";

grant delete on table "public"."expense_categories" to "anon";

grant insert on table "public"."expense_categories" to "anon";

grant references on table "public"."expense_categories" to "anon";

grant select on table "public"."expense_categories" to "anon";

grant trigger on table "public"."expense_categories" to "anon";

grant truncate on table "public"."expense_categories" to "anon";

grant update on table "public"."expense_categories" to "anon";

grant delete on table "public"."expense_categories" to "authenticated";

grant insert on table "public"."expense_categories" to "authenticated";

grant references on table "public"."expense_categories" to "authenticated";

grant select on table "public"."expense_categories" to "authenticated";

grant trigger on table "public"."expense_categories" to "authenticated";

grant truncate on table "public"."expense_categories" to "authenticated";

grant update on table "public"."expense_categories" to "authenticated";

grant delete on table "public"."expense_categories" to "service_role";

grant insert on table "public"."expense_categories" to "service_role";

grant references on table "public"."expense_categories" to "service_role";

grant select on table "public"."expense_categories" to "service_role";

grant trigger on table "public"."expense_categories" to "service_role";

grant truncate on table "public"."expense_categories" to "service_role";

grant update on table "public"."expense_categories" to "service_role";

grant delete on table "public"."expenses" to "anon";

grant insert on table "public"."expenses" to "anon";

grant references on table "public"."expenses" to "anon";

grant select on table "public"."expenses" to "anon";

grant trigger on table "public"."expenses" to "anon";

grant truncate on table "public"."expenses" to "anon";

grant update on table "public"."expenses" to "anon";

grant delete on table "public"."expenses" to "authenticated";

grant insert on table "public"."expenses" to "authenticated";

grant references on table "public"."expenses" to "authenticated";

grant select on table "public"."expenses" to "authenticated";

grant trigger on table "public"."expenses" to "authenticated";

grant truncate on table "public"."expenses" to "authenticated";

grant update on table "public"."expenses" to "authenticated";

grant delete on table "public"."expenses" to "service_role";

grant insert on table "public"."expenses" to "service_role";

grant references on table "public"."expenses" to "service_role";

grant select on table "public"."expenses" to "service_role";

grant trigger on table "public"."expenses" to "service_role";

grant truncate on table "public"."expenses" to "service_role";

grant update on table "public"."expenses" to "service_role";

grant delete on table "public"."income_entries" to "anon";

grant insert on table "public"."income_entries" to "anon";

grant references on table "public"."income_entries" to "anon";

grant select on table "public"."income_entries" to "anon";

grant trigger on table "public"."income_entries" to "anon";

grant truncate on table "public"."income_entries" to "anon";

grant update on table "public"."income_entries" to "anon";

grant delete on table "public"."income_entries" to "authenticated";

grant insert on table "public"."income_entries" to "authenticated";

grant references on table "public"."income_entries" to "authenticated";

grant select on table "public"."income_entries" to "authenticated";

grant trigger on table "public"."income_entries" to "authenticated";

grant truncate on table "public"."income_entries" to "authenticated";

grant update on table "public"."income_entries" to "authenticated";

grant delete on table "public"."income_entries" to "service_role";

grant insert on table "public"."income_entries" to "service_role";

grant references on table "public"."income_entries" to "service_role";

grant select on table "public"."income_entries" to "service_role";

grant trigger on table "public"."income_entries" to "service_role";

grant truncate on table "public"."income_entries" to "service_role";

grant update on table "public"."income_entries" to "service_role";

grant delete on table "public"."odometer_totals" to "anon";

grant insert on table "public"."odometer_totals" to "anon";

grant references on table "public"."odometer_totals" to "anon";

grant select on table "public"."odometer_totals" to "anon";

grant trigger on table "public"."odometer_totals" to "anon";

grant truncate on table "public"."odometer_totals" to "anon";

grant update on table "public"."odometer_totals" to "anon";

grant delete on table "public"."odometer_totals" to "authenticated";

grant insert on table "public"."odometer_totals" to "authenticated";

grant references on table "public"."odometer_totals" to "authenticated";

grant select on table "public"."odometer_totals" to "authenticated";

grant trigger on table "public"."odometer_totals" to "authenticated";

grant truncate on table "public"."odometer_totals" to "authenticated";

grant update on table "public"."odometer_totals" to "authenticated";

grant delete on table "public"."odometer_totals" to "service_role";

grant insert on table "public"."odometer_totals" to "service_role";

grant references on table "public"."odometer_totals" to "service_role";

grant select on table "public"."odometer_totals" to "service_role";

grant trigger on table "public"."odometer_totals" to "service_role";

grant truncate on table "public"."odometer_totals" to "service_role";

grant update on table "public"."odometer_totals" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."report_preferences" to "anon";

grant insert on table "public"."report_preferences" to "anon";

grant references on table "public"."report_preferences" to "anon";

grant select on table "public"."report_preferences" to "anon";

grant trigger on table "public"."report_preferences" to "anon";

grant truncate on table "public"."report_preferences" to "anon";

grant update on table "public"."report_preferences" to "anon";

grant delete on table "public"."report_preferences" to "authenticated";

grant insert on table "public"."report_preferences" to "authenticated";

grant references on table "public"."report_preferences" to "authenticated";

grant select on table "public"."report_preferences" to "authenticated";

grant trigger on table "public"."report_preferences" to "authenticated";

grant truncate on table "public"."report_preferences" to "authenticated";

grant update on table "public"."report_preferences" to "authenticated";

grant delete on table "public"."report_preferences" to "service_role";

grant insert on table "public"."report_preferences" to "service_role";

grant references on table "public"."report_preferences" to "service_role";

grant select on table "public"."report_preferences" to "service_role";

grant trigger on table "public"."report_preferences" to "service_role";

grant truncate on table "public"."report_preferences" to "service_role";

grant update on table "public"."report_preferences" to "service_role";


  create policy "own agreements"
  on "public"."agreement_configs"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "own records"
  on "public"."daily_records"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "own categories"
  on "public"."expense_categories"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "own expenses"
  on "public"."expenses"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "own income entries"
  on "public"."income_entries"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "own odometer totals"
  on "public"."odometer_totals"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "own profile"
  on "public"."profiles"
  as permissive
  for all
  to public
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "own report prefs"
  on "public"."report_preferences"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


