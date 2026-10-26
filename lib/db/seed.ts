import { getDb } from "./client";
import { habits, userSettings } from "./schema";

/** Uso: SEED_USER_ID=<uuid de Supabase Auth> npx tsx lib/db/seed.ts */
async function main() {
  const userId = process.env.SEED_USER_ID;
  if (!userId) throw new Error("Falta SEED_USER_ID");
  const db = getDb();

  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  await db.insert(habits).values([
    { userId, name: "Agua", emoji: "💧", kind: "quantity", unit: "vasos", aliases: ["tomé agua", "vaso"] },
    { userId, name: "Gym", emoji: "🏋️", schedule: { type: "weekly", times: 3 }, aliases: ["entrené", "pesas"] },
    { userId, name: "Leer", emoji: "📚", kind: "quantity", unit: "min", defaultAmount: 20, aliases: ["leí"] },
  ]);
  console.log("Seed listo");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
