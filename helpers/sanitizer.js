/**
 * @file Input Sanitization Helper
 * @description Provides functions to sanitize user input and prevent security vulnerabilities
 */

/**
 * Sanitizes user input to prevent SQL injection and XSS attacks
 * @param {string} input - The user input to sanitize
 * @returns {string} - The sanitized input
 */
function sanitizeInput(input) {
    // Return empty string if input is null or undefined
    if (input === null || input === undefined) {
        return '';
    }

    // Convert to string if it's not already
    const str = String(input);

    // Replace potentially dangerous characters
    return str
        // Remove SQL injection metacharacters
        .replace(/[\\';\-\-]/g, '')
        // Replace SQL wildcard characters with literal versions
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        // Escape HTML special characters to prevent XSS
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Sanitizes a string for use in a SQL LIKE clause
 * @param {string} input - The input to sanitize for LIKE clause
 * @returns {string} - The sanitized input for LIKE clause
 */
function sanitizeForLike(input) {
    if (input === null || input === undefined) {
        return '';
    }

    const str = String(input);

    // Escape special LIKE characters
    return str
        .replace(/[\\%\_]/g, char => `\\${char}`);
}

/**
 * Sanitizes an object's string properties recursively
 * @param {Object} obj - The object to sanitize
 * @returns {Object} - The sanitized object
 */
function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    const result = {};

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];

            if (typeof value === 'string') {
                result[key] = sanitizeInput(value);
            } else if (Array.isArray(value)) {
                result[key] = value.map(item => {
                    if (typeof item === 'string') {
                        return sanitizeInput(item);
                    } else if (typeof item === 'object') {
                        return sanitizeObject(item);
                    }
                    return item;
                });
            } else if (typeof value === 'object' && value !== null) {
                result[key] = sanitizeObject(value);
            } else {
                result[key] = value;
            }
        }
    }

    return result;
}

module.exports = {
    sanitizeInput,
    sanitizeForLike,
    sanitizeObject
};