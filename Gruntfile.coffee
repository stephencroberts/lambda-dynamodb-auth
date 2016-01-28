'use strict'
AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json')
config = require('./config.json')

grunt = require('grunt')
grunt.loadNpmTasks('grunt-aws-lambda')
grunt.loadNpmTasks('grunt-contrib-copy')
grunt.loadNpmTasks('grunt-contrib-watch')
grunt.loadNpmTasks("grunt-webpack")

webpackConfig = require("./webpack.config.js")

grunt.initConfig({
  copy: {
    default: {
      src: 'package.json'
      dest: 'build/package.json'
    }
  }
  lambda_invoke: {
    default: {
      options: {
        file_name: 'build/index.js'
      }
    }
  }
  lambda_deploy: {
    default: {
      options: {
        credentialsJSON: './config.json'
      }
      arn: config.lambdaARN
    }
  }
  lambda_package: {
    default: {
      options: {
        package_folder: './build'
      }
    }
  }
  webpack: {
    options: webpackConfig
    default: {
      devtool: "sourcemap"
    }
  }
  watch: {
    default: {
      files: ['src/**/*.js']
      tasks: ['webpack', 'lambda_invoke']
    }
  }
})

grunt.registerTask('deploy', ['copy', 'webpack', 'lambda_package', 'lambda_deploy'])