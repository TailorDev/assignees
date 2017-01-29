/* eslint consistent-return: 0 */
const User = require('../models/User');

// operations
const ADD = 'add';
const REMOVE = 'remove';

exports.ADD = ADD;
exports.REMOVE = REMOVE;

/**
 * config = {
 *   logger: { info: Function, error: Function },
 * }
 */
exports.configure = config => async (username, feature, operation) => {
  const user = await User.findOne({ github_login: username }).catch(null);

  if (!user) {
    config.logger.error(`User "${username}" not found`);
    return;
  }

  if (!feature) {
    config.logger.error('invalid feature');
    return;
  }

  const features = user.features ? (user.features || []) : [];

  switch (operation) {
    case ADD:
      if (features.includes(feature)) {
        config.logger.error('user already has this feature, aborting');
        return;
      }

      features.push(feature);

      return user.set({ features }).save().then(() => {
        config.logger.info(`added feature "${feature}" to user "${username}"`);
      });

    case REMOVE:
      if (!features.includes(feature)) {
        config.logger.error('user does not have this feature, aborting');
        return;
      }

      return user.set({
        features: features.filter(f => f !== feature),
      }).save().then(() => {
        config.logger.info(`removed feature "${feature}" on user "${username}"`);
      });

    default:
      config.logger.error(`Unrecognized operation: ${operation}`);
  }
};
