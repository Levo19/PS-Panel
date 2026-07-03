# SUPERPLAN · Facturación Electrónica PS — visión integral
**Fecha:** 2026-07-03 · **Mockups:** `PS/mockups_facturacion.html` (abrir en navegador) · **Spec técnica:** `OperacionesPS/supabase/PLAN_FACTURACION_PS_2026-07.md`
**Pensado como:** senior programador + legal + tributarista + administrador + diseñador + marketero. Revisión 100X de toda la conversación del 2026-07-03.

---

## 0. VISIÓN EN UNA FRASE
Un **solo sistema de facturación** —mismo modelo mental en el **Panel PS (admin)** y el **Muelle (operador)**— que emite CPE correctos por ley, **digitaliza el zarpe con IA**, concilia solo contra SUNAT, y le muestra al dueño **cuánto tributo pagará en tiempo real**. Con la "sensación MOS": rápido, sonoro, con feedback y advertencias en vivo.

## 1. LOS 7 MÓDULOS (todos unificados Panel↔Muelle)
1. **Emitir CPE unificado** — barra de búsqueda inteligente (autodetect DNI/RUC + APIsPeru) + checklist de reglas SUNAT en vivo + Boleta/Factura/Exportación + emitir-en-serie con `+1`.
2. **Jalar zarpe con IA** — foto del zarpe → Claude vision digitaliza pasajeros → revisar → agrupar (B2B vs sueltos) → emitir CPE diferido.
3. **Zarpe digitalizado** — tabla `zarpe_pax` permanente: documento + nombre + empresa|libre + su CPE + estado.
4. **Modo Exportación 0%** — factura al no domiciliado (pasaporte + paquete bote+guía + operador registrado); semáforo de 3 condiciones.
5. **Conciliación zarpe↔CPE** — PAX vs comprobantes vs monto por operación; marca huecos en rojo (defensa fiscalización).
6. **Módulo Tributario (Balance BN)** — IGV débito vs crédito, subir facturas de compra (IA), detracciones BN, retenciones, saldo a favor exportador.
7. **Historial + Ajustes** — estados 🟢🟡🔴, reenvío PDF, anulación con aprobación; conexión NubeFact/series/flags (solo admin).

## 2. CADA MÓDULO — lógica + interfaz

### M1 · Emitir CPE (lógica LISTA en `facturacion_blindaje.sql`)
- **Barra única** (patrón muelle/MOS): escribe nombre o doc → 8=DNI(RENIEC), 11=RUC(SUNAT) vía APIsPeru; CE/pasaporte manual; "Cliente varios" ≤S/700.
- **Checklist en vivo** (motor `_cpeReglas` portado de MOS): factura→RUC+razón+dir · boleta>700→ID · bancarización≥2000→medio de pago · detracción B2B>700 → aviso "12% a tu cuenta BN".
- **Default gravado 18%**. Botón se bloquea si falta requisito duro. Emitir no cierra → `+1`.

### M2 · Jalar zarpe con IA (NUEVO)
- Edge `extraer-zarpe`: imagen (Supabase Storage) → **Claude vision (claude-sonnet-4-6)** → JSON `[{nombre, tipo_doc, numero, nacionalidad}]`. Key en secret del Edge.
- **Trato automático por doc:** DNI→18% · Pasaporte→export 0% (si paquete) · RUC→factura · CE→18%.
- **Agrupación:** ej. 20 de 40 pax = agencia B2B → 1 factura; 20 sueltos → boletas c/u. Selección con checkboxes.
- **Revisión humana obligatoria** antes de emitir (foto/manuscrito puede fallar). Nunca auto-emite a ciegas.
- Reusa `emitir_comprobante` (batch). PII → tabla `clientes` (RLS ON).

### M3 · Zarpe digitalizado (NUEVO — tabla `zarpe_pax`)
- Al jalar un zarpe se persiste: `zarpe(id, id_operacion, foto_url, fecha, pax_total)` + `zarpe_pax(id, id_zarpe, documento, tipo_doc, nombre, empresa|libre, id_comprobante, estado)`.
- Es el **registro legal** y la base de la conciliación (M5) y reimpresión.

### M4 · Modo Exportación 0% (lógica LISTA)
- `p_exportacion`: factura + PASAPORTE(7, rechaza CE/DNI) + paquete 2+ servicios; IGV 0 (afectación 16/40, sunat_transaction 2, tipo op 0205); flag `operador_turistico_registrado=ON`.
- UI = **semáforo de 3 condiciones**; si falta una → emite 18% (nunca 0% por error).
- Bote = transporte turístico acuático (permiso DICAPI) + guía licenciado = paquete válido (Informe SUNAT 123-2012).

### M5 · Conciliación zarpe↔CPE (NUEVO)
- Vista por día/operación: PAX-zarpe vs CPE emitidos vs monto → 🟢 cuadra / 🔴 faltan N + botón "jalar zarpe y emitir pendientes".
- Es la defensa directa ante el cruce de SUNAT (el zarpe prueba cuántos viajaron).

