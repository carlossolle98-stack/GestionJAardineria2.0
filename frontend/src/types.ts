export type Pago = { _id: string; fecha: string; monto: number; horas?: number };

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
  cuentasPorCobrar: { total: number; clientes: { nombre: string; deuda: number }[] };
  cuentasPagar: { total: number; proveedores: Proveedor[] };
  ingresosMes: number;
  mesClave: string;
};
