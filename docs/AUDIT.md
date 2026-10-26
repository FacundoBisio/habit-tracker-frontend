# Auditoría (2026-10-26)

Alcance: todo el repo (dominio, PWA, API de Atajos, bot, sincronización, seguridad, accesibilidad, rendimiento, pruebas y proceso). Método: lectura del código, búsqueda de patrones de riesgo, pruebas automáticas, Lighthouse móvil y verificación manual en navegador.

## Resultado en números
| Chequeo | Resultado |
|---|---|
| Pruebas unitarias (Vitest) | 136 pasan |
| Pruebas E2E (Playwright, iPhone 14, Chrome) | 23 pasan |
| `eslint` / `tsc --noEmit` / `next build` | limpios |
| Lighthouse móvil (simulación 4× CPU, mediana de 3 corridas) | Rendimiento 80 · Accesibilidad 100 · Buenas prácticas 100 · SEO 100 · CLS 0 · TBT ~340 ms |

## Seguridad

### Corregido en esta auditoría
| # | Hallazgo | Riesgo | Arreglo |
|---|---|---|---|
| 1 | `POST /api/sync` aceptaba registros y vínculos de objetivos que apuntaban a hábitos de **otro usuario** | Un usuario que conociera un UUID ajeno podía colgar datos de ese hábito (y perderlos si el dueño lo borraba, por el borrado en cascada) | Solo se aceptan referencias a hábitos propios; el resto se descarta (`skipped`). Test: `hardening.test.ts` |
| 2 | Cantidades sin tope (`amount`, `targetValue`, `weight`, `defaultAmount`) en sync, Atajos y parser | Valores absurdos que rompen estadísticas y gráficos | Tope `MAX_AMOUNT = 100000` en todos los esquemas Zod |
| 3 | La zona horaria que llegaba por sync no se validaba | Una zona inválida hacía fallar `formatInTimeZone` y **cortaba el cron de recordatorios para todos** | Validación con `Intl.DateTimeFormat`; además cada usuario se procesa aislado (`try/catch`) |
| 4 | El parser de lenguaje natural aceptaba cualquier fecha del LLM | Registros en años absurdos por una alucinación | Se descartan fechas de hace más de un año |
| 5 | Sin cabeceras de seguridad HTTP | Clickjacking, sniffing de MIME | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS |
| 6 | Avisos de logros: una importación podía disparar decenas | Cola de avisos saturada | Más de 2 logros nuevos se resumen en un solo aviso |

### Verificado correcto
- Ningún secreto en el cliente: solo `NEXT_PUBLIC_SUPABASE_URL` y `_ANON_KEY` (públicas por diseño). No se usa la clave `service_role` en ningún lado.
- `user_id` siempre sale de la sesión (JWT validado con Supabase) o del token de API; nunca del cuerpo del pedido.
- Tokens de API: se muestran una vez y se guardan hasheados (SHA-256); revocables; máximo 10 activos.
- Webhook de Telegram con `secret_token` y cron con `CRON_SECRET`, ambos con comparación en tiempo constante.
- Autenticación por `Authorization: Bearer` (no por cookies): sin superficie de CSRF.
- Validación Zod en todas las rutas; las respuestas del LLM se validan y se resuelven contra los hábitos del propio usuario (la inyección de prompt solo puede afectar sus propios datos).
- Un único `dangerouslySetInnerHTML`, con un script estático (tema).
- RLS activa en todas las tablas como defensa en profundidad (`lib/db/rls.sql`).

### Riesgos abiertos
| Riesgo | Severidad | Nota |
|---|---|---|
| Rate limit en memoria por instancia serverless | Media | Es un freno contra ráfagas, no una garantía global. Pasar a una tabla/KV si hay uso real |
| Sin Content-Security-Policy | Media | El script de tema es inline: requiere CSP con nonce. Conviene agregarla antes de abrir la app a terceros |
| `drizzle-repo.ts` y `rls.sql` **no se probaron contra un Postgres real** | Media | Es el mayor punto ciego del proyecto (ver Pruebas) |
| Tokens de API sin vencimiento ni alcance (todo o nada) | Baja | Aceptable para uso personal |
| No hay "desvincular Telegram" ni borrar cuenta | Baja | Agregar antes de tener más usuarios |
| Datos locales (IndexedDB) sin cifrar | Baja | Normal en una PWA; el dispositivo ya está protegido por el sistema |

