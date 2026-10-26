# Registro rápido en iOS con Atajos

> Los nombres de las acciones corresponden a la app **Atajos** de iOS en español. Esta guía no pudo probarse en un iPhone real durante el desarrollo: si algún nombre de acción cambia en tu versión de iOS, buscá la equivalente con el buscador de acciones.

## 0. Antes de empezar
1. Abrí la PWA → **Ajustes → Cuenta** e iniciá sesión (código por email).
2. En **Atajos de iOS** creá un token llamado `iPhone Atajos`. **Se muestra una sola vez**: tocá **Token** para copiarlo y **URL base** para copiar la dirección de tu app (por ejemplo `https://tu-app.vercel.app`).
3. En cada Atajo vas a usar:
   - **URL base**: la de tu app.
   - **Token**: el copiado (va en el encabezado `Authorization: Bearer <token>`).

> Tip: en el primer paso de cada Atajo agregá una acción **Texto** con tu URL base y otra con tu token, y usalas como variables (`URLBase`, `Token`). Así los cambiás en un solo lugar.

## API (referencia)
Todas las rutas requieren `Authorization: Bearer <token>`. Agregá `?format=text` para recibir texto plano (ideal para **Mostrar resultado**).

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/quick/habits` | — | Lista de hábitos (JSON o un nombre por línea con `?format=text`). |
| `POST /api/quick/log` | `{ "habit": "Agua", "amount": 1, "date": "2026-03-10", "note": "…", "client_id": "uuid" }` | `✅ Agua +1 vaso · hoy 5 vasos · Agua marzo 62%` |
| `POST /api/quick/ingest` | `{ "text": "agua 3 y gym", "confirm": false }` | Con `confirm:false` dice qué entendió; con `true` registra. |

`habit` acepta id, nombre o alias. `amount`, `date`, `note` y `client_id` son opcionales. Con el mismo `client_id` un reintento **no duplica** el registro. Límite: 60 pedidos por minuto por token.

## 1. Atajo por hábito: «Agua +1» (para el widget)
1. **Atajos → + (nuevo atajo)** → nombralo `Agua +1`.
2. Acción **Obtener contenido de URL**:
   - URL: `URLBase` + `/api/quick/log?format=text`
   - Método: **POST**
   - Encabezados: `Authorization` = `Bearer ` + `Token`
   - Cuerpo de la solicitud: **JSON** → agregá campo **Texto** `habit` = `Agua` y campo **Número** `amount` = `1`.
3. Acción **Mostrar notificación** con el resultado de la acción anterior (o **Mostrar resultado**).
4. Tocá el ícono de ajustes del Atajo y elegí un ícono/color. Repetí para cada hábito que quieras (`Gym`, `Leer +20`, …).

## 2. «Registrar hábito» (elegir de una lista)
1. **Obtener contenido de URL**: `URLBase` + `/api/quick/habits?format=text`, método GET, encabezado `Authorization`.
2. **Dividir texto** (resultado anterior) por **Nuevas líneas**.
3. **Elegir de la lista** (la lista dividida) → variable `Hábito`.
4. **Pedir entrada** (tipo **Número**, mensaje «¿Cuánto?», valor predeterminado `1`) → variable `Cantidad`. Si el hábito es de sí/no, podés ignorar la cantidad: el servidor la usa solo en hábitos de cantidad.
5. **Obtener contenido de URL**: `POST` a `URLBase/api/quick/log?format=text`, encabezado `Authorization`, cuerpo JSON `habit` = `Hábito`, `amount` = `Cantidad`.
6. **Mostrar resultado**.

## 3. «Contale a mi tracker» (Siri + lenguaje natural)
1. **Dictar texto** (idioma Español (Argentina)) → resultado `Dictado`.
2. **Obtener contenido de URL**: `POST` a `URLBase/api/quick/ingest?format=text`, cuerpo JSON `text` = `Dictado`, `confirm` = **Booleano** `No`.
3. **Mostrar alerta**: título «¿Registro esto?», mensaje = resultado de la acción anterior (muestra «Entendí: …»). Dejá los botones **Cancelar** / **OK**; si cancelás el Atajo se detiene.
4. **Obtener contenido de URL**: igual que el paso 2 pero con `confirm` = `Sí`. Para que un reintento no duplique, agregá antes una acción **Número aleatorio** o usá **Fecha actual** y pasá un `client_id` UUID (opcional: sin `client_id` el servidor usa el texto + el día).
5. **Mostrar resultado**.
6. Nombre del Atajo: **Contale a mi tracker**. Decí «Oye Siri, contale a mi tracker».

## 4. Dónde ponerlos
- **Pantalla de inicio**: abrí el Atajo → botón de compartir → **Agregar a pantalla de inicio**.
- **Widget de Atajos**: mantené presionada la pantalla de inicio → **+** → **Atajos** → elegí el tamaño → mantené presionado el widget → **Editar widget** y elegí tus Atajos (por ejemplo los de `+1`). Un toque registra sin abrir nada.
- **Siri**: el nombre del Atajo es la frase de voz.
- **Widget de Chats de Telegram**: da acceso a un toque al bot (ver `docs/TELEGRAM.md`).

## Alternativa sin Atajos: deep link
Abrir `https://tu-app/log/<habitId>` abre la PWA y registra con una pantalla de confirmación (usa los datos de ese dispositivo).

## Problemas frecuentes
- **401 Token inválido**: el token se copió mal o fue revocado; creá uno nuevo.
- **404 No encontré el hábito**: revisá el nombre/alias exacto en Ajustes → Hábitos.
- **409 coincide con varios**: usá el nombre completo o agregá un alias único.
- **429**: demasiados pedidos; esperá unos segundos.
