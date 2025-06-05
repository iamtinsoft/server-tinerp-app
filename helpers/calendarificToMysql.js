
const mysql = require('mysql2/promise');
const axios = require('axios');
const config = require("config/");
//require('dotenv').config();

// Calendarific API configuration
const CALENDARIFIC_API_KEY = config.get("calendarific_api_key");
const CALENDARIFIC_API_URL = "https://calendarific.com/api/v2/holidays";
const db_host = config.get("db_host");
const db_user = config.get("db_user");
const db_password = config.get("db_password");
const db_database = config.get("db_database");

// MySQL database configuration
const dbConfig = {
    host: db_host,
    user: db_user,
    password: db_password,
    database: db_database
};

// Function to create the holidays table with improved structure
async function createPublicHolidaysTable(connection) {
    try {
        // Drop the table if it exists
        const dropTableQuery = `DROP TABLE IF EXISTS public_holidays`;
        await connection.execute(dropTableQuery);
        console.log('Existing public_holidays table dropped (if it existed)');

        // Create the table with enhanced structure to match JSON data
        const createTableQuery = `
            CREATE TABLE public_holidays (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                country_code VARCHAR(5) NOT NULL,
                country_name VARCHAR(100) NOT NULL,
                holiday_date VARCHAR(50) NOT NULL,
                year INT NOT NULL,
                month INT NOT NULL,
                day INT NOT NULL,
                primary_type VARCHAR(100) NOT NULL,
                types JSON,
                canonical_url VARCHAR(255),
                urlid VARCHAR(255),
                locations VARCHAR(255),
                states VARCHAR(255),
                date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('Active', 'Inactive') DEFAULT 'Active',
                UNIQUE KEY unique_holiday (holiday_date, country_code)
            )
        `;
        await connection.execute(createTableQuery);
        console.log('public_holidays table created successfully with enhanced structure');
    } catch (error) {
        console.error('Error creating holidays table:', error.message);
        throw error;
    }
}

// Function to insert a single holiday directly from JSON
async function insertHolidayFromJson(connection, holidayJson) {
    try {
        const insertQuery = `
            INSERT INTO public_holidays (
                name, 
                description, 
                country_code, 
                country_name, 
                holiday_date, 
                year, 
                month, 
                day, 
                primary_type, 
                types, 
                canonical_url, 
                urlid,
                locations,
                states
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                description = VALUES(description),
                primary_type = VALUES(primary_type),
                types = VALUES(types),
                canonical_url = VALUES(canonical_url),
                urlid = VALUES(urlid),
                locations = VALUES(locations),
                states = VALUES(states)
        `;

        // Extract values from the JSON
        const [result] = await connection.execute(insertQuery, [
            holidayJson.name,
            holidayJson.description || null,
            holidayJson.country.id,
            holidayJson.country.name,
            holidayJson.date.iso,
            holidayJson.date.datetime.year,
            holidayJson.date.datetime.month,
            holidayJson.date.datetime.day,
            holidayJson.primary_type,
            JSON.stringify(holidayJson.type),
            holidayJson.canonical_url,
            holidayJson.urlid,
            holidayJson.locations,
            holidayJson.states
        ]);

        console.log(`Holiday '${holidayJson.name}' inserted/updated successfully`);
        return result;
    } catch (error) {
        console.error('Error inserting holiday:', error.message);
        throw error;
    }
}

// Function to store holidays from API in the database
async function storeHolidays(connection, holidays, countryCode) {
    const insertQuery = `
        INSERT INTO public_holidays (
            name, 
            description, 
            country_code, 
            country_name,
            holiday_date, 
            year, 
            month, 
            day, 
            primary_type, 
            types,
            canonical_url,
            urlid,
            locations,
            states
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            description = VALUES(description),
            primary_type = VALUES(primary_type),
            types = VALUES(types),
            canonical_url = VALUES(canonical_url),
            urlid = VALUES(urlid),
            locations = VALUES(locations),
            states = VALUES(states)
    `;

    console.log('Storing holidays in database...');

    try {
        let insertedCount = 0;
        let updatedCount = 0;

        for (const holiday of holidays) {
            const holidayDate = holiday.date.iso;
            const year = holiday.date.datetime.year;
            const month = holiday.date.datetime.month;
            const day = holiday.date.datetime.day;

            const [result] = await connection.execute(insertQuery, [
                holiday.name,
                holiday.description || null,
                holiday.country.id,
                holiday.country.name,
                holidayDate,
                year,
                month,
                day,
                holiday.primary_type || 'National holiday',
                JSON.stringify(holiday.type || []),
                holiday.canonical_url || null,
                holiday.urlid || null,
                holiday.locations || 'All',
                holiday.states || 'All'
            ]);

            if (result.affectedRows > 0) {
                if (result.insertId) {
                    insertedCount++;
                } else {
                    updatedCount++;
                }
            }
        }

        console.log(`Successfully stored ${insertedCount} new holidays and updated ${updatedCount} existing holidays`);
    } catch (error) {
        console.error('Error storing holidays:', error.message);
        throw error;
    }
}

