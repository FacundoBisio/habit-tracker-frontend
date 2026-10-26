# Hoja de ruta: features por impacto

Criterio: **impacto** en que la app se use todos los días (activación, retención, confianza) frente al **esfuerzo** (S = horas, M = 1–3 días, L = una semana o más).

## 1. Primero: ponerlo en producción (impacto máximo, esfuerzo S)
Todo lo demás depende de usarlo de verdad unos días.
1. Conectar Supabase, Vercel, Telegram y el LLM siguiendo `docs/SETUP.md` y correr la checklist de humo.
2. Instalar la PWA en el iPhone, armar los Atajos y probar el bot.
3. Usarlo 1–2 semanas y anotar fricciones. Es la mejor fuente de prioridades.

## 2. Impacto alto
| Feature | Por qué | Esfuerzo |
|---|---|---|
| **Meta diaria en hábitos de cantidad** ("8 vasos", "30 min") con progreso parcial del día | Hoy un hábito de cantidad cuenta como "hecho" con cualquier valor; la meta diaria es lo que la gente espera y hace útil el anillo, las rachas y los días perfectos | M |
| **Plantillas en la bienvenida** (agua, gym, leer, meditar, dormir) | La mayor caída en apps de hábitos es la pantalla vacía; con 3 toques ya hay algo que registrar | S |
| **Aviso de "racha en riesgo"** (ej. 20:00 si falta un hábito con racha ≥ 3) | Aprovecha el cron y el bot que ya existen; protege justo lo que más se valora | S |
| **Pruebas de integración contra Postgres real** (Supabase local o contenedor) para `drizzle-repo` y RLS | Es el mayor punto ciego: toda la capa de datos de producción nunca corrió contra una base | M |
| **Sincronizar el nombre y los ajustes** (y `updated_at` para resolver conflictos entre dispositivos) | Evita pedir el nombre en un dispositivo nuevo y cierra el riesgo de pisarse entre dos dispositivos | M |
| **Pausa / vacaciones** que no corta las rachas | Frustración clásica: una gripe borra 60 días de racha | M |

## 3. Impacto medio
| Feature | Por qué | Esfuerzo |
|---|---|---|
| **Notificaciones push en la PWA** (iOS 16.4+ con la app instalada) | Complementa a Telegram sin depender de otra app | M |
| **Resumen semanal dentro de la app** (mejor día, hábito más constante, comparación con la semana anterior) | Convierte los datos en una razón para volver | M |
| **Recordatorio por hábito con horario** ("meditar a las 7:30") | Más fino que un único aviso diario | M |
| **Logros compartibles** (tarjeta-imagen) y más logros por categoría | Refuerza el sistema que ya existe | S–M |
| **Personaje con prendas/accesorios que se desbloquean con logros** | Da un objetivo de largo plazo a los logros y usa el personaje como recompensa | M |
| **Exportación automática** (CSV/JSON a Drive) y "borrar mi cuenta" | Confianza y cumplimiento de privacidad | S |
| **CI con E2E + presupuesto de Lighthouse** | Evita regresiones como la de los popups | S |

## 4. Impacto bajo o con costo desproporcionado
- **Personaje 3D (esfera): integrado.** three.js con carga diferida, modelo de ~600 KB, slime 2D como respaldo (sin WebGL, "menos movimiento", interruptor en Ajustes o si el modelo no carga). Pendiente a futuro: probar en iPhones reales (batería y rendimiento con WebGL), y evaluar `meshopt` para bajar el peso del modelo.
- **Funciones sociales / amigos:** requiere moderación, privacidad y más infraestructura; recién tiene sentido con más de un usuario real.
- **App nativa / widget WidgetKit:** exige Apple Developer (pago). Los Atajos + el widget de Atajos ya cubren el caso.

## 5. Deuda técnica a ir cerrando
1. Content-Security-Policy con nonce y rate limit global (tabla o KV).
2. `LazyMotion` y dividir bloques para bajar el tiempo de bloqueo (Lighthouse 80 → 90+).
3. Consultas de IndexedDB acotadas por fecha cuando haya miles de registros.
4. E2E del motor de sincronización con un servidor simulado.
5. Pruebas visuales de regresión (capturas por pantalla y tema).
6. "Desvincular Telegram" y tokens con vencimiento.

## Cómo seguir (propuesta de fases)
| Fase | Objetivo | Contenido |
|---|---|---|
| **6 — Salir al aire** | Usarlo de verdad | Credenciales, deploy, instalación en iPhone, Atajos, bot, checklist de humo, `git push` del historial limpio |
| **7 — Activación y retención** | Que se quiera volver | Meta diaria en cantidades, plantillas en la bienvenida, aviso de racha en riesgo, pausa/vacaciones |
| **8 — Confianza** | Que no se rompa | Integración contra Postgres real, CSP, CI con E2E, sync de ajustes con `updated_at` |
| **9 — Profundidad** | Que enganche | Resumen semanal, push en la PWA, recordatorios por hábito, accesorios del personaje |
