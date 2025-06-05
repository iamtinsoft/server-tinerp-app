// const jwt = require("jsonwebtoken");
// const config = require("config");

// function generateAuthToken(user, keepLoggedIn = false) {
//   const token = jwt.sign(user, config.get("jwtPrivateKey"), {
//     expiresIn: keepLoggedIn ? "7d" : "1h",
//   });
//   return token;
// }

// exports.generateAuthToken = generateAuthToken;

const jwt = require("jsonwebtoken");
const config = require("config");

function generateAuthToken(user, keepLoggedIn = false) {
  const token = jwt.sign(user, config.get("jwtPrivateKey"), {
    expiresIn: keepLoggedIn ? "8d" : "8d",
  });
  return token;
}

function generateRefreshToken(user) {
  // Refresh token with longer expiration (7 days)
  const refreshToken = jwt.sign(
    { userId: user.id || user._id }, // Only store minimal data in refresh token
    config.get("jwtPrivateKey"), // Consider using a separate refresh token secret
    { expiresIn: "7d" }
  );
  return refreshToken;
}

function extendTokenExpiration(token) {
  try {
    // Decode the token without verification to get original info
    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.iat || !decodedToken.exp) {
      throw new Error("Invalid token structure");
    }

    // Calculate original expiration duration in seconds
    const originalDuration = decodedToken.exp - decodedToken.iat;
    //console.log(originalDuration)
    // Verify the token is still valid (not expired)
    const verified = jwt.verify(token, config.get("jwtPrivateKey"));

    // Extract user data without timing claims
    const { iat, exp, ...userData } = verified;

    // Calculate new expiration time (current time + original duration)
    const now = Math.floor(Date.now() / 1000);
    const newExpiration = now + 3600;
    //console.log(originalDuration, newExpiration)
    // Create extended token with same payload but new timing
    const extendedToken = jwt.sign(
      {
        ...userData,
        iat: now,
        exp: newExpiration
      },
      config.get("jwtPrivateKey"),
      {
        noTimestamp: true // Prevent jwt.sign from overriding our custom iat/exp
      }
    );

    return extendedToken;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Cannot extend expired token");
    }
    throw new Error("Invalid token: " + error.message);
  }
}

function extendTokenBeforeExpiry(token, thresholdMinutes = 5) {
  try {
    // Decode token to check expiration without verification
    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.exp) {
      throw new Error("Invalid token structure");
    }

    const now = Math.floor(Date.now() / 1000);
    const expirationTime = decodedToken.exp;
    const thresholdTime = thresholdMinutes * 60;

    // Check if token is within threshold of expiring
    if ((expirationTime - now) <= thresholdTime) {
      // Token is about to expire, extend it
      return extendTokenExpiration(token);
    }

    // Token doesn't need extending yet
    return token;
  } catch (error) {
    throw new Error("Cannot extend token: " + error.message);
  }
}

exports.generateAuthToken = generateAuthToken;
exports.generateRefreshToken = generateRefreshToken;
exports.extendTokenExpiration = extendTokenExpiration;
exports.extendTokenBeforeExpiry = extendTokenBeforeExpiry;