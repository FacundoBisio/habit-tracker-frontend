# Brief: mascota 3D para SuperHábitos

Documento para pasarle a una herramienta o artista 3D. Pide un personaje **esfera 3D** con cara, brazos y accesorios, listo para una app web móvil. El entregable es un `.zip` que se integra directamente en el proyecto.

---

## 0. Prompt corto (para pegar si la herramienta solo acepta texto)

> A cute 3D character that is a perfect glossy **sphere / ball** (a round jelly-like orb) in vibrant emerald green, with big expressive white eyes with black pupils and small white highlights, tiny eyebrows, a small expressive mouth, soft white cheeks, and two small rounded stub arms (mitten-like hands, no fingers, same green as the body). Clean kawaii style, smooth surfaces, subtle specular highlight and soft rim light, no noise texture, flat-bottom contact with the ground (slight squash where it touches). Low/mid poly for mobile web (under 10k triangles). Export as glTF 2.0 (.glb), Y-up, origin at the bottom-centre of the sphere, 1 unit = height of the sphere. Separate named meshes for body, eyes, pupils, eyelids, eyebrows, mouth, cheeks, arms and hands, plus props: dumbbell, glass of water, open book. Rigged with a minimal skeleton and morph targets (blink, smile, open mouth, brow angry/raised, bicep flex). Animations in place (no root motion), 30 fps, looping where marked.

---

## 1. Contexto
- App móvil/PWA de hábitos (iPhone y escritorio). El personaje se ve **chico** (≈140 px de ancho) y a **60 fps**; también aparece grande (≈230 px) en la pantalla de bienvenida.
- Paleta de toda la app: **blanco, negro y verde**. El personaje es verde (`#1fa971` base; luz `#7fe3b8`; sombra `#0f6b45`). Ojos blancos y pupilas negras. Sin otros colores (salvo un posible rosa muy tenue en mejillas, preferible blanco translúcido).
- Se usa sobre fondo claro (casi blanco) y oscuro (casi negro): debe verse bien en ambos.
- Hoy existe una versión 2D de un cuerpo de gelatina; la 3D la reemplaza y la 2D queda de respaldo.

## 2. El personaje
- **Forma:** esfera perfecta / orbe redondo, con aspecto de gelatina o goma pulida. Apoyada en el piso con una pequeña zona achatada de contacto. Se puede aplastar y estirar (squash & stretch) conservando el volumen.
- **Material:** brillante y limpio, sin texturas con ruido. Reflejo especular suave, borde de luz (rim). Si usan transparencia, que sea opcional: preferible un material opaco o semitranslúcido barato (para móvil). Máximo 2 materiales para el cuerpo.
- **Cara (expresiva):** ojos grandes (blancos) con pupilas negras y un brillo blanco pequeño; párpados que cierran; cejas finas negras; boca pequeña que puede sonreír, abrirse, hacer una "o" y apretar los dientes; mejillas blancas translúcidas.
- **Brazos:** dos bracitos redondeados tipo muñón con manopla (sin dedos), del mismo verde. **Se pueden "esconder" dentro del cuerpo** (escala 0) cuando no se usan.
- **Brazo musculoso:** el brazo derecho debe poder **inflar el bíceps** (morph `bicepFlex`): un bulto redondo en el brazo, con brillo, que crece al levantar la mancuerna.
- **Sin piernas ni pies:** el personaje se mueve rebotando como una pelota.

## 3. Estructura y nombres (obligatorios)
Origen en el **centro inferior** de la esfera (punto de apoyo). Eje **Y arriba**, **+Z hacia adelante** (hacia la cámara). Altura de la esfera en reposo = `1.0` unidad.

