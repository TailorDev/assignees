const mongoose = require('mongoose');
const octicons = require('octicons');

const repositorySchema = new mongoose.Schema({
  name: String,
  owner: String,

  // github
  github_id: Number,
  private: Boolean,
  fork: Boolean,
  github_hook_id: Number,

  // assignees config
  enabled: { type: Boolean, default: false },
  enabled_by: {
    user_id: mongoose.Schema.Types.ObjectId,
    login: String,
  },
  max_reviewers: { type: Number, default: 1 },
});

repositorySchema.methods.getIconSVG = function getIconSVG() {
  let icon = 'repo';
  if (this.fork === true) {
    icon = 'repo-forked';
  }

  if (this.private === true) {
    icon = 'lock';
  }

  return octicons[icon].toSVG();
};

repositorySchema.methods.getURL = function getURL() {
  return `https://github.com/${this.owner}/${this.name}`;
};

repositorySchema.statics.findOneByGitHubId = function findOneByGitHubId(id) {
  return this.findOne({ github_id: id }).catch(() => null);
};

const Repository = mongoose.model('Repository', repositorySchema);

module.exports = Repository;
