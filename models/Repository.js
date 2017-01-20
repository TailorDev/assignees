const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema({
  name: String,
  owner: String,

  // github
  github_id: Number,
  private: Boolean,
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

repositorySchema.methods.canBeEditedBy = (userId) => {
  return this.enabled_by && this.enabled_by.user_id === userId;
};

const Repository = mongoose.model('Repository', repositorySchema);

module.exports = Repository;
