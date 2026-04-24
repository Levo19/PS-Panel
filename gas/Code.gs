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
        try { data = listarPersonal(); } catch(e) { data = []; }
        break;
      case 'listar_embarcaciones':
        data = listarEmbarcaciones();
        break;
      case 'listar_personal_ops':
        data = listarPersonalOps();
        break;
      case 'listar_contactos_ops':
        data = listarContactosOps();
        break;
      case 'dashboard':
        const fecha = e.parameter.fecha || hoy();
        data = getDashboardKPIs(fecha);
        break;
      case 'historico':
        data = getHistorico7dias();
        break;
      case 'lanchas_fechas':
        data = getLanchasFechas();
        break;
      case 'lanchas_dia':
        data = getLanchasDia(e.parameter.fecha || hoy());
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
      case 'verificar_pin':       data = verificarPin(body.nombre, body.pin); break;
      case 'crear_personal':      data = crearPersonal(body.nombre, body.rol, body.pin); break;
      case 'actualizar_personal': data = actualizarPersonal(body.id, body.nombre, body.rol, body.pin); break;
      case 'eliminar_personal':   data = eliminarPersonal(body.id); break;
      case 'guardar_config':        data = guardarConfig(body.clave, body.valor); break;
      case 'crear_operacion':       data = crearOperacion(body); break;
      case 'actualizar_operacion':  data = actualizarOperacion(body); break;
      case 'anular_operacion':       data = anularOperacion(body.id); break;
      case 'crear_movimiento':       data = crearMovimiento(body); break;
      case 'editar_movimiento':      data = editarMovimiento(body); break;
      case 'cancelar_movimiento':    data = cancelarMovimiento(body.id); break;
      case 'derivar_pase_ps':        data = derivarPasePS(body); break;
      case 'anular_pase_ps':         data = anularPasePS(body); break;
      case 'convertir_pase_compra':  data = convertirPaseCompra(body); break;
      case 'registrar_pago':         data = registrarPago(body); break;
      default: data = { ok: false, error: 'Acción desconocida: ' + accion };
    }
    return jsonResponse({ ok: true, data });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function hoy() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── LANCHAS: lista de fechas con actividad ───────────────────
function getLanchasFechas() {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SS_OPERACIONES_ID')
  );
  const fechasSet = new Set();

  const shOps = ss.getSheetByName('Operaciones');
  if (shOps) {
    const data = shOps.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      try {
        const f = Utilities.formatDate(new Date(data[i][1]), 'America/Lima', 'yyyy-MM-dd');
        fechasSet.add(f);
      } catch(e) {}
    }
  }

  const shMov = ss.getSheetByName('Movimientos');
  if (shMov) {
    const data = shMov.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const idOp = String(data[i][1] || '').trim();
      if (!idOp || idOp === 'PASE_DIRECTO') {
        try {
          const f = Utilities.formatDate(new Date(data[i][10]), 'America/Lima', 'yyyy-MM-dd');
          fechasSet.add(f);
        } catch(e) {}
      }
    }
  }

  return Array.from(fechasSet).sort((a, b) => b.localeCompare(a));
}

