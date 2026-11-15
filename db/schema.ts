import { sqliteTable, text, index, primaryKey } from 'drizzle-orm/sqlite-core';
// Logical records stay separate by kind; the envelope makes fixture replay and migrations small.
export const records = sqliteTable('records', {
 kind:text('kind').notNull(), id:text('id').notNull(), symbol:text('symbol'),
 publishedAt:text('published_at'), payload:text('payload').notNull(), updatedAt:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.kind,t.id]}),index('records_kind_symbol').on(t.kind,t.symbol),index('records_kind_date').on(t.kind,t.publishedAt)]);
