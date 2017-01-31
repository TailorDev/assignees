const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;

const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

/**
 * Sign in with GitHub.
 */
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_ID,
  clientSecret: process.env.GITHUB_SECRET,
  callbackURL: '/auth/github/callback',
  passReqToCallback: true,
}, (req, accessToken, refreshToken, profile, done) => {
  if (req.user) {
    if (req.user.hasGitHubScopes(req.session.scopes)) {
      return done(null, req.user);
    }

    // when not all *required* scopes have been granted, we need to
    // "reset" user info so that we are sure to use the right token.

    req.user.tokens = [{
      kind: 'github',
      accessToken,
      scopes: req.session.scopes,
    }];
    req.user.repositories = [];
    req.user.organizations = [];
    req.user.last_synchronized_at = null;

    return req.user.save((err) => {
      req.flash('info', { msg: 'We have updated your information to reflect new GitHub permissions.' });
      done(err, req.user);
    });
  }

  User.findOne({ github: profile.id }, (err, existingUser) => {
    if (err) {
      return done(err);
    }

    if (existingUser) {
      if (existingUser.hasGitHubScopes(req.session.scopes)) {
        return done(null, existingUser);
      }

      // when not all *required* scopes have been granted, we need to
      // "reset" user info so that we are sure to use the right token.

      existingUser.tokens = [{
        kind: 'github',
        accessToken,
        scopes: req.session.scopes,
      }];
      existingUser.repositories = [];
      existingUser.organizations = [];
      existingUser.last_synchronized_at = null;

      return existingUser.save((err) => {
        req.flash('info', { msg: 'We have updated your information to reflect new GitHub permissions.' });
        done(err, existingUser);
      });
    }

    const user = new User();

    user.github = profile.id;
    user.github_login = profile._json.login;
    user.email = profile._json.email;
    user.tokens = [{
      kind: 'github',
      accessToken,
      scopes: req.session.scopes,
    }];
    user.profile.name = profile.displayName;
    user.profile.picture = profile._json.avatar_url;
    user.profile.location = profile._json.location;
    user.profile.website = profile._json.blog;

    user.save((err) => {
      done(err, user);
    });
  });
}));

/**
 * Login Required middleware.
 */
exports.isAuthenticated = function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
};

/**
 * Authorization Required middleware.
 */
exports.isAdmin = function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.isAdmin()) {
    return next();
  }

  res.redirect('/404');
};