// ── LANCHAS: datos completos de un día ───────────────────────
function getLanchasDia(fecha) {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SS_OPERACIONES_ID')
  );

  // Mapa contactos: precio_pax_defecto y nombre_comercial
  // Columnas: id_contacto | nombre_comercial | tipo | precio_pax_defecto
  const precioDefecto  = {};
  const nombreContacto = {};
  const shCon = ss.getSheetByName('Contactos');
  if (shCon) {
    const d = shCon.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const cid = String(d[i][0]);
      precioDefecto[cid]  = parseFloat(d[i][3]) || 0;
      nombreContacto[cid] = String(d[i][1] || '');
    }
  }

  // Mapa nombre botes
  const nombreBote = {};
  const shEmb = ss.getSheetByName('Embarcaciones');
  if (shEmb) {
    const d = shEmb.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) nombreBote[String(d[i][0])] = String(d[i][1] || '');
  }

  // Mapa nombre personal (hoja Personal en SS_OPERACIONES)
  // Columnas: id_empleado | nombre | rol | tarifa_fija | estado
  const nombrePersonal = {};
  const shPers = ss.getSheetByName('Personal');
  if (shPers) {
    const d = shPers.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) nombrePersonal[String(d[i][0])] = String(d[i][1] || '');
  }

  // Operaciones del día
  const ops = {};       // id -> op object
  const opIds = new Set();
  const shOps = ss.getSheetByName('Operaciones');
  if (shOps) {
    const d = shOps.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      try {
        const f = Utilities.formatDate(new Date(d[i][1]), 'America/Lima', 'yyyy-MM-dd');
        if (f !== fecha) continue;
        const id    = String(d[i][0]);
        const idBot = String(d[i][3]);
        const idCap = String(d[i][4]);
        const idGui = String(d[i][5] || '');
        opIds.add(id);
        ops[id] = {
          id, fecha: f, hora_salida: d[i][2],
          id_bote: idBot,    nombre_bote:    nombreBote[idBot]    || idBot,
          id_capitan: idCap, nombre_capitan: nombrePersonal[idCap] || idCap,
          id_guia: idGui,    nombre_guia:    idGui ? (nombrePersonal[idGui] || idGui) : '',
          estado: String(d[i][6] || 'Activa'), creado_por: String(d[i][7] || ''),
          destino: String(d[i][10] || ''),
          movimientos: [], caja: [],
          pax_total: 0, ingresos_operador: 0, deuda_comisionados: 0,
          tipo_chips: {}, caja_sum: 0, mov_sum: 0, descuadre: false
        };
      } catch(e) {}
    }
  }

  // Movimientos: distribuir por operación o pases sueltos
  const pasesSueltos = [];
  const shMov = ss.getSheetByName('Movimientos');
  if (shMov) {
    const d = shMov.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const row = d[i];
      const idOp = String(row[1] || '').trim();
      const estado = String(row[11] || '');
      const tipo = String(row[2] || '');
      const cantPax = parseFloat(row[5]) || 0;
      const precioApliq = parseFloat(row[6]) || 0;
      const montoTotal = parseFloat(row[7]) || 0;
      const montoComprado = parseFloat(row[14]) || 0;
      const idContacto = String(row[3] || '');

      const idPase = String(row[12] || '');
      const mov = {
        id_mov: row[0], id_operacion: idOp, tipo, id_contacto: idContacto,
        nombre_contacto: String(row[4] || ''), cant_pax: cantPax,
        precio_aplicado: precioApliq, monto_total: montoTotal,
        adicionales: row[8], operador: row[9], timestamp: row[10],
        estado, id_contacto_pase: idPase,
        nombre_contacto_pase: idPase ? (nombreContacto[idPase] || idPase) : '',
        id_agencia_comprada: String(row[13] || ''), monto_comprado: montoComprado
      };

      if (idOp && opIds.has(idOp)) {
        // Movimiento vinculado a operación del día
        const op = ops[idOp];
        op.movimientos.push(mov);
        if (estado !== 'Cancelado') {
          op.pax_total += cantPax;
          op.tipo_chips[tipo] = (op.tipo_chips[tipo] || 0) + cantPax;
          if (tipo === 'Directo' || tipo === 'Agencia') {
            op.ingresos_operador += montoTotal;
            op.mov_sum += montoTotal;
          } else if (tipo === 'Comisionado') {
            const pdComp = precioDefecto[idContacto] || 0;
            const margen = pdComp * cantPax;
            const deuda = (precioApliq * cantPax) - margen;
            op.ingresos_operador += margen;
            op.deuda_comisionados += Math.max(0, deuda);
            op.mov_sum += margen;
          }
        }
      } else if (!idOp || idOp === 'PASE_DIRECTO') {
        // Pase suelto — filtrar por fecha del timestamp
        try {
          const f = Utilities.formatDate(new Date(row[10]), 'America/Lima', 'yyyy-MM-dd');
          if (f === fecha) pasesSueltos.push(mov);
        } catch(e) {}
      }
    }
  }

  // Caja operadores
  let cajaEfectivo = 0, cajaTransferencia = 0;
  const cajaSuelta = [];
  const shCaj = ss.getSheetByName('Caja_Operador');
  if (shCaj) {
    const d = shCaj.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const row = d[i];
      const idOp = String(row[1] || '').trim();
      const monto = parseFloat(row[4]) || 0;
      const metodo = String(row[5] || '').toLowerCase();
      const cajEntry = {
        id_transaccion: row[0], id_operacion: idOp, id_contacto: row[2],
        categoria: row[3], monto, metodo_pago: row[5],
        comentarios: row[6], foto_url: row[7], operador: row[8],
        timestamp: row[9], id_movimiento: row[10]
      };
      if (idOp && opIds.has(idOp)) {
        ops[idOp].caja.push(cajEntry);
        ops[idOp].caja_sum += monto;
        if (metodo.includes('efect') || metodo === 'cash') cajaEfectivo += monto;
        else cajaTransferencia += monto;
      } else {
        try {
          const f = Utilities.formatDate(new Date(row[9]), 'America/Lima', 'yyyy-MM-dd');
          if (f === fecha) {
            if (metodo.includes('efect') || metodo === 'cash') cajaEfectivo += monto;
            else cajaTransferencia += monto;
            cajaSuelta.push(cajEntry);
          }
        } catch(e) {}
      }
    }
  }

  // Calcular descuadre y totales del día
  let diaIngresos = 0, diaDeuda = 0, diaPax = 0;
  const operacionesList = Object.values(ops);
  operacionesList.forEach(op => {
    op.descuadre = Math.abs(op.caja_sum - op.mov_sum) > 0.5;
    diaIngresos += op.ingresos_operador;
    diaDeuda += op.deuda_comisionados;
    diaPax += op.pax_total;
  });

  const todasCerradas = operacionesList.every(o =>
    String(o.estado).toLowerCase().includes('cerr') || String(o.estado).toLowerCase().includes('pasad')
  );
  const algunaActiva = operacionesList.some(o =>
    String(o.estado).toLowerCase().includes('activ') || String(o.estado).toLowerCase().includes('abierta')
  );
  const semaforo = operacionesList.length === 0 ? 'gris' :
                   todasCerradas ? 'verde' : algunaActiva ? 'amarillo' : 'gris';

  return {
    operaciones: operacionesList.sort((a, b) => (a.hora_salida || '').localeCompare(b.hora_salida || '')),
    pases_sueltos: pasesSueltos,
    caja_suelta: cajaSuelta,
    kpis: {
      pax_total: diaPax,
      ingresos_operador: diaIngresos,
      deuda_comisionados: diaDeuda,
      caja_efectivo: cajaEfectivo,
      caja_transferencia: cajaTransferencia,
      operaciones_count: operacionesList.length,
      semaforo
    }
  };
}

