export type Pago = { _id: string; fecha: string; monto: number; horas?: number; medio?: string };

export type Cliente = {
  _id: string;
  num: number;
  nombre: string;
  direccion: string;
  formaPago: string;
  telefono?: string;
  deuda: number;
  pagos: Pago[];
};

export type Prospecto = {
  _id: string;
  nombre: string;
  zona: string;
  tipoTrabajo: string;
  frecuencia: string;
  disponibilidad: string;
  estado: string;
  presupuesto?: string;
  notas?: string;
};

export type Turno = {
  _id: string;
  cliente: string;
  fecha: string;
  hora: string;
  duracion: string;
  tipo: string;
  realizado?: boolean;
};

export type CobroDiario = {
  _id: string;
  cliente: string;
  monto: number;
  fecha: string;
  medio: string;
  tipo: string;
};

export type Proveedor = {
  _id: string;
  nombre: string;
  factura: string;
  deudaTotal: number;
  saldoActual: number;
  estado: string;
};

export type AppSettings = {
  _id: string;
  cajaLiquida: { total: number; mercadoPago: number; banco: number; efectivo: number };
  patrimonio: { total: number; activosNoLiquidos: number };
  empleadosEsteMes: { nombre: string; monto: number }[];
  resultadoMesActual: { etiqueta: string; monto: number; sub: string };
  alertas: { tipo: string; titulo: string; texto: string }[];
  mesesHistoricos: { mes: string; anio: number; ingresos: number; egresos: number; estado: string }[];
};

export type ResumenPayload = {
  settings: AppSettings | null;
  cuentasPorCobrar: {
    total: number;
    clientes: { _id: string; nombre: string; deuda: number; direccion?: string }[];
  };
  cuentasPagar: { total: number; proveedores: Proveedor[] };
  ingresosMes: number;
  mesClave: string;
};

export type J2EgresoTipo = 'fijo' | 'varios' | 'sueldo' | 'mercaderia' | 'inventario' | 'bancario';

/**
 * dependencia: se le retiene mutual (queda al negocio) y se le separa aguinaldo
 * que se le transfiere aparte. sinDescuentos: cobra limpio y el negocio va
 * acumulando el aguinaldo que le debe pagar en julio y enero.
 */
export type J2Modalidad = 'dependencia' | 'sinDescuentos';

export type J2Empleado = {
  id: string;
  nombre: string;
  activo: boolean;
  /** dependencia: aguinaldo que ya se le transfirió a su cuenta aparte (informativo). */
  aguinaldo: number;
  adelanto?: number;
  modalidad?: J2Modalidad;
  mutualPct?: number;
  aguinaldoPct?: number;
  /** Cuenta donde queda el descuento por mutual (la plata que no se le transfiere). */
  mutualCuenta?: 'mp' | 'banco' | 'efectivo';
  /** sinDescuentos: aguinaldo acumulado que el negocio le debe. */
  aguinaldoDevengado?: number;
};

export type J2Pago = { cuenta: 'mp' | 'banco' | 'efectivo'; monto: number };

export type J2MovLog = {
  id: string;
  fecha: string;
  tipo: string;
  concepto: string;
  detalle: string;
  monto: number;
  cuenta: string;
};

/** Un registro anulado no se borra: queda visible con el motivo y se compensa con un contraasiento. */
export type J2Anulacion = { fecha: string; motivo: string };

export type J2Egreso = {
  id: string;
  fecha: string;
  tipo: J2EgresoTipo;
  categoria: string;
  concepto: string;
  monto: number;
  cuenta: 'mp' | 'banco' | 'efectivo';
  anulado?: J2Anulacion;
  /** De dónde salió el egreso, para que al anularlo se revierta todo lo que hizo. */
  /**
   * Lo que salió de cada cuenta cuando no fue una sola, o cuando no coincide con
   * el monto (un sueldo con adelanto ya entregado). Si falta, salió `monto` de `cuenta`.
   */
  partes?: J2Pago[];
  origen?:
    | { tipo: 'liquidacion'; empleadoId: string; adelanto: number }
    | { tipo: 'credito'; creditoId: string; pagoId: string }
    | {
        tipo: 'sueldo';
        empleadoId: string;
        mutual: number;
        aguinaldo: number;
        devengado: number;
        adelanto: number;
        ingresoMutualId?: string;
      }
    | { tipo: 'aguinaldo'; empleadoId: string; descontado: number };
};

export type J2Transferencia = {
  id: string;
  fecha: string;
  de: string;
  para: string;
  monto: number;
  nota?: string;
};

export type J2ListaEspera = {
  id: string;
  clienteId: string;
  nombreCliente: string;
  trabajo: string;
  notas: string;
  fechaAgregado: string;
};

export type J2Cuentas = { mp: number; banco: number; efectivo: number };

export type J2Inversion = { id: string; nombre: string; saldo: number; activa: boolean };

export type J2PagoCredito = {
  id: string;
  fecha: string;
  capital: number;
  interes: number;
  cuenta: string;
  egresoId?: string;
  anulado?: J2Anulacion;
};

export type J2AjusteCredito = { id: string; fecha: string; diferencia: number; motivo: string };

/** Plata prestada por un banco o financiera: entra a caja y queda como deuda, no como ingreso. */
export type J2Credito = {
  id: string;
  fecha: string;
  entidad: string;
  monto: number;
  saldo: number;
  cuenta: string;
  cuotas?: number;
  nota?: string;
  pagos: J2PagoCredito[];
  ajustes: J2AjusteCredito[];
  anulado?: J2Anulacion;
};

/** Aporte o retiro de un socio: mueve caja pero no es ingreso ni gasto del negocio. */
export type J2MovCapital = {
  id: string;
  fecha: string;
  tipo: 'aporte' | 'retiro';
  socio: string;
  monto: number;
  cuenta: string;
  nota?: string;
  anulado?: J2Anulacion;
};

export type J2Inversiones = {
  items: J2Inversion[];
  usd: { cantidad: number; precio: number };
  creditos: J2Credito[];
  capital: J2MovCapital[];
};

export type J2Ingreso = {
  id: string;
  fecha: string;
  cliente: string;
  concepto: string;
  monto: number;
  medio: string;
  anulado?: J2Anulacion;
  /** El descuento por mutual nace de un pago de sueldo y se anula junto con él. */
  egresoId?: string;
};

export type Activo = {
  _id: string;
  nombre: string;
  categoria: string;
  valorCompra: number;
  fechaCompra: string;
  vidaUtilAnios: number;
  estado: string;
  notas?: string;
};

export type MovimientoInventario = {
  _id: string;
  fecha: string;
  tipo: 'entrada' | 'salida';
  cantidad: number;
  motivo: string;
};

export type ItemInventario = {
  _id: string;
  nombre: string;
  categoria: string;
  stock: number;
  unidad: string;
  stockMinimo: number;
  movimientos: MovimientoInventario[];
};

export type J2DeudaCliente = {
  id: string;
  nombreCliente: string;
  concepto: string;
  monto: number;
  fecha: string;
  estado: 'pendiente' | 'pagado';
  fechaPago?: string;
  cuentaCobro?: string;
};
