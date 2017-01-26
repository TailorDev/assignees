const bodyParser = require('body-parser');
const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');
const sinon = require('sinon');
require('sinon-mongoose');
require('sinon-as-promised');

const app = require('../app');
const Repository = require('../models/Repository');
const User = require('../models/User');

describe('POST /events', () => {
  const githubApi = nock('https://api.github.com');

  it('should filter incoming requests', (done) => {
    request(app)
      .post('/events')
      .expect(400, done);
  });

  it('should reply to GitHub PING', (done) => {
    request(app)
      .post('/events')
      .set('x-github-event', 'ping')
      .expect(200, 'PONG', done);
  });

  it('should filter incoming GitHub events', (done) => {
    request(app)
      .post('/events')
      .set('x-github-event', 'some_event')
      .expect(200, {
        status: 'ignored',
        reason: 'I do not listen to such events',
      } , done);
  });

  it('should filter Pull Request status', (done) => {
    request(app)
      .post('/events')
      .set('x-github-event', 'pull_request')
      .send({ action: 'closed' })
      .expect(200, {
        status: 'ignored',
        reason: 'action is not "opened"',
      } , done);
  });

  it('should ignore unknown repositories', (done) => {
    const event = {
      action: 'opened',
      repository: {
        id: 123,
      },
      pull_request: {
        number: '10',
        user: {
          login: 'john',
        },
        base: {
          ref: 'master',
        },
      },
    };

    const mock = sinon.mock(Repository);
    mock.expects('findOne').resolves(null);

    request(app)
      .post('/events')
      .set('x-github-event', 'pull_request')
      .send(event)
      .end((err, res) => {
        expect(res.status).to.equal(404);

        mock.restore();
        done();
      })
    ;
  });

  it('should ignore disabled repositories', (done) => {
    const event = {
      action: 'opened',
      repository: {
        id: 123,
      },
      pull_request: {
        number: '10',
        user: {
          login: 'john',
        },
        base: {
          ref: 'master',
        },
      },
    };

    const repository = {
      enabled: false,
    };

    const mock = sinon.mock(Repository);
    mock.expects('findOne').resolves(repository);

    request(app)
      .post('/events')
      .set('x-github-event', 'pull_request')
      .send(event)
      .end((err, res) => {
        expect(res.status).to.equal(403);

        mock.restore();
        done();
      })
    ;
  });

  it('should ignore unknown user', (done) => {
    const event = {
      action: 'opened',
      repository: {
        id: 123,
      },
      pull_request: {
        number: '10',
        user: {
          login: 'john',
        },
        base: {
          ref: 'master',
        },
      },
    };

    const repository = {
      enabled: true,
      enabled_by: {
        user_id: 'user-id',
      },
    };

    const repoMock = sinon.mock(Repository);
    repoMock.expects('findOne').resolves(repository);

    const userMock = sinon.mock(User);
    userMock.expects('findOne').resolves(null);

    request(app)
      .post('/events')
      .set('x-github-event', 'pull_request')
      .send(event)
      .end((err, res) => {
        expect(res.status).to.equal(401);

        repoMock.restore();
        userMock.restore();
        done();
      })
    ;
  });

  describe('with smart selection', () => {
    it('should handle repositories with empty teams', (done) => {
      const event = {
        action: 'opened',
        repository: {
          id: 123,
        },
        pull_request: {
          number: '10',
          user: {
            login: 'john',
          },
          base: {
            ref: 'master',
          },
        },
      };

      const repository = {
        owner: 'foo',
        name: 'bar',
        enabled: true,
        enabled_by: {
          user_id: 'user-id',
        },
        getTeams: () => [],
        max_reviewers: 3,
      };

      const user = {
        user_id: 'user-id',
        getGitHubToken: () => 'token',
      };

      const repoMock = sinon.mock(Repository);
      repoMock.expects('findOne').resolves(repository);

      const userMock = sinon.mock(User);
      userMock.expects('findOne').resolves(user);

      githubApi
        .get('/repos/foo/bar/pulls/10/files')
        .query({ per_page: 100, access_token: 'token' })
        .reply(200, require('./fixtures/pull-request-files-1.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Metadata/Driver/AnnotationDriver.php' })
        .reply(200, require('./fixtures/repo-commits-driver.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Exclusion.php' })
        .reply(200, require('./fixtures/repo-commits-exclusion.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Annotation/Exclusion.php' })
        .reply(200, require('./fixtures/repo-commits-annotation-exclusion.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Serializer/ExclusionManager.php' })
        .reply(200, require('./fixtures/repo-commits-manager.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Serializer/Metadata/RelationPropertyMetadata.php' })
        .reply(200, require('./fixtures/repo-commits-property.json'))
      ;

      githubApi
        .post('/repos/foo/bar/pulls/10/requested_reviewers', (body) => {
          return body.reviewers.length === 3;
        })
        .query({ access_token: 'token' })
        .reply(201)
      ;

      request(app)
        .post('/events')
        .set('x-github-event', 'pull_request')
        .send(event)
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.status).to.equal('ok');

          repoMock.restore();
          userMock.restore();
          done();
        })
      ;
    });

    it('should handle repositories with teams', (done) => {
      const event = {
        action: 'opened',
        repository: {
          id: 123,
        },
        pull_request: {
          number: '10',
          user: {
            login: 'john',
          },
          base: {
            ref: 'master',
          },
        },
      };

      const repository = {
        owner: 'foo',
        name: 'bar',
        enabled: true,
        enabled_by: {
          user_id: 'user-id',
        },
        getTeams: () => [ 'team-id-1', 'team-id-2' ],
        max_reviewers: 3,
      };

      const user = {
        user_id: 'user-id',
        getGitHubToken: () => 'token',
      };

      const repoMock = sinon.mock(Repository);
      repoMock.expects('findOne').resolves(repository);

      const userMock = sinon.mock(User);
      userMock.expects('findOne').resolves(user);

      githubApi
        .get('/repos/foo/bar/pulls/10/files')
        .query({ per_page: 100, access_token: 'token' })
        .reply(200, require('./fixtures/pull-request-files-1.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Metadata/Driver/AnnotationDriver.php' })
        .reply(200, require('./fixtures/repo-commits-driver.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Exclusion.php' })
        .reply(200, require('./fixtures/repo-commits-exclusion.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Annotation/Exclusion.php' })
        .reply(200, require('./fixtures/repo-commits-annotation-exclusion.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Serializer/ExclusionManager.php' })
        .reply(200, require('./fixtures/repo-commits-manager.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Serializer/Metadata/RelationPropertyMetadata.php' })
        .reply(200, require('./fixtures/repo-commits-property.json'))
      ;

      githubApi
        .get('/teams/team-id-1/members')
        .query({ access_token: 'token' })
        .reply(200, [
          { login: 'mvrhov' },
          { login: 'willdurand' },
        ])
      ;

      githubApi
        .get('/teams/team-id-2/members')
        .query({ access_token: 'token' })
        .reply(200, [
          { login: 'willdurand' },
        ])
      ;

      githubApi
        .post('/repos/foo/bar/pulls/10/requested_reviewers', (body) => {
          return body.reviewers.includes('willdurand') && body.reviewers.includes('mvrhov');
        })
        .query({ access_token: 'token' })
        .reply(201)
      ;

      request(app)
        .post('/events')
        .set('x-github-event', 'pull_request')
        .send(event)
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.status).to.equal('ok');

          repoMock.restore();
          userMock.restore();
          done();
        })
      ;
    });
  });

  describe('without smart selection', () => {
    it('should handle repositories with teams', (done) => {
      const event = {
        action: 'opened',
        repository: {
          id: 123,
        },
        pull_request: {
          number: '10',
          user: {
            login: 'john',
          },
          base: {
            ref: 'master',
          },
        },
      };

      const repository = {
        owner: 'foo',
        name: 'bar',
        enabled: true,
        enabled_by: {
          user_id: 'user-id',
        },
        getTeams: () => [ 'team-id-1', 'team-id-2' ],
        max_reviewers: 2,
      };

      const user = {
        user_id: 'user-id',
        getGitHubToken: () => 'token',
      };

      const repoMock = sinon.mock(Repository);
      repoMock.expects('findOne').resolves(repository);

      const userMock = sinon.mock(User);
      userMock.expects('findOne').resolves(user);

      githubApi
        .get('/repos/foo/bar/pulls/10/files')
        .query({ per_page: 100, access_token: 'token' })
        .reply(200, require('./fixtures/pull-request-files-1.json'))
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Metadata/Driver/AnnotationDriver.php' })
        .reply(200, [])
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Exclusion.php' })
        .reply(200, [])
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Configuration/Annotation/Exclusion.php' })
        .reply(200, [])
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Serializer/ExclusionManager.php' })
        .reply(200, [])
      ;

      githubApi
        .get('/repos/foo/bar/commits')
        .query({ per_page: 30, access_token: 'token', path: 'src/Hateoas/Serializer/Metadata/RelationPropertyMetadata.php' })
        .reply(200, [])
      ;

      githubApi
        .get('/repos/foo/bar/collaborators')
        .query({ access_token: 'token' })
        .reply(200, [
          { login: 'babar' },
          { login: 'emma' },
          { login: 'gilles' },
          { login: 'sharah' },
          { login: 'titeuf' },
          { login: 'titi' },
        ])
      ;

      githubApi
        .get('/teams/team-id-1/members')
        .query({ access_token: 'token' })
        .reply(200, [
          { login: 'babar' },
          { login: 'titi' },
          { login: 'john' },
        ])
      ;

      githubApi
        .get('/teams/team-id-2/members')
        .query({ access_token: 'token' })
        .reply(200, [
          { login: 'babar' },
          { login: 'emma' },
        ])
      ;

      githubApi
        .post('/repos/foo/bar/pulls/10/requested_reviewers', (body) => {
          return !body.reviewers.includes('john');
        })
        .query({ access_token: 'token' })
        .reply(201)
      ;

      request(app)
        .post('/events')
        .set('x-github-event', 'pull_request')
        .send(event)
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.status).to.equal('ok');

          repoMock.restore();
          userMock.restore();
          done();
        })
      ;
    });
  });
});
