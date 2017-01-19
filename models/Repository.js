const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  name: String,
  org: String,
  github_id: Number,
  github_url: String,
  enabled: Boolean,
  github_hook_id: Number,
});

const Repository = mongoose.model('Repository', repositorySchema);
module.exports = Repository;
