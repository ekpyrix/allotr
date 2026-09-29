// Synthetic first user for the E2E instances.
export const account = {
  name: 'Sam Example',
  email: 'sam@example.test',
  password: 'correct horse battery staple',
};

/** `PUT /v1/settings/setup` body for specs that do not test setup. */
export const setupSkipped = { finished: true, handled: [] };
