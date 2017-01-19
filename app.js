/**
 * Module dependencies.
 */
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const bodyParser = require('body-parser');
const logger = require('morgan');
const chalk = require('chalk');
const errorHandler = require('errorhandler');
const lusca = require('lusca');
const MongoStore = require('connect-mongo')(session);
const flash = require('express-flash');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const expressValidator = require('express-validator');
const sass = require('node-sass-middleware');
const gh = require('./helpers/github');

/**
 * Controllers (route handlers).
 */
const homeController = require('./controllers/home');
const userController = require('./controllers/user');
const repoController = require('./controllers/repo');
const eventController = require('./controllers/event');

/**
 * API keys and Passport configuration.
 */
const passportConfig = require('./config/passport');

/**
 * Create Express server.
 */
const app = express();

/**
 * Connect to MongoDB.
 */
mongoose.Promise = global.Promise;
mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI);
mongoose.connection.on('error', () => {
  console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'));
  process.exit();
});

/**
 * Express configuration.
 */
app.set('port', process.env.PORT || 3000);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
// pretty html == better bootstrap output (yes, I know...)
app.locals.pretty = true;

app.use(compression());
app.use(sass({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public')
}));
app.use(logger('dev'));

app.use(bodyParser.json({
  verify: (req, res, buffer) => {
    if (req.path !== '/events') {
      return;
    }

    [
      'x-hub-signature',
      'x-github-event',
      'x-github-delivery',
    ].forEach((header) => {
      if (!req.headers[header]) {
        throw new Error(`Header ${header} is missing.`);
      }
    });

    const expected = req.headers['x-hub-signature'];
    const computed = gh.computeSignature(buffer);

    if (expected !== computed) {
      throw new Error('Invalid signature');
    }
  },
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
  store: new MongoStore({
    url: process.env.MONGODB_URI || process.env.MONGOLAB_URI,
    autoReconnect: true
  })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use((req, res, next) => {
  if (req.path === '/events') {
    next();
  } else {
    lusca.csrf()(req, res, next);
  }
});
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});
app.use((req, res, next) => {
  // After successful login, redirect back to the intended page
  if (!req.user &&
      req.path !== '/login' &&
      req.path !== '/signup' &&
      !req.path.match(/^\/auth/) &&
      !req.path.match(/\./)) {
    req.session.returnTo = req.path;
  } else if (req.user && req.path == '/account') {
    req.session.returnTo = req.path;
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));

/**
 * Primary app routes.
 */
app.get('/', homeController.index);
app.get('/logout', userController.logout);
app.get('/account', passportConfig.isAuthenticated, userController.getAccount);
app.post('/account/profile', passportConfig.isAuthenticated, userController.postUpdateProfile);
app.post('/account/delete', passportConfig.isAuthenticated, userController.postDeleteAccount);

/**
 * OAuth authentication routes. (Sign in)
 */
app.get('/auth/github', passport.authenticate('github'));
app.get('/auth/github/callback', passport.authenticate('github', {
    failureRedirect: '/',
}), (req, res) => {
  if (!req.session.returnTo || req.session.returnTo === '/') {
    res.redirect('/repositories');
  }

  res.redirect(req.session.returnTo);
});

/**
 * Real app routes
 */
app.get('/repositories/:org?', passportConfig.isAuthenticated, repoController.listRepos);
app.post('/repositories/:org/:repo/enable', passportConfig.isAuthenticated, repoController.enable);
app.post('/repositories/:org/:repo/pause', passportConfig.isAuthenticated, repoController.pause);
app.post('/repositories/:org/:repo/configure', passportConfig.isAuthenticated, repoController.configureRepo);

app.post('/sync/organizations', passportConfig.isAuthenticated, repoController.syncOrgs);
app.post('/sync/repositories/:org', passportConfig.isAuthenticated, repoController.syncRepos);

app.post('/events', eventController.listen);

/**
 * Error Handler.
 */
app.use(errorHandler());

/**
 * Start Express server.
 */
app.listen(app.get('port'), () => {
  console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env')); 
  console.log('  Press CTRL-C to stop\n');
});

module.exports = app;
