const config = require("config");
const nodemailer = require("nodemailer");
const ejs = require("ejs");
let mailHost = config.get("mail_host");
let mailPort = config.get("mail_port");
let mailUser = config.get("mail_user");
let mailPassword = config.get("mail_password");

const transport = nodemailer.createTransport({
  host: mailHost,
  port: mailPort,
  auth: {
    user: mailUser,
    pass: mailPassword,
  },
});


const sendEmployeeNotificationEmail = async (
  receiver,
  subject,
  content,
  user
) => {
  ejs.renderFile(
    __dirname + "/templates/employeeNotificationEmail.ejs",
    { receiver, content, user },
    (err, data) => {
      if (err) {
        console.log(err);
      } else {
        var mailOptions = {
          from: mailUser,
          to: receiver,
          subject: subject,
          html: data,
        };

        transport.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }
    }
  );
};




const sendPaymentEmail = async (
  receiver,
  subject,
  content,
  user,
  amount,
  tracking
) => {
  ejs.renderFile(
    __dirname + "/templates/payment.ejs",
    { receiver, content, user, amount, tracking },
    (err, data) => {
      if (err) {
        console.log(err);
      } else {
        var mailOptions = {
          from: mailUser,
          to: receiver,
          subject: subject,
          html: data,
        };

        transport.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }
    }
  );
};

const sendOtpEmail = async (receiver, subject, code, user, link) => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = new Date().toLocaleTimeString();
  const date = new Date().toLocaleDateString();
  ejs.renderFile(
    __dirname + "/templates/otp.ejs",
    { receiver, code, user, link },
    (err, data) => {
      if (err) {
        console.log(err);
      } else {
        var mailOptions = {
          from: mailUser,
          to: receiver,
          subject: subject,
          html: data,
        };

        transport.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }
    }
  );
};

const sendContactEmail = async (
  receiver,
  subject,
  message,
  user,
  phone,
  email,
  company
) => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = new Date().toLocaleTimeString();
  const date = new Date().toLocaleDateString();
  ejs.renderFile(
    __dirname + "/templates/contact.ejs",
    { receiver, message, user, subject, phone, email, company },
    (err, data) => {
      if (err) {
        console.log(err);
      } else {
        var mailOptions = {
          from: mailUser,
          to: "viktinho56@gmail.com",
          subject: subject,
          html: data,
        };

        transport.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }
    }
  );
};

const sendEmail = async (receiver, subject, content, user) => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = new Date().toLocaleTimeString();
  const date = new Date().toLocaleDateString();
  ejs.renderFile(
    __dirname + "/templates/loginNotification.ejs",
    { receiver, content, timezone, time, date, user },
    (err, data) => {
      if (err) {
        console.log(err);
      } else {
        var mailOptions = {
          from: mailUser,
          to: receiver,
          subject: subject,
          html: data,
        };

        transport.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }
    }
  );
};

const sendWelcomeEmail = async (
  receiver,
  subject,
  content,
  user,
  role,
  password
) => {
  // const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // const time = new Date().toLocaleTimeString();
  // const date = new Date().toLocaleDateString();
  ejs.renderFile(
    __dirname + "/templates/welcomeNotification.ejs",
    { receiver, content, user, role, password },
    (err, data) => {
      if (err) {
        console.log(err);
      } else {
        var mailOptions = {
          from: mailUser,
          to: receiver,
          subject: subject,
          html: data,
        };

        transport.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }
    }
  );
};

const sendPasswordResetEmail = async (
  receiver,
  subject,
  content,
  user,
  appUrl
) => {
  // const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // const time = new Date().toLocaleTimeString();
  // const date = new Date().toLocaleDateString();
  const resetUrl = `${appUrl}/email=${receiver}`;
  ejs.renderFile(
    __dirname + "/templates/forgotPasswordNotification.ejs",
    { receiver, content, user, appUrl },
    (err, data) => {
      if (err) {
        console.log(err);
      } else {
        var mailOptions = {
          from: mailUser,
          to: receiver,
          subject: subject,
          html: data,
        };

        transport.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }
    }
  );
};

const sendNotificationEmail = async (
  receiver,
  subject,
  content,
  appUrl,
  user
) => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = new Date().toLocaleTimeString();
  const date = new Date().toLocaleDateString();
  ejs.renderFile(
    __dirname + "/templates/emailNotification.ejs",
    { receiver, content, timezone, time, date, subject, appUrl, user },
    (err, data) => {
      if (err) {
        console.log(err);
      } else {
        var mailOptions = {
          from: mailUser,
          to: receiver,
          subject: subject,
          html: data,
        };

        transport.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }
    }
  );
};


module.exports = {
  sendPaymentEmail,
  sendOtpEmail,
  sendEmail,
  sendContactEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendNotificationEmail,
  // sendSampleNotificationEmail,
  // sendResultNotificationEmail,
  sendEmployeeNotificationEmail
};