### M6 · Módulo Tributario / Balance BN (NUEVO — como MOS)
- **Débito vs crédito:** IGV de ventas (CPE) − IGV de compras = **IGV por pagar** en vivo.
- **Subir facturas de compra** (foto → IA extrae RUC/base/IGV) → suma crédito fiscal → baja lo que pagas.
- **Cuenta BN detracciones:** acumula lo que las agencias depositaron (tu dinero para impuestos).
- **Retenciones 3%** sufridas (crédito a favor) + **Saldo a Favor Exportador** por ventas 0%.
- Aviso de vencimiento mensual (SIRE). Tablas nuevas: `compras`, `tributos_periodo`.

### M7 · Historial + Ajustes
- Estados 🟢 aceptada (CDR) / 🟡 pendiente (cron reconcilia) / 🔴 rechazada (mensaje entendible + reintento). PDF/XML/CDR/QR guardados (`nf_respuesta`).
- Anulación: operador **solicita**, admin **aprueba**. Ajustes: RUTA/TOKEN NubeFact, series (demo BBB1/FFF1), flag operador, token APIsPeru — solo admin, tokens nunca al navegador.

## 3. SISTEMA UX (la "sensación MOS", unificada)
- **Triple feedback** siempre: visual + sonoro + háptico.
- **Sonoro:** ✓ éxito (tono asc.), ✗ error (grave+shake), tap suave, 🔔 conciliación con hueco.
- **Animaciones:** `+1` al emitir (no cierra), slide-up bottom-sheet, checklist que se pinta en vivo, barra "IA analizando", reveal-pop.
- **Atajos (MOS):** ⌘K búsqueda global, enter=emitir, esc=cerrar, +/− PAX, teclado numérico en docs, doble-tap protegido.
- **Advertencias (puedes/no puedes):** factura sin RUC→bloqueado; boleta>700 sin doc→ámbar; ≥2000 efectivo→bancarización; B2B>700→detracción BN; export sin 3 condiciones→18%.
- **Responsive:** safe-area iOS, bottom-sheet móvil / modal desktop, mismo componente en ambas apps.
- **Marketing/confianza:** "tus libros cuadran solos con el zarpe" · "sabes cuánto IGV pagarás, sin sorpresas" · PDF+QR al WhatsApp al instante.

## 4. MODELO DE DATOS NUEVO (sobre lo ya construido)
- ✅ YA: `comprobantes` (SoT completa: estados, pdf/xml/cdr/qr/hash/barcode, nf_respuesta, export), `series`, `clientes`, `servicios`, `facturacion_config` (+auth_header, +operador_turistico_registrado).
- NUEVO: `zarpe` + `zarpe_pax` (M3) · `compras` (M6, facturas de compra + IGV crédito) · `tributos_periodo` (M6, cierre mensual débito/crédito/detracción/retención/SFE).
- Potenciar `servicios` → catálogo maestro multi-servicio (Ballestas/Reserva/Hotel/+) con `tipo_afectacion` + `categoria`.

## 5. ROADMAP (revisado, con la visión completa)
- **Fase A — Backend blindaje + export** ✅ CONSTRUIDO (`facturacion_blindaje.sql` + 18 tests). Falta: **aplicar a la base**.
- **Fase A-front:** localId estable (B2) + muelle reenvía cliente_dir/es_extranjero (B3).
- **Fase B — UX unificada:** componente único Panel/Muelle: barra búsqueda + motor `_cpeReglas` + segmento Boleta/Factura/Exportación + chips estado + efectos/atajos + iOS. Emitir-desde-movimiento (pre-llenar del zarpe).
- **Fase C — IA:** Edge `extraer-zarpe` (Claude vision) + tabla `zarpe_pax` + agrupación B2B/sueltos + lookup APIsPeru afinado (template + cache + retry).
- **Fase D — Módulo Tributario:** balance débito/crédito + subir compras (IA) + detracciones BN + retenciones + SFE + avisos.
- **Fase E — Validación demo:** token demo, header crudo, BBB1/FFF1, emitir boleta+factura+export, validar afectación 40/tipo op 0205 en NubeFact.
- **Fase F — Cutover producción:** series reales, alinear correlativo, prender `activo`, vigilar 1×1.
- **Confirmar con contador (paralelo):** clasificación detracción tour, tratamiento tasas SERNANP/muelle, códigos exactos catálogo 51, SIRE.

## 6. PRINCIPIOS (para no perder el rumbo)
1. **Correcto por ley primero, bonito después** — cada emisión pasa las validaciones SUNAT server-side.
2. **Un solo correlativo, un solo componente** — Panel y Muelle comparten backend y UI.
3. **La IA asiste, el humano confirma** — nada fiscal se auto-emite sin revisión.
4. **Nada se pierde** — `nf_respuesta` guarda todo; el zarpe queda registrado.
5. **El dueño ve su dinero** — módulo tributario en tiempo real, sin sorpresas.
