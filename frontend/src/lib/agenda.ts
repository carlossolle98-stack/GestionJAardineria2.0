export function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function mondayOfToday() {
  const hoy = new Date();
  const dow = hoy.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  hoy.setDate(hoy.getDate() + diff);
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function weekRangeFromOffset(offsetWeeks: number) {
  const lunes = mondayOfToday();
  lunes.setDate(lunes.getDate() + offsetWeeks * 7);
  const sabado = addDays(lunes, 5);
  return { lunes, desde: toYMD(lunes), hasta: toYMD(sabado) };
}

export function labelSemana(lunes: Date) {
  const viernes = addDays(lunes, 5);
  const op: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${lunes.getDate()} al ${viernes.toLocaleDateString('es-AR', op)}`;
}

const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function diasLaborablesSemana(lunes: Date) {
  return NOMBRES.map((nombre, i) => {
    const fecha = addDays(lunes, i);
    return { nombre, fecha, ymd: toYMD(fecha) };
  });
}
