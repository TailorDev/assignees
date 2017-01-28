const findReviewersTask = require('../tasks/findReviewers');

const findReviewers = findReviewersTask.configure({
  maxPullRequestFilesToProcess: process.env.maxPullRequestFilesToProcess || 5,
  nbCommitsToRetrieve: process.env.nbCommitsToRetrieve || 30,
  createReviewRequest: true,
});

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

  await findReviewers(
    req.body.repository.id,
    req.body.pull_request.number,
    req.body.pull_request.user.login,
    req.logger
  );

  res.send({ status: 'ok' });
};
