const { expect } = require('chai');
const sinon = require('sinon');
require('sinon-mongoose');

const User = require('../models/User');

describe('User Model', () => {
  it('should create a new user', (done) => {
    const UserMock = sinon.mock(new User({ github: 'github-id' }));
    const user = UserMock.object;

    UserMock
      .expects('save')
      .yields(null);

    user.save((err) => {
      UserMock.verify();
      UserMock.restore();
      expect(err).to.be.null;
      done();
    });
  });

  it('should return error if user is not created', (done) => {
    const UserMock = sinon.mock(new User({ github: 'github-id' }));
    const user = UserMock.object;
    const expectedError = {
      name: 'ValidationError'
    };

    UserMock
      .expects('save')
      .yields(expectedError);

    user.save((err, result) => {
      UserMock.verify();
      UserMock.restore();
      expect(err.name).to.equal('ValidationError');
      expect(result).to.be.undefined;
      done();
    });
  });

  it('should not create a user if github id already exists', (done) => {
    const UserMock = sinon.mock(new User({ github: 'github-id' }));
    const user = UserMock.object;
    const expectedError = {
      name: 'MongoError',
      code: 11000
    };

    UserMock
      .expects('save')
      .yields(expectedError);

    user.save((err, result) => {
      UserMock.verify();
      UserMock.restore();
      expect(err.name).to.equal('MongoError');
      expect(err.code).to.equal(11000);
      expect(result).to.be.undefined;
      done();
    });
  });

  describe('hasGitHubScopes()', () => {
    const createUserWithScopes = (scopes) => {
      return new User({
        tokens: [{ kind: 'github', token: '', scopes }],
      });
    };

    it('should deal with empty values', () => {
      const user1 = new User();
      expect(user1.hasGitHubScopes([])).to.be.true;
      expect(user1.hasGitHubScopes(['foo'])).to.be.false;

      const user2 = createUserWithScopes([]);
      expect(user2.hasGitHubScopes([])).to.be.true;

      const user3 = createUserWithScopes(undefined);
      expect(user3.hasGitHubScopes([])).to.be.true;
    });

    it('should return true when user own (at least) all given scopes', () => {
      const user = createUserWithScopes(['foo', 'bar', 'baz']);

      expect(user.hasGitHubScopes(['foo'])).to.be.true;
      expect(user.hasGitHubScopes(['baz', 'foo'])).to.be.true;
      expect(user.hasGitHubScopes(['bar', 'baz', 'foo'])).to.be.true;
    });

    it('should return false when user does not own all given scopes', () => {
      const user = createUserWithScopes(['foo', 'bar', 'baz']);

      expect(user.hasGitHubScopes(['foo', ''])).to.be.false;
      expect(user.hasGitHubScopes(['bar', 'nope', 'foo'])).to.be.false;
    });
  });

  describe('hasAccessTo()', () => {
    it('should not cause errors', () => {
      const user = new User();

      expect(user.hasAccessTo('foo')).to.be.false;
      expect(user.hasAccessTo(null)).to.be.false;
      expect(user.hasAccessTo(undefined)).to.be.false;

      const user2 = new User({ features: [] });

      expect(user2.hasAccessTo('foo')).to.be.false;
      expect(user2.hasAccessTo(null)).to.be.false;
      expect(user2.hasAccessTo(undefined)).to.be.false;

      const user3 = new User({ features: null });

      expect(user3.hasAccessTo('foo')).to.be.false;
      expect(user3.hasAccessTo(null)).to.be.false;
      expect(user3.hasAccessTo(undefined)).to.be.false;

      const user4 = new User({ features: undefined });

      expect(user4.hasAccessTo('foo')).to.be.false;
      expect(user4.hasAccessTo(null)).to.be.false;
      expect(user4.hasAccessTo(undefined)).to.be.false;
    });

    it('should return true when user has feature', () => {
      const user = new User({ features: ['foo'] });

      expect(user.hasAccessTo('foo')).to.be.true;
      expect(user.hasAccessTo('invalid')).to.be.false;
    });
  });
});
