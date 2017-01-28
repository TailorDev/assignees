const mongoose = require('mongoose');

module.exports = (logger) => {
  mongoose.Promise = global.Promise;
  mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI);
  mongoose.connection.on('error', () => {
    logger.error('✗ MongoDB connection error. Please make sure MongoDB is running.');
    process.exit();
  });

  return mongoose;
};
