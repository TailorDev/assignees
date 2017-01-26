const util = require('util');

module.exports = () => {
  if (process.env.NODE_ENV === 'test') {
    return (err, req, res, next) => {
      res.status(err.statusCode || 500).end();
    };
  }

  return (err, req, res, next) => {
    const info = [
      `request_method=${req.method}`,
      `request_headers=${util.inspect(req.headers)}`,
    ];

    if (req.id) {
      info.push(`request_id=${req.id}`);
    }

    if (req.user) {
      info.push(`user_id=${req.user._id}`);
      info.push(`user_username=${req.user.github_login}`);
    }

    info.push(Object.getOwnPropertyNames(err).map(
      k => `${k}=${util.inspect(err[k])}`
    ));

    console.log('[error]', info.join(' '));

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
    });
  }
};
