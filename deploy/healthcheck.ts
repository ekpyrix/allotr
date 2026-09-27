// Container healthcheck: the server answers /readyz. A gateway-only
// container has no HTTP endpoint, so it counts as healthy while running.
const role = process.env.ALLOTR_ROLE ?? 'all';
if (role === 'gateway') process.exit(0);

const port = process.env.ALLOTR_PORT ?? '8080';
try {
  const response = await fetch(`http://127.0.0.1:${port}/readyz`, {
    signal: AbortSignal.timeout(4000),
  });
  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
