# Plan de migración — PS Panel → Supabase (transición 100%)

> Objetivo: cerrar la **fuente de verdad partida**. OperacionesPS ya escribe a Supabase;
> el PS Panel todavía lee/escribe operaciones en Sheets (GAS) → ve datos viejos y los
> admins editarían en la hoja. Migramos las lecturas y escrituras de **operaciones** del
> PS a Supabase (las de hotel se quedan en Sheets por ahora).

## 1. Diagnóstico
- **SS_OPERACIONES_ID** (operaciones): ahora vive en Supabase. PS lo lee por GAS → **stale**. ← migrar.
- **SS_PS_ID** (PERSONAL_MASTER, config): auth. Ya parcialmente en Supabase (`app_usuarios`, Empleados/Apps).
- **SS_HOTEL_ID** (hotel): lo llena hotel-pms, NO está en Supabase. PS lo lee por GAS → **OK, no hay doble fuente**. ← NO tocar ahora.

## 2. Inventario de endpoints PS (acción → fuente → destino Supabase → estado)

### Lecturas de OPERACIONES (migrar)
| accion GAS | función | destino Supabase | estado |
|---|---|---|---|
| balance_aliados | getBalanceAliados | `v_balance_aliados` | ✅ vista cuadrada |
| balance_agencias | getBalanceAgencias | `v_balance_agencias` | ✅ vista cuadrada |
| caja_feed | getCajaFeed | `v_caja_items` | ✅ vista cuadrada |
| lanchas_fechas | getLanchasFechas | RPC `get_lanchas_fechas()` | 🔨 construir |
| lanchas_dia | getLanchasDia | RPC `get_lanchas_dia(fecha)` | 🔨 construir (agrega pax/ingresos/descuadre) |
| dashboard (ops) | getLanchasKPIs | RPC `get_kpis_ops(fecha)` | 🔨 construir |
| historico | getHistorico7dias | RPC `get_historico()` | 🔨 construir |
| listar_contactos_ops | listarContactosOps | tabla `contactos` | ✅ |
| listar_embarcaciones(_catalogo) | — | tabla `embarcaciones` | ✅ |
| listar_impuestos | listarImpuestos | tabla `impuestos` | ✅ |
| listar_personal_ops(_catalogo) | — | tabla `personal` | ✅ |

### Escrituras de OPERACIONES (migrar)
| accion GAS | RPC Supabase | estado |
|---|---|---|
| registrar_pago | `registrar_transaccion` | ✅ existe (mapea exacto) |
| anular_operacion | `anular_operacion` | ✅ |
| cancelar_movimiento | `eliminar_movimiento` | ✅ |
| actualizar_adicionales | `actualizar_adicionales` | ✅ |
| derivar_pase_ps | `derivar_pase` | ✅ (verificar semántica PS) |
| anular_pase_ps | `anular_pase` | ✅ (verificar semántica PS) |
| convertir_pase_compra | `convertir_pase_compra` | ✅ |
| crear_operacion | `abrir_operacion` | ✅ |
| actualizar_operacion | `editar_operacion` | ✅ |
| crear_movimiento | `registrar_movimiento` | ✅ |
| editar_movimiento | `editar_movimiento` | ✅ |
| crear/actualizar embarcacion·contacto·impuesto·personal_ops | RPCs catálogo | 🔨 construir |

### Auth / PERSONAL_MASTER (ya casi)
| accion | destino | estado |
|---|---|---|
| verificar_pin | `signInWithPassword` | ✅ (Empleados/Apps); falta el login principal |
| crear/actualizar/eliminar_personal | `admin_set_pin`/`admin_toggle_activo` | ✅ (módulo Empleados) — retirar el CRUD viejo de Config |

### Hotel (NO migrar ahora)
hotel_habitaciones, hotel_reservas, getHotelKPIs → siguen en GAS/Sheets. Dashboard = **híbrido** (ops de Supabase + hotel de GAS).

## 3. Estrategia
- **NO hay dual-write**: OperacionesPS ya escribe solo a Supabase. El cutover de PS es solo **cambiar de dónde lee/escribe** — no hay que sincronizar nada.
- **Flag `USE_SUPABASE_PS`** en el frontend (como el muelle): permite cortar por módulo y revertir.
- **Hotel intacto**: el dashboard mezcla KPIs de ops (Supabase) + hotel (GAS); si Supabase u hotel fallan, el otro no se cae.
- Las tablas de catálogo (contactos/embarcaciones/impuestos/personal) son **las MISMAS** que usa OperacionesPS → editar desde PS es single-source, sin desync. ✅

