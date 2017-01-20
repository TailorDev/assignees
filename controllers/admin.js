const Repository = require('../models/Repository');
const User = require('../models/User');

/**
 * Dashboard
 */
exports.index = (req, res) => {
  Repository.count({}, (err, nbRepositories) => {
    User.count({}, (err, nbUsers) => {
      res.render('dashboard/index', {
        title: 'Dashboard',
        nbRepositories,
        nbUsers,
      });
    });
  });
};
