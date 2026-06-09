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

// ── ALIADOS: balance de pases (en PAX) ───────────────────────
// Lee Movimientos (SS_OPERACIONES_ID) y netea pases por aliado.
// Modelo confirmado con operación:
//   · Aliado(PaseIn) / Aliado  → el aliado (col id_contacto) NOS mandó pax → él nos debe (+)
//   · Aliado(PaseOut) con Id_contactoPase → le mandamos pax a ese aliado  → le debemos (−)
//        id_contacto en PaseOut = ORIGEN (solo informativo / etiqueta)
//   · Aliado(PaseOut) sin Id_contactoPase + monto_comprado>0 → venta convertida:
//        NO cuenta en PAX; se anota como dinero pagado al comprador (id_agencia_comprada)
//   · Cancelado → ignora.   CON-00 (Varios) → no es aliado (informativo).
// Params opcionales desde/hasta (yyyy-MM-dd, inclusive). Vacío = todo el histórico.
function getBalanceAliados(desde, hasta) {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SS_OPERACIONES_ID')
  );

  // Mapa contactos: id → nombre
  const nombreContacto = {};
  const tipoContacto   = {};
  const shCon = ss.getSheetByName('Contactos');
  if (shCon) {
    const d = shCon.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const id = String(d[i][0] || '').trim();
      if (id) {
        nombreContacto[id] = String(d[i][1] || id);
        tipoContacto[id]   = String(d[i][2] || '').trim().toLowerCase();  // normaliza 'Agencia ' → 'agencia'
      }
    }
  }
  const esVarios     = id => /^CON-00/i.test(String(id || ''));
  const nombreDe     = id => nombreContacto[String(id || '').trim()] || String(id || '');
  const esAliadoTipo = id => tipoContacto[String(id || '').trim()] === 'aliado';

  // Mapa operación → id_bote (Operaciones col 3) y id_bote → nombre (Embarcaciones col 1)
  const opBote = {}, opCapitan = {};
  const shOps = ss.getSheetByName('Operaciones');
  if (shOps) {
    const d = shOps.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const idOp = String(d[i][0] || '').trim();
      if (idOp) { opBote[idOp] = String(d[i][3] || '').trim(); opCapitan[idOp] = String(d[i][4] || '').trim(); }
    }
  }
  const boteNombre = {};
  const shEmb = ss.getSheetByName('Embarcaciones');
  if (shEmb) {
    const d = shEmb.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const idB = String(d[i][0] || '').trim();
      if (idB) boteNombre[idB] = String(d[i][1] || idB);
    }
  }
  const personalNombre = {};   // Personal: id_empleado(0) | nombre(1)
  const shPer = ss.getSheetByName('Personal');
  if (shPer) {
    const d = shPer.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const idP = String(d[i][0] || '').trim();
      if (idP) personalNombre[idP] = String(d[i][1] || idP);
    }
  }

  const aliados = {};
  const ventas  = [];   // pases convertidos a venta (comprador = agencia) → dinero, NO es aliado
  const alertas = [];   // pases cuyo campo de aliado NO apunta a un contacto tipo 'Aliado'
  function ali(id) {
    const key = String(id).trim();
    if (!aliados[key]) aliados[key] = { id: key, nombre: nombreDe(key), pax_in: 0, pax_out: 0, movimientos: [] };
    return aliados[key];
  }

  const shMov = ss.getSheetByName('Movimientos');
  if (shMov) {
    const m = shMov.getDataRange().getValues();
    for (let i = 1; i < m.length; i++) {
      const row  = m[i];
      const tipo = String(row[2] || '');
      if (tipo.indexOf('Aliado') === -1) continue;                 // solo pases

      const estado = String(row[11] || '').toLowerCase();
      if (estado.indexOf('cancel') !== -1) continue;               // sin cancelados

      let fecha = '', hora = '';
      try {
        const ts = new Date(row[10]);
        fecha = Utilities.formatDate(ts, 'America/Lima', 'yyyy-MM-dd');
        hora  = Utilities.formatDate(ts, 'America/Lima', 'HH:mm');
      } catch(e) {}
      if (desde && fecha && fecha < desde) continue;
      if (hasta && fecha && fecha > hasta) continue;

      const idOp        = String(row[1] || '').trim();
      const embarcacion = boteNombre[opBote[idOp]] || '';
      const capitan     = personalNombre[opCapitan[idOp]] || '';
      const directo     = (!idOp || idOp === 'PASE_DIRECTO');
      const idContacto = String(row[3]  || '').trim();
      const pax        = parseFloat(row[5]) || 0;
      const idPase     = String(row[12] || '').trim();             // col 12 Id_contactoPase
      const idCompra   = String(row[13] || '').trim();             // col 13 id_agencia_comprada
      const montoComp  = parseFloat(row[14]) || 0;                 // col 14 monto_comprado
      const esPaseOut  = tipo.indexOf('PaseOut') !== -1;

      const idMov = String(row[0] || '');
      if (!esPaseOut) {
        // PaseIn → el aliado es id_contacto
        if (esVarios(idContacto) || !idContacto) continue;          // Varios = informativo
        if (!esAliadoTipo(idContacto)) {                            // dato inconsistente → alerta
          alertas.push({ id_mov: idMov, fecha, hora, pase: 'PaseIn', campo: 'id_contacto',
                         id: idContacto, nombre: nombreDe(idContacto),
                         tipo_real: tipoContacto[idContacto] || '(sin tipo)', pax, origen: '' });
          continue;
        }
        const a = ali(idContacto); a.pax_in += pax;
        a.movimientos.push({ fecha, hora, embarcacion, capitan, directo, dir: 'in', pax, origen: '', id_mov: idMov });
      } else if (idPase) {
        // PaseOut → el aliado es Id_contactoPase (col 12); id_contacto es solo el origen
        if (esVarios(idPase)) continue;
        if (!esAliadoTipo(idPase)) {                                // dato inconsistente → alerta
          alertas.push({ id_mov: idMov, fecha, hora, pase: 'PaseOut', campo: 'Id_contactoPase',
                         id: idPase, nombre: nombreDe(idPase),
                         tipo_real: tipoContacto[idPase] || '(sin tipo)', pax, origen: nombreDe(idContacto) });
          continue;
        }
        const a = ali(idPase); a.pax_out += pax;
        a.movimientos.push({ fecha, hora, embarcacion, capitan, directo, dir: 'out', pax, origen: nombreDe(idContacto), id_mov: idMov });
      } else if (montoComp > 0 && idCompra) {
        // venta convertida → dinero a una agencia (comprador). NO es aliado → sección aparte.
        ventas.push({ fecha, hora, pax, monto: montoComp, origen: nombreDe(idContacto),
                      comprador: nombreDe(idCompra), comprador_id: idCompra, id_mov: idMov });
      }
      // PaseOut huérfano (sin destino ni venta) → se ignora
    }
  }

  const lista = Object.keys(aliados).map(k => {
    const a = aliados[k];
    a.neto = a.pax_in - a.pax_out;
    a.movimientos.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
    return a;
  }).filter(a => a.pax_in || a.pax_out)
    .sort((x, y) => Math.abs(y.neto) - Math.abs(x.neto));

  ventas.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
  alertas.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));

  let te_deben = 0, les_debes = 0;
  lista.forEach(a => { if (a.neto > 0) te_deben += a.neto; else if (a.neto < 0) les_debes += -a.neto; });

  return {
    desde: desde || '', hasta: hasta || '',
    aliados: lista,
    ventas: ventas, alertas: alertas,
    ventas_monto: ventas.reduce((s, v) => s + v.monto, 0),
    totales: {
      te_deben, les_debes, neto_global: te_deben - les_debes,
      n_te_deben:  lista.filter(a => a.neto > 0).length,
      n_les_debes: lista.filter(a => a.neto < 0).length,
      n_a_mano:    lista.filter(a => a.neto === 0).length,
      n_alertas:   alertas.length, n_ventas: ventas.length
    }
  };
}

