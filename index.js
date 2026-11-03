import app from './src/app.js';
import { config } from './src/config.js';
import { closeDb, getDb } from './src/db.js';

async function start() {
  // Connect (and create indexes) before accepting traffic so the first
  // request never pays the connection cost or races index creation.
  await getDb();

  const server = app.listen(config.port, () => {
    console.log(`BookNook API listening on http://localhost:${config.port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down.`);

    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();

    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (error) => {
  console.error('BookNook API failed to start.');
  console.error(error);
  await closeDb().catch(() => {});
  process.exit(1);
});
