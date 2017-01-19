const gh = require('../helpers/github');
const User = require('../models/User');
const Repository = require('../models/Repository');

/**
 * Listen to GitHub events
 */
exports.listen = (req, res) => {
  if (req.header('x-github-event') === 'ping') {
    return res.send('PONG');
  }

  if (req.header('x-github-event') !== 'pull_request') {
    return res.send({ status: 'ignored', reason: 'I don\t listen to such events.' });
  }

  if (req.body.action !== 'opened') {
    return res.send({ status: 'ignored', reason: 'Action is not "opened".' });
  }

  // TODO: check params

  const repoId = req.body.repository.id;
  const pullTitle = req.body.pull_request.title;
  const pullNumber = req.body.pull_request.number;

  Repository.findOne({ github_id: repoId }, (err, repository) => {
    if (!repository) {
      return res.send({ status: 'ignored', reason: 'Unknown repository.' });
    }

    if (!repository.enabled) {
      return res.send({ status: 'ignored', reason: 'Repository is paused.' });
    }

    if (repository.skip_wip && /wip/i.test(pullTitle)) {
      return res.send({ status: 'ignored', reason: 'WIP.' });
    }

    // TODO: find collaborators, also check `max_reviewers`
    // TODO: move this logic to a worker

    User.findOne({ _id: repository.user_id }, (err, user) => {
      gh.auth(user).pullRequests
        .createReviewRequest({
          owner: repository.org,
          repo: repository.name,
          number: pullNumber,
          reviewers: ['jmaupetit'],
        })
        .then(() => {
          res.send({ status: 'accepted' });
        })
        .catch((err) => {
          console.log({err});

          res.send({ status: 'errored' });
        })
      ;
    });
  });
};
