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
    });
  });
};