## 4. Fases (cada una reversible y cuadrada antes de cortar)
- **F1 · Lecturas de operaciones** → Supabase. Construir `get_lanchas_dia`, `get_lanchas_fechas`, `get_kpis_ops`, `get_historico`. **Cuadrar cada una contra el GAS en vivo (0 diferencias)** como hicimos con balances/caja/dashboard. Read-only = bajo riesgo.
- **F2 · Escrituras de operaciones** (lo que el usuario necesita: **pagos**, anular, derivar, convertir, editar). Casi todo con RPCs existentes. Validar con ROLLBACK + cuadre del efecto en las vistas.
- **F3 · Catálogos** (lectura ya; escritura con RPCs nuevos crear/actualizar).
- **F4 · Auth full**: login principal → Supabase; retirar el "Personal Master" viejo de Config (lo reemplaza Empleados).
- **F5 · (aparte) Hotel** → requiere migrar hotel-pms también. Fuera de este alcance.

## 5. Revisión senior — los 20 puntos que NO se pueden pasar
1. **Cuadrar CADA lectura migrada contra GAS (0 diferencias)** antes de cortar — patrón ya probado (balances/caja/dashboard cuadraron 0).
2. **TZ America/Lima** en toda agregación por día (lanchas_dia, historico, KPIs).
3. **`get_lanchas_dia` debe replicar EXACTO**: pax_total, ingresos_operador, deuda_comisionados, caja_sum vs mov_sum, **descuadre** (>S/0.50), tipo_chips, pases sueltos.
4. **RLS**: los writes de PS van como **Administrador** (Patricia) → necesita sesión Supabase (ya está el reauth-PIN en Empleados/Apps; extender al módulo que escriba).
5. **registrar_pago**: la `categoria` ('Cobro' con/sin id_movimiento, 'Pago Agencia', 'Cobro' abono) define cómo lo leen las vistas → validar que un pago escrito desde PS aparezca en `v_balance_agencias` igual que antes (cuadre antes/después).
6. **IDs**: PS y muelle ahora comparten las secuencias de RPC (7 díg, sin choque con históricos 6 díg). OK.
7. **Dashboard híbrido**: si el fetch de hotel (GAS) falla, los KPIs de ops (Supabase) deben mostrarse igual, y viceversa.
8. **Hotel intacto**: no tocar SS_HOTEL_ID; PS sigue leyéndolo por GAS.
9. **Modales de pago optimistas + rollback** (patrón ya en PS).
10. **Fallback**: si Supabase cae, manejar error visible (no pantalla colgada — lección del muelle: timeout en restRpc, no interceptar supabase.co en SW).
11. **Cliente supabase-js con lock passthrough** (ya aplicado en PS) — evita el cuelgue.
12. **Versionado + SW**: bump APP_VERSION/sw/version.json en cada deploy de PS.
13. **`derivar_pase_ps`/`anular_pase_ps`**: comparar la versión PS con los RPCs `derivar_pase`/`anular_pase` — pueden diferir (PS quizá reasigna distinto). Cuadrar caso por caso.
14. **Catálogo compartido**: editar contacto/embarcación desde PS modifica la MISMA tabla que usa el muelle → consistencia inmediata (ventaja), pero validar que no rompa precios/factor.
15. **Migrar lecturas ANTES que escrituras** (read-only primero, 100% reversible).
16. **GAS como fallback** hasta validar cada fase (flag `USE_SUPABASE_PS`).
17. **Concurrencia**: aforo ya con `FOR UPDATE`; edits de PS sobre movimientos no necesitan lock salvo aforo (registrar_movimiento ya lo tiene).
18. **No romper el panel actual**: con el flag en false, PS sigue 100% en GAS (cero cambios percibidos hasta cortar).
19. **Cuadre del `historico` 7 días** y de los **KPIs** (totales de pax, ingresos, ocupación) contra GAS.
20. **Rotar el password de la DB** (pendiente del muelle) antes de ampliar superficie.

## 6. Validación (igual que OperacionesPS)
Por cada endpoint migrado, script node que compara `RPC/vista Supabase` vs `endpoint GAS en vivo` sobre datos reales → **0 diferencias** antes de poner el flag en true.

## 7. Lo que el usuario debe decidir
- **Hotel**: ¿se queda en Sheets por ahora (recomendado, hotel-pms no migrado) o lo metemos también?
- **Arranque**: ¿F1+F2 juntas (lecturas + escrituras de operaciones, que es lo que necesitás para editar pagos) o estrictamente por fases?
