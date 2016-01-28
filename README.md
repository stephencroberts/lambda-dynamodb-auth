lambda-dynamodb-auth
====================

Manage user credentials with AWS serverless architecture including Lambda, DynamoDB, Cognito, IAM, and API Gateway. Users can perform common tasks such as registration, account verification, authentication, forgot password, reset password, and change password. Credentials are stored in DynamoDB and Cognito distributes an OpenID token after authentication. The client should use the token to retrieve temporary access credentials for making authenticated API calls. 

Webpack is used to bundle the source together into a single file to reduce disk access latency -- I experienced significant latency in Lambda when requiring the source files separately. You can also use webpack to bundle together microservices from a larger codebase, making it easy to share code across microservices in development and deploy only the parts you need to Lambda. 

A minimalist ActiveRecord is used for DynamoDB. 

# Getting Started

You'll need to set up all the AWS resources yourself including a Lambda function, IAM roles, DynamoDB table, and Cognito pool. I recommend taking a look at https://github.com/danilop/LambdAuth. 

Install dependencies:

```
npm install
```

Create a `config.json` file (see sample)

Create an `event.json` file for local testing:

```json
{
  "operation": "register",
  "payload": {
    "email": "email@domain.com",
    "password": "yourpassword"
  }
}
```

Invoke your lambda function locally with grunt:

```
grunt lambda_invoke
```

Or you can use `grunt watch` to invoke the lambda function every time you save the source. 

Deploy to lambda:

```
grunt deploy
```