// ── Hotel ────────────────────────────────────────────────────
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
  const fechaBuscar = fecha || hoy();
  for (let i = 1; i < data.length; i++) {
    try {
      const f = Utilities.formatDate(new Date(data[i][1]), 'America/Lima', 'yyyy-MM-dd');
      if (f === fechaBuscar) {
        const row = data[i];
        result.push({ id: row[0], fecha: row[1], huesped: row[2], habitacion: row[3], noches: row[4], total: row[5], estado: row[6] });
      }
    } catch(e) {}
  }
  return result;
}

// ── Config panel ─────────────────────────────────────────────
function guardarConfig(clave, valor) {
  const sh = getOrCreateConfigSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === clave) { sh.getRange(i + 1, 2).setValue(valor); return { ok: true }; }
  }
  sh.appendRow([clave, valor, new Date().toISOString()]);
  return { ok: true };
}

function getOrCreateConfigSheet() {
  let sh = getSS_PS().getSheetByName('CONFIG_PANEL');
  if (!sh) {
    sh = getSS_PS().insertSheet('CONFIG_PANEL');
    sh.appendRow(['clave', 'valor', 'timestamp']);
  }
  return sh;
}

// ── Catálogos de operaciones ──────────────────────────────────
function getSS_OPS() {
  return SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SS_OPERACIONES_ID')
  );
}

