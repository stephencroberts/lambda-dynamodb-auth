'use strict';

var path = require('path');
var fs = require('fs');

var nodeModules = {};
fs.readdirSync('node_modules')
  .filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    // Don't bundle aws sdk, thanks to http://jlongster.com/Backend-Apps-with-Webpack--Part-I
    if (mod == 'aws-sdk')
      nodeModules[mod] = 'commonjs ' + mod;
  });

module.exports = {
  entry: './src/index.js',
  target: 'node',
  module: {
    loaders: [
      { test: /\.json$/, loader: "json" },
      { test: /\.html$/, loader: "html" }
    ]
  },
  output: {
    library: "handler",
    libraryTarget: "commonjs",
    path: path.join(__dirname, 'build'),
    filename: 'index.js'
  },
  externals: nodeModules
}