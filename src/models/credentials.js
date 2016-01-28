'use strict'

var config = require('../../config.json')
var AWS = require('aws-sdk')
var cognitoidentity = new AWS.CognitoIdentity()
var crypto = require('crypto')
var Record = require('./record')

/**
 * Credentials model, inherits from Record
 *
 * If a new Credentials object is created without an id, 
 * it is considered new and stored, unverified; otherwise
 * a credential object is initialized and either returned directly or through
 * the callback. If a new record is created, the callback is required; otherwise
 * it's optional. 
 * 
 * @param {object}   data     requires at least email/password
 * @param {Function} callback
 */
var Credentials = function(data, callback) {

  var self = this

  if (data.id === undefined) {

    data.id = self._randomHex(16)
    data.verified = false
    data.verificationToken = self._randomHex(32)

    Credentials.computeHash(data.password, null, function(err, result) {
      if (err) return callback(err)

      data.passwordSalt = result.salt
      data.passwordHash = result.hash

      self.create(data, function(err, result) {
        self._setFields(data)
        return callback(err, self)
      })
    })
  } else {
    self._setFields(data)
    if (Object.prototype.toString.call(callback) == '[object Function]')
      return callback(null, self)
    else
      return self
  }
}

/**
 * inherit from Record, configuring the storage
 */
Credentials.constructor = Credentials
Credentials.prototype = new Record({
  name: "Credentials",
  fields: [
    "id",
    "email",
    "passwordSalt",
    "passwordHash",
    "permissions",
    "verified",
    "verificationToken",
    "resetToken",
    "requirePasswordChange"
  ],
  primaryKey: "id"
})

/********************
 * "Static" Methods *
 ********************
 * These methods can be called without creating a new instance
 */

/**
 * credentials exist or not based on email
 * @param  {string}   email
 * @param  {Function} callback
 */
Credentials.exists = function(email, callback) {

  this.prototype.findBy('email', email, function(err, result) {

    // Result is always an object, empty if not found
    return callback(err, Object.keys(result).length > 0)
  })
}

/**
 * fetch credentials from storage by email address
 * @param  {string}   email
 * @param  {Function} callback Credentials object
 */
Credentials.findByEmail = function(email, callback) {
  this.prototype.findBy('email', email, function(err, result) {
    return callback(err, new Credentials(result))
  })
}

/**
 * computes a password hash
 * @param  {string}   password
 * @param  {string}   salt     if null, a salt will be generated
 * @param  {Function} callback salt/hash
 */
Credentials.computeHash = function(password, salt, callback) {

  if ( ! salt ) {
    var salt = this.prototype._randomHex(128)
    if ( salt instanceof Error ) return callback(salt)
    return this.computeHash(password, salt, callback)
  }

  crypto.pbkdf2(password, salt, 4096, 256, function(err, derivedKey) {
    if (err) callback( new Error("Interval Server Error: " + JSON.stringify(err)) )
    callback(null, {salt: salt, hash: derivedKey.toString('hex')})
  })
}

/******************
 * Public methods *
 ******************
 * These methods should be called from a Credentials instance
 */

/**
 * gets an OpenID token from Cognito
 * @param  {Function} callback  OpenID Token
 */
Credentials.prototype.authToken = function(callback) {

  var params = {
    IdentityPoolId: config.cognitoIdentityPoolId,
    Logins: {},
    TokenDuration: 3600
  }
  params.Logins[config.developerProviderName] = this.email
  
  cognitoidentity.getOpenIdTokenForDeveloperIdentity(params, function(err, data) {
    if (err) return callback(new Error("Internal Server Error: " + JSON.stringify(err)))
    return callback(null, data.Token)
  })
}

/**
 * sets a new password
 * @param {string}   password
 * @param {Function} callback
 */
Credentials.prototype.setPassword = function(password, callback) {

  var self = this

  Credentials.computeHash(password, null, function(err, result) {
    if (err) return callback(err)

    var updates = {
      passwordSalt: result.salt,
      passwordHash: result.hash
    }

    self.update(updates, callback)
  })
}

/**
 * sets the credentials as verified and removes the verification token
 * @param {Function} callback
 */
Credentials.prototype.setVerified = function(callback) {
  this.update({verified: true, verificationToken: null}, callback)
}

/**
 * creates a reset password token
 * @param {Function} callback
 */
Credentials.prototype.setResetToken = function(callback) {
  this.update({resetToken: this._randomHex(32)}, callback)
}

/*******************
 * Private methods *
 *******************/

/**
 * sets the Credentials values from a hash
 * @param {object} fields hash of key/values
 */
Credentials.prototype._setFields = function(fields) {
  for (var key in fields)
    this[key] = fields[key]
}

/**
 * generates a random hex string
 * @param  {number} length
 * @return {string}        hex string
 */
Credentials.prototype._randomHex = function(length) {
  var id = crypto.randomBytes(length)
  if (id instanceof Error) return new Error("Interval Server Error: " + JSON.stringify(id))
  return id.toString('hex')
}

module.exports = Credentials