function listarEmbarcaciones() {
  const sh = getSS_OPS().getSheetByName('Embarcaciones');
  if (!sh) return [];
  const d = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < d.length; i++) {
    if (d[i][0]) result.push({ id: String(d[i][0]), nombre: String(d[i][1] || '') });
  }
  return result;
}

function listarPersonalOps() {
  const sh = getSS_OPS().getSheetByName('Personal');
  if (!sh) return [];
  const d = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < d.length; i++) {
    if (!d[i][0]) continue;
    const estado = String(d[i][4] || '').toLowerCase();
    if (estado === 'inactivo' || estado === 'baja') continue;
    result.push({ id: String(d[i][0]), nombre: String(d[i][1] || ''), rol: String(d[i][2] || '') });
  }
  return result;
}

// ── CRUD Operaciones ──────────────────────────────────────────
function crearOperacion(body) {
  const sh = getSS_OPS().getSheetByName('Operaciones');
  if (!sh) throw new Error('Sheet Operaciones no encontrada');
  const id = 'OP-' + Math.floor(100000 + Math.random() * 900000);
  sh.appendRow([
    id,
    new Date(body.fecha),
    body.hora_salida || '',
    body.id_bote || '',
    body.id_capitan || '',
    body.id_guia || '',
    body.estado || 'Abierta',
    body.creado_por || '',
    new Date(),
    body.foto_zarpe_url || '',
    body.destino || ''
  ]);
  return { id };
}

function actualizarOperacion(body) {
  const ss = getSS_OPS();
  const sh = ss.getSheetByName('Operaciones');
  if (!sh) throw new Error('Sheet Operaciones no encontrada');
  const d = sh.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) !== String(body.id)) continue;
    const row = i + 1;
    // Campos editables por todos
    if (body.hora_salida !== undefined) sh.getRange(row, 3).setValue(body.hora_salida);
    if (body.id_capitan  !== undefined) sh.getRange(row, 5).setValue(body.id_capitan);
    if (body.id_guia     !== undefined) sh.getRange(row, 6).setValue(body.id_guia);
    if (body.destino     !== undefined) sh.getRange(row, 11).setValue(body.destino);
    // Campos exclusivos de administrador
    if (body.fecha  !== undefined && body.fecha  !== '') sh.getRange(row, 2).setValue(new Date(body.fecha));
    if (body.estado !== undefined && body.estado !== '') sh.getRange(row, 7).setValue(body.estado);
    SpreadsheetApp.flush();
    return { ok: true };
  }
  throw new Error('Operación no encontrada: ' + body.id);
}

// Anula (Cancelada) solo si no hay pasajeros activos en la operación.
function anularOperacion(id) {
  const ss  = getSS_OPS();
  const shO = ss.getSheetByName('Operaciones');
  const shM = ss.getSheetByName('Movimientos');
  if (!shO) throw new Error('Sheet Operaciones no encontrada');

  // Verificar pasajeros activos
  if (shM) {
    const movs = shM.getDataRange().getValues();
    for (let j = 1; j < movs.length; j++) {
      if (String(movs[j][1]) !== String(id)) continue;
      const est = String(movs[j][11] || '').toLowerCase();
      if (!est.includes('cancelado') && !est.includes('pasado')) {
        return { ok: false, error: 'No se puede anular: hay pasajeros activos a bordo.' };
      }
    }
  }

  const d = shO.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) !== String(id)) continue;
    shO.getRange(i + 1, 7).setValue('Cancelada');
    SpreadsheetApp.flush();
    return { ok: true };
  }
  throw new Error('Operación no encontrada: ' + id);
}

// ── Catálogo Contactos ────────────────────────────────────────
function listarContactosOps() {
  const sh = getSS_OPS().getSheetByName('Contactos');
  if (!sh) return [];
  const d = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < d.length; i++) {
    if (!d[i][0]) continue;
    result.push({
      id:     String(d[i][0]),
      nombre: String(d[i][1] || ''),
      tipo:   String(d[i][2] || ''),
      precio: parseFloat(d[i][3]) || 0
    });
  }
  return result;
}

