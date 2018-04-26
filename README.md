Assignees
=========

[![CircleCI](https://circleci.com/gh/TailorDev/assignees.svg?style=svg&circle-token=75bf93c8fc2ccb61e3cb3f07f1444a133bf87eab)](https://circleci.com/gh/TailorDev/assignees)

Assignees does automatically code review requests on GitHub (currently).
This project is based on the
[hackathon-starter](https://github.com/sahat/hackathon-starter) :heart:
and it is a side project developed in a couple days for our needs (and
also for fun).

<p align="center">
<img src="public/images/assignees-projects.png">
</p>

## Usage

### Web application

~The application is available at: https://app.assignees.io/.~
<br>:warning: As of April 2018, our public instance is not available anymore,
sorry.

See the next section if you want to host it yourself.

### Command line

This project provides a command line tool to perform various operations. You can
run it _via_ [Yarn](https://yarnpkg.com/):

    $ yarn run assignees

In development environment, you should run the command above within a `app`
Docker container:

    $ docker-compose run --rm app yarn run assignees
    yarn run v0.19.1
    $ node bin/assignees

    Usage: assignees [options] [command]


    Commands:

        feature:add [username] [feature]                       add feature to user
        feature:remove [username] [feature]                    remove feature to user
        feature:list [username...]                             list enabled features of user
        pr:process [options] [repositoryId] [number] [author]  process pull request

    Options:

        -h, --help     output usage information
        -V, --version  output the version number

## Installation

This project provides a [Docker Compose](https://docs.docker.com/compose/)
configuration to quickly build and start it. Clone the project, then run:

    $ docker-compose up -d app

The application will shortly be accessible at: http://assignees.localdev:3000/.

**Important:** you must configure your local DNS to be able to use
`assignees.localdev` in the URL. You can edit your `/etc/hosts` file, but it is
recommended to install and configure
[Dnsmasq](https://en.wikipedia.org/wiki/Dnsmasq). [This link is a good
tutorial](https://passingcuriosity.com/2013/dnsmasq-dev-osx/).

### Limitations

The `docker-compose.yml` contains *my* credentials (for an application that does
not exist anymore at the time of writing by the way). You should [register a new
OAuth application](https://github.com/settings/applications/new) on your own.

It is also recommended to use [ngrok](https://ngrok.com/) if you plan to test
webhooks from your development environment.

### Configuration

This project is configured with environment variables. Here is the list:

* `ADMIN_IDS`: a comma-separated (without space) list of GitHub user identifiers
  (not usernames) to grant admin rights to certain users;
* `APP_DOMAIN`: the domain that points to this application (for redirecting
  traffic from Heroku `*.herokuapp.com` domain for instance);
* `GITHUB_ID`: the GitHub ID you get when you register a GitHub (OAuth)
  application;
* `GITHUB_SECRET`: the GitHub secret tied to the previous GitHub ID;
* `GITHUB_APP_ID`: the identifier of the application you had to register on
  GitHub;
* `GITHUB_WEBHOOK_SECRET`: a randomly generated value (like a password) used to
  sign and verify GitHub webhooks requests.
* `GITHUB_WEBHOOK_URL`: the webhook URL that will be registered on each project
  enabled by Assignees (_e.g._ `https://app.assignees.io/events`);
* `MONGODB_URI`: the MongoDB data source name (_e.g._ `mongodb://user:pass@server/db`).
  This variable is automatically set if you use the _mLab_ add-on on Heroku.
  Alternatively, you can use the `MONGOLAB_URI` environment variable;
* `SESSION_SECRET`: a randomly generated value to prevent session tampering.

Also, setting `NODE_ENV` to `production` looks like a good idea.

**N.B.** because of the Yarn incompatibility on Heroku, I set
`NODE_MODULES_CACHE` to `false` and `NPM_CONFIG_PRODUCTION` to `true`.

#### New Relic

To monitor the application at an early stage, it is possible to use New Relic
APM. These extra environment variables could be useful (at least on Heroku):

* `NEW_RELIC_APP_NAME`;
* `NEW_RELIC_LICENSE_KEY`;
* `NEW_RELIC_LOG` (automatically set by Heroku when enabling the add-on);
* `NEW_RELIC_NO_CONFIG_FILE` should be set to `true`;
* `NEW_RELIC_SKIP_NATIVE_METRICS` should be set to `true`.

**Note:** [this commit](https://github.com/TailorDev/assignees/commit/f1d0e6657a2676ddf79c93c2da170363f926b71f)
has disabled New Relic on this project. You can re-enable it by yourself by
requiring the `newrelic` package in both the `package.json` file and the code.

#### Other settings

You may want to change the name of the project, the contact email address, or
the Piwik tracking code by editing the [`views/global-mixins.pug`
template](https://github.com/TailorDev/assignees/blob/master/views/global-mixins.pug).

## Running the Tests

    $ [docker-compose run --rm app] yarn run test

## License

Assignees is released under the MIT License. See the bundled
[LICENSE](LICENSE.md) file for details.
