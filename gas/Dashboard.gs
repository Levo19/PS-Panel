// ============================================================
// PS Panel — Dashboard.gs
// KPIs consolidados: Lanchas + Hotel
// ============================================================

function getDashboardKPIs(fecha) {
  const props = PropertiesService.getScriptProperties();
  const SS_OPS_ID   = props.getProperty('SS_OPERACIONES_ID');
  const SS_HOTEL_ID = props.getProperty('SS_HOTEL_ID');

  const result = {
    fecha,
    lanchas: getLanchasKPIs(SS_OPS_ID, fecha),
    hotel:   getHotelKPIs(SS_HOTEL_ID, fecha)
  };

  // Resumen combinado
  result.total_ingresos = result.lanchas.ingresos_operador + result.hotel.ingresos_total;
  result.total_deudas   = result.lanchas.deuda_comisionados + result.lanchas.pendiente_aliados;

  return result;
}

// ── LANCHAS ─────────────────────────────────────────────────
function getLanchasKPIs(ssId, fecha) {
  const ss = SpreadsheetApp.openById(ssId);

  const shOps = ss.getSheetByName('Operaciones');
  const shMov = ss.getSheetByName('Movimientos');
  const shCaj = ss.getSheetByName('Caja_Operador');
  const shCon = ss.getSheetByName('Contactos');

  // Mapa precio_pax_defecto por id_contacto
  const precioDefecto = {};
  if (shCon) {
    const conData = shCon.getDataRange().getValues();
    // Cols: id_contacto(0), nombre_comercial(1), tipo(2), precio_pax_defecto(3)
    for (let i = 1; i < conData.length; i++) {
      precioDefecto[conData[i][0]] = parseFloat(conData[i][3]) || 0;
    }
  }

  // Operaciones del día
  const opsHoy = [];
  if (shOps) {
    const opsData = shOps.getDataRange().getValues();
    // Cols: id(0), fecha(1), hora_salida(2), id_bote(3), id_capitan(4), id_guia(5), estado(6), ...
    for (let i = 1; i < opsData.length; i++) {
      const fechaOp = Utilities.formatDate(new Date(opsData[i][1]), 'America/Lima', 'yyyy-MM-dd');
      if (fechaOp === fecha) opsHoy.push(opsData[i][0]);
    }
  }

  const opsSet = new Set(opsHoy);

  // Movimientos del día → KPIs
  let paxTotal = 0;
  let ingresos_directo = 0;
  let ingresos_agencia = 0;
  let ingresos_operador = 0; // lo que queda en la empresa
  let deuda_comisionados = 0;
  let pendiente_paseIN = 0;
  let pendiente_aliados = 0;
  let por_tipo = { Directo: 0, Agencia: 0, Comisionado: 0, PaseIN: 0, PaseOUT: 0, Aliado: 0 };

  if (shMov) {
    const movData = shMov.getDataRange().getValues();
    // Cols: id_mov(0), id_operacion(1), tipo_movimiento(2), id_contacto(3), nombreContacto(4),
    //       cant_pax(5), precio_unitario_aplicado(6), monto_total_cobrar(7), adicionales(8),
    //       operador(9), timestamp(10), estado_movimiento(11), Id_contactoPase(12),
    //       id_agencia_comprada(13), monto_comprado(14)
    for (let i = 1; i < movData.length; i++) {
      const row = movData[i];
      if (!opsSet.has(row[1])) continue;
      const estado = row[11];
      if (estado === 'Cancelado') continue;

      const tipo        = row[2];
      const idContacto  = row[3];
      const cantPax     = parseFloat(row[5]) || 0;
      const precioApliq = parseFloat(row[6]) || 0;
      const montoTotal  = parseFloat(row[7]) || 0;
      const montComprado= parseFloat(row[14]) || 0;

      paxTotal += cantPax;
      por_tipo[tipo] = (por_tipo[tipo] || 0) + cantPax;

      if (tipo === 'Directo') {
        ingresos_directo += montoTotal;
        ingresos_operador += montoTotal;
      } else if (tipo === 'Agencia') {
        ingresos_agencia += montoTotal;
        ingresos_operador += montoTotal;
      } else if (tipo === 'Comisionado') {
        // Lo cobrado al cliente
        const cobrado = precioApliq * cantPax;
        // Lo que queda en la empresa (precio defecto × pax)
        const pdComp = precioDefecto[idContacto] || 0;
        const margenEmpresa = pdComp * cantPax;
        const deudaComis = cobrado - margenEmpresa;
        ingresos_operador += margenEmpresa;
        deuda_comisionados += Math.max(0, deudaComis);
      } else if (tipo === 'PaseIN') {
        // Recibimos PAX, debemos PAX (o dinero) de vuelta
        pendiente_paseIN += montoTotal;
      } else if (tipo === 'PaseOUT') {
        // Enviamos PAX, aliado nos debe
        // Si monto_comprado > 0, ya se liquidó parcialmente
        const neto = montoTotal - montComprado;
        pendiente_aliados += Math.max(0, neto);
      } else if (tipo === 'Aliado') {
        // Enviamos PAX con aliado, ellos cobran y nos pagan
        pendiente_aliados += montoTotal;
      }
    }
  }

  // Caja operadores del día
  let caja_efectivo = 0;
  let caja_transferencia = 0;
  if (shCaj) {
    const cajData = shCaj.getDataRange().getValues();
    for (let i = 1; i < cajData.length; i++) {
      const row = cajData[i];
      if (!opsSet.has(row[1])) continue;
      const monto = parseFloat(row[4]) || 0;
      const metodo = String(row[5]).toLowerCase();
      if (metodo.includes('efectivo') || metodo === 'cash') caja_efectivo += monto;
      else caja_transferencia += monto;
    }
  }

  return {
    operaciones_hoy: opsHoy.length,
    pax_total: paxTotal,
    ingresos_directo,
    ingresos_agencia,
    ingresos_operador,
    deuda_comisionados,
    pendiente_paseIN,
    pendiente_aliados,
    caja_efectivo,
    caja_transferencia,
    por_tipo
  };
}

