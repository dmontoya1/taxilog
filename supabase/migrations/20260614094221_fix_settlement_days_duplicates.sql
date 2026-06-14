-- Fix: settlement_days returned duplicate rows when a user had multiple
-- agreement_configs with overlapping date ranges (e.g. valid_to not set on old row).
-- Replace LEFT JOIN with a LATERAL subquery that picks the single most-recent
-- agreement valid on each day, guaranteeing one output row per day.

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
  left join lateral (
    select *
    from public.agreement_configs
    where user_id = auth.uid()
      and days.d >= valid_from
      and (valid_to is null or days.d <= valid_to)
    order by valid_from desc
    limit 1
  ) a on true
  order by days.d;
$function$
;
