const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema({
  // link to user
  user_id: mongoose.Schema.Types.ObjectId,

  name: String,
  org: String,
  enabled: { type: Boolean, default: false },

  // github
  github_id: Number,
  github_url: String,
  github_hook_id: Number,

  max_reviewers: { type: Number, default: 1 },
  skip_wip: { type: Boolean, default: false },
});

const Repository = mongoose.model('Repository', repositorySchema);

module.exports = Repository;