// Function to fetch holidays from Calendarific API
async function fetchHolidays(year, countryCode = 'NG') {
    try {
        const url = `${CALENDARIFIC_API_URL}?api_key=${CALENDARIFIC_API_KEY}&country=${countryCode}&year=${year}`;
        console.log(`Fetching holidays for ${countryCode}, year ${year}...`);

        const response = await axios.get(url);

        if (response.status !== 200 || response.data.meta.code !== 200) {
            throw new Error(
                response.data.meta.error_detail ||
                `API request failed with status ${response.status}`
            );
        }

        console.log(`Successfully fetched ${response.data.response.holidays.length} holidays`);
        return response.data.response.holidays;
    } catch (error) {
        console.error('Error fetching holidays from API:', error.message);
        throw error;
    }
}

// Main function to fetch and store holidays
async function syncHolidaysForYear(year, countryCode = 'NG') {
    let connection;

    try {
        // Create database connection
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database');

        // Create holidays table if it doesn't exist
        await createPublicHolidaysTable(connection);

        // Fetch holidays from API
        const holidays = await fetchHolidays(year, countryCode);

        // Store holidays in database
        await storeHolidays(connection, holidays, countryCode);

        console.log(`Holiday sync completed for ${countryCode}, year ${year}`);
        return holidays.length;
    } catch (error) {
        console.error('Error in holiday sync process:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed');
        }
    }
}

// Function to insert a single holiday from JSON data
async function insertSingleHoliday(holidayJson) {
    let connection;

    try {
        // Create database connection
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database');

        // Create holidays table if it doesn't exist
        await createPublicHolidaysTable(connection);

        // Insert the provided holiday JSON
        await insertHolidayFromJson(connection, holidayJson);

        console.log(`Single holiday '${holidayJson.name}' inserted successfully`);
    } catch (error) {
        console.error('Error inserting single holiday:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed');
        }
    }
}

// Function to fetch holidays for multiple years
async function syncHolidaysForMultipleYears(startYear, endYear, countryCodes = ['NG']) {
    console.log(`Starting holiday sync for years ${startYear}-${endYear}`);

    for (const countryCode of countryCodes) {
        for (let year = startYear; year <= endYear; year++) {
            try {
                await syncHolidaysForYear(year, countryCode);
            } catch (error) {
                console.error(`Failed to sync holidays for ${countryCode}, year ${year}: ${error.message}`);
            }
        }
    }

    console.log('Holiday sync process completed');
}

// Example of how to use the script to insert the sample holiday
const sampleHoliday = {
    "name": "New Year's Day",
    "description": "New Year's Day is the first day of the year, or January 1, in the Gregorian calendar.",
    "country": {
        "id": "ng",
        "name": "Nigeria"
    },
    "date": {
        "iso": "2025-01-01",
        "datetime": {
            "year": 2025,
            "month": 1,
            "day": 1
        }
    },
    "type": [
        "National holiday"
    ],
    "primary_type": "Public Holiday",
    "canonical_url": "https://calendarific.com/holiday/nigeria/new-year-day",
    "urlid": "nigeria/new-year-day",
    "locations": "All",
    "states": "All"
};

// If running directly (not imported)
if (require.main === module) {
    // Get command line arguments or use defaults
    const arg = process.argv[2];

    if (arg === 'insert-sample') {
        // Insert the sample holiday
        insertSingleHoliday(sampleHoliday)
            .catch(error => {
                console.error('ERROR:', error.message);
                process.exit(1);
            });
    } else {
        // Default behavior - sync multiple years
        const startYear = parseInt(process.argv[2]) || new Date().getFullYear();
        const endYear = parseInt(process.argv[3]) || startYear;
        const countryCodes = process.argv[4] ? process.argv[4].split(',') : ['NG'];

        syncHolidaysForMultipleYears(startYear, endYear, countryCodes)
            .catch(error => {
                console.error('ERROR:', error.message);
                process.exit(1);
            });
    }
}

module.exports = {
    syncHolidaysForYear,
    syncHolidaysForMultipleYears,
    insertSingleHoliday
};
