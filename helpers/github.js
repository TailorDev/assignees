const crypto = require('crypto');
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

exports.getWebhookConfig = (owner, repo, active) => {
  return {
    owner,
    repo,
    name: 'web',
    config: {
      url: process.env.GITHUB_WEBHOOK_URL,
      content_type: 'json',
      secret: process.env.GITHUB_WEBHOOK_SECRET,
    },
    events: ['pull_request'],
    active,
  };
};

exports.getExistingWebhookConfig = (id, owner, repo, active) => {
  return Object.assign({},
    module.exports.getWebhookConfig(owner, repo, active),
    { id }
  );
};

exports.computeSignature = (blob) => {
  return 'sha1=' + crypto
    .createHmac('sha1', process.env.GITHUB_WEBHOOK_SECRET)
    .update(blob)
    .digest('hex')
  ;
};
