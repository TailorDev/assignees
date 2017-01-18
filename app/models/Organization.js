const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  name: String,
  description: String,
  github_id: Number,
  github_url: String,
  avatar_url: String,
});

const organization = mongoose.model('organization', organizationSchema);
module.exports = organization;
