'use strict'

var CredentialsController = require('./controllers/credentials')

/**
 * lambda handler
 * 
 * Event can have the following params:
 * @param  {string} operation method to call on the controller
 * @param  {object} payload JSON object to pass to the method
 * @return {error|object} result if an error occurred, fail the lambda function, otherwise send an object with the following params:
 *   @param {boolean} success whether the method completed as expected
 *   @param {mixed} data results from the method call
 */
module.exports = function(event, context) {

  if ( event.operation === undefined ) return context.fail( new Error('Bad Request: You must define an operation') )
  if ( CredentialsController[event.operation] === undefined ) return context.fail( new Error("Bad Request: Unknown operation: " + event.operation) )

  // Default payload to empty object
  var payload = event.payload || {}

  // Call the controller's method
  CredentialsController[event.operation](payload, function(err, result) {
    if (err) return context.fail(err)

    // If the result is an error, something went wrong (though not fatal!), send the error back
    if (result instanceof Error)
      context.succeed({
        success: false,
        message: result.message
      })

    // Everything went well, send results
    else
      context.succeed({
        success: true,
        data: result
      })
  })
}