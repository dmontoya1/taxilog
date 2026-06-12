'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toIsoDate } from '@/lib/domain/rest-days';
import { euro } from '@/lib/domain/settlement';

interface Category {
  id: string;
  name: string;
  default_boss_share: number;
}

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  boss_share: number;
  notes: string | null;
  category: { name: string } | null;
}

export default function GastosPage() {
  const supabase = useMemo(() => createClient(), []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [recent, setRecent] = useState<Expense[]>([]);

  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [bossShare, setBossShare] = useState('0');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: cats }, { data: expenses }] = await Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase
        .from('expenses')
        .select('id, expense_date, amount, boss_share, notes, category:expense_categories(name)')
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    setCategories(cats ?? []);
    setRecent((expenses as unknown as Expense[]) ?? []);
    if (cats?.length && !categoryId) {
      setCategoryId(cats[0].id);
      setBossShare(String(cats[0].default_boss_share));
    }
  }, [supabase, categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleCategoryChange(id: string) {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    // El default de la categoría se copia; editable caso a caso.
    if (cat) setBossShare(String(cat.default_boss_share));
  }

  async function handleSave() {
    if (!amount || Number(amount) <= 0) {
      setError('Indica el monto del gasto.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('expenses').insert({
      user_id: userData.user!.id,
      expense_date: date,
      category_id: categoryId || null,
      amount: Number(amount),
      boss_share: Number(bossShare) || 0,
      notes: notes.trim() || null,
    });

    if (insertError) {
      setError('No se pudo guardar el gasto. Inténtalo de nuevo.');
      setSaving(false);
      return;
    }

    setAmount('');
    setNotes('');
    setSaving(false);
    await load();
  }

  async function handleDelete(id: string) {
    await supabase.from('expenses').delete().eq('id', id);
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rise-in font-[family-name:var(--font-display)] text-2xl font-bold">
        Gastos
      </h1>

      <section className="card rise-in-2 flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Fecha</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="amount-input px-3 py-3 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Categoría</span>
            <select
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="amount-input px-3 py-3 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Monto</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="amount-input px-4 py-4 text-2xl"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">% que asume el jefe</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            step="1"
            value={bossShare}
            onChange={(e) => setBossShare(e.target.value)}
            className="amount-input px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Nota (opcional)</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. repostaje completo"
            className="amount-input px-4 py-3 text-base"
          />
        </label>

        {error && <p className="text-sm text-bad">{error}</p>}

        <button onClick={handleSave} disabled={saving} className="btn-amber py-3.5 text-base">
          {saving ? 'Guardando…' : 'Añadir gasto'}
        </button>
      </section>

      {/* ---------- Últimos gastos ---------- */}
      {recent.length > 0 && (
        <section className="rise-in-3 flex flex-col gap-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Últimos</h2>
          {recent.map((e) => (
            <div key={e.id} className="card flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-semibold">
                  {e.category?.name ?? 'Sin categoría'}
                  {e.boss_share > 0 && (
                    <span className="ml-2 text-xs text-amber">jefe {e.boss_share}%</span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {e.expense_date}
                  {e.notes ? ` · ${e.notes}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="taximeter text-base">{euro.format(e.amount)}</span>
                <button
                  onClick={() => handleDelete(e.id)}
                  aria-label="Eliminar gasto"
                  className="text-muted transition-colors hover:text-bad"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
