// ============================================================
// PS Panel — Catalogos.gs
// CRUD de tablas maestras: Embarcaciones, Personal Ops,
// Contactos, Impuestos. Todo vive en SS_OPERACIONES_ID.
// ============================================================

// Genera el siguiente ID con prefijo + padding numérico.
// Ej: _nextIdCat(sh, 1, 'BOT-', 2) → 'BOT-04' si el último era 'BOT-03'.
function _nextIdCat(sh, col, prefix, padDigits) {
  const last = sh.getLastRow();
  if (last < 2) return prefix + String(1).padStart(padDigits, '0');
  const d = sh.getRange(2, col, last - 1, 1).getValues();
  let max = 0;
  for (let i = 0; i < d.length; i++) {
    const id = String(d[i][0] || '');
    if (!id.startsWith(prefix)) continue;
    const n = parseInt(id.slice(prefix.length).replace(/\D/g, '')) || 0;
    if (n > max) max = n;
  }
  return prefix + String(max + 1).padStart(padDigits, '0');
}

// ── Embarcaciones (cols: id, nombre, capacidad_pax, matricula) ──
function listarEmbarcacionesCatalogo() {
  const sh = getSS_OPS().getSheetByName('Embarcaciones');
  if (!sh) return [];
  const d = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < d.length; i++) {
    if (!d[i][0]) continue;
    result.push({
      id: String(d[i][0]),
      nombre: String(d[i][1] || ''),
      capacidad_pax: parseInt(d[i][2]) || 0,
      matricula: String(d[i][3] || '')
    });
  }
  return result;
}

function crearEmbarcacion(body) {
  const sh = getSS_OPS().getSheetByName('Embarcaciones');
  if (!sh) throw new Error('Hoja Embarcaciones no encontrada');
  const id = _nextIdCat(sh, 1, 'BOT-', 2);
  sh.appendRow([id, body.nombre || '', parseInt(body.capacidad_pax) || 0, body.matricula || '']);
  return { ok: true, id };
}

function actualizarEmbarcacion(body) {
  const sh = getSS_OPS().getSheetByName('Embarcaciones');
  if (!sh) throw new Error('Hoja Embarcaciones no encontrada');
  const d = sh.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(body.id)) {
      if (body.nombre        !== undefined) sh.getRange(i + 1, 2).setValue(body.nombre);
      if (body.capacidad_pax !== undefined) sh.getRange(i + 1, 3).setValue(parseInt(body.capacidad_pax) || 0);
      if (body.matricula     !== undefined) sh.getRange(i + 1, 4).setValue(body.matricula);
      return { ok: true };
    }
  }
  throw new Error('Embarcación no encontrada: ' + body.id);
}

// ── Personal Ops (cols: id, nombre, rol, tarifa_fija, estado) ──
// Devuelve TODOS los registros (incluye inactivos) para el catálogo.
// La función listarPersonalOps() en Code.gs sigue filtrando activos
// para los selects de operaciones — no la tocamos.
function listarPersonalCatalogo() {
  const sh = getSS_OPS().getSheetByName('Personal');
  if (!sh) return [];
  const d = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < d.length; i++) {
    if (!d[i][0]) continue;
    result.push({
      id:          String(d[i][0]),
      nombre:      String(d[i][1] || ''),
      rol:         String(d[i][2] || ''),
      tarifa_fija: parseFloat(String(d[i][3] || '').replace(',', '.')) || 0,
      estado:      String(d[i][4] || 'activo')
    });
  }
  return result;
}

function crearPersonalOps(body) {
  const sh = getSS_OPS().getSheetByName('Personal');
  if (!sh) throw new Error('Hoja Personal no encontrada');
  const id = _nextIdCat(sh, 1, 'EMP-', 2);
  sh.appendRow([
    id,
    body.nombre || '',
    body.rol || '',
    parseFloat(body.tarifa_fija) || 0,
    body.estado || 'activo'
  ]);
  return { ok: true, id };
}

function actualizarPersonalOps(body) {
  const sh = getSS_OPS().getSheetByName('Personal');
  if (!sh) throw new Error('Hoja Personal no encontrada');
  const d = sh.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(body.id)) {
      if (body.nombre      !== undefined) sh.getRange(i + 1, 2).setValue(body.nombre);
      if (body.rol         !== undefined) sh.getRange(i + 1, 3).setValue(body.rol);
      if (body.tarifa_fija !== undefined) sh.getRange(i + 1, 4).setValue(parseFloat(body.tarifa_fija) || 0);
      if (body.estado      !== undefined) sh.getRange(i + 1, 5).setValue(body.estado);
      return { ok: true };
    }
  }
  throw new Error('Empleado no encontrado: ' + body.id);
}

// ── Contactos (cols: id, nombre, tipo, precio_pax_defecto) ──
// listarContactosOps() ya existe en Code.gs.
function crearContacto(body) {
  const sh = getSS_OPS().getSheetByName('Contactos');
  if (!sh) throw new Error('Hoja Contactos no encontrada');
  const id = _nextIdCat(sh, 1, 'CON-', 2);
  sh.appendRow([
    id,
    body.nombre || '',
    body.tipo || 'Libre',
    parseFloat(body.precio) || 0
  ]);
  return { ok: true, id };
}

function actualizarContacto(body) {
  const sh = getSS_OPS().getSheetByName('Contactos');
  if (!sh) throw new Error('Hoja Contactos no encontrada');
  const d = sh.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(body.id)) {
      if (body.nombre !== undefined) sh.getRange(i + 1, 2).setValue(body.nombre);
      if (body.tipo   !== undefined) sh.getRange(i + 1, 3).setValue(body.tipo);
      if (body.precio !== undefined) sh.getRange(i + 1, 4).setValue(parseFloat(body.precio) || 0);
      return { ok: true };
    }
  }
  throw new Error('Contacto no encontrado: ' + body.id);
}

// ── Impuestos (cols: idimpuesto, nombre, monto) ──
// listarImpuestos() ya existe en Code.gs.
function crearImpuesto(body) {
  const sh = getSS_OPS().getSheetByName('Impuestos');
  if (!sh) throw new Error('Hoja Impuestos no encontrada');
  const id = _nextIdCat(sh, 1, 'imp', 3);
  sh.appendRow([id, body.nombre || '', parseFloat(body.monto) || 0]);
  return { ok: true, id };
}

function actualizarImpuesto(body) {
  const sh = getSS_OPS().getSheetByName('Impuestos');
  if (!sh) throw new Error('Hoja Impuestos no encontrada');
  const d = sh.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(body.id)) {
      if (body.nombre !== undefined) sh.getRange(i + 1, 2).setValue(body.nombre);
      if (body.monto  !== undefined) sh.getRange(i + 1, 3).setValue(parseFloat(body.monto) || 0);
      return { ok: true };
    }
  }
  throw new Error('Impuesto no encontrado: ' + body.id);
}
