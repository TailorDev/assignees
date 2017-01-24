const gh = require('../helpers/github');
const User = require('../models/User');
const Repository = require('../models/Repository');

const newError = (statusCode, status, reason, req) => {
  const err = new Error();

  err.statusCode = statusCode;
  err.status = status;
  err.reason = reason;
  err.payload = req.body;

  return err;
};

/**
 * Listen to GitHub events
 */
exports.listen = async (req, res) => {
  if (req.header('x-github-event') === 'ping') {
    return res.send('PONG');
  }

  if (req.header('x-github-event') !== 'pull_request') {
    return res.send({ status: 'ignored', reason: 'I do not listen to such events' });
  }

  if (req.body.action !== 'opened') {
    return res.send({ status: 'ignored', reason: 'action is not "opened"' });
  }

  // TODO: check params
  const repoId = req.body.repository.id;
  const pullNumber = req.body.pull_request.number;
  const pullAuthor = req.body.pull_request.user.login;

  const repository = await Repository.findOne({
    github_id: repoId,
  })
  .catch(() => null);

  if (!repository) {
    throw newError(404, 'ignored', 'unknown repository', req);
  }

  if (!repository.enabled) {
    throw newError(403, 'ignored', 'repository is paused', req);
  }

  // TODO: move this logic to a worker

  const user = await User.findOne({
    _id: repository.enabled_by.user_id
  })
  .catch(() => null);

  if (!user) {
    throw newError(401, 'ignored', 'user not found', req);
  }

  const github = gh.auth(user);
  const collaborators = await github.repos
    .getCollaborators({
      owner: repository.owner,
      repo: repository.name,
    })
  ;

  Promise.all(
    repository.teams.map(
      team => github.orgs.getTeamMembers({ id: team }).map(m => m.login)
    ))
    .then((members) => members.reduce((a, b) => a.concat(b), []))
    .then((members) => {
      if (members.length === 0) {
        return collaborators;
      }

      return collaborators.filter(c => members.includes(c.login));
    })
    .then(collaborators => collaborators
      .map(c => c.login)
      .filter(login => login !== pullAuthor)
      .sort(() => 0.5 - Math.random())
      .slice(0, repository.max_reviewers)
    )
    .then((reviewers) => {
      if (reviewers.length === 0) {
        throw newError(422, 'aborted', 'no reviewers found', req);
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
    .then(res.send({ status: 'ok' }))
  ;
};
