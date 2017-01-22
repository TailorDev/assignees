const Repository = require('../models/Repository');
const User = require('../models/User');

/**
 * Dashboard
 */
exports.index = async (req, res) => {
  const nbRepositories = await Repository.count()
    .catch(err => null);
  const nbEnabledRepos = await Repository.count({ enabled: true, })
    .catch(err => null);
  const nbUsers = await User.count()
    .catch(err => null);
  const nbPrivateUsers = await User.count({ 'tokens.scopes': { $in: ['repo'] } })
    .catch(err => null);

  return res.render('dashboard/index', {
    title: 'Dashboard',
    nbRepositories,
    nbUsers,
    nbPrivateUsers,
    nbEnabledRepos,
  });
};
