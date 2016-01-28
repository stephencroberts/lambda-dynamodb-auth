'use strict'

var config = require('../../config.json')
var AWS = require('aws-sdk')
var ses = new AWS.SES()
var crypto = require('crypto')
var Credentials = require('../models/credentials')

var CredentialsController = function() {}

/**
 * create a credential record and send verification email
 * @param  {object}   payload  registration data - email/password required
 * @param  {Function} callback
 */
CredentialsController.register = function(payload, callback) {

  var self = this

  if (payload.email === undefined) return callback( new Error('Bad Request: Missing email') )
  if (payload.password === undefined) return callback( new Error('Bad Request: Missing password') )

  // Validate input
  if (this.isValidEmail(payload.email) === false) return callback( new Error('Validation Error: Invalid email address') )
  if (this.isValidPassword(payload.password) === false) return callback( new Error('Validation Error: Invalid password') )

  // Credentials exist already?
  Credentials.exists(payload.email, function(err, exists) {

    if (err) return callback( err )
    if (exists) return callback(null, new Error("User already exists: " + payload.email) )

    // Create new credentials
    new Credentials(payload, function(err, result) {
      if (err) return callback(err)

      // Send verification email
      self.sendVerificationEmail({email: payload.email, token: result.verificationToken}, function(err, result) {
        if (err) return callback(err)

        // Send back an error so we can send a 201 status via API GW -- a bit counterintuitive
        return callback(new Error('Created: ' + payload.email))
      })
    })
  })
}

/**
 * authenticate credentials
 * @param  {object}   payload  email/password
 * @param  {Function} callback
 */
CredentialsController.authenticate = function(payload, callback) {

  var self = this

  if (payload.email === undefined) return callback( new Error('Bad Request: Missing email') )
  if (payload.password === undefined) return callback( new Error('Bad Request: Missing password') )

  // Get credentials from storage
  Credentials.findByEmail(payload.email, function(err, credentials) {
    if (err) return callback(err)

    // Compute hash with input password
    Credentials.computeHash(payload.password, credentials.passwordSalt, function(err, result) {
      if (err) return callback(err)

      // Hashes match? Sweet!
      if (result.hash == credentials.passwordHash) {

        // Send back OpenID token
        credentials.authToken(callback)
      } else {
        return callback(null, new Error("Incorrect password"))
      }
    })
  })
}

/**
 * verify email address
 * @param  {object}   payload  email/token
 * @param  {Function} callback
 */
CredentialsController.verify = function(payload, callback) {

  var self = this

  if (payload.email === undefined) return callback( new Error('Bad Request: Missing email') )
  if (payload.token === undefined) return callback( new Error('Bad Request: Missing token') )

  // Get credentials from storage
  Credentials.findByEmail(payload.email, function(err, credentials) {
    if (err) return callback(err)

    // Tokens match? Excellent choice. 
    if (payload.token == credentials.verificationToken) {

      // Set the credentials to verified
      credentials.setVerified(callback)
    } else {
      callback(null, new Error("Invalid token"))
    }
  })
}

/**
 * email a link to reset password
 * @param  {object}   payload  email
 * @param  {Function} callback
 */
CredentialsController.forgotPassword = function(payload, callback) {

  var self = this

  if (payload.email === undefined) return callback( new Error('Bad Request: Missing email') )

  // Get credentials from storage
  Credentials.findByEmail(payload.email, function(err, credentials) {
    if (err) return callback(err)

    // Generate reset token
    credentials.setResetToken(function(err, result) {
      if (err) return callback(err)

      // Params for the reset email template
      var params = {
        email: payload.email,
        token: credentials.resetToken
      }

      // Send the email!
      self.sendForgotPasswordEmail(params, callback)
    })
  })
}

/**
 * reset password
 * @param  {object}   payload  email/token/new password
 * @param  {Function} callback
 */
