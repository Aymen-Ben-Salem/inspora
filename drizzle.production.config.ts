// Direct drizzle-kit execution skips the pinned ledger/data checks.
throw new Error('Use npm run db:migrate:production -- --plan FILE and the reviewed pinned release procedure. Direct production migrations are disabled.');
export {};
