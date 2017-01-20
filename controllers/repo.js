const gh = require('../helpers/github');
const Repository = require('../models/Repository');

/**
 * List all organizations that have been sync'ed
 */
exports.listOrgs = (req, res) => {
  const user = req.user;

  const organizations = user.organizations;

  // first time, let's sync them
  if (organizations.length === 0 && !user.last_synchronized_at) {
    return module.exports.syncOrgs(req, res);
  }

  res.render('repo/list', {
    title: 'Projects',
    organizations,
  });
};

/**
 * List all repositories that can be sync'ed
 */
exports.listRepos = (req, res) => {
  const org = req.params.org;
  const user = req.user;

  const organizations = user.organizations;
  const current_org = organizations.find(o => o.name === org);

  if (!current_org) {
    return res.status(404).send('Not Found');
  }

  Repository.find({
    user_id: user.id,
    org,
  })
  .then((repositories) => {
    // first time, let's sync them
    if (repositories.length === 0 && !current_org.last_synchronized_at) {
      return module.exports.syncRepos(req, res);
    }

    res.render('repo/list', {
      title: 'Projects',
      organizations,
      repositories,
      current_org,
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

      return res.redirect(`/projects/${org}`);
    }

    let createOrEditHook;
    if (repository.github_hook_id) {
      createOrEditHook = gh.auth(req.user).repos.editHook(
        gh.getExistingWebhookConfig(repository.github_hook_id, org, repo, true)
      );
    } else {
      createOrEditHook = gh.auth(req.user).repos.createHook(
        gh.getWebhookConfig(org, repo, true)
      );
    }

    createOrEditHook
      .catch((err) => {
        if (err.code === 404) {
          // the hook does not exist. Are we screwed?
          // Nope! Let's create a new one
          return gh.auth(req.user).repos.createHook(
            gh.getWebhookConfig(org, repo, true)
          );
        }

        throw err;
      })
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
        console.log({ method: 'enable-hook', err });

        req.flash('errors', { msg: 'An error has occured... Please contact the support.' });
      })
      .then(() => {
        return res.redirect(`/projects/${org}`);
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

      return res.redirect(`/projects/${org}`);
    }

    return gh.auth(req.user).repos.editHook(
      gh.getExistingWebhookConfig(repository.github_hook_id, org, repo, false),
      (err, hook) => {
        repository
          .set({ enabled: false })
          .save();

        req.flash('success', { msg: `Project "${repo}" has been paused.` });

        return res.redirect(`/projects/${org}`);
      }
    );
  });
};

/**
 * Sync organizations
 */
exports.syncOrgs = (req, res) => {
  const user = req.user;

  // 1. fetch current orgs
  gh.auth(user).users.getOrgs({}, (err, orgs) => {
    const organizations = [
      {
        name: user.github_login,
        description: 'Your personal account',
        github_id: user.github,
        avatar_url: user.profile.picture,
      }
    ].concat(orgs.map(o => {
      return {
        name: o.login,
        description: o.description,
        github_id: o.id,
        avatar_url: o.avatar_url,
      };
    }));

    // 2. persist
    user.set({
      organizations: organizations,
      last_synchronized_at: Date.now(),
    });

    user.save(() => {
      req.flash('success', { msg: 'Organizations successfully synchronized.' });

      return res.redirect('/projects');
    });
  });
};

/**
 * Sync repositories
 */
exports.syncRepos = (req, res) => {
  const org = req.params.org;
  const user = req.user;

  Repository.find({ user_id: user.id, org }, (err, existingRepos) => {
    let fetchRepositories;

    if (org === user.github_login) {
      fetchRepositories = gh.auth(user).repos.getForUser({ username: org, per_page: 50 });
    } else {
      fetchRepositories = gh.auth(user).repos.getForOrg({ org, per_page: 50 });
    }

    fetchRepositories
      .then((repos) => {
        const repositories = repos
          .filter(r => existingRepos.find(e => e.github_id === r.id) === undefined)
          .map(r => {
            return {
              user_id: user.id,
              org,
              name: r.name,
              github_id: r.id,
            };
          })
        ;

        Repository.create(repositories, (err) => {
          user.organizations = user.organizations.map(organization => {
            if (organization.name === org) {
              console.log({organization})
              organization.last_synchronized_at = Date.now();
            }

            return organization;
          });

          user.save(() => {
            req.flash('success', { msg: `"${org}" repositories successfully synchronized.` });

            return res.redirect(`/projects/${org}`);
          });
        });
      });
  });
};

/**
 * Configure a repository.
 */
exports.configureRepo = (req, res) => {
  const { org, repo } = req.params;
  const userId = req.user.id;

  Repository.findOne({
    user_id: userId,
    name: repo,
    org
  }, (err, repository) => {
    if (err) {
      return res.status(404).end();
    }

    req.sanitizeBody('max').toInt();
    req.sanitizeBody('skip').toBoolean();

    req.checkBody('max', 'The number of reviewers should be an integer')
      .isInt('The minimum number of reviewers should be 1', { min: 1 })
    ;
    req.checkBody('skip').optional().isBoolean();

    req.getValidationResult().then((result) => {
      if (!result.isEmpty()) {
        result.array().forEach(error => {
          req.flash('errors', { msg: error.msg });
        });
      } else {
        const { max, skip } = req.body;

        repository
          .set({
            skip_wip: !!skip || false,
            max_reviewers: max,
          })
          .save()
        ;

        req.flash('success', { msg: 'Configuration successfully updated.' });
      }

      return res.redirect(`/projects/${org}`);
    });
  });
};
