export const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export type MesImportado = { clave: string; anio: number; mes: string; ingresos: number; egresos: number };

/** Acepta "1234.56", "1.234,56" y "1234,56". */
function numero(texto: string): number {
  let t = texto.trim().replace(/[$\s]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  return Number(t);
}

function numeroDeMes(texto: string): number | null {
  const t = texto.trim().toLowerCase();
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const i = NOMBRES_MES.findIndex((m) => m.toLowerCase() === t);
  return i >= 0 ? i + 1 : null;
}

/**
 * Lee un historial mensual con columnas Año;Mes;Ingresos;Egresos (separado por
 * punto y coma o tabulación, como lo exporta o copia Excel en español).
 */
export function parsearHistorial(texto: string): { meses: MesImportado[]; errores: string[] } {
  const meses: MesImportado[] = [];
  const errores: string[] = [];
  texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((linea, i) => {
      const partes = linea.split(/[;\t]/);
      if (i === 0 && !/^\d/.test(partes[0])) return;
      if (partes.length < 4) {
        errores.push(`Línea ${i + 1}: faltan columnas`);
        return;
      }
      const anio = Number(partes[0]);
      const mesNum = numeroDeMes(partes[1]);
      const ingresos = numero(partes[2]);
      const egresos = numero(partes[3]);
      if (!Number.isInteger(anio) || anio < 2000 || !mesNum || !Number.isFinite(ingresos) || !Number.isFinite(egresos)) {
        errores.push(`Línea ${i + 1}: no se entiende "${linea}"`);
        return;
      }
      meses.push({
        clave: `${anio}-${String(mesNum).padStart(2, '0')}`,
        anio,
        mes: NOMBRES_MES[mesNum - 1],
        ingresos: Math.round(ingresos * 100) / 100,
        egresos: Math.round(egresos * 100) / 100,
      });
    });
  return { meses, errores };
}
