/* eslint global-require: 0, comma-dangle: 0, no-param-reassign: 0 */
/* eslint prefer-arrow-callback: ["error", { "allowNamedFunctions": true }] */
process.env.NODE_ENV === 'production' && require('newrelic'); // eslint-disable-line

const express = require('express');
const compression = require('compression');
const session = require('express-session');
const bodyParser = require('body-parser');
const lusca = require('lusca');
const MongoStore = require('connect-mongo')(session);
const flash = require('express-flash');
const path = require('path');
const passport = require('passport');
const expressValidator = require('express-validator');
const sass = require('node-sass-middleware');
const moment = require('moment');
const d3Format = require('d3-format');
const gh = require('./helpers/github');

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
const logger = require('./helpers/logger').consoleLogger(app.get('env'));
require('./config/mongoose')(logger);

/**
 * Express configuration.
 */
app.set('port', process.env.PORT || 3000);
app.use(require('express-request-id')());
app.use(require('./middlewares/logger')(logger));

if (app.get('env') === 'production') {
  app.enable('trust proxy', 1); // trust first proxy
  app.use(require('express-sslify').HTTPS({ trustProtoHeader: true }));

  // redirect to custom domain (if any)
  // TODO: make it work in dev too
  app.use(function redirectToAppDomain(req, res, next) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;

    if (process.env.APP_DOMAIN && host !== process.env.APP_DOMAIN) {
      res.redirect(301, `${protocol}://${process.env.APP_DOMAIN}${req.originalUrl}`);
      return;
    }

    next();
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
  name: 'assignees',
  resave: false,
  saveUninitialized: false,
  secret: process.env.SESSION_SECRET,
  store: new MongoStore({
    url: process.env.MONGODB_URI || process.env.MONGOLAB_URI,
    autoReconnect: true,
    touchAfter: 24 * 3600 // time period in seconds
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
app.use(function addUserToLocals(req, res, next) {
  res.locals.user = req.user;
  next();
});
app.use(function redirectUser(req, res, next) {
  // After successful login, redirect back to the intended page
  if (!req.user && !req.path.match(/^\/auth/) && !req.path.match(/\./)) {
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
app.locals.asset = require('./middlewares/asset')();

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
  const scopes = ['user:email', 'read:org', 'public_repo'];

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
    res.redirect('/projects');
    return;
  }

  res.redirect(req.session.returnTo);
});

/**
 * Real app routes
 */
const withErrorHandler = fn => (...args) => fn(...args).catch(args[2]);
const ownerParam = ':owner([0-9a-zA-Z]+[-0-9a-zA-Z]*)';
const repoParam = ':repo([-_.0-9a-zA-Z]+)';

app.get(
  '/projects',
  passportConfig.isAuthenticated,
  projectController.listOrgs
);
app.get(
  `/projects/${ownerParam}`,
  passportConfig.isAuthenticated,
  withErrorHandler(projectController.listRepos)
);
app.post(
  `/projects/${ownerParam}/${repoParam}/enable`,
  passportConfig.isAuthenticated,
  withErrorHandler(projectController.enable)
);
app.post(
  `/projects/${ownerParam}/${repoParam}/pause`,
  passportConfig.isAuthenticated,
  withErrorHandler(projectController.pause)
);
app.post(
  `/projects/${ownerParam}/${repoParam}/configure`,
  passportConfig.isAuthenticated,
  withErrorHandler(projectController.configureRepo)
);

app.post(
  '/sync/organizations',
  passportConfig.isAuthenticated,
  withErrorHandler(projectController.syncOrgs)
);
app.post(
  `/sync/projects/${ownerParam}`,
  passportConfig.isAuthenticated,
  withErrorHandler(projectController.syncRepos)
);

app.post('/events', withErrorHandler(eventController.listen));

// Admin corner
app.get('/dashboard', passportConfig.isAdmin, adminController.index);

// error handling and logging
if (app.get('env') === 'development') {
  app.use(require('morgan')('dev')); // eslint-disable-line
  app.use(require('errorhandler')()); // eslint-disable-line
}

// handle 404
app.use(function error404Handler(req, res) {
  res.status(404).render('error/404', {
    title: 'Page Not Found',
  });
});

// handle all other errors
app.use(require('./middlewares/error'));

/**
 * Start Express server.
 */
app.listen(app.get('port'), () => {
  logger.info('✓ App is running at http://localhost:%d in %s mode', app.get('port'), app.get('env'));
  logger.info('  Press CTRL-C to stop\n');
});

module.exports = app;
