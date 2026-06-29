'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { currentWorkday } from '@/lib/domain/rest-days';
import { euro } from '@/lib/domain/settlement';
import { useToast } from '@/components/ui/toast';

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
  category_id: string | null;
  category: { name: string } | null;
}

function GastosInner() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [recent, setRecent] = useState<Expense[]>([]);

  const [date, setDate] = useState(() => searchParams.get('date') ?? currentWorkday());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [bossShare, setBossShare] = useState('0');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: cats }, { data: expenses }] = await Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase
        .from('expenses')
        .select('id, expense_date, amount, boss_share, notes, category_id, category:expense_categories(name)')
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

  function resetForm() {
    setAmount('');
    setNotes('');
    setEditingId(null);
  }

  function handleQuickAmount(val: number, isAdditive: boolean) {
    if (isAdditive) {
      const current = Number(amount) || 0;
      setAmount((current + val).toFixed(2).replace(/\.00$/, ''));
    } else {
      setAmount(String(val));
    }
  }

  function startEdit(e: Expense) {
    setEditingId(e.id);
    setDate(e.expense_date);
    setCategoryId(e.category_id ?? '');
    setAmount(String(e.amount));
    setBossShare(String(e.boss_share));
    setNotes(e.notes ?? '');
    setError(null);
  }

  async function handleSave() {
    if (!amount || Number(amount) <= 0) {
      toastError('Indica el monto del gasto.');
      setError('Indica el monto del gasto.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      expense_date: date,
      category_id: categoryId || null,
      amount: Number(amount),
      boss_share: Number(bossShare) || 0,
      notes: notes.trim() || null,
    };

    const isEdit = !!editingId;
    const { error: saveError } = editingId
      ? await supabase.from('expenses').update(payload).eq('id', editingId)
      : await supabase.from('expenses').insert({ user_id: userData.user!.id, ...payload });

    if (saveError) {
      toastError('No se pudo guardar el gasto. Inténtalo de nuevo.');
      setError('No se pudo guardar el gasto. Inténtalo de nuevo.');
      setSaving(false);
      return;
    }

    success(isEdit ? '¡Cambios guardados con éxito!' : '¡Gasto añadido con éxito!');
    resetForm();
    setSaving(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (editingId === id) resetForm();
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', id);
    if (deleteError) {
      toastError('No se pudo eliminar el gasto.');
    } else {
      success('Gasto eliminado.');
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rise-in font-[family-name:var(--font-display)] text-2xl font-bold">
        Gastos
      </h1>

      <section className="card rise-in-2 flex flex-col gap-4 p-5">
        {editingId && (
          <div className="flex items-center justify-between text-xs text-amber">
            <span>Editando gasto</span>
            <button type="button" onClick={resetForm} className="text-muted underline">
              Cancelar
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Fecha</span>
            <input
              type="date"
              value={date}
              max={currentWorkday()}
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
          <div className="flex flex-wrap gap-1.5 text-xs pt-0.5 pb-1">
            <button
              type="button"
              onClick={() => handleQuickAmount(10, true)}
              className="rounded-full bg-surface-2 border border-line px-3 py-1.5 hover:border-amber hover:text-amber active:scale-95 transition-all text-muted font-semibold cursor-pointer"
            >
              +10€ (Lavado)
            </button>
            <button
              type="button"
              onClick={() => handleQuickAmount(20, true)}
              className="rounded-full bg-surface-2 border border-line px-3 py-1.5 hover:border-amber hover:text-amber active:scale-95 transition-all text-muted font-semibold cursor-pointer"
            >
              +20€
            </button>
            <button
              type="button"
              onClick={() => handleQuickAmount(50, true)}
              className="rounded-full bg-surface-2 border border-line px-3 py-1.5 hover:border-amber hover:text-amber active:scale-95 transition-all text-muted font-semibold cursor-pointer"
            >
              +50€ (Combustible)
            </button>
          </div>
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
          {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Añadir gasto'}
        </button>
      </section>

      {/* ---------- Últimos gastos ---------- */}
      {recent.length > 0 && (
        <section className="rise-in-3 flex flex-col gap-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Últimos</h2>
          {recent.map((e) => (
            <div
              key={e.id}
              className={`card flex items-center justify-between px-4 py-3 ${
                editingId === e.id ? 'border-amber' : ''
              }`}
            >
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
                  onClick={() => startEdit(e)}
                  aria-label="Editar gasto"
                  className="text-muted transition-colors hover:text-amber"
                >
                  ✏️
                </button>
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

export default function GastosPage() {
  return (
    <Suspense fallback={<p className="pt-10 text-center text-muted">Cargando…</p>}>
      <GastosInner />
    </Suspense>
  );
}
