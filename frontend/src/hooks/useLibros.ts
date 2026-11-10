import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { valorStock } from '@/lib/inventario';
import { generarLibros } from '@/lib/contabilidad';
import type { J2Datos } from '@/lib/j2reducer';
import type { Activo, ItemInventario } from '@/types';
import { useJ2Local } from '@/context/J2LocalContext';
import { useAuth } from '@/context/AuthContext';

/**
 * Los libros contables, armados una sola vez para todas las pantallas: así el
 * Resumen y Contabilidad muestran siempre los mismos números.
 */
export function useLibros() {
  const j2 = useJ2Local();
  const { puede } = useAuth();
  const hoy = todayISO();

  const { data: inventario, isError: sinInventario } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => getJson<ItemInventario[]>('/api/inventario'),
    enabled: puede('inventario'),
    retry: false,
  });
  const { data: activos, isError: sinActivos } = useQuery({
    queryKey: ['activos'],
    queryFn: () => getJson<Activo[]>('/api/activos'),
    enabled: puede('finanzas'),
    retry: false,
  });

  const libros = useMemo(() => {
    // El contexto entrega los anulados aparte: para los libros van todos, con su contraasiento.
    const datos: J2Datos = {
      cuentas: j2.cuentas,
      inversiones: j2.inversiones,
      egresos: [...j2.egresos, ...j2.egresosAnulados],
      ingresos: [...j2.ingresos, ...j2.ingresosAnulados],
      transferencias: j2.transferencias,
      empleados: j2.empleados,
      deudasClientes: j2.deudasClientes,
      listaEspera: j2.listaEspera,
      movlog: j2.movlog,
    };
    return generarLibros(datos, {
      hoy,
      mercaderia: inventario ? valorStock(inventario) : undefined,
      activos: activos ?? undefined,
    });
  }, [j2, inventario, activos, hoy]);

  return { libros, hoy, sinInventario, sinActivos };
}
