const bodyParser = require('body-parser');
const request = require('supertest');
const { expect } = require('chai');
const nock = require('nock');
const sinon = require('sinon');
require('sinon-mongoose');
require('sinon-as-promised');

const app = require('../../app');
const Repository = require('../../models/Repository');
const User = require('../../models/User');

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
      },
    };

    const repository = {
      owner: 'foo',
      name: 'bar',
      enabled: true,
      enabled_by: {
        user_id: 'user-id',
      },
      teams: [],
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
      .get('/repos/foo/bar/collaborators')
      .query({ access_token: 'token' })
      .reply(200, [
        { login: 'babar' },
      ])
    ;

    githubApi
      .post('/repos/foo/bar/pulls/10/requested_reviewers', {
        reviewers: ['babar'],
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
