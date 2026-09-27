import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkCheckpoint,
  checkpointsWithSteps,
  joinedAt,
  loadFixtures,
  runStep,
} from './testing/replay.ts';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Replays each synthetic fixture (testdata/synthetic/) against a real
// server: import the bundle, move the clock through the timeline, and
// compare balances and today's figures with hand-worked values. Together
// with the property tests this is the M1 exit (#41).

const fixtures = loadFixtures();

it('finds the synthetic fixtures', () => {
  expect(fixtures.length).toBeGreaterThan(0);
});

for (const fixture of fixtures) {
  describe(fixture.name, () => {
    const clock = { now: new Date(joinedAt(fixture.replay)) };
    let h: TwoUsers;

    beforeAll(async () => {
      h = await startWithTwoUsers({ now: () => clock.now });
      // Sign-up stamps users with the real clock; pin the day they joined.
      await h.db
        .updateTable('users')
        .set({ created_at: joinedAt(fixture.replay) })
        .where('id', '=', await userIdOf(h.alice))
        .execute();
      const imported = await h.alice.post('/v1/import', fixture.bundle);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    });

    afterAll(async () => {
      await h.close();
    });

    for (const { checkpoint, steps } of checkpointsWithSteps(fixture.replay)) {
      it(`matches at ${checkpoint.at}`, async () => {
        for (const step of steps) {
          clock.now = new Date(step.at);
          await runStep(h.alice, step);
        }
        clock.now = new Date(checkpoint.at);
        await checkCheckpoint(h.alice, checkpoint);
      });
    }
  });
}
