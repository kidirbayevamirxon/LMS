import cron from 'node-cron';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { runPeriodicNotificationChecks } from './modules/notifications/notifications.service.js';
import { syncStudentPaymentMonths } from './modules/payments/payments.billing.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`EduManager Backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  console.log(`Swagger Docs available at http://localhost:${env.PORT}/api/docs`);
});

// Billing & payment reminder check every 6 hours + once shortly after startup
cron.schedule('0 */6 * * *', async () => {
  try {
    await syncStudentPaymentMonths();
    await runPeriodicNotificationChecks();
  } catch (err) {
    console.error('Periodic notification cron failed:', err);
  }
});

setTimeout(async () => {
  try {
    await syncStudentPaymentMonths();
    await runPeriodicNotificationChecks();
  } catch (err) {
    console.error('Startup notification check failed:', err);
  }
}, 15000);

async function shutdown() {
  console.log('Shutting down EduManager Backend...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
