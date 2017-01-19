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

  res.send({ status: 'accepted' });
};
