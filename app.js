/**
 * Module dependencies.
 */
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const bodyParser = require('body-parser');
const chalk = require('chalk');
const lusca = require('lusca');
const MongoStore = require('connect-mongo')(session);
const flash = require('express-flash');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const expressValidator = require('express-validator');
const sass = require('node-sass-middleware');
const moment = require('moment');
const d3Format = require('d3-format');

const gh = require('./helpers/github');
const errors = require('./middlewares/errors');

/**
 * Controllers (route handlers).
 */
const homeController = require('./controllers/home');
const userController = require('./controllers/user');
const projectController = require('./controllers/project');
const eventController = require('./controllers/event');
const adminController = require('./controllers/admin');

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

if (app.get('env') === 'production') {
  app.enable('trust proxy');
  app.use(require('express-sslify').HTTPS({ trustProtoHeader: true })); // eslint-disable-line global-require
  app.use(require('express-request-id')()); // eslint-disable-line global-require

  // redirect to custom domain (if any)
  // TODO: make it work in dev too
  app.use((req, res, next) => {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;

    if (process.env.APP_DOMAIN && host !== process.env.APP_DOMAIN) {
      res.redirect(301, `${protocol}://${process.env.APP_DOMAIN}${req.originalUrl}`);
      next();
    } else {
      next();
    }
  });
}

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// compress all responses
app.use(compression());

if (app.get('env') === 'test') {
  app.use(bodyParser.json());
} else {
  // verify GitHub webhook signatures
  app.use(bodyParser.json({ verify: gh.verifySignature }));
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());

// session
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
  name: 'assignees',
  store: new MongoStore({
    url: process.env.MONGODB_URI || process.env.MONGOLAB_URI,
    autoReconnect: true,
  }),
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// security
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.path === '/events') {
    next();
  } else {
    lusca.csrf()(req, res, next);
  }
});
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));

// user
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
  } else if (req.user && req.path === '/account') {
    req.session.returnTo = req.path;
  }
  next();
});

// assets / views
app.use(sass({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public'),
}));

app.locals.pretty = true; // pretty html == better bootstrap output (yes, I know...)
app.locals.moment = moment;
app.locals.d3Format = d3Format;
app.locals.github_app_id = process.env.GITHUB_APP_ID;
app.locals.asset = require('./middlewares/assets')();

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
 * OAuth / GitHub
 */
app.get('/auth/github', (req, res, next) => {
  // `write:repo_hook` for installing a hook
  const scopes = ['user:email', 'read:org', 'write:repo_hook'];

  req.sanitizeQuery('private').toBoolean();

  // `repo` for reading private repos :x
  if (req.query.private === true) {
    scopes.push('repo');
  }

  req.session.scopes = scopes;

  return passport.authenticate('github', { scope: scopes })(req, res, next);
});

app.get('/auth/github/callback', passport.authenticate('github', {
  failureRedirect: '/',
}), (req, res) => {
  if (!req.session.returnTo || req.session.returnTo === '/') {
    return res.redirect('/projects');
  }

  res.redirect(req.session.returnTo);
});

/**
 * Real app routes
 */
const errorHandler = fn => (...args) => fn(...args).catch(args[2]);
const ownerParam = ':owner([0-9a-zA-Z]+[-0-9a-zA-Z]*)';
const repoParam = ':repo([-_\.0-9a-zA-Z]+)';

app.get('/projects', passportConfig.isAuthenticated, projectController.listOrgs);
app.get(`/projects/${ownerParam}`, passportConfig.isAuthenticated, errorHandler(projectController.listRepos));
app.post(`/projects/${ownerParam}/${repoParam}/enable`, passportConfig.isAuthenticated, errorHandler(projectController.enable));
app.post(`/projects/${ownerParam}/${repoParam}/pause`, passportConfig.isAuthenticated, errorHandler(projectController.pause));
app.post(`/projects/${ownerParam}/${repoParam}/configure`, passportConfig.isAuthenticated, errorHandler(projectController.configureRepo));

app.post('/sync/organizations', passportConfig.isAuthenticated, errorHandler(projectController.syncOrgs));
app.post(`/sync/projects/${ownerParam}`, passportConfig.isAuthenticated, errorHandler(projectController.syncRepos));

app.post('/events', errorHandler(eventController.listen));

// Admin corner
app.get('/dashboard', passportConfig.isAdmin, adminController.index);

// error handling and logging
if (app.get('env') === 'development') {
  app.use(require('morgan')('dev')); // eslint-disable-line global-require
  app.use(require('errorhandler')()); // eslint-disable-line global-require
}

// handle 404
app.use((req, res, next) => res.status(404).render('error/404', {
  title: 'Page Not Found',
}));

// handle all other errors
app.use(errors());

/**
 * Start Express server.
 */
app.listen(app.get('port'), () => {
  console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env'));

  console.log('  Press CTRL-C to stop\n');
});

module.exports = app;
