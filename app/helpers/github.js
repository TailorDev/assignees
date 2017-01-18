const GitHub = require('github');

exports.auth = (user) => {
  const gh = new GitHub();
  const tokens = user.tokens.map(t => t.accessToken);

  gh.authenticate({
    type: 'oauth',
    token: tokens[0],
  });

  return gh;
};
