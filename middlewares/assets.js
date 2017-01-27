const pkg = require('../package.json');

module.exports = () => {
  if (process.env.NODE_ENV === 'production') {
    const version = pkg.version;

    return (url) => {
      return `${url}?v=${version}`;
    };
  }

  return (url) => url;
};
