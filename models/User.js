const crypto = require('crypto');
const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: String,
  description: String,
  github_id: Number,
  avatar_url: String,
  last_synchronized_at: Date,
});

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },

  tokens: Array,

  github: String,
  github_login: String,

  repositories: Array,
  organizations: [organizationSchema],
  last_synchronized_at: Date,

  profile: {
    name: String,
    location: String,
    website: String,
    picture: String
  }
}, { timestamps: true });

/**
 * Helper method for getting user's gravatar.
 */
userSchema.methods.gravatar = function gravatar(size) {
  if (!size) {
    size = 200;
  }

  if (!this.email) {
    return `https://gravatar.com/avatar/?s=${size}&d=retro`;
  }

  const md5 = crypto.createHash('md5').update(this.email).digest('hex');

  return `https://gravatar.com/avatar/${md5}?s=${size}&d=retro`;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
