const _ = require('lodash');
const passport = require('passport');
const request = require('request');
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
  // `write:repo_hook` for installing a hook
  // `repo` for reading private repos :x
  scope: [ 'user:email', 'read:org', 'write:repo_hook', 'repo' ],
  passReqToCallback: true
}, (req, accessToken, refreshToken, profile, done) => {
  if (req.user) {
    User.findOne({ github: profile.id }, (err, existingUser) => {
      if (existingUser) {
        req.flash('errors', { msg: 'There is already a GitHub account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
        done(err);
      } else {
        User.findById(req.user.id, (err, user) => {
          if (err) { return done(err); }
          user.github = profile.id;
          user.github_login = user.github_login || profile._json.login,
          user.tokens.push({ kind: 'github', accessToken });
          user.profile.name = user.profile.name || profile.displayName;
          user.profile.picture = user.profile.picture || profile._json.avatar_url;
          user.profile.location = user.profile.location || profile._json.location;
          user.profile.website = user.profile.website || profile._json.blog;
          user.save((err) => {
            req.flash('info', { msg: 'GitHub account has been linked.' });
            done(err, user);
          });
        });
      }
    });
  } else {
    User.findOne({ github: profile.id }, (err, existingUser) => {
      if (err) {
        return done(err);
      }

      if (existingUser) {
        return done(null, existingUser);
      }

      const user = new User();
      user.email = profile._json.email;
      user.github = profile.id;
      user.github_login = profile._json.login,
      user.tokens.push({ kind: 'github', accessToken });
      user.profile.name = profile.displayName;
      user.profile.picture = profile._json.avatar_url;
      user.profile.location = profile._json.location;
      user.profile.website = profile._json.blog;

      user.save((err) => {
        done(err, user);
      });
    });
  }
}));

/**
 * Login Required middleware.
 */
exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
};

/**
 * Authorization Required middleware.
 */
exports.isAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.isAdmin()) {
    return next();
  }
  res.status(404).send(`Cannot GET ${req.path}`);
};
