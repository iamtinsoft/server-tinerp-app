const jwt = require("jsonwebtoken");
const config = require("config");

function generateAuthToken(user) {
  const token = jwt.sign(user, config.get("jwtPrivateKey"), {
    expiresIn: config.get("jwtPrivateKeyExpiration"),
  });
  return token;
}

exports.generateAuthToken = generateAuthToken;
