require('dotenv').config();  // ← MUST be first

const app = require('./app');
const http = require('http');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Now DB env vars are loaded, this will work
    // Verify DB connection
    const { sequelize } = require('./models');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');


    const server = http.createServer(app);

    /*
      Scheduled campaigns. Started HERE and nowhere else: a scheduler running
      in more than one place sends the same notification twice, and one that is
      never started makes "Schedule for Later" a button that silently does nothing.
    */
    require('./services/campaignScheduler.service').start();
    // The mobile app's scheduled notifications (event_notifications).
    require('./services/eventNotificationScheduler.service').start();
    // QR joiners waiting for guest-limit room: let them in once there is room.
    require('./services/participantWaitlist.service').start();

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);

    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
}

startServer();
