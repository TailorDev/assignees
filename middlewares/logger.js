const { withRequestId } = require('../helpers/logger');

module.exports = logger => (req, res, next) => {
  req.logger = withRequestId(logger, req.id);
  next();
};
