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
  const pullAuthor = req.body.pull_request.user.login;

  Repository.findOne({ github_id: repoId }, (err, repository) => {
    if (!repository) {
      return res.send({ status: 'ignored', reason: 'unknown repository' });
    }

    if (!repository.enabled) {
      return res.send({ status: 'ignored', reason: 'repository is paused' });
    }

    if (repository.skip_wip && /wip/i.test(pullTitle)) {
      return res.send({ status: 'ignored', reason: 'skip wip' });
    }

    // TODO: move this logic to a worker

    User.findOne({ _id: repository.enabled_by.user_id }, (err, user) => {
      const github = gh.auth(user);

      github
        .repos
        .getCollaborators({
          owner: repository.owner,
          repo: repository.name,
        })
        .then(collaborators => collaborators
            .map(c => c.login)
            .filter(login => login !== pullAuthor)
            .sort(() => 0.5 - Math.random())
            .slice(0, repository.max_reviewers))
        .then((reviewers) => {
          if (reviewers.length === 0) {
            return res.send({ status: 'aborted', reason: 'no reviewers found' });
          }

          return github
            .pullRequests
            .createReviewRequest({
              owner: repository.owner,
              repo: repository.name,
              number: pullNumber,
              reviewers,
            })
          ;
        })
        .then(() => {
          res.send({ status: 'ok' });
        })
        .catch((err) => {
          res.send({ status: 'errored' });
        })
      ;
    });
  });
};