CredentialsController.resetPassword = function(payload, callback) {

  var self = this

  if (payload.email === undefined) return callback( new Error('Bad Request: Missing email') )
  if (payload.token === undefined) return callback( new Error('Bad Request: Missing token') )
  if (payload.password === undefined) return callback( new Error('Bad Request: Missing password') )

  // Validate new password!
  if (this.isValidPassword(payload.password) === false) return callback( new Error('Validation Error: Invalid password') )

  // Get credentials from storage
  Credentials.findByEmail(payload.email, function(err, credentials) {
    if (err) return callback(err)

    // Hope the token matches...
    if (payload.token == credentials.resetToken) {

      // Update the password
      credentials.setPassword(payload.password, callback)
    } else {
      return callback(null, new Error("Invalid token"))
    }
  })
}

/**
 * change password
 * @param  {object}   payload  email/current password/new password
 * @param  {Function} callback
 */
CredentialsController.changePassword = function(payload, callback) {

  var self = this

  if (payload.email === undefined) return callback( new Error('Bad Request: Missing email') )
  if (payload.currentPassword === undefined) return callback( new Error('Bad Request: Missing current password') )
  if (payload.newPassword === undefined) return callback( new Error('Bad Request: Missing new password') )

  // Validate new password
  if (this.isValidPassword(payload.newPassword) === false) return callback( new Error('Validation Error: Invalid password') )

  // Get credentials from storage
  Credentials.findByEmail(payload.email, function(err, credentials) {
    if (err) return callback(err)

    // Compute hash with current password
    Credentials.computeHash(payload.currentPassword, credentials.passwordSalt, function(err, result) {
      if (err) return callback(err)

      // Verify current password
      if (result.hash == credentials.passwordHash) {

        // Update new password
        credentials.setPassword(payload.newPassword, callback)
      } else {
        return callback(null, new Error("Incorrect password"))
      }
    })
  })
}

/**
 * validate an email address
 * @param  {string}  email
 * @return {Boolean}       email is well-formed
 */
CredentialsController.isValidEmail = function(email) {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(email)
}

/**
 * validate a password
 * @param  {string}  password
 * @return {Boolean}          Password is 8-20 chars, has at least 1 lowercase, uppercase, number, and symbol ($@!%*?&)
 */
CredentialsController.isValidPassword = function(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[$@$!%*?&])[A-Za-z\d$@$!%*?&]{8,20}/.test(password)
}

/**
 * send verification email
 * @param  {object}   params   requires at least email/token
 * @param  {Function} callback
 */
CredentialsController.sendVerificationEmail = function(params, callback) {

  params.subject = "[" + config.appName + "] Please verify this email address"
  params.link = config.verificationLink + '?email=' + params.email + '&token=' + params.token

  this.sendEmail('verification', params, callback)
}

/**
 * send forgot password email
 * @param  {object}   params   requires at least email/token
 * @param  {Function} callback
 */
CredentialsController.sendForgotPasswordEmail = function(params, callback) {

  params.subject = "[" + config.appName + "] Reset your password"
  params.link = config.resetPasswordLink + '?email=' + params.email + '&token=' + params.token

  this.sendEmail('resetPassword', params, callback)
}

/**
 * send email
 * @param  {string}   template template name
 * @param  {object}   params   params for template token replacement
 * @param  {Function} callback
 */
CredentialsController.sendEmail = function(template, params, callback) {

  var template = require('../templates/' + template + '.html')
  for (var key in params)
    template = template.replace(new RegExp('\{\{' + key + '\}\}', 'g'), params[key])

  ses.sendEmail({
    Source: config.emailSource,
    Destination: {
      ToAddresses: [ params.email ]
    },
    Message: {
      Subject: {
          Data: params.subject
      },
      Body: {
        Html: {
          Data: template
        }
      }
    }
  }, function(err, data) {
    if (err) return callback(new Error("Interval Server Error: " + JSON.stringify(err)))
    return callback(null)
  })
}

module.exports = CredentialsController
