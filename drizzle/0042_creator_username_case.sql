ALTER TABLE "creator_username_aliases" DROP CONSTRAINT "creator_username_aliases_username_valid";--> statement-breakpoint
ALTER TABLE "creators" DROP CONSTRAINT "creators_username_valid";--> statement-breakpoint
ALTER TABLE "creator_username_aliases" ADD CONSTRAINT "creator_username_aliases_username_valid" CHECK ("creator_username_aliases"."username" ~ '^[A-Za-z0-9_]{1,30}$');--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_username_valid" CHECK ("creators"."username" is null or "creators"."username" ~ '^[A-Za-z0-9_]{1,30}$');