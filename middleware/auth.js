const jwt = require("jsonwebtoken");
const config = require("config");
const { extendTokenExpiration } = require("../helpers/token");
module.exports = function (req, res, next) {
  if (!config.get("requiresAuth")) return next();

  const token = req.header("x-auth-token");

  if (!token) return res.status(401).send("Access denied. No token provided.");

  try {
    const decoded = jwt.verify(token, config.get("jwtPrivateKey"));
    req.user = decoded;
    extendTokenExpiration(token)
    next();
  } catch (ex) {
    console.log(ex.name)
    // Check if the error is specifically due to token expiration
    if (ex.name === "TokenExpiredError") {
      return res.status(401).send("Token has expired. Please login again.");
    }

    // Check for other JWT-related errors
    if (ex.name === "JsonWebTokenError") {
      return res.status(401).send("Invalid token format.");
    }

    if (ex.name === "NotBeforeError") {
      return res.status(401).send("Token not active yet.");
    }

    // Generic invalid token response for other errors
    res.status(401).send("Invalid token.");
  }
};