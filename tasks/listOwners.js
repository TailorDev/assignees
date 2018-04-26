const Repository = require('../models/Repository');
const inspect = require('../helpers/inspect');

/**
 * config = {
 *   logger: { info: Function, error: Function },
 * }
 */
exports.configure = config => async (asList) => {
  const repositories = await Repository.find().catch([]);
  const owners = [...new Set(repositories.map((r) => r.owner))];

  if (asList) {
    console.log(owners.join(' '))
  } else {
    config.logger.info(inspect(owners));
  }
};
