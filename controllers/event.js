const deck = require('deck');
const gh = require('../helpers/github');
const User = require('../models/User');
const Repository = require('../models/Repository');

const MAX_PR_FILES_TO_PROCESS = process.env.MAX_PR_FILES_TO_PROCESS || 5;
const NB_COMMITS_TO_RETRIEVE = process.env.NB_COMMITS_TO_RETRIEVE || 30;

const newError = (statusCode, status, reason, req) => {
  const err = new Error();

  err.statusCode = statusCode;
  err.status = status;
  err.reason = reason;
  err.payload = req.body;

  return err;
};

const getFiles = async (github, owner, repo, number) => {
  return new Promise((resolve, reject) => {
    github.pullRequests.getFiles({
      owner,
      repo,
      number,
      per_page: 100,
    }, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

/**
 * Listen to GitHub events
 */
exports.listen = async (req, res) => {
  if (!req.header('x-github-event')) {
    return res.status(400).end();
  }

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

  // the GitHub dance
  const github = gh.auth(user);

  // 1 - get all files for the current PR
  let files = await getFiles(github, repository.owner, repository.name, pullNumber);
  // 1.1 - sort files by the number of deletions
  files.sort((a, b) => {
    const countA = a.deletions;
    const countB = b.deletions;

    return countA > countB ? -1 : (countA < countB ? 1 : 0);
  });
  // 1.2 - only take MAX_PR_FILES_TO_PROCESS files
  files = files.slice(0, MAX_PR_FILES_TO_PROCESS);

  // 2 - retrieve the logins of people who touched this files
  const authorsFromHistory = await Promise.all(
    files.map(file =>
      github.repos.getCommits({
        owner: repository.owner,
        repo: repository.name,
        path: file.filename,
        per_page: NB_COMMITS_TO_RETRIEVE,
      })
      .catch([])
      .then(commits => commits.map(commit => commit.author.login))
    ))
    .then(authors => authors.reduce((a, b) => a.concat(b), []))
    .then(authors => authors.filter(author => author !== pullAuthor))
    // create a dict with { login: weight }
    .then(authors => authors.reduce((prev, curr) => (prev[curr] = ++prev[curr] || 1, prev), {}))
  ;

  let collaborators;
  // ...in case we find no one suitable
  if (Object.keys(authorsFromHistory).length === 0) {
    collaborators = await github.repos
      .getCollaborators({
        owner: repository.owner,
        repo: repository.name,
      })
      .catch([])
      .then(collaborators => collaborators.map(collaborator => collaborator.login))
      .then(collaborators => collaborators.filter(collaborator => collaborator !== pullAuthor))
      .then(collaborators => collaborators.reduce((prev, curr) => (prev[curr] = 1, prev), {}))
    ;
  } else {
    // better.
    collaborators = authorsFromHistory;
  }

  // 3 - fetch all team members (if any)
  Promise.all(repository.getTeams().map(
    team => github.orgs.getTeamMembers({ id: team })
  ))
  // gather all members in a list
  .then(members => members.reduce((a, b) => a.concat(b), []))
  // list logins only
  .then(members => members.map(m => m.login))
  // array unique
  .then(members => [...new Set(members)])
  // whitelist collaborators if there are teams
  .then(members => {
    if (repository.getTeams().length > 0) {
      Object.keys(collaborators).forEach((k) => {
        if (!members.includes(k)) {
          delete collaborators[k];
        }
      });
    }

    return collaborators;
  })
  // weigthed shuffle, then select N reviewers
  .then(collaborators => deck.shuffle(collaborators).slice(0, repository.max_reviewers))
  // create review request
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
  .then(res.send({ status: 'ok' }));
};
