'use strict'

var config = require('../../config.json')
var AWS = require('aws-sdk')
var dynamodb = new AWS.DynamoDB()

/**
 * models a record in dynamodb
 *
 * The general idea is from ActiveRecord to abstract persistent storage
 * from the rest of the app and give subclasses CRUD. This is a minimal
 * implementation to accomplish our goals.
 *
 * Table name is determined from a prefix and the subclass name (I wish I could infer it!).
 * Indexes are in the form of {key}-index, eg email-index. 
 * 
 * @param {object} options name|fields|primaryKey
 */
var Record = function(options) {
  this._table = config.tablePrefix + options.name
  this._fields = options.fields
  this._primaryKey = options.primaryKey
}

/**
 * fetches a record by a given key/value
 *
 * @param  {string}   key
 * @param  {mixed}   value
 * @param  {Function} callback a "clean" database result
 */
Record.prototype.findBy = function(key, value, callback) {

  var self = this

  var query = {
    TableName: this._table,
    IndexName: key + '-index',
    KeyConditionExpression: key + ' = :' + key,
    ExpressionAttributeValues: {}
  }

  query.ExpressionAttributeValues[":" + key] = this._typedAttribute(value)

  dynamodb.query(query, function(err, data) {
    if (err) return callback(new Error("Internal Server Error: " + JSON.stringify(err)))
    return callback(null, self._clean(data.Items[0]))
  })
}

/**
 * creates a new record
 * @param  {object}   data
 * @param  {Function} callback
 */
Record.prototype.create = function(data, callback) {

  // Only store attributes that have been configured as valid fields
  var item = {}
  for (var key in data) {
    if (this._fields.indexOf(key) !== -1) {
      item[key] = this._typedAttribute(data[key])
    }
  }

  var query = {
    TableName: this._table,
    Item: item
  }

  dynamodb.putItem(query, function(err, data) {
    if (err) return callback(new Error("Internal Server Error: " + JSON.stringify(err)))
    return callback(null, "User created successfully")
  })

}

/**
 * updates a record
 *
 * This method can be called in two ways:
 * 
 * @param {string} key
 * @param {mixed} value
 * @param {Function} calllback
 *
 * OR
 *
 * @param {object} updates hash of keys/values for making multiple updates at once
 * @param {Function} callback
 */
Record.prototype.update = function() {

  var updates = {}
  var callback
  var item = {}

  // Accept key/value/callback, or object/callback
  if (Object.prototype.toString.call(arguments[0]) == '[object Object]') {
    updates = arguments[0]
    callback = arguments[1]
  } else {
    updates[arguments[0]] = arguments[1]
    callback = arguments[2]
  }

  for (var key in updates) {

    // Only update valid fields
    if (this._fields.indexOf(key) !== -1) {

      // a null value will delete an attribute
      item[key] = {
        Action: updates[key] === null ? 'DELETE' : 'PUT',
      }

      // if not deleting, set the value with it's typed attribute
      if (item[key].Action != 'DELETE') {
        item[key].Value = this._typedAttribute(updates[key])
      }

      // Update ouselves
      this[key] = updates[key]
    }
  }

  var query = {
    TableName: this._table,
    Key: {},
    AttributeUpdates: item
  }

  query.Key[this._primaryKey] = this._typedAttribute(this[this._primaryKey])

  dynamodb.updateItem(query, function(err, data) {
    if (err) return callback(new Error("Internal Server Error: " + JSON.stringify(err)))
    return callback(null)
  })
}

/**
 * convert a value into it's typed attribute
 * @param  {mixed} value
 * @return {object}       typed attribute
 */
Record.prototype._typedAttribute = function(value) {

  // TODO: Add all data types
  switch (Object.prototype.toString.call(value)) {
    case '[object String]': return {S: value}
    case '[object Number]': return {N: value.toString()}
    case '[object Boolean]': return {BOOL: value}
  }
}

/**
 * cleans a record of the attribute types
 * @param  {object} item
 * @return {object}      cleaned item
 */
Record.prototype._clean = function(item) {

  var newItem = {}
  for (var key in item) {
    var keys = Object.keys(item[key])
    if (keys.length === 1 && /(S|N|BOOL)/.test(keys[0]))
      newItem[key] = item[key][keys[0]]
    else
      newItem[key] = item[key]
  }

  return newItem
}

module.exports = Record