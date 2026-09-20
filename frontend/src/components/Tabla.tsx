import { useMemo, useState, type ReactNode } from 'react';

/* ==========================================================================
   Orden
   ========================================================================== */

export type Direccion = 'asc' | 'desc';

export type Orden<C extends string> = { campo: C; direccion: Direccion };

/**
 * Ordena una lista por columna, sin perder el tipo de la fila.
 *
 * `valores` dice cómo sacar el valor ordenable de cada columna: números y
 * fechas ISO se comparan como corresponde y los textos con localeCompare,
 * que en español ordena bien los acentos.
 */
export function useOrden<T, C extends string>(
  filas: T[],
  valores: Record<C, (fila: T) => string | number | null | undefined>,
  // NoInfer evita que el campo inicial fije el genérico: las columnas
  // válidas salen de `valores`, no de cuál se usa como orden por defecto.
  inicial: { campo: NoInfer<C>; direccion: Direccion }
) {
  const [orden, setOrden] = useState<Orden<C>>(inicial);

  const ordenadas = useMemo(() => {
    const sacar = valores[orden.campo];
    if (!sacar) return filas;

    const signo = orden.direccion === 'asc' ? 1 : -1;
    return [...filas].sort((a, b) => {
      const va = sacar(a);
      const vb = sacar(b);

      // Los vacíos van siempre al final, sin importar la dirección.
      const aVacio = va === null || va === undefined || va === '';
      const bVacio = vb === null || vb === undefined || vb === '';
      if (aVacio && bVacio) return 0;
      if (aVacio) return 1;
      if (bVacio) return -1;

      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo;
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * signo;
    });
  }, [filas, orden, valores]);

  /** Clic en una columna: primera vez ordena, la siguiente invierte. */
  function alternar(campo: C) {
    setOrden((o) =>
      o.campo === campo
        ? { campo, direccion: o.direccion === 'asc' ? 'desc' : 'asc' }
        : { campo, direccion: 'asc' }
    );
  }

  return { filas: ordenadas, orden, alternar, setOrden };
}

/** Encabezado clicable, con estado accesible para lectores de pantalla. */
export function Th<C extends string>({
  campo,
  orden,
  alternar,
  children,
  alinear = 'left',
}: {
  campo?: C;
  orden?: Orden<C>;
  alternar?: (campo: C) => void;
  children: ReactNode;
  alinear?: 'left' | 'right' | 'center';
}) {
  if (!campo || !orden || !alternar) {
    return <th style={{ textAlign: alinear }}>{children}</th>;
  }

  const activo = orden.campo === campo;
  const ariaSort = activo ? (orden.direccion === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th style={{ textAlign: alinear }} aria-sort={ariaSort}>
      <button
        type="button"
        className={`th-orden ${activo ? 'activo' : ''}`}
        onClick={() => alternar(campo)}
        title={`Ordenar por ${typeof children === 'string' ? children : campo}`}
      >
        {children}
        <span aria-hidden="true" className="th-flecha">
          {activo ? (orden.direccion === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

/* ==========================================================================
   Filtros
   ========================================================================== */

export type OpcionFiltro = { valor: string; label: string };

/**
 * Barra de filtros: búsqueda libre, selects y un resumen de resultados con
 * botón para limpiar. Se usa igual en todas las pantallas con tabla.
 */
export function BarraFiltros({
  busqueda,
  onBusqueda,
  placeholder = 'Buscar…',
  filtros = [],
  resultados,
  total,
  hayFiltros,
  onLimpiar,
  extra,
  orden,
}: {
  busqueda?: string;
  onBusqueda?: (v: string) => void;
  placeholder?: string;
  filtros?: {
    id: string;
    label: string;
    valor: string;
    opciones: OpcionFiltro[];
    onCambio: (v: string) => void;
  }[];
  resultados?: number;
  total?: number;
  hayFiltros?: boolean;
  onLimpiar?: () => void;
  extra?: ReactNode;
  /** Orden actual + columnas, para poder ordenar desde el celular. */
  orden?: {
    actual: string;
    columnas: OpcionFiltro[];
    direccion: Direccion;
    onCampo: (campo: string) => void;
    onDireccion: () => void;
  };
}) {
  return (
    <div className="barra-filtros">
      {onBusqueda && (
        <div className="filtro-busqueda">
          <span aria-hidden="true" className="filtro-lupa">
            🔍
          </span>
          <input
            type="search"
            value={busqueda ?? ''}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => onBusqueda(e.target.value)}
          />
          {busqueda ? (
            <button
              type="button"
              className="filtro-limpiar-texto"
              aria-label="Limpiar búsqueda"
              onClick={() => onBusqueda('')}
            >
              ✕
            </button>
          ) : null}
        </div>
      )}

      {filtros.map((f) => (
        <div className="filtro-select" key={f.id}>
          <label htmlFor={`filtro-${f.id}`}>{f.label}</label>
          <select id={`filtro-${f.id}`} value={f.valor} onChange={(e) => f.onCambio(e.target.value)}>
            {f.opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {orden && (
        <div className="filtro-select filtro-orden-movil">
          <label htmlFor="filtro-orden">Ordenar por</label>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <select
              id="filtro-orden"
              value={orden.actual}
              onChange={(e) => orden.onCampo(e.target.value)}
              style={{ flex: 1 }}
            >
              {orden.columnas.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn secundario sm"
              onClick={orden.onDireccion}
              aria-label={orden.direccion === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
            >
              {orden.direccion === 'asc' ? '▲' : '▼'}
            </button>
          </div>
        </div>
      )}

      {extra}

      <div className="filtro-resumen" aria-live="polite">
        {resultados !== undefined && total !== undefined && (
          <span>
            {resultados === total
              ? `${total} ${total === 1 ? 'registro' : 'registros'}`
              : `${resultados} de ${total}`}
          </span>
        )}
        {hayFiltros && onLimpiar && (
          <button type="button" className="btn fantasma sm" onClick={onLimpiar}>
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

/** Compara texto ignorando acentos y mayúsculas. */
export function coincide(texto: unknown, busqueda: string) {
  if (!busqueda.trim()) return true;
  const normalizar = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  return normalizar(String(texto ?? '')).includes(normalizar(busqueda));
}

/** True si alguno de los campos coincide con la búsqueda. */
export function coincideAlguno(campos: unknown[], busqueda: string) {
  if (!busqueda.trim()) return true;
  return campos.some((c) => coincide(c, busqueda));
}
