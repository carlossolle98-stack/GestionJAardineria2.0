export type Jornada = {
  _id: string;
  usuarioId: string;
  nombre: string;
  fecha: string;
  entrada: string;
  salida: string | null;
  pausaMin: number;
  nota: string;
  origen: 'app' | 'manual';
  aprobada: boolean;
  aprobadaPor: string;
  editadaPor: string;
  /** Minutos trabajados (sin la pausa); null si todavía no salió. */
  minutos: number | null;
};

/** "08:30" en hora argentina, desde un instante. */
export function horaAR(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
}

export function horasTexto(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Lunes de la semana de una fecha AAAA-MM-DD. */
export function lunesDe(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  const dow = f.getUTCDay();
  f.setUTCDate(f.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return f.toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, n: number) {
  const [y, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + n));
  return f.toISOString().slice(0, 10);
}

export type FilaPersona = { usuarioId: string; nombre: string; porDia: Record<string, number>; total: number; abiertas: number };

/** Minutos por persona y por día (de las jornadas cerradas). */
export function grillaSemana(jornadas: Jornada[], dias: string[]): FilaPersona[] {
  const filas = new Map<string, FilaPersona>();
  for (const j of jornadas) {
    if (!dias.includes(j.fecha)) continue;
    const f = filas.get(j.usuarioId) ?? { usuarioId: j.usuarioId, nombre: j.nombre, porDia: {}, total: 0, abiertas: 0 };
    if (j.minutos === null) f.abiertas += 1;
    else {
      f.porDia[j.fecha] = (f.porDia[j.fecha] ?? 0) + j.minutos;
      f.total += j.minutos;
    }
    filas.set(j.usuarioId, f);
  }
  return [...filas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Minutos por persona y por semana del mes (semana 1 = la que contiene el día 1). */
export function totalesMes(jornadas: Jornada[], mes: string) {
  const porPersona = new Map<string, { nombre: string; semanas: Map<string, number>; total: number }>();
  for (const j of jornadas) {
    if (!j.fecha.startsWith(mes) || j.minutos === null) continue;
    const p = porPersona.get(j.usuarioId) ?? { nombre: j.nombre, semanas: new Map<string, number>(), total: 0 };
    const sem = lunesDe(j.fecha);
    p.semanas.set(sem, (p.semanas.get(sem) ?? 0) + j.minutos);
    p.total += j.minutos;
    porPersona.set(j.usuarioId, p);
  }
  return porPersona;
}
