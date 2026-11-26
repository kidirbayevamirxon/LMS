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

// Daily billing & reminder check at 08:00 Tashkent time
cron.schedule('0 3 * * *', async () => {
  try {
    await syncStudentPaymentMonths();
    await runPeriodicNotificationChecks();
  } catch (err) {
    console.error('Daily cron failed:', err);
  }
});

async function shutdown() {
  console.log('Shutting down EduManager Backend...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
