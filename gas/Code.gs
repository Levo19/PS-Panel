// ============================================================
// PS Panel — Code.gs  (Router principal)
// Script Properties requeridas:
//   SS_PS_ID           → ID del Google Sheet de PS Panel
//   SS_OPERACIONES_ID  → ID del Sheet de OperacionesPS
//   SS_HOTEL_ID        → ID del Sheet de hotel-pms
// ============================================================

function doGet(e) {
  const accion = e.parameter.accion || '';
  let data;

  try {
    switch (accion) {
      case 'listar_personal':
        data = listarPersonal();
        break;
      case 'dashboard':
        const fecha = e.parameter.fecha || Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
        data = getDashboardKPIs(fecha);
        break;
      case 'historico':
        data = getHistorico7dias();
        break;
      case 'lanchas_operaciones':
        data = getLanchasOperaciones(e.parameter.fecha);
        break;
      case 'lanchas_movimientos':
        data = getLanchasMovimientos(e.parameter.id_operacion);
        break;
      case 'lanchas_caja':
        data = getLanchasCaja(e.parameter.fecha);
        break;
      case 'hotel_habitaciones':
        data = getHotelHabitaciones();
        break;
      case 'hotel_reservas':
        data = getHotelReservas(e.parameter.fecha);
        break;
      default:
        data = { ok: false, error: 'Acción desconocida: ' + accion };
    }
    return jsonResponse({ ok: true, data });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const accion = body.accion || '';
  let data;

  try {
    switch (accion) {
      case 'verificar_pin':
        data = verificarPin(body.nombre, body.pin);
        break;
      case 'crear_personal':
        data = crearPersonal(body.nombre, body.rol, body.pin);
        break;
      case 'actualizar_personal':
        data = actualizarPersonal(body.id, body.nombre, body.rol, body.pin);
        break;
      case 'eliminar_personal':
        data = eliminarPersonal(body.id);
        break;
      case 'guardar_config':
        data = guardarConfig(body.clave, body.valor);
        break;
      default:
        data = { ok: false, error: 'Acción desconocida: ' + accion };
    }
    return jsonResponse({ ok: true, data });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Helpers de Lanchas ───────────────────────────────────────
function getLanchasOperaciones(fecha) {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SS_OPERACIONES_ID'));
  const sh = ss.getSheetByName('Operaciones');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  const result = [];
  const fechaBuscar = fecha || Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const fechaOp = Utilities.formatDate(new Date(row[1]), 'America/Lima', 'yyyy-MM-dd');
    if (fechaOp === fechaBuscar) {
      result.push({
        id: row[0], fecha: row[1], hora_salida: row[2], id_bote: row[3],
        id_capitan: row[4], id_guia: row[5], estado: row[6],
        creado_por: row[7], destino: row[10] || ''
      });
    }
  }
  return result;
}

function getLanchasMovimientos(idOperacion) {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SS_OPERACIONES_ID'));
  const sh = ss.getSheetByName('Movimientos');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[1]) === String(idOperacion)) {
      result.push({
        id_mov: row[0], id_operacion: row[1], tipo: row[2], id_contacto: row[3],
        nombre_contacto: row[4], cant_pax: row[5], precio_aplicado: row[6],
        monto_total: row[7], adicionales: row[8], operador: row[9],
        timestamp: row[10], estado: row[11], id_contacto_pase: row[12],
        id_agencia_comprada: row[13], monto_comprado: row[14]
      });
    }
  }
  return result;
}

function getLanchasCaja(fecha) {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SS_OPERACIONES_ID'));
  const sh = ss.getSheetByName('Caja_Operador');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  const result = [];
  const fechaBuscar = fecha || Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const fechaTx = Utilities.formatDate(new Date(row[9]), 'America/Lima', 'yyyy-MM-dd');
    if (fechaTx === fechaBuscar) {
      result.push({
        id_transaccion: row[0], id_operacion: row[1], id_contacto: row[2],
        categoria: row[3], monto: row[4], metodo_pago: row[5],
        comentarios: row[6], foto_url: row[7], operador: row[8],
        timestamp: row[9], id_movimiento: row[10]
      });
    }
  }
  return result;
}

// ── Helpers de Hotel ─────────────────────────────────────────
function getHotelHabitaciones() {
  const ssId = PropertiesService.getScriptProperties().getProperty('SS_HOTEL_ID');
  if (!ssId) return [];
  const ss = SpreadsheetApp.openById(ssId);
  const sh = ss.getSheetByName('Habitaciones');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    result.push({ id: row[0], numero: row[1], tipo: row[2], estado: row[3], precio: row[4] });
  }
  return result;
}

function getHotelReservas(fecha) {
  const ssId = PropertiesService.getScriptProperties().getProperty('SS_HOTEL_ID');
  if (!ssId) return [];
  const ss = SpreadsheetApp.openById(ssId);
  const sh = ss.getSheetByName('Reservas');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  const result = [];
  const fechaBuscar = fecha || Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    try {
      const fechaRes = Utilities.formatDate(new Date(row[1]), 'America/Lima', 'yyyy-MM-dd');
      if (fechaRes === fechaBuscar) {
        result.push({ id: row[0], fecha: row[1], huesped: row[2], habitacion: row[3], noches: row[4], total: row[5], estado: row[6] });
      }
    } catch(e) {}
  }
  return result;
}

// ── Config del panel ─────────────────────────────────────────
function guardarConfig(clave, valor) {
  const sh = getOrCreateConfigSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === clave) {
      sh.getRange(i + 1, 2).setValue(valor);
      return { ok: true };
    }
  }
  sh.appendRow([clave, valor, new Date().toISOString()]);
  return { ok: true };
}

function getOrCreateConfigSheet() {
  let sh = SS_PS.getSheetByName('CONFIG_PANEL');
  if (!sh) {
    sh = SS_PS.insertSheet('CONFIG_PANEL');
    sh.appendRow(['clave', 'valor', 'timestamp']);
  }
  return sh;
}
