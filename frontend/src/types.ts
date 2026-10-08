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

export type J2Empleado = { id: string; nombre: string; activo: boolean; aguinaldo: number; adelanto?: number };

export type J2MovLog = {
  id: string;
  fecha: string;
  tipo: string;
  concepto: string;
  detalle: string;
  monto: number;
  cuenta: string;
};

export type J2Egreso = {
  id: string;
  fecha: string;
  tipo: J2EgresoTipo;
  categoria: string;
  concepto: string;
  monto: number;
  cuenta: 'mp' | 'banco' | 'efectivo';
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

export type J2Inversiones = {
  cocos: number;
  servente: number;
  usd: { cantidad: number; precio: number };
};

export type J2Ingreso = {
  id: string;
  fecha: string;
  cliente: string;
  concepto: string;
  monto: number;
  medio: string;
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
