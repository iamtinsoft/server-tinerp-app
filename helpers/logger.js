/**
 * @file Logger Helper
 * @description Provides functions for logging errors and other messages
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// Configure log file paths
const LOG_DIR = path.join(__dirname, '../logs');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'error.log');
const APP_LOG_FILE = path.join(LOG_DIR, 'app.log');

// Ensure log directory exists
try {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
} catch (err) {
    console.error('Failed to create log directory:', err);
}

/**
 * Formats an error object or message with additional context
 * @param {Error|string} error - The error object or message
 * @param {Object} context - Additional context information
 * @returns {string} - Formatted error message
 */
function formatError(error, context = {}) {
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : null;

    const logEntry = {
        timestamp,
        message: errorMessage,
        stack: errorStack,
        ...context
    };

    return JSON.stringify(logEntry, null, process.env.NODE_ENV === 'development' ? 2 : 0);
}

/**
 * Logs an error to the console and error log file
 * @param {string} message - Error message description
 * @param {Object} options - Error details and context
 * @param {Error} [options.error] - The original error object
 * @param {Object} [options.context] - Additional contextual information
 * @param {boolean} [options.consoleLog=true] - Whether to log to console
 */
function logError(message, options = {}) {
    const { error, context = {}, consoleLog = true } = options;

    // Combine all context information
    const fullContext = {
        ...context,
        originalError: error ? {
            message: error.message,
            name: error.name,
            code: error.code
        } : undefined
    };

    // Format the error message
    const formattedError = formatError(message, fullContext);

    // Log to console in non-production environments
    if (consoleLog && process.env.NODE_ENV !== 'production') {
        console.error(`\x1b[31m[ERROR] ${message}\x1b[0m`);
        if (error) {
            console.error(error);
        }
        if (Object.keys(context).length > 0) {
            console.error('Context:', context);
        }
    }

    // Append to log file
    try {
        fs.appendFileSync(ERROR_LOG_FILE, formattedError + '\n');
    } catch (err) {
        console.error('Failed to write to error log file:', err);
    }

    // Return the formatted error for potential further use
    return formattedError;
}

/**
 * Logs an informational message to the app log file
 * @param {string} message - The message to log
 * @param {Object} [context={}] - Additional context information
 */
function logInfo(message, context = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = JSON.stringify({
        timestamp,
        level: 'INFO',
        message,
        ...context
    });

    // Log to console in development environment
    if (process.env.NODE_ENV === 'development') {
        console.log(`\x1b[34m[INFO] ${message}\x1b[0m`);
        if (Object.keys(context).length > 0) {
            console.log('Context:', context);
        }
    }

    // Append to log file
    try {
        fs.appendFileSync(APP_LOG_FILE, logEntry + '\n');
    } catch (err) {
        console.error('Failed to write to app log file:', err);
    }
}

/**
 * Creates a request logger middleware
 * @returns {Function} Express middleware function
 */
function requestLogger() {
    return (req, res, next) => {
        const start = Date.now();

        // Log when the response finishes
        res.on('finish', () => {
            const duration = Date.now() - start;
            const logData = {
                method: req.method,
                url: req.originalUrl || req.url,
                status: res.statusCode,
                duration: `${duration}ms`,
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent')
            };

            // Log as error if status code is 4xx or 5xx
            if (res.statusCode >= 400) {
                logError(`Request failed: ${req.method} ${req.originalUrl || req.url}`, {
                    context: logData,
                    consoleLog: process.env.NODE_ENV !== 'production'
                });
            } else {
                logInfo(`Request completed: ${req.method} ${req.originalUrl || req.url}`, logData);
            }
        });

        next();
    };
}

module.exports = {
    logError,
    logInfo,
    requestLogger
};