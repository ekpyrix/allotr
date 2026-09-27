import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { uniquely } from './sqlite-errors.ts';
import type { Db } from './store.ts';

// Free-form tags (FR-L7).

export type TagView = { id: string; name: string };

function nameTaken(): RequestProblem {
  return new RequestProblem(
    409,
    'tag_name_taken',
    'A tag with this name exists.',
  );
}

export function listTags(db: Db, userId: string): Promise<TagView[]> {
  return db
    .selectFrom('tags')
    .select(['id', 'name'])
    .where('user_id', '=', userId)
    .orderBy('name')
    .execute();
}

export async function createTag(
  db: Kysely<DB>,
  userId: string,
  name: string,
  now: Date,
): Promise<TagView> {
  const id = randomUUID();
  const at = now.toISOString();
  await uniquely(
    () =>
      db
        .insertInto('tags')
        .values({ id, user_id: userId, name, created_at: at, updated_at: at })
        .execute(),
    nameTaken,
  );
  return { id, name };
}

export async function renameTag(
  db: Kysely<DB>,
  userId: string,
  id: string,
  name: string,
  now: Date,
): Promise<TagView> {
  const result = await uniquely(
    () =>
      db
        .updateTable('tags')
        .set({ name, updated_at: now.toISOString() })
        .where('user_id', '=', userId)
        .where('id', '=', id)
        .executeTakeFirst(),
    nameTaken,
  );
  if (result.numUpdatedRows === 0n) {
    throw new RequestProblem(404, 'tag_not_found', 'There is no such tag.');
  }
  return { id, name };
}
