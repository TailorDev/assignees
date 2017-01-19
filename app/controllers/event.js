/**
 * Listen to GitHub events
 */
exports.listen = (req, res) => {
  if (req.header('x-github-event') !== 'pull_request') {
    return res.send({ status: 'ignored', reason: 'I don\t listen to such events.' });
  }

  if (req.body.action !== 'opened') {
    return res.send({ status: 'ignored', reason: 'Action is not "opened".' });
  }

  // TODO: see if project is still enabled
  // TODO: send the PR to queue for assigning reviewers
  // TODO: see if `req.body.pull_request.title` contains WIP

  res.send({ status: 'accepted' });
};
