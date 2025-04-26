const winston = require("winston");
const config = require("config");
const express = require("express");
const app = express();

const http = require("http").Server(app);
require("./startup/logging")();
require("./startup/cors")(app);

const socketIO = require("socket.io")(http, {
  cors: {
    origin: config.get("client_url"),
  },
});
const users = {};
//Add this before the app.get() block
socketIO.on("connection", (socket) => {
  console.log(`⚡: ${socket.id} user just connected!`);
  // Listen for user identification (e.g., on login)
  socket.on('register', (userId) => {
    users[userId] = socket.id; // Map userId to socket.id
    console.log(`User registered: ${userId}`);
  });
  //sends the message to all the users on the server
  socket.on("message", (data) => {
    socketIO.emit("messageResponse", data);
  });
  // Listen for a private message event
  socket.on('private_message', ({ recipientId, message }) => {
    const recipientSocketId = users[recipientId];
    if (recipientSocketId) {
      socketIO.to(recipientSocketId).emit('receive_message', { message });
      console.log(`Message sent to ${recipientId}:`, message);
    } else {
      console.log(`User ${recipientId} is not online.`);
    }
  });

  socket.on("newData", (data) => {
    socketIO.emit("newDataResponse", data);
  });
  socket.on("typing", ({ recipientId, message }) => {
    const recipientSocketId = users[recipientId];
    if (recipientSocketId) {
      socketIO.to(recipientSocketId).emit('typingResponse', { message });
      console.log(`Message sent to ${recipientId}:`, message);
    } else {
      console.log(`User ${recipientId} is not online.`);
    }
  });

  socket.on("typingOff", ({ recipientId, message }) => {
    const recipientSocketId = users[recipientId];
    if (recipientSocketId) {
      socketIO.to(recipientSocketId).emit('typingResponseOff', { message });
      console.log(`Message sent to ${recipientId}:`, message);
    } else {
      console.log(`User ${recipientId} is not online.`);
    }
  });

  socket.on("disconnect", () => {
    // Remove the user from the mapping
    for (const [userId, socketId] of Object.entries(users)) {
      if (socketId === socket.id) {
        delete users[userId];
        console.log(`User unregistered: ${userId}`);
        break;
      }
    }
  });
});

require("./startup/routes")(app);
require("./startup/config")();
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
const port = process.env.PORT || config.get("port");

http.listen(port, () => {
  winston.info(`Listening on port ${port}...`);
});