// ── CRUD Movimientos ──────────────────────────────────────────
// Columnas Movimientos:
// col 1  id_mov            col 2  id_operacion      col 3  tipo_movimiento
// col 4  id_contacto       col 5  nombreContacto    col 6  cant_pax
// col 7  precio_unitario   col 8  monto_total        col 9  adicionales
// col 10 operador          col 11 timestamp          col 12 estado_movimiento
// col 13 Id_contactoPase   col 14 id_agencia_comprada col 15 monto_comprado

function _checkCapacidadOps(ss, id_operacion, exclude_mov_id) {
  const shM = ss.getSheetByName('Movimientos');
  const shO = ss.getSheetByName('Operaciones');
  const shE = ss.getSheetByName('Embarcaciones');
  let ocupados = 0, capacidad = 999, idBote = '';
  if (shO) {
    const d = shO.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][0]) === String(id_operacion)) { idBote = String(d[i][3]); break; }
    }
  }
  if (idBote && shE) {
    const d = shE.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][0]) === idBote) { capacidad = parseInt(d[i][2]) || 999; break; }
    }
  }
  if (shM) {
    const d = shM.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][1]) !== String(id_operacion)) continue;
      if (exclude_mov_id && String(d[i][0]) === String(exclude_mov_id)) continue;
      const est = String(d[i][11] || '').toLowerCase();
      if (!est.includes('cancelado') && !est.includes('pasado')) ocupados += parseInt(d[i][5]) || 0;
    }
  }
  return { ocupados, capacidad };
}

function crearMovimiento(body) {
  const ss  = getSS_OPS();
  const shO = ss.getSheetByName('Operaciones');
  const shM = ss.getSheetByName('Movimientos');
  if (!shM) throw new Error('Sheet Movimientos no encontrada');
  if (shO) {
    const d = shO.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][0]) === String(body.id_operacion)) {
        const est = String(d[i][6] || '');
        if (est !== 'Abierta') return { ok: false, error: 'La operacion no esta Abierta (' + est + ').' };
        break;
      }
    }
  }
  const cap = _checkCapacidadOps(ss, body.id_operacion, null);
  if (cap.ocupados + (parseInt(body.cant_pax) || 0) > cap.capacidad) {
    return { ok: false, error: 'Sin cupos. Quedan ' + (cap.capacidad - cap.ocupados) + '.' };
  }
  const id = 'MOV-' + Date.now().toString().slice(-6);
  shM.appendRow([
    id, body.id_operacion,
    body.tipo || 'Directo',
    body.id_contacto || '',
    body.nombre_contacto || '',
    parseInt(body.cant_pax) || 0,
    parseFloat(body.precio_unitario) || 0,
    parseFloat(body.monto_total) || 0,
    body.adicionales || '',
    body.operador || 'PS',
    new Date(), 'Embarcado', ''
  ]);
  SpreadsheetApp.flush();
  return { ok: true, id };
}

function editarMovimiento(body) {
  const ss  = getSS_OPS();
  const shM = ss.getSheetByName('Movimientos');
  if (!shM) throw new Error('Sheet Movimientos no encontrada');
  const d = shM.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) !== String(body.id_mov)) continue;
    const cap = _checkCapacidadOps(ss, String(d[i][1]), body.id_mov);
    if (cap.ocupados + (parseInt(body.cant_pax) || 0) > cap.capacidad) {
      return { ok: false, error: 'Sin cupos. Quedan ' + (cap.capacidad - cap.ocupados) + '.' };
    }
    const row = i + 1;
    shM.getRange(row, 3).setValue(body.tipo || d[i][2]);
    shM.getRange(row, 4).setValue(body.id_contacto !== undefined ? body.id_contacto : d[i][3]);
    shM.getRange(row, 5).setValue(body.nombre_contacto !== undefined ? body.nombre_contacto : d[i][4]);
    shM.getRange(row, 6).setValue(parseInt(body.cant_pax) || d[i][5]);
    shM.getRange(row, 7).setValue(parseFloat(body.precio_unitario) || d[i][6]);
    shM.getRange(row, 8).setValue(parseFloat(body.monto_total) || d[i][7]);
    const estAct = String(d[i][11] || '');
    if (!estAct.includes('(Editado)')) shM.getRange(row, 12).setValue(estAct + ' (Editado)');
    SpreadsheetApp.flush();
    return { ok: true };
  }
  return { ok: false, error: 'Movimiento no encontrado.' };
}

