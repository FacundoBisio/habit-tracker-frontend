import { expect, test, type Page } from "@playwright/test";

async function createHabit(page: Page, opts: { name: string; icon?: string; quantity?: { unit: string; perTap: string } }) {
  await page.getByRole("button", { name: /Crear hábito|Nuevo hábito/ }).first().click();
  await page.getByLabel("Nombre").fill(opts.name);
  if (opts.icon) await page.getByRole("radio", { name: opts.icon }).click();
  if (opts.quantity) {
    await page.getByRole("radio", { name: "Cantidad" }).click();
    await page.getByLabel("Unidad").fill(opts.quantity.unit);
    await page.getByLabel("Por toque").fill(opts.quantity.perTap);
  }
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

const habitRow = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}[.,]`) });
const addTo = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^Sumar .* a ${name}$`) }).click();
const subFrom = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^Restar .* a ${name}$`) }).click();
const dayProgress = (page: Page) => page.getByRole("progressbar");

const NAME = "Facu";
const greeting = (page: Page) => page.getByRole("heading", { level: 1 });

const nameInput = (page: Page) => page.getByLabel("¿Cómo te llamo?");

async function freshDb(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("habit-tracker");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
    sessionStorage.removeItem("intro-done"); // vuelve a aparecer la presentación
  });
  await page.reload();
}

/** Pasa la presentación con pantallazos (si aparece) y deja la pantalla de nombre a la vista. */
async function skipIntro(page: Page) {
  const skip = page.getByRole("button", { name: "Saltar" });
  await skip.or(nameInput(page)).first().waitFor();
  if (await skip.isVisible()) await skip.click();
  await expect(nameInput(page)).toBeVisible();
}

async function completeWelcome(page: Page, name = NAME) {
  await skipIntro(page);
  await nameInput(page).fill(name);
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(greeting(page)).toHaveText(`Hola, ${name}`);
}

test.beforeEach(async ({ page }) => {
  // El splash de arranque (1 vez por sesión) se desactiva salvo en los tests que lo verifican ("splash-test").
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("splash-test")) sessionStorage.setItem("splash-shown", "1");
    // Por defecto el personaje es la bola verde (más liviano y estable en las pruebas); los tests del 3D lo activan.
    if (!localStorage.getItem("mascot-mode")) localStorage.setItem("mascot-mode", "2d");
  });
  // Cada test arranca con una base limpia y la bienvenida ya completada.
  await freshDb(page);
  await completeWelcome(page);
});

test("registrar un hábito, ver el progreso del día y deshacer", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Empezá con tu primer hábito" })).toBeVisible();
  await createHabit(page, { name: "Meditar" });

  await expect(dayProgress(page)).toHaveAttribute("aria-valuenow", "0");
  await habitRow(page, "Meditar").click();
  await expect(dayProgress(page)).toHaveAttribute("aria-valuenow", "1");
  // El aviso con "Deshacer" espera su turno en la cola (puede salir antes "Hábito creado").
  const undo = page.getByRole("button", { name: "Deshacer" });
  await expect(undo).toBeVisible({ timeout: 15_000 });
  await undo.click();
  await expect(dayProgress(page)).toHaveAttribute("aria-valuenow", "0");
});

test("cada registro suma al objetivo vinculado, lo completa y se reabre al deshacer", async ({ page }) => {
  await createHabit(page, { name: "Agua", quantity: { unit: "vasos", perTap: "2" } });

  await page.getByRole("link", { name: "Objetivos" }).click();
  await page.getByRole("button", { name: /Crear objetivo|Nuevo objetivo/ }).first().click();
  await page.getByLabel("Título").fill("Tomar 4 vasos");
  await page.getByRole("button", { name: /Suma total/ }).click();
  await page.getByLabel("Meta").fill("4");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Agua/ }).click();
  await dialog.getByRole("button", { name: "Crear objetivo" }).click();
  await expect(page.getByText("Tomar 4 vasos")).toBeVisible();

  const goalBar = () => page.getByRole("progressbar").first();
  await expect(goalBar()).toHaveAttribute("aria-valuenow", "0");

  await page.getByRole("link", { name: "Hoy" }).click();
  await addTo(page, "Agua");
  await page.getByRole("link", { name: "Objetivos" }).click();
  await expect(goalBar()).toHaveAttribute("aria-valuenow", "50");

  await page.getByRole("link", { name: "Hoy" }).click();
  await addTo(page, "Agua");
  await expect(page.getByText("Objetivo completo: Tomar 4 vasos")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Objetivos" }).click();
  await expect(goalBar()).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByText("¡Completado!")).toBeVisible();

  // Desmarcar el día desde la grilla de Semana revierte los registros y reabre el objetivo.
  await page.getByRole("link", { name: "Semana" }).click();
  await page.locator('button[aria-pressed="true"]').first().click();
  await page.getByRole("link", { name: "Objetivos" }).click();
  await expect(goalBar()).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByText("¡Completado!")).toBeHidden();
});

test("corregir cantidades: restar con − y fijar el total desde el editor", async ({ page }) => {
  await createHabit(page, { name: "Leer", quantity: { unit: "min", perTap: "20" } });
  const row = (total: string) => page.getByRole("button", { name: new RegExp(`^Leer, ${total} min hoy`) });

  await addTo(page, "Leer");
  await addTo(page, "Leer");
  await addTo(page, "Leer");
  await expect(row("60")).toBeVisible();

  // Me pasé de minutos: bajo con −
  await subFrom(page, "Leer");
  await expect(row("40")).toBeVisible();

  // Corrijo el total exacto desde el editor
  await row("40").click();
  await page.getByLabel(/^Total hoy/).fill("25");
  await page.getByRole("button", { name: "Guardar total" }).click();
  await expect(row("25")).toBeVisible();

  // Y puedo quitar todo lo marcado
  await row("25").click();
  await page.getByRole("button", { name: "Quitar todo" }).click();
  await page.getByRole("button", { name: "Guardar total" }).click();
  await expect(row("0")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Restar .* a Leer$/ })).toBeDisabled();
});

test("los avisos aparecen en el espacio reservado y no tapan el título", async ({ page }) => {
  await createHabit(page, { name: "Meditar" });
  await habitRow(page, "Meditar").click();
  // Los avisos van en cola: "Hábito creado" sale primero y "Meditar hecho" espera su turno.
  const notice = page.getByRole("status").locator("li").filter({ hasText: "Meditar hecho" });
  await expect(notice).toBeVisible({ timeout: 15_000 });
  const [n, h1] = await Promise.all([notice.boundingBox(), greeting(page).boundingBox()]);
  expect(n!.y + n!.height).toBeLessThanOrEqual(h1!.y + 1);
});

test("modo claro y oscuro con el botón del tema", async ({ page }) => {
  const html = page.locator("html");
  await page.getByRole("button", { name: /Cambiar a modo (claro|oscuro)/ }).click();
  const first = await html.getAttribute("data-theme");
  expect(["light", "dark"]).toContain(first);
  await page.getByRole("button", { name: /Cambiar a modo (claro|oscuro)/ }).click();
  const second = await html.getAttribute("data-theme");
  expect(second).not.toBe(first);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", second!);
});

test("la tira de fechas permite ver y corregir otro día sin tocar hoy", async ({ page }) => {
  await createHabit(page, { name: "Meditar" });
  const subtitle = page.getByText(/^(Hoy|Ayer) /);
  await expect(subtitle).toHaveText(/^Hoy /);

  // Elegir ayer: el título lo dice y el registro va a ese día
  const days = page.getByRole("group", { name: "Elegir día" }).getByRole("button");
  await days.nth(-2).click();
  await expect(subtitle).toHaveText(/^Ayer /);
  await habitRow(page, "Meditar").click();
  await expect(dayProgress(page)).toHaveAttribute("aria-valuenow", "1");

  // Volver a hoy: sigue pendiente
  await page.getByRole("button", { name: "Volver a hoy" }).click();
  await expect(subtitle).toHaveText(/^Hoy /);
  await expect(dayProgress(page)).toHaveAttribute("aria-valuenow", "0");
});

test("registrar varios hábitos seguidos no mueve la pantalla y los avisos van en cola de a uno", async ({ page }) => {
  for (const name of ["Uno", "Dos", "Tres"]) await createHabit(page, { name });
  const title = greeting(page);
  const y0 = (await title.boundingBox())!.y;

  for (const name of ["Uno", "Dos", "Tres"]) {
    await habitRow(page, name).click();
    expect((await title.boundingBox())!.y, `el título se movió al registrar ${name}`).toBeCloseTo(y0, 0);
  }
  // Un solo aviso visible por vez; el resto espera en cola
  await expect(page.getByRole("status").locator("li")).toHaveCount(1);
  await expect(page.getByLabel(/avisos en espera/)).toBeVisible();
  expect((await title.boundingBox())!.y).toBeCloseTo(y0, 0);
});

test("el personaje: estado por defecto, actividad del último hábito tocado durante 10 s y festejo", async ({ page }) => {
  await createHabit(page, { name: "Gym", icon: "Gimnasio" });
  await createHabit(page, { name: "Agua", icon: "Agua" });
  const resting = page.getByRole("img", { name: /^El personaje (te acompaña|te saluda)$/ });

  // Por defecto no está haciendo pesas: respira y saluda
  await expect(resting).toBeVisible();

  // Toco Gym: hace pesas
  await habitRow(page, "Gym").click();
  await expect(page.getByRole("img", { name: "El personaje levanta pesas" })).toBeVisible();

  // Toco Agua: completa los 2 hábitos del día y festeja
  await habitRow(page, "Agua").click();
  await expect(page.getByRole("img", { name: "El personaje festeja" })).toBeVisible();

  // Pasados ~10 s vuelve al estado por defecto
  await expect(resting).toBeVisible({ timeout: 16_000 });
});

test("tocar un hábito muestra su actividad (tomar agua) sin completar el día", async ({ page }) => {
  await createHabit(page, { name: "Agua", icon: "Agua", quantity: { unit: "vasos", perTap: "1" } });
  await createHabit(page, { name: "Leer", icon: "Lectura" });
  await page.getByRole("button", { name: /^Sumar .* a Agua$/ }).click();
  await expect(page.getByRole("img", { name: "El personaje toma agua" })).toBeVisible();
});

test("bienvenida: el personaje se presenta, pide el nombre y pasa a la app", async ({ page }) => {
  await freshDb(page);
  await skipIntro(page);
  await expect(page.getByText("Hola, soy SuperHábitos")).toBeVisible();
  await expect(page.getByText(/guiarte/)).toBeVisible();
  const start = page.getByRole("button", { name: "Empezar" });
  await expect(start).toBeDisabled();
  await page.getByLabel("¿Cómo te llamo?").fill("Lu");
  await expect(start).toBeEnabled();
  await start.click();
  await expect(greeting(page)).toHaveText("Hola, Lu");
  await expect(page.getByText(/^Hoy \p{L}+ \d+ de \p{L}+$/u)).toBeVisible();
  await expect(page.getByText("SuperHábitos").first()).toBeVisible();
  // Recargar no vuelve a pedir el nombre
  await page.reload();
  await expect(greeting(page)).toHaveText("Hola, Lu");
});

test("las rachas largas se colorean: neutras hasta 9, naranja desde 10 y rojas desde 30", async ({ page }) => {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open("habit-tracker");
      r.onsuccess = () => res(r.result);
    });
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(d);
    const tx = db.transaction(["habits", "entries"], "readwrite");
    const lengths: Record<string, number> = { Corta: 5, Media: 12, Larga: 35 };
    Object.entries(lengths).forEach(([name, n], i) => {
      const id = crypto.randomUUID();
      tx.objectStore("habits").put({ id, name, emoji: "sparkles", color: "green", kind: "boolean", defaultAmount: 1, schedule: { type: "daily" }, archived: false, sortOrder: i, aliases: [] });
      for (let b = 0; b < n; b++) {
        const day = new Date(Date.now() - b * 86400000);
        tx.objectStore("entries").put({ id: crypto.randomUUID(), clientId: crypto.randomUUID(), habitId: id, localDate: fmt(day), occurredAt: day.getTime(), amount: 1, source: "app" });
      }
    });
    await new Promise((res) => (tx.oncomplete = res));
  });
  await page.reload();
  const colorOf = (n: number) => page.getByLabel(`Racha de ${n}`).evaluate((el) => (el as HTMLElement).style.color);
  expect(await colorOf(5)).toBe("");
  expect(await colorOf(12)).toContain("--flame-orange");
  expect(await colorOf(35)).toContain("--flame-red");
});

test("logros en Ajustes: se desbloquean al registrar y avisan", async ({ page }) => {
  await createHabit(page, { name: "Meditar" });
  await habitRow(page, "Meditar").click();
  await expect(page.getByText("Logro desbloqueado: Primer registro")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page.getByRole("heading", { name: "Logros" })).toBeVisible();
  await expect(page.getByText(/de 25 desbloqueados/)).toBeVisible();
  const first = page.getByRole("group", { name: /^Primer registro\./ });
  await expect(first).toContainText("Desbloqueado");
  await expect(page.getByRole("group", { name: /^Arrancando\./ })).not.toContainText("Desbloqueado");
});

test("intro con pantallazos: título, Siguiente al segundo slide y Empezar lleva a pedir el nombre", async ({ page }) => {
  await freshDb(page);
  await expect(page.getByRole("heading", { name: /Hacé hábitos mejores con SuperHábitos/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Saltar" })).toBeVisible();

  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Un toque. Una racha. Un logro." })).toBeVisible();
  await expect(page.getByText("Tu constancia se ve crecer")).toBeVisible();

  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(nameInput(page)).toBeVisible();
  await expect(page.getByText("Hola, soy SuperHábitos")).toBeVisible();

  // Con Saltar también se llega al nombre (y un reload en la misma sesión no repite la presentación)
  await freshDb(page);
  await page.getByRole("button", { name: "Saltar" }).click();
  await expect(nameInput(page)).toBeVisible();
  await page.reload();
  await expect(nameInput(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Saltar" })).toHaveCount(0);
});

test("splash de arranque: aparece una vez por sesión para quien ya tiene nombre, se va solo y deja la app usable", async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem("splash-test", "1");
    sessionStorage.removeItem("splash-shown");
  });
  const t0 = Date.now();
  await page.reload();
  const splash = page.getByTestId("launch-splash");
  await expect(splash).toBeVisible();
  await expect(splash).toBeHidden({ timeout: 3_000 });
  expect(Date.now() - t0).toBeLessThan(4_000);
  await expect(greeting(page)).toHaveText(`Hola, ${NAME}`);
  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();

  // En la misma sesión no vuelve a aparecer (el reload conserva la ruta: volvemos a Hoy primero)
  await page.getByRole("link", { name: "Hoy" }).click();
  // Esperar a que la navegación termine: recargar en medio de ella dejaría la ruta anterior
  await page.waitForURL((url) => url.pathname === "/");
  await expect(greeting(page)).toHaveText(`Hola, ${NAME}`);
  await page.reload();
  await expect(greeting(page)).toHaveText(`Hola, ${NAME}`);
  await expect(splash).toHaveCount(0);
});

test("con 'menos movimiento' el splash de arranque no aparece ni bloquea", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    sessionStorage.setItem("splash-test", "1");
    sessionStorage.removeItem("splash-shown");
  });
  await page.reload();
  await expect(page.getByTestId("launch-splash")).toHaveCount(0);
  await page.getByRole("link", { name: "Ajustes" }).click(); // usable de inmediato
  await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
});

test("el registro persiste al recargar (IndexedDB)", async ({ page }) => {
  await createHabit(page, { name: "Leer" });
  await habitRow(page, "Leer").click();
  await expect(dayProgress(page)).toHaveAttribute("aria-valuenow", "1");
  await page.reload();
  await expect(dayProgress(page)).toHaveAttribute("aria-valuenow", "1");
});

test("importa el formato viejo de localStorage desde Ajustes", async ({ page }) => {
  await page.getByRole("link", { name: "Ajustes" }).click();
  const legacy = {
    habits: [{ id: "a", name: "Leer", frequency: { type: "daily" } }],
    checks: [{ id: "1", habitId: "a", date: "2026-03-01" }],
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "viejo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.getByText("Importados 1 hábitos y 1 registros")).toBeVisible();
  await page.getByRole("link", { name: "Hoy" }).click();
  await expect(habitRow(page, "Leer")).toBeVisible();
});

test("todas las pantallas cargan sin scroll horizontal y con navegación inferior", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [link, heading] of [
    ["Hoy", `Hola, ${NAME}`],
    ["Semana", "Semana"],
    ["Objetivos", "Objetivos"],
    ["Stats", "Stats"],
    ["Ajustes", "Ajustes"],
  ]) {
    await page.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `scroll horizontal en ${link}`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test("PWA: manifest, íconos y apple-touch-icon disponibles", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.ok(), icon.src).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').first()).toHaveCount(1);
});

test("los objetivos táctiles principales miden al menos 44px", async ({ page }) => {
  await createHabit(page, { name: "Meditar" });
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll("nav a, main button")].map((el) => {
      const r = el.getBoundingClientRect();
      return { label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30), w: r.width, h: r.height };
    }),
  );
  for (const s of sizes) expect(Math.min(s.w, s.h), s.label).toBeGreaterThanOrEqual(43.5);
});


// ---------------------------------------------------------------------------------------------
// Personaje 3D (esfera, public/models/mascot.glb)
// ---------------------------------------------------------------------------------------------
test.describe("personaje 3D", () => {
  test.setTimeout(75_000);

  async function enable3d(page: Page) {
    const webgl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
    test.skip(!webgl, "este navegador no tiene WebGL 2");
    await page.evaluate(() => localStorage.setItem("mascot-mode", "3d"));
    await page.reload();
  }

  test("carga el modelo, dibuja una esfera real en el canvas y responde a las actividades", async ({ page }) => {
    await createHabit(page, { name: "Pesas", icon: "Gimnasio" });
    await createHabit(page, { name: "Agua", icon: "Agua" });
    await createHabit(page, { name: "Leer", icon: "Lectura" }); // queda pendiente: el día no se completa (si no, festeja)
    await enable3d(page);

    const canvas = page.locator("canvas");
    await expect(canvas).toHaveCount(1, { timeout: 30_000 });
    const resting = page.getByRole("img", { name: /^El personaje (te acompaña|te saluda)$/ });
    await expect(resting).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500); // algunos cuadros renderizados

    // El canvas dibuja algo: la captura cambia si lo ocultamos
    const withModel = await canvas.screenshot();
    await canvas.evaluate((c) => ((c as HTMLCanvasElement).style.opacity = "0"));
    const without = await canvas.screenshot();
    await canvas.evaluate((c) => ((c as HTMLCanvasElement).style.opacity = "1"));
    expect(withModel.equals(without)).toBe(false);
    expect(Math.abs(withModel.length - without.length)).toBeGreaterThan(1500);

    // Tocar un hábito cambia la actividad (misma etiqueta accesible que la bola verde)
    await habitRow(page, "Pesas").click();
    await expect(page.getByRole("img", { name: "El personaje levanta pesas" })).toBeVisible();
    await page.getByRole("button", { name: /^Sumar .* a Agua$/ }).or(habitRow(page, "Agua")).first().click();
    await expect(page.getByRole("img", { name: "El personaje toma agua" })).toBeVisible();
  });

  /** Vuelve a la presentación (usuario nuevo) con el 3D elegido. */
  async function restartAsNewUser(page: Page) {
    const webgl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
    test.skip(!webgl, "este navegador no tiene WebGL 2");
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("habit-tracker");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
      sessionStorage.removeItem("intro-done");
      localStorage.setItem("mascot-mode", "3d");
    });
  }

  test("motor único: un solo renderer y una sola descarga del modelo en toda la entrada", async ({ page }) => {
    let glbRequests = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/models/mascot.glb")) glbRequests++;
    });
    await restartAsNewUser(page);
    await page.reload();
    await expect(page.getByRole("button", { name: "Saltar" })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(1, { timeout: 30_000 });
    await page.getByRole("button", { name: "Siguiente" }).click(); // slide 2: el personaje NO se vuelve a montar
    await page.waitForTimeout(800);
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.getByRole("button", { name: "Empezar" }).click();
    await expect(nameInput(page)).toBeVisible();
    await nameInput(page).fill(NAME);
    await page.getByRole("button", { name: "Empezar" }).click();
    await expect(greeting(page)).toHaveText(`Hola, ${NAME}`);
    await expect(page.locator("canvas")).toHaveCount(1, { timeout: 15_000 });
    const stats = await page.evaluate(() => (window as unknown as { __mascotStats: { renderers: number; loads: number } }).__mascotStats);
    expect(stats.renderers).toBe(1);
    expect(stats.loads).toBe(1);
    expect(glbRequests).toBe(1);
  });

  test("con el modelo demorado no se ve la bola 2D de pasada: aparece directamente el 3D", async ({ page }) => {
    await restartAsNewUser(page);
    await page.route("**/models/mascot.glb", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Saltar" })).toBeVisible();
    const ball = page.locator('[role="img"][aria-label^="El personaje"] svg');
    await page.waitForTimeout(1000); // el modelo todavía está bajando
    await expect(ball).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByRole("img", { name: /^El personaje/ })).toBeVisible({ timeout: 30_000 });
    await expect(ball).toHaveCount(0);
  });

  test("si el modelo no carga, se queda la bola verde y la app sigue andando", async ({ page }) => {
    await createHabit(page, { name: "Meditar", icon: "Mente" });
    await createHabit(page, { name: "Leer", icon: "Lectura" }); // queda pendiente: el día no se completa
    await page.route("**/models/mascot.glb", (route) => route.abort());
    await enable3d(page);
    await expect(page.locator("canvas")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("img", { name: /^El personaje/ })).toBeVisible();
    await expect(greeting(page)).toHaveText(`Hola, ${NAME}`);
    await habitRow(page, "Meditar").click();
    await expect(page.getByRole("img", { name: "El personaje medita" })).toBeVisible();
  });

  test("el interruptor de Ajustes cambia entre 3D y 2D y se recuerda al recargar", async ({ page }) => {
    const webgl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
    test.skip(!webgl, "este navegador no tiene WebGL 2");
    await createHabit(page, { name: "Meditar" });
    await page.getByRole("link", { name: "Ajustes" }).click();
    const toggle = page.getByRole("checkbox", { name: "Personaje en 3D" });
    await expect(toggle).not.toBeChecked(); // las pruebas arrancan en 2D
    await toggle.check();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Personaje en 3D" })).toBeChecked();
    await page.getByRole("link", { name: "Hoy" }).click();
    await expect(page.locator("canvas")).toHaveCount(1, { timeout: 30_000 });
    await page.getByRole("link", { name: "Ajustes" }).click();
    await page.getByRole("checkbox", { name: "Personaje en 3D" }).uncheck();
    await page.getByRole("link", { name: "Hoy" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
  });
});
