const gh = require('../helpers/github');
const Repository = require('../models/Repository');

/**
 * List all repositories that can be sync'ed
 */
exports.listRepos = (req, res) => {
  const org = req.params.org;
  const user = req.user;

  const organizations = user.organizations;
  if (organizations.length === 0 && !user.last_synchronized_at) {
    return module.exports.syncOrgs(req, res);
  }

  let findRepos = Promise.resolve(null);

  if (org) {
    findRepos = Repository.find({ user_id: user.id, org });
    current = organizations.find(o => o.name === org);
  }

  findRepos
    .then((repositories) => {
      if (repositories !== null && current !== null) {
        if (repositories.length === 0 && !current.last_synchronized_at) {
          return module.exports.syncRepos(req, res);
        }
      }

      res.render('repo/list', {
        title: 'Projects',
        organizations,
        repositories,
        current_org_name: current ? current.name : null,
        current_org: current,
      });
    })
  ;
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
};

/**
 * Sync organizations
 */
exports.syncOrgs = (req, res) => {
  const user = req.user;

  // 1. fetch current orgs
  gh.auth(user).users.getOrgs({}, (err, orgs) => {
    const organizations = orgs.map(o => {
      return {
        name: o.login,
        description: o.description,
        github_id: o.id,
        github_url: o.url,
        avatar_url: o.avatar_url,
      };
    });

    // 2. persist
    user.set({
      organizations: organizations,
      last_synchronized_at: Date.now(),
    });

    user.save(() => {
      req.flash('success', { msg: 'Organizations successfully synchronized.' });

      return res.redirect('/repositories');
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
              github_url: r.html_url,
              enabled: false,
            };
          })
        ;

        Repository.create(repositories, (err) => {
          user.organizations = user.organizations.map(organization => {
            if (organization.name === org) {
              organization.last_synchronized_at = Date.now();
            }

            return organization;
          });

          user.save(() => {
            req.flash('success', { msg: `"${org}" repositories successfully synchronized.` });

            return res.redirect(`/repositories/${org}`);
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

      return res.redirect(`/repositories/${org}`);
    });
  });
};
