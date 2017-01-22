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
  email: String,

  tokens: Array,

  github: { type: String, unique: true },
  github_login: String,

  repositories: Array,
  organizations: [organizationSchema],
  last_synchronized_at: Date,

  profile: {
    name: String,
    location: String,
    website: String,
    picture: String,
  },
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

userSchema.methods.isAdmin = function isAdmin() {
  const admins = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];

  return this.github && admins.includes(this.github);
};

userSchema.methods.canSee = function (repository) {
  return this.repositories.includes(repository.github_id);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
