export type LineaClasificada = { fragmento: string; categoria: string; accion: string };

const palabrasClave = {
  cobro: ['pago', 'transferencia', 'te debo', 'cuánto', 'precio', 'presupuesto', 'cobro', 'factura', 'debe', 'saldo'],
  lluvia: ['lluvia', 'llovió', 'llueve', 'reprogramar', 'cancelar', 'clima', 'mojado', 'tormenta'],
  turno: ['cuándo', 'cuando', 'turno', 'visita', 'pasar', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'semana'],
  prospecto: ['jardín', 'poda', 'desmalezar', 'mantenimiento', 'nuevo', 'presupuesto', 'interesa', 'precio'],
};

export function clasificarLineas(texto: string): LineaClasificada[] {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: LineaClasificada[] = [];
  for (const linea of lineas.slice(0, 40)) {
    if (linea.length < 5) continue;
    const lMin = linea.toLowerCase();
    let categoria = 'Sin acción necesaria';
    let accion = '—';
    if (palabrasClave.cobro.some((p) => lMin.includes(p))) {
      categoria = '💰 Cobro / Deuda';
      accion = 'Gestionar pago';
    } else if (palabrasClave.lluvia.some((p) => lMin.includes(p))) {
      categoria = '☁ Reprogramar por lluvia';
      accion = 'Proponer nueva fecha';
    } else if (palabrasClave.turno.some((p) => lMin.includes(p))) {
      categoria = '📅 Turno a confirmar';
      accion = 'Pasar a Calendar';
    } else if (palabrasClave.prospecto.some((p) => lMin.includes(p))) {
      categoria = '🌱 Prospecto nuevo';
      accion = 'Pedir datos mínimos';
    }
    const fragmento = linea.length > 80 ? `${linea.slice(0, 80)}…` : linea;
    out.push({ fragmento, categoria, accion });
  }
  return out;
}
