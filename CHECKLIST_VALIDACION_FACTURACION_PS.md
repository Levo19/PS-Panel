# ✅ CHECKLIST DE VALIDACIÓN — Facturación PS (2026-07-03)
Recorremos punto por punto; lo que falle, lo corregimos. Estado demo: NubeFact activo, series **BBB1/FFF1**.
Antes de probar en el navegador: **`git push`** en ambos repos (OperacionesPS `ops-v43`, PS-Panel `1.16.0`).

## A · Emisión desde el MUELLE (OperacionesPS)
- [ ] A1. FAB 🧾 aparece solo si el admin habilitó facturación en muelle.
- [ ] A2. Boleta a "Cliente varios" S/30 → emite, sale PDF, efecto +1, háptica de "emitido".
- [ ] A3. Boleta > S/700 sin documento → el checklist marca ⛔ y el botón se atenúa.
- [ ] A4. Factura: buscar RUC → autocompleta razón social + dirección; emite con PDF.
- [ ] A5. Venta ≥ S/2000 → aparece el selector de medio de pago; sin elegirlo, no deja emitir.
- [ ] A6. Emitir NO cierra el modal (queda listo para el siguiente).
- [ ] A7. Reintento tras error de red no genera doble comprobante (localId estable).

## B · Emisión desde el PANEL PS (admin)
- [ ] B1. Overlay Facturación abre solo para Administrador.
- [ ] B2. Segmento Boleta / Factura / Exportación funciona.
- [ ] B3. Factura exige RUC + razón social + dirección (checklist en vivo).
- [ ] B4. Medio de pago aparece ≥ S/2000.
- [ ] B5. Historial muestra chips 🟢 aceptada / 🟡 pendiente / 🔴 rechazada.

## C · Reglas SUNAT en vivo (motor de reglas)
- [ ] C1. El checklist se actualiza al tipear/cambiar tipo.
- [ ] C2. Botón "Emitir" bloqueado/atenuado si falta un requisito duro.
- [ ] C3. Mensaje de error entendible si SUNAT rechaza.

## D · Exportación 0% (turista extranjero)
- [ ] D1. Modo Exportación exige PASAPORTE (rechaza CE/DNI).
- [ ] D2. Exige paquete de 2+ servicios (bote + guía).
- [ ] D3. Emite factura con IGV 0% y PDF. *(Validado en demo: aceptada por SUNAT.)*
- [ ] D4. Con datos incompletos, emite 18% en vez de 0% (nunca exonera por error).

## E · Lookup RUC/DNI (Edge protegida)
- [ ] E1. 8 dígitos → DNI (RENIEC); 11 → RUC (SUNAT); autocompleta nombre/dirección.
- [ ] E2. CE/pasaporte → entrada manual (sin lookup).
- [ ] E3. La Edge rechaza llamadas sin sesión (solo usuarios logueados).

## F · Historial, estados y anulación
- [ ] F1. Estados 🟢🟡🔴 correctos vs lo que muestra el panel de NubeFact.
- [ ] F2. Reenvío de PDF por WhatsApp/correo.
- [ ] F3. Operador SOLICITA anulación → admin la APRUEBA en el panel.
- [ ] F4. El cron de reconciliación pasa 🟡 pendiente → 🟢 aceptada cuando SUNAT confirma.

## G · Háptica / UX
- [ ] G1. Vibración distinta en emitido vs error vs advertencia.
- [ ] G2. Safe-area iOS (botón y FAB no quedan bajo la barra de gestos).
- [ ] G3. Sonido de "advertencia" ≠ sonido de "error".

## H · IA-Zarpe (digitalizar foto del zarpe) — DEPENDE DE LA KEY
- [ ] H1. **Setear `ANTHROPIC_API_KEY`** (secret) y confirmar deploy de `extraer-zarpe`.
- [ ] H2. Subir foto de un zarpe → devuelve lista de pasajeros (doc + nombre) correcta.
- [ ] H3. Guardar en tabla `zarpe_pax` sin duplicar (reintento).
- [ ] H4. Agrupar B2B (agencia) vs sueltos y emitir. *(⚠️ Falta el modal de captura foto→lista→emitir; data-layer y Edge ya listos.)*

## I · Módulo Tributario + Conciliación (Panel)
- [ ] I1. Pestaña 📊 muestra IGV débito vs crédito, por pagar, saldo a favor, cobertura.
- [ ] I2. "Registrar compra" suma crédito y baja el IGV por pagar.
- [ ] I3. Pestaña ⚖ Conciliación: PAX-zarpe vs comprobantes; marca en rojo los huecos.

## J · Deploy y configuración
- [ ] J1. `git push` OperacionesPS (ops-v43) y PS-Panel (1.16.0).
- [ ] J2. Antes de PRODUCCIÓN: cambiar RUTA/TOKEN a producción + series reales + `admin_alinear_correlativo` + purgar comprobantes demo.
- [ ] J3. Reiniciar correlativo demo si se quiere partir limpio.

## K · Fase 2 (con contador, post-cutover) — NO construido aún
- [ ] K1. Detracción 12% cód. 037 en facturas B2B > S/700 (leyenda SPOT + constancia BN).
- [ ] K2. Líneas inafectas SERNANP/muelle separadas.
- [ ] K3. Notas de crédito/débito.
- [ ] K4. SIRE (registro de ventas/compras electrónico).

---
**Nota:** el núcleo fiscal (boleta/factura/exportación) ya está **validado en vivo contra NubeFact demo** (3 tipos aceptados por SUNAT con PDF). Lo de arriba es para confirmar la experiencia end-to-end en el navegador y afinar.
