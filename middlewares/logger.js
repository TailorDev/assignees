const { withRequestId } = require('../helpers/logger');

module.exports = (logger) => {
  return (req, res, next) => {
    req.logger = withRequestId(logger, req.id);
    next();
  };
};