// ── AGENCIAS: cuenta corriente en SOLES ───────────────────────
// Modelo confirmado con operación:
//   ME DEBE  = Σ (monto_total_cobrar + adicionales) de TODO movimiento cuyo
//              id_contacto sea un contacto tipo 'Agencia' (sea Agencia, Aliado(PaseIn)
//              o Aliado(PaseOut) — el origen agencia siempre me debe su grupo)
//              − Σ Cobro (Caja_Operador ligados por id_movimiento; parciales OK)
//   LE DEBO  = Σ monto_comprado donde id_agencia_comprada sea agencia (ventas convertidas)
//              − Σ 'Pago Agencia'
//   Excluye Cancelado, CON-00 (Varios), e id_contacto tipo Comisionado.
function getBalanceAgencias(desde, hasta) {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SS_OPERACIONES_ID')
  );

  const nombreContacto = {}, tipoContacto = {};
  const shCon = ss.getSheetByName('Contactos');
  if (shCon) {
    const d = shCon.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const id = String(d[i][0] || '').trim();
      if (id) { nombreContacto[id] = String(d[i][1] || id); tipoContacto[id] = String(d[i][2] || '').trim().toLowerCase(); }
    }
  }
  const nombreDe  = id => nombreContacto[String(id || '').trim()] || String(id || '');
  const esAgencia = id => tipoContacto[String(id || '').trim()] === 'agencia';

  const opBote = {}, opCapitan = {};
  const shOps = ss.getSheetByName('Operaciones');
  if (shOps) {
    const d = shOps.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) { const idOp = String(d[i][0] || '').trim(); if (idOp) { opBote[idOp] = String(d[i][3] || '').trim(); opCapitan[idOp] = String(d[i][4] || '').trim(); } }
  }
  const boteNombre = {}; const shEmb = ss.getSheetByName('Embarcaciones');
  if (shEmb) { const d = shEmb.getDataRange().getValues(); for (let i = 1; i < d.length; i++) { const idB = String(d[i][0] || '').trim(); if (idB) boteNombre[idB] = String(d[i][1] || idB); } }
  const personalNombre = {}; const shPer = ss.getSheetByName('Personal');
  if (shPer) { const d = shPer.getDataRange().getValues(); for (let i = 1; i < d.length; i++) { const idP = String(d[i][0] || '').trim(); if (idP) personalNombre[idP] = String(d[i][1] || idP); } }

  const parseAdic = s => { if (!s) return 0; return String(s).split(',').reduce((acc, p) => { const v = parseFloat((p.split(':')[1] || '').trim()); return acc + (isNaN(v) ? 0 : v); }, 0); };
  const inRange = f => (!desde || !f || f >= desde) && (!hasta || !f || f <= hasta);

  const ag = {};
  function getAg(id) { const k = String(id).trim(); if (!ag[k]) ag[k] = { id: k, nombre: nombreDe(k), facturado: 0, cobrado: 0, comprado: 0, pagado: 0, _movs: {}, _ventas: {} }; return ag[k]; }
  const movToAg = {};

  const shMov = ss.getSheetByName('Movimientos');
  if (shMov) {
    const m = shMov.getDataRange().getValues();
    for (let i = 1; i < m.length; i++) {
      const row = m[i];
      const estado = String(row[11] || '').toLowerCase(); if (estado.indexOf('cancel') !== -1) continue;
      let fecha = '', hora = '';
      try { const ts = new Date(row[10]); fecha = Utilities.formatDate(ts, 'America/Lima', 'yyyy-MM-dd'); hora = Utilities.formatDate(ts, 'America/Lima', 'HH:mm'); } catch(e) {}
      if (!inRange(fecha)) continue;
      const idMov = String(row[0] || '');
      const idContacto = String(row[3] || '').trim();
      const idOp = String(row[1] || '').trim();
      const pax = parseFloat(row[5]) || 0;
      const cargo = (parseFloat(row[7]) || 0) + parseAdic(row[8]);
      const idCompra = String(row[13] || '').trim();
      const montoComp = parseFloat(row[14]) || 0;

      if (esAgencia(idContacto)) {                       // la agencia (origen) me debe
        const a = getAg(idContacto); a.facturado += cargo;
        a._movs[idMov] = { id_mov: idMov, fecha, hora, pax, monto: cargo, bote: boteNombre[opBote[idOp]] || '', capitan: personalNombre[opCapitan[idOp]] || '', operador: String(row[9] || ''), tipo: String(row[2] || ''), cobros: [], cobrado: 0 };
        movToAg[idMov] = idContacto;
      }
      if (idCompra && montoComp > 0 && esAgencia(idCompra)) {   // venta convertida → le debo a la compradora
        const b = getAg(idCompra); b.comprado += montoComp;
        b._ventas[idMov] = { id_mov: idMov, fecha, hora, pax, monto: montoComp, origen: nombreDe(idContacto), pagos: [], pagado: 0 };
      }
    }
  }

  const shCaj = ss.getSheetByName('Caja_Operador');
  if (shCaj) {
    const d = shCaj.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      const row = d[i];
      const cat = String(row[3] || '');
      const monto = parseFloat(row[4]) || 0;
      const idMov = String(row[10] || '').trim();
      const idCont = String(row[2] || '').trim();
      const oper = String(row[8] || '');
      let fecha = '', hora = '';
      try { const ts = new Date(row[9]); fecha = Utilities.formatDate(ts, 'America/Lima', 'yyyy-MM-dd'); hora = Utilities.formatDate(ts, 'America/Lima', 'HH:mm'); } catch(e) {}
      if (!inRange(fecha)) continue;
      if (cat === 'Cobro' && idMov && movToAg[idMov]) {
        const a = ag[movToAg[idMov]];
        if (a && a._movs[idMov]) { a._movs[idMov].cobros.push({ monto, operador: oper, hora, fecha, metodo: String(row[5] || '') }); a._movs[idMov].cobrado += monto; a.cobrado += monto; }
      } else if (cat === 'Pago Agencia' && esAgencia(idCont)) {
        const b = getAg(idCont); b.pagado += monto;
        if (idMov && b._ventas[idMov]) { b._ventas[idMov].pagos.push({ monto, operador: oper, hora, fecha }); b._ventas[idMov].pagado += monto; }
      }
    }
  }

  const lista = Object.keys(ag).map(k => {
    const a = ag[k];
    a.movimientos = Object.keys(a._movs).map(x => a._movs[x]).sort((p, q) => (p.fecha + p.hora).localeCompare(q.fecha + q.hora));
    a.ventas      = Object.keys(a._ventas).map(x => a._ventas[x]).sort((p, q) => (p.fecha + p.hora).localeCompare(q.fecha + q.hora));
    delete a._movs; delete a._ventas;
    a.te_debe = a.facturado - a.cobrado;
    a.le_debo = a.comprado - a.pagado;
    a.neto = a.te_debe - a.le_debo;
    return a;
  }).filter(a => a.facturado || a.comprado || a.cobrado || a.pagado)
    .sort((x, y) => Math.abs(y.neto) - Math.abs(x.neto));

  let te_deben = 0, le_debo = 0;
  lista.forEach(a => { if (a.te_debe > 0.005) te_deben += a.te_debe; if (a.le_debo > 0.005) le_debo += a.le_debo; });

  return {
    desde: desde || '', hasta: hasta || '',
    agencias: lista,
    totales: {
      te_deben, le_debo, neto_global: te_deben - le_debo,
      facturado_total: lista.reduce((s, a) => s + a.facturado, 0),
      cobrado_total:   lista.reduce((s, a) => s + a.cobrado, 0),
      n_te_deben: lista.filter(a => a.te_debe > 0.005).length,
      n_le_debo:  lista.filter(a => a.le_debo > 0.005).length
    }
  };
}