// ── HOTEL ────────────────────────────────────────────────────
function getHotelKPIs(ssId, fecha) {
  if (!ssId) return { ingresos_total: 0, ocupacion_pct: 0, habitaciones_ocupadas: 0, total_habitaciones: 0, ingresos_consumos: 0, ingresos_alojamiento: 0 };

  const ss = SpreadsheetApp.openById(ssId);
  const shHab   = ss.getSheetByName('Habitaciones');
  const shRes   = ss.getSheetByName('Reservas');
  const shCons  = ss.getSheetByName('Consumos');
  const shCaja  = ss.getSheetByName('Caja');

  let total_habitaciones = 0;
  let habitaciones_ocupadas = 0;

  if (shHab) {
    const habData = shHab.getDataRange().getValues();
    for (let i = 1; i < habData.length; i++) {
      total_habitaciones++;
      if (String(habData[i][3]).toLowerCase() === 'ocupada') habitaciones_ocupadas++;
    }
  }

  let ingresos_alojamiento = 0;
  if (shRes) {
    const resData = shRes.getDataRange().getValues();
    for (let i = 1; i < resData.length; i++) {
      const fechaRes = Utilities.formatDate(new Date(resData[i][1]), 'America/Lima', 'yyyy-MM-dd');
      if (fechaRes === fecha) {
        const estado = String(resData[i][6]).toLowerCase();
        if (estado !== 'cancelada') ingresos_alojamiento += parseFloat(resData[i][5]) || 0;
      }
    }
  }

  let ingresos_consumos = 0;
  if (shCons) {
    const consData = shCons.getDataRange().getValues();
    for (let i = 1; i < consData.length; i++) {
      const fechaCons = Utilities.formatDate(new Date(consData[i][1]), 'America/Lima', 'yyyy-MM-dd');
      if (fechaCons === fecha) {
        const estado = String(consData[i][7]).toLowerCase();
        if (estado !== 'cancelado') ingresos_consumos += parseFloat(consData[i][4]) || 0;
      }
    }
  }

  return {
    total_habitaciones,
    habitaciones_ocupadas,
    ocupacion_pct: total_habitaciones > 0 ? Math.round((habitaciones_ocupadas / total_habitaciones) * 100) : 0,
    ingresos_alojamiento,
    ingresos_consumos,
    ingresos_total: ingresos_alojamiento + ingresos_consumos
  };
}

// ── Histórico (últimos 7 días) ───────────────────────────────
function getHistorico7dias() {
  const props = PropertiesService.getScriptProperties();
  const SS_OPS_ID   = props.getProperty('SS_OPERACIONES_ID');
  const SS_HOTEL_ID = props.getProperty('SS_HOTEL_ID');
  const result = [];

  for (let d = 6; d >= 0; d--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    const fecha = Utilities.formatDate(dt, 'America/Lima', 'yyyy-MM-dd');
    const lanchas = getLanchasKPIs(SS_OPS_ID, fecha);
    const hotel   = getHotelKPIs(SS_HOTEL_ID, fecha);
    result.push({
      fecha,
      ingresos_lanchas: lanchas.ingresos_operador,
      ingresos_hotel: hotel.ingresos_total,
      pax: lanchas.pax_total
    });
  }
  return result;
}
