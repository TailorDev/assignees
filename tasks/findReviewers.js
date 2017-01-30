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

const sortByNumberOfDeletions = files => files.sort((a, b) => {
  const countA = a.deletions;
  const countB = b.deletions;

  return countA > countB ? -1 : (countA < countB ? 1 : 0); // eslint-disable-line
});

const flattenResults = results => results.reduce((a, b) => a.concat(b), []);

const exclude = excluded => items => items.filter(item => item !== excluded);

// create a dict with { login: weight }
const createWeightedMap = authors => authors.reduce((prev, curr) => (prev[curr] = ++prev[curr] || 1, prev), {}); // eslint-disable-line

const selectThoseWithPushAccess = users => users.filter(u => u.permissions.push === true);

const getLoginsFromList = users => users.map(u => u.login);

const getLoginsFromCommits = commits => commits
  .filter(commit => commit.author !== null)
  .map(commit => commit.author.login)
;

const weigthedShuffle = items => deck.shuffle(items);

const take = number => items => items.slice(0, number);

const getPullRequestFiles = async (github, repository, number) => github.pullRequests
  .getFiles({
    owner: repository.owner,
    repo: repository.name,
    number,
    per_page: 100,
  })
;

const retrievePreviousAuthors = (github, repository, nbCommitsToRetrieve) => async file => github.repos
  .getCommits({
    owner: repository.owner,
    repo: repository.name,
    path: file.filename,
    per_page: nbCommitsToRetrieve,
  })
  .catch([])
  .then(getLoginsFromCommits)
;

const getCollaborators = async (github, repository) => github.repos
  .getCollaborators({
    owner: repository.owner,
    repo: repository.name,
  })
  .catch([])
;

const logPotentialReviewers = (logger, collaborators, authorsFromHistory, reviewers) => {
  logger.info([
    "message='potential reviewers'",
    `collaborators=${inspect(collaborators)}`,
    `authors=${inspect(authorsFromHistory)}`,
    `potential_reviewers=${inspect(reviewers)}`,
  ].join(' '));
};

const logSelectReviewers = (logger, repository, number, reviewers) => {
  logger.info([
    "message='selected reviewers'",
    `owner=${repository.owner}`,
    `name=${repository.name}`,
    `number=${number}`,
    `max_reviewers=${repository.max_reviewers}`,
    `reviewers=${inspect(reviewers)}`,
  ].join(' '));
};

/**
 * config = {
 *   maxPullRequestFilesToProcess: number,
 *   nbCommitsToRetrieve: number,
 *   createReviewRequest: boolean,
 * }
 */
exports.configure = config => async (repositoryId, number, author, logger) => {
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

  logger.info(`message='processing' repository_id=${repositoryId} number=${number} author=${author}`);

  // the GitHub dance
  const github = gh.auth(user);

  // 1 - get all files for the current PR
  const files = await getPullRequestFiles(github, repository, number)
    .then(sortByNumberOfDeletions)
    .then(take(config.maxPullRequestFilesToProcess))
  ;

  if (files.length === 0) {
    logger.info("message='no files'");

    return Promise.resolve();
  }

  // 2 - retrieve the logins of people who touched this files
  const authorsFromHistory = await Promise.all(
    files.map(
      retrievePreviousAuthors(github, repository, config.nbCommitsToRetrieve)
    ))
    .then(flattenResults)
    .then(exclude(author))
    .then(createWeightedMap)
  ;

  const collaborators = await getCollaborators(github, repository)
    .then(selectThoseWithPushAccess)
    .then(getLoginsFromList)
    .then(exclude(author))
    .then(createWeightedMap)
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

  logPotentialReviewers(logger, collaborators, authorsFromHistory, reviewers);

  // 3 - We're almost there
  return Promise.resolve(reviewers)
    .then(weigthedShuffle)
    .then(take(repository.max_reviewers))
    // create review request
    .then((selected) => {
      if (selected.length === 0) {
        throw createHttpError(422, 'aborted', 'no reviewers found');
      }

      logSelectReviewers(logger, repository, number, selected);

      if (config.createReviewRequest === false) {
        return Promise.resolve();
      }

      return github.pullRequests
        .createReviewRequest({
          owner: repository.owner,
          repo: repository.name,
          number,
          reviewers: selected,
        })
      ;
    })
  ;
};
