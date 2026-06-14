import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Emisoras (radioteléfono) del taxi en Madrid.
 *
 * Cada conductor gestiona SU lista (tabla `emisoras`, RLS por usuario). El
 * catálogo de abajo solo alimenta los botones de "añadido rápido" en
 * Configuración; no es una tabla. La emisora es informativa: el ingreso por
 * emisora sigue yendo al jefe igual que el datáfono, no cambia el cuadre.
 */

export interface Emisora {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

/** Principales emisoras de Madrid, para los botones de añadido rápido. */
export const MADRID_EMISORAS: string[] = [
  'Tele Taxi',
  'Radio Teléfono Taxi',
  'Radio Taxi Independiente',
  'Servitaxi Madrid',
  'Radio Taxi Madrid Aeropuerto',
];

/** Emisoras del usuario (activas e inactivas), ordenadas. */
export async function getEmisoras(supabase: SupabaseClient): Promise<Emisora[]> {
  const { data, error } = await supabase
    .from('emisoras')
    .select('id, name, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(`Error cargando las emisoras: ${error.message}`);
  return (data as Emisora[]) ?? [];
}

/** Crea una emisora para el usuario. Devuelve la fila creada. */
export async function addEmisora(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<Emisora> {
  const { data, error } = await supabase
    .from('emisoras')
    .insert({ user_id: userId, name: name.trim() })
    .select('id, name, is_active, sort_order')
    .single<Emisora>();
  if (error) throw new Error(`No se pudo añadir la emisora: ${error.message}`);
  return data;
}

/** Activa o desactiva una emisora (no se borra para conservar el histórico). */
export async function setEmisoraActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('emisoras')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw new Error(`No se pudo actualizar la emisora: ${error.message}`);
}

/** Borra una emisora. Las carreras pasadas conservan su emisora_id si tienen FK. */
export async function deleteEmisora(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('emisoras').delete().eq('id', id);
  if (error) throw new Error(`No se pudo borrar la emisora: ${error.message}`);
}
