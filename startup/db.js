const winston = require("winston");
const mysql = require("mysql2/promise");
const config = require("config");

const db_host = config.get("db_host");
const db_user = config.get("db_user");
const db_password = config.get("db_password");
const db_database = config.get("db_database");
module.exports = function () {


  let connection = mysql.createPool({
    host: db_host,
    user: db_user,
    password: db_password,
    database: db_database,
  });
  winston.info(`Connected to ${db_host}...`);
  // connection.connect(function (err) {
  //   if (err) throw err;

  //   winston.info(`Connected to ${db_host}...`);
  // });
  return connection;
  //connection.connect().then(() => winston.info(`Connected to ${db}...`));
};