function cancelarMovimiento(id) {
  const shM = getSS_OPS().getSheetByName('Movimientos');
  if (!shM) throw new Error('Sheet Movimientos no encontrada');
  const d = shM.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) !== String(id)) continue;
    shM.getRange(i + 1, 12).setValue('Cancelado');
    SpreadsheetApp.flush();
    return { ok: true };
  }
  return { ok: false, error: 'Movimiento no encontrado.' };
}

function derivarPasePS(body) {
  const shM = getSS_OPS().getSheetByName('Movimientos');
  if (!shM) throw new Error('Sheet Movimientos no encontrada');
  const d = shM.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) !== String(body.id_mov)) continue;
    const row = i + 1;
    shM.getRange(row, 3).setValue('Aliado(PaseOut)');
    shM.getRange(row, 10).setValue(body.operador || 'PS');
    shM.getRange(row, 11).setValue(new Date());
    shM.getRange(row, 12).setValue('Pasado');
    shM.getRange(row, 13).setValue(body.id_aliado || '');
    SpreadsheetApp.flush();
    return { ok: true };
  }
  return { ok: false, error: 'Movimiento no encontrado.' };
}

function anularPasePS(body) {
  const ss  = getSS_OPS();
  const shM = ss.getSheetByName('Movimientos');
  if (!shM) throw new Error('Sheet Movimientos no encontrada');
  const d = shM.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) !== String(body.id_mov)) continue;
    let tipo = 'Directo';
    const idCon = String(d[i][3] || '');
    if (idCon) {
      const shC = ss.getSheetByName('Contactos');
      if (shC) {
        const cD = shC.getDataRange().getValues();
        for (let j = 1; j < cD.length; j++) {
          if (String(cD[j][0]) === idCon) { tipo = String(cD[j][2] || 'Directo'); break; }
        }
      }
    }
    const row = i + 1;
    shM.getRange(row, 3).setValue(tipo);
    shM.getRange(row, 12).setValue('Embarcado');
    shM.getRange(row, 13).setValue('');
    SpreadsheetApp.flush();
    return { ok: true, tipo };
  }
  return { ok: false, error: 'Movimiento no encontrado.' };
}

function convertirPaseCompra(body) {
  const shM = getSS_OPS().getSheetByName('Movimientos');
  if (!shM) throw new Error('Sheet Movimientos no encontrada');
  const d = shM.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) !== String(body.id_mov)) continue;
    const row = i + 1;
    shM.getRange(row, 13).setValue('');
    shM.getRange(row, 14).setValue(body.id_agencia || '');
    shM.getRange(row, 15).setValue(parseFloat(body.monto) || 0);
    SpreadsheetApp.flush();
    return { ok: true };
  }
  return { ok: false, error: 'Movimiento no encontrado.' };
}

function registrarPago(body) {
  const sh = getSS_OPS().getSheetByName('Caja_Operador');
  if (!sh) throw new Error('Sheet Caja_Operador no encontrada');
  const id = 'TX-' + Date.now().toString().slice(-6);
  sh.appendRow([
    id,
    body.id_operacion  || '',
    body.id_contacto   || '',
    body.categoria     || 'Cobro',
    parseFloat(body.monto) || 0,
    body.metodo_pago   || 'Efectivo',
    body.comentarios   || '',
    '',
    body.operador      || 'PS',
    new Date(),
    body.id_movimiento || ''
  ]);
  SpreadsheetApp.flush();
  return { ok: true, id };
}