## Corrección funcional
- **Fechas:** todo "día" se calcula en la zona del usuario; hay tests para las 23:30 de Argentina y los cambios de semana. Sin hallazgos.
- **Sincronización:** el plan de push/pull es puro y está testeado. El motor del cliente (IndexedDB + red) solo se verificó manualmente: hay un riesgo residual en escenarios con dos dispositivos editando a la vez (gana el último push; no hay `updated_at`).
- **Entradas inmutables:** corregir una cantidad borra y recrea registros (así la sincronización solo ve altas y bajas). Probado por E2E.
- **Recordatorios:** se envían solo si el cron cae justo en el minuto configurado. Si se pierde ese minuto, ese día no llega.
- **Nombre del usuario:** vive solo en el dispositivo; en un dispositivo nuevo la bienvenida vuelve a pedirlo.
- **Bug encontrado por la auditoría de Lighthouse:** el reloj del personaje podía retroceder (el tiempo de `requestAnimationFrame` llega a veces antes que `performance.now()`), el parpadeo daba un párpado de altura negativa y Chrome registraba `<rect> height: negative value`. Corregido en tres capas (dt nunca negativo, `blink` con guarda, rangos acotados al dibujar) y con prueba de regresión.
- **Bug encontrado y corregido durante el desarrollo:** `filter`/`transform` persistentes en la transición de página hacían que los popups se posicionaran respecto a la columna y no a la pantalla. Ahora la transición solo anima opacidad/desplazamiento y los popups van en un portal sobre `<body>`.

## Accesibilidad
- Lighthouse 100. Verificado además: foco visible, `prefers-reduced-motion` respetado (animaciones y confeti), objetivos táctiles ≥ 44 px (test E2E), inputs de 16 px (sin zoom en iOS), etiquetas accesibles en todos los controles y en el personaje.
- Pendiente de revisión manual: contraste del verde sobre superficies translúcidas en modo claro con el aura al máximo, y una pasada con VoiceOver en un iPhone real.

## Rendimiento
- Mejora aplicada: el cliente de Supabase (~70 KB) pasó a carga diferida; sin variables configuradas ni se descarga. Rendimiento 69 → 80, TBT 680 → 410 ms, CLS 0.
- Pendiente: el bloque de framework/animación (≈700 ms de scripting con 4× CPU). Opciones: `LazyMotion`, dividir el personaje, y consultas de Dexie acotadas por fecha cuando haya miles de registros.

## Pruebas
- Fuertes: dominio (fechas, rachas, objetivos, logros), parser NL con LLM simulado, API de Atajos, bot completo con Telegram simulado, sincronización (plan puro y handlers), 17 flujos E2E en viewport de iPhone.
- **Huecos:** (1) nada corre contra Postgres real; (2) el motor de sync del cliente no tiene E2E con servidor; (3) sin pruebas visuales de regresión; (4) no probado en un iPhone real ni con Supabase/Telegram/LLM reales; (5) el CI (`ci.yml`) no ejecuta todavía los E2E.

## Proceso
- Las animaciones del personaje se verificaron en Chrome real (entrada, slides, pantalla de nombre, curl, tomar agua, correr, vuelta al reposo a los 10 s, avisos en cola) y con capturas por actividad en claro y oscuro.
- Personaje 3D: el `.glb` entregado se inspeccionó antes de usarlo (sin extensiones, sin texturas, 606 KB, 9.980 triángulos, licencia CC0/MIT). Un test verifica el contrato del modelo (piezas, morphs) para detectar cambios futuros. Riesgo abierto: no se probó en iPhones reales (consumo de batería con WebGL).
- Historial local reescrito para quitar atribuciones de Claude; **falta `git push --force-with-lease origin master`** (lo bloqueó el modo automático; lo corrés vos).
- `npm audit`: una advertencia moderada de `esbuild` vía `drizzle-kit` (solo desarrollo).
