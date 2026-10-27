-- Si un mismo chat quedó vinculado a varias cuentas, se conserva solo en la más reciente.
UPDATE "user_settings" s SET "telegram_chat_id" = NULL, "reminders_enabled" = false
WHERE "telegram_chat_id" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "user_settings" o
  WHERE o."telegram_chat_id" = s."telegram_chat_id"
    AND (o."updated_at" > s."updated_at" OR (o."updated_at" = s."updated_at" AND o."id" > s."id"))
);--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_telegram_chat_uq" ON "user_settings" USING btree ("telegram_chat_id") WHERE "user_settings"."telegram_chat_id" is not null;
