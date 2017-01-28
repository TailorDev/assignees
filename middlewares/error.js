/* eslint no-unused-vars: 0 */
const util = require('util');

const inspect = require('../helpers/inspect');

module.exports = (env, logger) => {
  if (env === 'test') {
    return (err, req, res, next) => {
      res.status(err.statusCode || 500).end();
    };
  }

  return (err, req, res, next) => {
    const info = [];

    if (req.id) {
      info.push(`request_id=${req.id}`);
    }

    if (req.user) {
      info.push(`user_id=${req.user._id}`);
      info.push(`user_login=${req.user.github_login}`);
    }

    info.push([
      `request_method=${req.method}`,
      `request_body=${inspect(req.body)}`,
      `request_headers=${inspect(req.headers)}`,
    ].join(' '));

    Object.getOwnPropertyNames(err).forEach(
      k => info.push(`error_${k}=${inspect(err[k])}`)
    );

    logger.error(info.join(' '));

    return res.format({
      json: () => {
        res.status(err.statusCode || 500).send({
          message: 'Server Error',
        });
      },
      html: () => {
        res.status(500).render('error/500', {
          title: 'Server Error',
        });
      },
      'default': () => {
        res.status(406).send('Not Acceptable');
      },
    });
  };
};
