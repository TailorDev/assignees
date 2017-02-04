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

  features: Array,
}, { timestamps: true });

/**
 * Helper method for getting user's gravatar.
 */
userSchema.methods.gravatar = function gravatar(size) {
  const s = size || 200;

  if (!this.email) {
    return `https://gravatar.com/avatar/?s=${s}&d=retro`;
  }

  const md5 = crypto.createHash('md5').update(this.email).digest('hex');

  return `https://gravatar.com/avatar/${md5}?s=${s}&d=retro`;
};

userSchema.methods.isAdmin = function isAdmin() {
  const admins = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];

  return this.github && admins.includes(this.github);
};

userSchema.methods.canSee = function canSee(repository) {
  return this.repositories.includes(repository.github_id);
};

userSchema.methods.getGitHubToken = function getGitHubToken() {
  return this.tokens.find(t => t.kind === 'github').accessToken || null;
};

// inclusion is checked here, not equality
userSchema.methods.hasGitHubScopes = function hasGitHubScopes(scopes) {
  const token = this.tokens.find(t => t.kind === 'github');
  const userScopes = token ? (token.scopes || []) : [];

  return scopes.filter(s => userScopes.includes(s) !== true).length === 0;
};

userSchema.methods.hasAccessTo = function hasAccessTo(feature) {
  if (!this.features || this.features.length === 0) {
    return false;
  }

  return this.features.includes(feature);
};

userSchema.methods.getUsername = function getUsername() {
  return this.github_login;
};

userSchema.statics.findOneById = function findOneById(id) {
  return this.findOne({ _id: id }).catch(() => null);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