```
Root
├─ Body                (esfera principal, con el bone/morph de squash y stretch)
├─ Face
│  ├─ Eye_L / Eye_R            (esclerótica blanca)
│  ├─ Pupil_L / Pupil_R        (negras, con highlight como submesh Pupil_Hi_L/R)
│  ├─ Eyelid_L / Eyelid_R      (cierran el ojo)
│  ├─ Brow_L / Brow_R
│  ├─ Mouth
│  └─ Cheek_L / Cheek_R
├─ Arm_L (Upper, Fore, Hand)
├─ Arm_R (Upper, Fore, Hand, Bicep)   ← el que hace el curl y se infla
├─ Prop_Dumbbell       (mancuerna negra con discos; se agarra con Arm_R/Hand)
├─ Prop_Glass          (vaso transparente + Prop_Water que baja de nivel)
├─ Prop_Book           (libro abierto con 2 páginas; Prop_BookPage se da vuelta)
└─ FX (opcional)       (gota de sudor, estrellitas, "z", notas musicales: pueden ser planos con textura)
```

Cada pieza debe ser un **objeto/malla separado con ese nombre exacto** (los usa el código para mostrar, ocultar y mover cosas).

## 4. Rig y animaciones

### 4.1 Mínimo viable (Nivel B) — aceptable si la herramienta no puede animar
Solo el **GLB estático** con las piezas separadas y los nombres de arriba (pose neutra, brazos extendidos a los costados, boca sonriendo). **Yo me encargo de animar por código** (rebote, squash/stretch, tembleque de gelatina, parpadeo, mirada, brazos, props). Es la opción más liviana y la que mejor se integra con lo ya construido.

### 4.2 Ideal (Nivel A) — rig y clips
- **Esqueleto mínimo:** `root`, `body` (squash/stretch), `arm_L` y `arm_R` (hombro → codo → mano), `eye_L`/`eye_R` (para mirar), `brow_L`/`brow_R`.
- **Morph targets (blendshapes), valores 0–1:** `blink_L`, `blink_R`, `smile`, `mouthOpen`, `mouthO`, `browAngry`, `browRaise`, `squash`, `stretch`, `bicepFlex`, `cheeksPuff`.
- **Clips** (nombres exactos, 30 fps, **en el lugar**, sin desplazamiento del root):

| Clip | Duración | Loop | Qué hace (movimiento realista, con peso y anticipación) |
|---|---|---|---|
| `idle` | 3 s | sí | Respira (squash sutil), se balancea, parpadea, mira alrededor; un saltito cada ~7 s |
| `wave` | 1.6 s | sí | Saluda con el brazo derecho, leve inclinación |
| `lift` | 3.4 s | sí | **Un solo brazo musculoso (derecho) levanta una mancuerna (curl):** anticipación (se agacha apenas), el antebrazo sube con el codo fijo cerca del cuerpo, el **bíceps se infla** (`bicepFlex`), cara de esfuerzo (cejas fruncidas, ojos entrecerrados, dientes apretados), sostén con temblor, baja lento. El brazo izquierdo queda escondido |
| `drink` | 4.4 s | sí | Lleva un vaso a la boca, inclina el cuerpo hacia atrás, el agua baja, traga (pulso de squash) y baja con un "ahh" |
| `read` | 3.4 s | sí | Sostiene un libro abierto con ambas manos, los ojos recorren las líneas, da vuelta una página |
| `meditate` | 4 s | sí | Se achata levemente (sentado), ojos cerrados, respiración profunda, levita apenas |
| `run` | 0.42 s | sí | Corre a saltitos: se estira al despegar, se aplasta al caer, inclinado hacia adelante, brazos oscilando |
| `sleep` | 4 s | sí | Achatado e inclinado, ojos cerrados, boca entreabierta, respiración lenta (con globito de moco opcional) |
| `dance` | 1.9 s | sí | Rebota al ritmo, se inclina de lado a lado, brazos arriba alternados |
| `celebrate` | 2.6 s | sí | Se agacha, salta estirado con los brazos arriba, aterriza aplastado con rebote de gelatina, festeja |
| `poke` | 0.5 s | no | "Boing": pequeño rebote cuando lo tocan |

