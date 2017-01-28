/* eslint no-return-assign: 0 */
const deck = require('deck');

const inspect = require('../helpers/inspect');
const Repository = require('../models/Repository');
const User = require('../models/User');
const gh = require('../helpers/github');

const createHttpError = (statusCode, status, reason) => {
  const err = new Error();

  err.statusCode = statusCode;
  err.status = status;
  err.reason = reason;

  return err;
};

const getFiles = async (github, owner, repo, number) => new Promise((resolve, reject) => {
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

const logPotentialReviewers = (logger, collaborators, authorsFromHistory) => {
  logger.info([
    `collaborators=${inspect(collaborators)}`,
    `authors=${inspect(authorsFromHistory)}`,
  ].join(' '));
};

const logReviewers = (logger, repository, number, reviewers) => {
  logger.info([
    `owner=${repository.owner}`,
    `name=${repository.name}`,
    `number=${number}`,
    `max_reviewers=${repository.max_reviewers}`,
    `reviewers=${inspect(reviewers)}`,
  ].join(' '));
};

const loggerWithRequestId = (logger, requestId) => {
  if (!requestId) {
    return logger;
  }

  return {
    info: (message) => logger.info(`request_id=${requestId} ${message}`),
    error: (message) => logger.error(`request_id=${requestId} ${message}`),
  };
};

/**
 * config = {
 *   maxPullRequestFilesToProcess: number,
 *   nbCommitsToRetrieve: number,
 *   createReviewRequest: boolean,
 *   logger: { info: Function, error: Function },
 * }
 */
module.exports = config => async (repositoryId, number, author, requestId) => {
  const repository = await Repository.findOneByGitHubId(repositoryId);

  if (!repository) {
    throw createHttpError(404, 'ignored', 'unknown repository');
  }

  if (!repository.enabled) {
    throw createHttpError(403, 'ignored', 'repository is paused');
  }

  const user = await User.findOneById(repository.enabled_by.user_id);

  if (!user) {
    throw createHttpError(401, 'ignored', 'user not found');
  }

  const logger = loggerWithRequestId(config.logger, requestId);
  logger.info(`repository_id=${repositoryId} number=${number} author=${author}`);

  // the GitHub dance
  const github = gh.auth(user);

  // 1 - get all files for the current PR
  let files = await getFiles(github, repository.owner, repository.name, number);
  // 1.1 - sort files by the number of deletions
  files.sort((a, b) => {
    const countA = a.deletions;
    const countB = b.deletions;

    return countA > countB ? -1 : (countA < countB ? 1 : 0); // eslint-disable-line
  });
  // 1.2 - only take maxPullRequestFilesToProcess files
  files = files.slice(0, config.maxPullRequestFilesToProcess);

  // 2 - retrieve the logins of people who touched this files
  const authorsFromHistory = await Promise.all(
    files.map(file =>
      github.repos.getCommits({
        owner: repository.owner,
        repo: repository.name,
        path: file.filename,
        per_page: config.nbCommitsToRetrieve,
      })
      .catch([])
      .then(commits => commits.map(commit => commit.author.login))
    ))
    .then(authors => authors.reduce((a, b) => a.concat(b), []))
    .then(authors => authors.filter(a => a !== author))
    // create a dict with { login: weight }
    .then(authors => authors.reduce((prev, curr) => (prev[curr] = ++prev[curr] || 1, prev), {})) // eslint-disable-line
  ;

  const collaborators = await github.repos
    .getCollaborators({
      owner: repository.owner,
      repo: repository.name,
    })
    .catch([])
    // filter collaborators who don't have push access
    .then(collaborators => collaborators.filter(collaborator => collaborator.permissions.push === true))
    .then(collaborators => collaborators.map(collaborator => collaborator.login))
    .then(collaborators => collaborators.filter(collaborator => collaborator !== author))
    .then(collaborators => collaborators.reduce((prev, curr) => (prev[curr] = 1, prev), {})) // eslint-disable-line
  ;

  let reviewers = [];
  if (Object.keys(authorsFromHistory).length > 0) {
    const allowed = Object.keys(collaborators);

    reviewers = Object.keys(authorsFromHistory).filter(k => allowed.includes(k));
  }

  // fallback
  if (reviewers.length === 0) {
    reviewers = collaborators;
  }

  logPotentialReviewers(logger, collaborators, authorsFromHistory);

  // 3 - We're almost there
  return Promise.resolve(reviewers)
    // weigthed shuffle, then select N reviewers
    .then(reviewers => deck.shuffle(reviewers).slice(0, repository.max_reviewers))
    // create review request
    .then((reviewers) => {
      if (reviewers.length === 0) {
        throw createHttpError(422, 'aborted', 'no reviewers found');
      }

      logReviewers(logger, repository, number, reviewers);

      if (config.createReviewRequest === false) {
        return Promise.resolve();
      }

      return github
        .pullRequests
        .createReviewRequest({
          owner: repository.owner,
          repo: repository.name,
          number,
          reviewers,
        })
      ;
    })
  ;
};
