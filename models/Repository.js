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
  skip_wip: { type: Boolean, default: false },
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

const Repository = mongoose.model('Repository', repositorySchema);

module.exports = Repository;
