import { sql, type SQLWrapper } from "drizzle-orm";

// Keep the inner alias literal: Drizzle's relational queries alias outer columns.
export function publicCreatorPredicate(creatorId: SQLWrapper) {
  return sql`exists (select 1 from "creators" as "visible_creator" where "visible_creator"."id" = ${creatorId} and "visible_creator"."trashed_at" is null)`;
}
