const crypto = require('crypto');
const GitHub = require('github');

exports.auth = (user) => {
  const gh = new GitHub();

  gh.authenticate({
    type: 'oauth',
    token: user.getGitHubToken(),
  });

  return gh;
};

exports.getWebhookConfig = (owner, repo, active) => ({
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
});

exports.getExistingWebhookConfig = (id, owner, repo, active) => Object.assign(
  {},
  module.exports.getWebhookConfig(owner, repo, active),
  { id }
);

exports.verifySignature = (req, res, buffer) => {
  if (req.path !== '/events') {
    return;
  }

  [
    'x-hub-signature',
    'x-github-event',
    'x-github-delivery',
  ].forEach((header) => {
    if (!req.headers[header]) {
      throw new Error(`Header ${header} is missing.`);
    }
  });

  const expected = req.headers['x-hub-signature'];
  const computed = `sha1=${crypto.createHmac('sha1', process.env.GITHUB_WEBHOOK_SECRET).update(blob).digest('hex')}`;

  if (expected !== computed) {
    throw new Error('Invalid signature');
  }
};
