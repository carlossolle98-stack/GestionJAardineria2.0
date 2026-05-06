export type WaTipo = 'cobro' | 'turno' | 'prospecto' | 'lluvia';

const plantillas: Record<WaTipo, (nombre: string, extra?: string) => string> = {
  cobro: (nombre) =>
    `Hola ${nombre} 👋, te escribo de Jardinería 2.0.\n\nQuería avisarte que tenés un saldo pendiente por los trabajos realizados. Cuando puedas, te agradecería que lo regularices.\n\nPodés transferir a Mercado Pago o banco, o avisame si preferís otro medio.\n\n¡Gracias y que tengas un buen día! 🌿`,
  turno: (nombre) =>
    `Hola ${nombre} 👋, te escribe Jardinería 2.0.\n\nEstamos organizando la agenda de la semana y quería coordinar tu próximo mantenimiento.\n\n¿Qué días y horarios te quedan bien?\n\n¡Quedamos en contacto! 🌿`,
  prospecto: (nombre) =>
    `Hola ${nombre || ''} 👋, te escribe Jardinería 2.0.\n\nPara poder prepararte un presupuesto, necesito algunos datos:\n\n📍 Dirección exacta del trabajo\n🌿 Tipo de trabajo (poda, mantenimiento, desmalezado, otro)\n📐 Tamaño aproximado del jardín (o podés mandarnos fotos/video)\n🔁 ¿Cada cuánto necesitarías el servicio?\n🕐 ¿Qué días y horarios tenés disponibles?\n\n¡Con eso te armo el presupuesto rápido! 🌿`,
  lluvia: (nombre, nuevaFecha) =>
    `Hola ${nombre} 👋, te habla Jardinería 2.0.\n\nPor las condiciones climáticas de hoy, lamentablemente tenemos que reprogramar tu turno.\n\nTe propongo reagendarlo para ${nuevaFecha || 'esta semana'}. ¿Te queda bien?\n\n¡Disculpá las molestias y gracias por entender! 🌿`,
};

export function mensajeWa(tipo: WaTipo, nombre: string, extra?: string) {
  return plantillas[tipo](nombre, extra);
}

export async function copiar(text: string, onOk?: (msg: string) => void) {
  await navigator.clipboard.writeText(text);
  onOk?.('✓ Copiado al portapapeles');
}
