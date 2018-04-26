const Repository = require('../models/Repository');
const disableProjectTask = require('./disableProject');

/**
 * config = {
 *   logger: { info: Function, error: Function },
 * }
 */
exports.configure = config => async (owner) => {
  config.logger.info(`Disabling all enabled projects for "${owner}"`);

  const disableProject = disableProjectTask.configure(config);

  const repositories = await Repository.find({
    owner,
    enabled: true,
  });

  await Promise.all(
    repositories.map(async (repository) => {
      config.logger.info(`-> disabling "${repository.name}"`);

      await disableProject({ repository });
    })
  );
};
