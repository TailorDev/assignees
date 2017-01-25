module.exports = () => {
  if (process.env.NODE_ENV === 'production') {
    const version = Date.now();

    return (url) => {
      return `${url}?v=${version}`;
    };
  }

  return (url) => url;
};
