import { workspaceName } from './index.ts';

// ADR 0007: the gateway idles until a chat platform is configured. Platform
// adapters arrive in later milestones; until then it only has to stay up
// under s6 and stop cleanly.

function log(msg: string): void {
  console.log(
    JSON.stringify({
      level: 30,
      time: new Date().toISOString(),
      service: workspaceName,
      msg,
    }),
  );
}

log('no chat platforms configured; idling');

const keepAlive = setInterval(() => undefined, 2 ** 30);

function stop(signal: NodeJS.Signals): void {
  log(`received ${signal}; stopping`);
  clearInterval(keepAlive);
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
