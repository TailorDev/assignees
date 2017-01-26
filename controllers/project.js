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
exports.listRepos = (req, res, next) => {
  const owner = req.params.owner;
  const user = req.user;

  const organizations = user.organizations;
  const currentOrg = organizations.find(o => o.name === owner);

  if (!currentOrg) {
    return Promise.resolve().then(next); // 404
  }

  // first time, let's sync them
  if (!currentOrg.last_synchronized_at) {
    return module.exports.syncRepos(req, res, next);
  }

  return Repository.find({
    owner,
  })
  .then((repositories) => {
     // filter repos for user
    repositories = repositories.filter(r => user.repositories.includes(r.github_id));

    // enabled projects first
    repositories.sort(a => (a.enabled ? -1 : 1));

    let fetchTeams = Promise.resolve([]);
    if (owner !== user.github_login) {
      fetchTeams = gh.auth(user).orgs
        .getTeams({
          org: owner,
        })
        .catch([])
      ;
    }

    return fetchTeams
      .then((teams) => {
        res.render('project/list', {
          title: 'Projects',
          organizations,
          repositories,
          teams,
          current_org: currentOrg,
        });
      })
    ;
  });
};

/**
 * Enable project and install webhook
 */
exports.enable = async (req, res, next) => {
  const { owner, repo } = req.params;
  const user = req.user;

  const repository = await Repository.findOne({
    name: repo,
    owner,
  })
  .catch(() => null);

  if (repository === null || !user.canSee(repository)) {
    return Promise.resolve().then(next); // 404
  }

  if (repository.enabled) {
    req.flash('info', { msg: 'Repository already enabled' });

    return res.redirect(`/projects/${owner}`);
  }

  let createOrEditHook;
  if (repository.github_hook_id) {
    createOrEditHook = gh.auth(user).repos.editHook(
      gh.getExistingWebhookConfig(repository.github_hook_id, owner, 'repo', true)
    );
  } else {
    createOrEditHook = gh.auth(user).repos.createHook(
      gh.getWebhookConfig(owner, repo, true)
    );
  }

  return createOrEditHook
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
    .then(hook => {
      return repository
        .set({
          enabled: true,
          enabled_by: {
            user_id: user.id,
            login: user.github_login,
          },
          github_hook_id: hook.id,
        })
        .save()
      ;
    })
    .then(() => {
      req.flash('success', { msg: `Project "${repo}" is successfully configured.` });
      res.redirect(`/projects/${owner}`);
    })
  ;
};

/**
 * Pause project and disable webhook
 */
exports.pause = async (req, res, next) => {
  const { owner, repo } = req.params;
  const user = req.user;

  const repository = await Repository.findOne({
    name: repo,
    owner,
  })
  .catch(() => null);

  if (repository === null || !user.canSee(repository)) {
    return Promise.resolve().then(next); // 404
  }

  if (!repository.enabled) {
    req.flash('errors', { msg: 'You must enable the project first if you want to disable it.' });

    return res.redirect(`/projects/${owner}`);
  }

  return gh.auth(req.user).repos
    .editHook(gh.getExistingWebhookConfig(repository.github_hook_id, owner, repo, false))
    .then(() => {
      return repository
        .set({ enabled: false })
        .save()
      ;
    })
    .then(() => {
      req.flash('success', { msg: `Project "${repo}" has been paused.` });
      res.redirect(`/projects/${owner}`);
    })
  ;
};

/**
 * Sync organizations
 */
exports.syncOrgs = (req, res) => {
  const user = req.user;

  return gh.auth(user).users
    .getOrgs({})
    .then(organizations => {
      return [
        {
          name: user.github_login,
          description: 'Your personal account',
          github_id: user.github,
          avatar_url: user.profile.picture,
        },
      ].concat(organizations.map(o => ({
        name: o.login,
        description: o.description,
        github_id: o.id,
        avatar_url: o.avatar_url,
      })));
    })
    .then(organizations => {
      return user
        .set({
          organizations,
          last_synchronized_at: Date.now(),
        })
        .save()
      ;
    })
    .then(() => {
      req.flash('success', { msg: 'Organizations successfully synchronized.' });
      res.redirect('/projects');
    })
  ;
};

/**
 * Sync repositories
 */
exports.syncRepos = (req, res) => {
  const owner = req.params.owner;
  const user = req.user;

  return Repository
    .find({ owner })
    .then((existingRepos) => {
      let fetchRepositories;

      if (owner === user.github_login) {
        fetchRepositories = gh.auth(user).repos.getAll({ affiliation: 'owner', per_page: 100 });
      } else {
        fetchRepositories = gh.auth(user).repos.getForOrg({ org: owner, per_page: 100 });
      }

      return fetchRepositories
        // exclude repos without admin rights
        .then(repos => repos.filter(r => r.permissions.admin === true))
        .then((repos) => {
          // update existing repos
          repos
            .filter(r => existingRepos.find(e => e.github_id === r.id) !== undefined)
            .map(r => ({
              gh: r,
              db: existingRepos.find(e => e.github_id === r.id),
            }))
            .forEach((repos) => {
              repos.db
                .set({
                  name: repos.gh.name,
                  private: repos.gh.private,
                  fork: repos.gh.fork,
                })
                .save((err) => {
                  if (err) {
                    throw err;
                  }
                })
              ;
            })
          ;

          // create new ones
          const repositories = repos
            .filter(r => existingRepos.find(e => e.github_id === r.id) === undefined)
            .map(r => ({
              owner,
              name: r.name,
              github_id: r.id,
              private: r.private,
              fork: r.fork,
            }))
          ;

          return Repository.create(repositories)
            .then(() => {
              user.organizations = user.organizations.map((organization) => {
                if (organization.name === owner) {
                  organization.last_synchronized_at = Date.now();
                }

                return organization;
              });

              // TODO: here we should filter by org, otherwise one
              // may see repos he does not have access to anymore.

              // list of repo ids the user is allowed to see
              user.repositories = [...new Set(
                user.repositories.concat(repos.map(r => r.id))
              )];

              return user.save();
            })
          ;
        })
      ;
    })
    .then(() => {
      req.flash('success', { msg: `"${owner}" repositories successfully synchronized.` });
      res.redirect(`/projects/${owner}`);
    })
  ;
};

/**
 * Configure a repository.
 */
exports.configureRepo = async (req, res, next) => {
  const { owner, repo } = req.params;
  const user = req.user;

  const repository = await Repository.findOne({
    name: repo,
    owner,
  })
  .catch(() => null);

  if (repository === null || !user.canSee(repository)) {
    return Promise.resolve().then(next); // 404
  }

  req.sanitizeBody('max').toInt();
  req.checkBody('max',
    'We expect the number of reviewers to be a strictly positive integer.'
  ).isInt({ min: 1 });

  const errors = await req.getValidationResult();

  if (!errors.isEmpty()) {
    errors.array().forEach((error) => {
      req.flash('errors', { msg: error.msg });
    });

    return res.redirect(`/projects/${owner}`);
  }

  const { max } = req.body;

  let teams = [];
  if (req.body.teams) {
    // sanitize team ids
    teams = [].concat(req.body.teams).map(Number).filter(n => !isNaN(n) && n > 0);
  }

  return repository
    .set({
      max_reviewers: max,
      teams,
    })
    .save()
    .then(() => {
      req.flash('success', { msg: 'Configuration successfully updated.' });
      res.redirect(`/projects/${owner}`);
    })
  ;
};
