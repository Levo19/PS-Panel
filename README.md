# PS Panel

PWA de gestión para PS — Vue 3 (build global, sin bundler) + Google Apps Script + Google Sheets.

Módulos: **Lanchas** (operaciones diarias, manifiesto PAX, caja), **Hotel**, **Finanzas**, **Catálogos** (admin).

## Stack

- Frontend: Vue 3 (`vue.global.prod.js`), monolítico en `index.html`, sin bundler.
- Backend: Apps Script en `gas/` (varios `.gs`).
- Storage: 3 Google Sheets — PS Panel master (auth), Operaciones, Hotel.
- PWA: `sw.js` + `manifest.json`. Update banner por comparación de `version.json` con `APP_VERSION`.

## Estructura

```
PS/
├── index.html         # App completa (Vue 3, todos los componentes)
├── sw.js              # Service Worker (cache + update detection)
├── version.json       # Versión visible al SW para detectar updates
├── manifest.json      # PWA manifest
├── ticket.html        # Vista de ticket imprimible
├── report.html        # Vista de reportes
├── icon-*.png         # Iconos PWA
└── gas/               # Backend Apps Script (NO se sincroniza automático)
    ├── Code.gs        # Router principal (doGet / doPost) + Lanchas CRUD
    ├── Auth.gs        # PIN login + Personal Master (PS sheet)
    ├── Dashboard.gs   # KPIs e histórico
    └── Catalogos.gs   # CRUD de embarcaciones, personal ops, contactos, impuestos
```

## Deploy frontend

Hosting estático cualquiera (GitHub Pages, Netlify, Cloudflare, etc.). No hay build step.

```bash
git push origin master
```

Los usuarios reciben el update automáticamente: el SW detecta cambio de `version.json` y muestra banner "actualización disponible".

### Bump de versión

Cuando hagas cambios al frontend, **bumpa los 3 lugares** a la misma versión:

- `index.html` → `const APP_VERSION = 'X.Y.Z';`
- `sw.js` → `const VERSION = 'X.Y.Z';`
- `version.json` → `{"version":"X.Y.Z","build":"YYYYMMDD<sufijo>"}`

Si no bumpeas, los usuarios siguen usando la versión cacheada.

## Deploy backend (Apps Script)

El repo **no** sincroniza con Apps Script. Cuando cambies cualquier `.gs`:

1. Abrir el proyecto en [script.google.com](https://script.google.com) (el ligado a `SS_OPERACIONES_ID`).
2. Copiar el contenido de cada archivo `gas/*.gs` modificado a su archivo correspondiente en el proyecto. Si es archivo nuevo: **+ → Script** y pegar.
3. **Deploy → Manage deployments → Edit (lápiz) → Version: New version → Deploy**.
4. Si la URL del Web App cambia, actualizarla en el frontend (avatar → Configuración → URL del GAS).

### Script Properties requeridas

En el proyecto Apps Script: **Project Settings → Script Properties**.

| Clave | Valor |
|---|---|
| `SS_PS_ID` | ID del Sheet de PS Panel (PERSONAL_MASTER) |
| `SS_OPERACIONES_ID` | ID del Sheet de Operaciones |
| `SS_HOTEL_ID` | ID del Sheet del hotel-pms |

### Hojas esperadas en `SS_OPERACIONES_ID`

| Hoja | Columnas |
|---|---|
| Operaciones | id, fecha, hora_salida, id_bote, id_capitan, id_guia, estado, creado_por, timestamp_creacion, foto_zarpe_url, Destino |
| Movimientos | id_mov, id_operacion, tipo, id_contacto, nombre_contacto, cant_pax, precio_unitario, monto_total, adicionales, operador, timestamp, estado, id_contacto_pase, id_agencia_comprada, monto_comprado |
| Caja_Operador | (registros de pagos / cobros) |
| Embarcaciones | id_bote, nombre, capacidad_pax, matricula |
| Personal | id_empleado, nombre, rol, tarifa_fija, estado |
| Contactos | id_contacto, nombre_comercial, tipo, precio_pax_defecto |
| Impuestos | idimpuesto, nombre, monto |

## Roles

- `Administrador` / `Supervisor`: acceso a todo, incluido **Catálogos**.
- Otros roles (`Operador`, etc.): no ven Catálogos ni campos admin del modal de operaciones.

## Convenciones

- Vue templates: nada de backticks dentro de `:style` bindings (ya quema una vez).
- Optimistic UI por defecto: snapshot → patch local → cierra modal/toast → API en background → rollback en error.
- Fechas en GAS: usar `_parseFecha(s)` (mediodía local) — `new Date("YYYY-MM-DD")` da medianoche UTC = día anterior en Lima.
- Celda de fecha pura: `setNumberFormat('dd/MM/yyyy')`. Celda de timestamp: `setNumberFormat('dd/MM/yyyy HH:mm:ss')`.
- IDs de catálogos: prefijo + número padded (`BOT-04`, `EMP-16`, `CON-32`, `imp006`). Generador: `_nextIdCat()` en `Catalogos.gs`.
