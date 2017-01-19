const gh = require('../helpers/github');
const Organization = require('../models/Organization');
const Repository = require('../models/Repository');

/**
 * List all repositories that can be sync'ed
 */
exports.listRepos = (req, res) => {
  const org = req.params.org;
  const userId = req.user.id;

  let repositories;
  let organizations;

  if (org) {
    Repository.find({ user_id: userId, org }, (err, docs) => {
      if (docs.length === 0) {
        gh.auth(req.user).repos.getForOrg({ org }, (err, repos) => {
          repositories = repos.map(r => {
            return {
              user_id: userId,
              name: r.name,
              org,
              github_id: r.id,
              github_url: r.html_url,
              enabled: false,
            };
          });

          Repository.create(repositories);
        });
      } else {
        repositories = docs;
      }
    });
  }

  Organization.find({ user_id: userId }, (err, docs) => {
    if (docs.length === 0) {
      gh.auth(req.user).users.getOrgs({}, function(err, orgs) {
        organizations = orgs.map(o => {
          return {
            user_id: userId,
            name: o.login,
            description: o.description,
            github_id: o.id,
            github_url: o.url,
            avatar_url: o.avatar_url,
          };
        });

        Organization.create(organizations);
      });
    } else {
      organizations = docs;
    }

    res.render('repo/list', {
      title: 'Your repositories',
      organizations,
      repositories,
      current_org: org,
    });
  });
};

/**
 * Enable project and install webhook
 */
exports.enable = (req, res) => {
  const { org, repo } = req.params;
  const userId = req.user.id;

  Repository.findOne({
    user_id: userId,
    name: repo,
    org
  }, (err, repository) => {
    if (repository.enabled) {
      req.flash('info', { msg: 'Repository already enabled' });

      return res.redirect(`/repositories/${org}`);
    }

    let githubTask;
    if (repository.github_hook_id) {
      githubTask = gh.auth(req.user).repos.editHook(
        gh.getExistingWebhookConfig(repository.github_hook_id, org, repo, true)
      );
    } else {
      githubTask = gh.auth(req.user).repos.createHook(
        gh.getWebhookConfig(org, repo, true)
      );
    }

    githubTask
      .then((hook) => {
        repository
          .set({
            enabled: true,
            github_hook_id: hook.id,
          })
          .save();

        req.flash('success', { msg: `Project "${repo}" is successfully configured.` });
      })
      .catch((err) => {
        req.flash('errors', { msg: 'An error has occured... Please contact the support.' });
      })
      .then(() => {
        return res.redirect(`/repositories/${org}`);
      })
    ;
  })
};

/**
 * Pause project and disable webhook
 */
exports.pause = (req, res) => {
  const { org, repo } = req.params;
  const userId = req.user.id;

  Repository.findOne({
    user_id: userId,
    name: repo,
    org
  }, (err, repository) => {
    if (!repository.enabled) {
      req.flash('errors', { msg: 'You must enable the project first if you want to disable it.' });

      return res.redirect(`/repositories/${org}`);
    }

    return gh.auth(req.user).repos.editHook(
      gh.getExistingWebhookConfig(repository.github_hook_id, org, repo, false),
      (err, hook) => {
        repository
          .set({ enabled: false })
          .save();

        req.flash('success', { msg: `Project "${repo}" has been paused.` });

        return res.redirect(`/repositories/${org}`);
      }
    );
  });
}
