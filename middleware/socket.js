const socketIO = require("socket.io");

/**
 * Initializes Socket.IO and attaches it to the server.
 * Also adds the `io` instance to the `req` object for easy access in routes.
 *
 * @param {Object} server - The HTTP server instance.
 * @returns {Function} Middleware function for Express.js.
 */
function initializeSocketIO(server) {
    const io = socketIO(server);

    // Set up connection handling
    io.on("connection", (socket) => {
        console.log("A user connected:", socket.id);

        // Example event listener
        socket.on("example_event", (data) => {
            console.log("Example event received:", data);
            socket.emit("example_response", { message: "Event processed!" });
        });

        // Handle disconnection
        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);
        });
    });

    // Middleware function to add `io` to `req`
    return (req, res, next) => {
        req.io = io; // Attach the io instance to req
        next();
    };
}

module.exports = initializeSocketIO;
