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

  res.render('project/list', {
    title: 'Projects',
    organizations,
  });
};

/**
 * List all repositories that can be sync'ed
 */
exports.listRepos = (req, res) => {
  const owner = req.params.owner;
  const user = req.user;

  const organizations = user.organizations;
  const current_org = organizations.find(o => o.name === owner);

  if (!current_org) {
    return res.status(404).send('Not Found');
  }

  Repository.find({
    owner,
  })
  .then((repositories) => {
    // first time, let's sync them
    if (repositories.length === 0 && !current_org.last_synchronized_at) {
      return module.exports.syncRepos(req, res);
    }

    // filter repos for user
    repositories = repositories.filter(r => user.repositories.includes(r.github_id));

    // enabled projects first
    repositories.sort(a => a.enabled ? -1 : 1);

    res.render('project/list', {
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
  const { owner, repo } = req.params;
  const user = req.user;

  // TODO: ensure user can do that

  Repository.findOne({
    name: repo,
    owner,
  }, (err, repository) => {
    if (!user.repositories.includes(repository.github_id)) {
      return res.status(404).send('Not Found');
    }

    if (repository.enabled) {
      req.flash('info', { msg: 'Repository already enabled' });

      return res.redirect(`/projects/${owner}`);
    }

    let createOrEditHook;
    if (repository.github_hook_id) {
      createOrEditHook = gh.auth(user).repos.editHook(
        gh.getExistingWebhookConfig(repository.github_hook_id, owner, repo, true)
      );
    } else {
      createOrEditHook = gh.auth(user).repos.createHook(
        gh.getWebhookConfig(owner, repo, true)
      );
    }

    createOrEditHook
      .catch((err) => {
        if (err.code === 404) {
          // the hook does not exist. Are we screwed?
          // Nope! Let's create a new one
          return gh.auth(user).repos.createHook(
            gh.getWebhookConfig(owner, repo, true)
          );
        }

        throw err;
      })
      .then((hook) => {
        repository
          .set({
            enabled: true,
            enabled_by: {
              user_id: user.id,
              login: user.github_login,
            },
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
        return res.redirect(`/projects/${owner}`);
      })
    ;
  })
};

/**
 * Pause project and disable webhook
 */
exports.pause = (req, res) => {
  const { owner, repo } = req.params;
  const user = req.user;

  // TODO: ensure user can do that

  Repository.findOne({
    name: repo,
    owner,
  }, (err, repository) => {
    if (!user.repositories.includes(repository.github_id)) {
      return res.status(404).send('Not Found');
    }

    if (!repository.enabled) {
      req.flash('errors', { msg: 'You must enable the project first if you want to disable it.' });

      return res.redirect(`/projects/${owner}`);
    }

    return gh.auth(req.user).repos.editHook(
      gh.getExistingWebhookConfig(repository.github_hook_id, owner, repo, false),
      (err, hook) => {
        repository
          .set({ enabled: false })
          .save();

        req.flash('success', { msg: `Project "${repo}" has been paused.` });

        return res.redirect(`/projects/${owner}`);
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
  const owner = req.params.owner;
  const user = req.user;

  Repository.find({ owner }, (err, existingRepos) => {
    let fetchRepositories;

    if (owner === user.github_login) {
      fetchRepositories = gh.auth(user).repos.getForUser({ username: owner, per_page: 50 });
    } else {
      fetchRepositories = gh.auth(user).repos.getForOrg({ org: owner, per_page: 50 });
    }

    fetchRepositories
      .then((repos) => {
        // update existing repos
        repos
          .filter(r => existingRepos.find(e => e.github_id === r.id) !== undefined)
          .map(r => {
            return {
              gh: r,
              db: existingRepos.find(e => e.github_id === r.id),
            };
          })
          .forEach(repos => {
            repos.db
              .set({
                name: repos.gh.name,
                private: repos.gh.private,
                fork: repos.gh.fork,
              })
              .save()
            ;
          })
        ;

        const repositories = repos
          .filter(r => existingRepos.find(e => e.github_id === r.id) === undefined)
          .map(r => {
            return {
              owner,
              name: r.name,
              github_id: r.id,
              private: r.private,
              fork: r.fork,
            };
          })
        ;

        Repository.create(repositories, (err) => {
         user.organizations = user.organizations.map(organization => {
            if (organization.name === owner) {
              organization.last_synchronized_at = Date.now();
            }

            return organization;
          });

          // lis of repo ids the user is allowed to see
          user.repositories = [...new Set(
            user.repositories.concat(repos.map(r => r.id))
          )];

          user.save(() => {
            req.flash('success', { msg: `"${owner}" repositories successfully synchronized.` });

            return res.redirect(`/projects/${owner}`);
          });
        });
      });
  });
};

/**
 * Configure a repository.
 */
exports.configureRepo = (req, res) => {
  const { owner, repo } = req.params;
  const user = req.user;

  // TODO: ensure user can do that

  Repository.findOne({
    name: repo,
    owner,
  }, (err, repository) => {
    if (!user.repositories.includes(repository.github_id)) {
      return res.status(404).send('Not Found');
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

      return res.redirect(`/projects/${owner}`);
    });
  });
};