Principios: anticipación antes de cada movimiento, squash & stretch con volumen constante, rebote amortiguado al aterrizar, movimiento secundario (los brazos siguen con retraso), nada rígido.

## 5. Requisitos técnicos
- **Formato:** glTF 2.0 binario (`.glb`), **un solo archivo** `mascot.glb` con todo (mallas, rig, morphs, animaciones, materiales).
- **Compresión:** si pueden, **Meshopt** o **Draco** (la app los soporta).
- **Peso:** objetivo **≤ 1 MB** (máximo 2 MB). Texturas ≤ 1024×1024 (idealmente ≤ 512), formato PNG/JPG o KTX2.
- **Polígonos:** ≤ 10.000 triángulos en total (ideal 4.000–8.000). El cuerpo con una esfera suave (no facetada).
- **Escala/ejes:** Y arriba, +Z adelante, metros, altura de la esfera = 1.0, origen en el punto de apoyo.
- **Sin** luces, cámaras ni suelo embebidos. Materiales PBR estándar (`metallicRoughness`); evitar extensiones raras. `KHR_materials_transmission` solo si es imprescindible.
- Normales suaves en el cuerpo, sin UV con costuras visibles.
- Animaciones a 30 fps, **en el lugar**, con los nombres de la tabla.
- Debe verse bien con una luz direccional + ambiente simple (así lo voy a renderizar).

## 6. Entrega (el `.zip`)
```
mascot-3d.zip
├─ mascot.glb               ← obligatorio
├─ preview.png              ← render 1024×1024 sobre fondo blanco y otro sobre negro (opcional pero muy útil)
├─ turntable.mp4/.gif       ← giro de 360° (opcional)
├─ source/                  ← .blend / .fbx originales (opcional)
├─ textures/                ← si no están embebidas
└─ LICENSE.txt              ← licencia: debe permitir uso comercial y redistribución dentro de una app web
```
Si la herramienta entrega varios archivos sueltos (`body.glb`, `arm.glb`…), está bien: mantener los nombres de la sección 3 y aclarar el punto de pivote de cada uno.

## 7. Checklist de aceptación (lo que voy a verificar)
- [ ] `mascot.glb` abre en un visor glTF estándar y pesa ≤ 2 MB.
- [ ] Nombres de piezas exactamente como en la sección 3.
- [ ] Origen en la base; Y arriba; altura 1.0.
- [ ] La esfera se ve bien con luz simple, sobre fondo blanco y negro.
- [ ] (Nivel A) los 11 clips existen, con esos nombres, en el lugar y con loop donde corresponde.
- [ ] (Nivel A) los morphs de la sección 4.2 existen, en especial `bicepFlex`, `blink_L/R`, `smile`, `mouthOpen`.
- [ ] Props separados y ocultables (`Prop_Dumbbell`, `Prop_Glass`, `Prop_Book`).
- [ ] Sin texturas ruidosas ni colores fuera de la paleta (blanco, negro, verde).

## 8. Cómo lo voy a integrar (para que sepan el destino)
- Carga **diferida** (no entra en el paquete inicial) con three.js / `@react-three/fiber`, solo en las pantallas donde aparece el personaje.
- **Respaldo:** si el dispositivo no tiene WebGL, el usuario pidió "menos movimiento" o el modelo no cargó, se usa la versión 2D actual.
- Animación por clips (Nivel A) o procedural (Nivel B); en ambos casos conservo las mismas actividades que la app ya usa: reposo, saludar, gimnasio, tomar agua, leer, meditar, correr, dormir, bailar, festejar.
- Pausa automática fuera de pantalla y en segundo plano, para cuidar la batería.

## 9. Mensaje de vuelta
Al devolver el `.zip`, indicar: qué nivel entregaron (A o B), los nombres de los clips y morphs reales si difieren de los pedidos, y la licencia. Con eso lo conecto sin tocar el resto de la app.
