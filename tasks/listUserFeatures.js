const User = require('../models/User');
const inspect = require('../helpers/inspect');

/**
 * config = {
 *   logger: { info: Function, error: Function },
 * }
 */
exports.configure = config => async (username) => {
  const user = await User.findOne({ github_login: username }).catch(null);

  if (!user) {
    config.logger.error(`user "${username}" not found`);
    return;
  }

  config.logger.info(`user "${user.github_login}" has the following features: ${inspect(user.features)}`);
};
