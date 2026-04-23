// ============================================================
// PS Panel — Auth.gs
// Gestión de Personal Master: verificación de PIN, CRUD
// ============================================================

const SS_PS = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SS_PS_ID'));

function getPersonalMasterSheet() {
  let sh = SS_PS.getSheetByName('PERSONAL_MASTER');
  if (!sh) {
    sh = SS_PS.insertSheet('PERSONAL_MASTER');
    sh.appendRow(['id', 'nombre', 'rol', 'pin', 'activo', 'foto_url', 'timestamp']);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  return sh;
}

function verificarPin(nombre, pin) {
  const sh = getPersonalMasterSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const [id, nom, rol, storedPin, activo] = data[i];
    if (nom === nombre && String(storedPin) === String(pin) && activo === true) {
      return { ok: true, id, nombre: nom, rol };
    }
  }
  return { ok: false };
}

function listarPersonal() {
  const sh = getPersonalMasterSheet();
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const [id, nombre, rol, , activo, foto_url] = data[i];
    if (activo) result.push({ id, nombre, rol, foto_url: foto_url || '' });
  }
  return result;
}

function crearPersonal(nombre, rol, pin) {
  const sh = getPersonalMasterSheet();
  const id = 'USR_' + Date.now();
  sh.appendRow([id, nombre, rol, pin, true, '', new Date().toISOString()]);
  return { ok: true, id };
}

function actualizarPersonal(id, nombre, rol, pin) {
  const sh = getPersonalMasterSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sh.getRange(i + 1, 2).setValue(nombre);
      sh.getRange(i + 1, 3).setValue(rol);
      if (pin) sh.getRange(i + 1, 4).setValue(pin);
      return { ok: true };
    }
  }
  return { ok: false, error: 'No encontrado' };
}

function eliminarPersonal(id) {
  const sh = getPersonalMasterSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sh.getRange(i + 1, 5).setValue(false);
      return { ok: true };
    }
  }
  return { ok: false, error: 'No encontrado' };
}
