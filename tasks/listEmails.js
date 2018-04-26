const User = require('../models/User');
const inspect = require('../helpers/inspect');

/**
 * config = {
 *   logger: { info: Function, error: Function },
 * }
 */
exports.configure = config => async (asList) => {
  const users = await User.find().catch([]);
  const emails = [...new Set(users.map((r) => r.email).filter((email) => /@/.test(email)))];

  if (asList) {
    console.log(emails.join('\n'))
  } else {
    config.logger.info(inspect(emails));
  }
};
