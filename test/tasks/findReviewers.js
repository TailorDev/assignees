const { expect } = require('chai');
const findReviewersTask = require('../../tasks/findReviewers');

describe('tasks/findReviewers', () => {
  describe('getPotentialReviewers()', () => {
    const getPotentialReviewers = findReviewersTask.getPotentialReviewers;

    it('should compute a weighted map of potential reviwers', () => {
      const reviewers = getPotentialReviewers(
        { foo: 40, bar: 2, titi: 1 },
        { foo: 1, bar: 1, titi: 1 }
      );

      expect(reviewers).to.contain.all.keys(['foo', 'bar', 'titi']);
    });

    it('should exclude non-collaborators', () => {
      const reviewers = getPotentialReviewers(
        { foo: 40, bar: 2, titi: 1 },
        { foo: 1 }
      );

      expect(reviewers).to.contain.all.keys(['foo']);
      expect(reviewers).not.to.contain.all.keys(['bar', 'titi']);
    });

    it('should return collaborators if no reviewers from authors', () => {
      const reviewers = getPotentialReviewers(
        { foo: 40, bar: 2, titi: 1 },
        { babar: 1 }
      );

      expect(reviewers).to.contain.all.keys(['babar']);
      expect(reviewers).not.to.contain.all.keys(['foo', 'bar', 'titi']);
    });

    it('should accept an empty set of authors', () => {
      const reviewers = getPotentialReviewers({}, { babar: 1, 'john-y': 1 });

      expect(reviewers).to.contain.all.keys(['babar', 'john-y']);
    });

    it('should accept an empty set of collaborators', () => {
      const reviewers = getPotentialReviewers({}, {});

      expect(reviewers).to.deep.equal({});
    });

    it('should does not return any reviewer when no collaborators', () => {
      const reviewers = getPotentialReviewers({ boo: 23, baz: 1 }, {});

      expect(reviewers).to.deep.equal({});
    });
  });

  describe('getPotentialReviewers()', () => {
    const createWeightedMap = findReviewersTask.createWeightedMap;

    it('should return a weighted map from an array', () => {
      const map = createWeightedMap([
        'foo',
        'foo',
        'baz',
        'baz',
        'bar',
        'foo',
        'foo',
        'baz',
      ]);

      expect(map).to.deep.equal({ foo: 4, baz: 3, bar: 1 });
    });

    it('should accept an empty array', () => {
      const map = createWeightedMap([]);

      expect(map).to.deep.equal({});
    });

    it('should accept names with special chars', () => {
      const map = createWeightedMap(['foo', 'ti ti', 'to-to']);

      expect(map).to.deep.equal({ foo: 1, 'ti ti': 1, 'to-to': 1 });
    });
  });
});
