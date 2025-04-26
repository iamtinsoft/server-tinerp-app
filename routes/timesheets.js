const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");
const mysql = require("mysql2/promise");
const config = require("config");
const db_host = config.get("db_host");
const db_user = config.get("db_user");
const db_password = config.get("db_password");
const db_database = config.get("db_database");
// Create a timesheet
router.post("/", [auth], async (req, res) => {

    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    const {
        tenant_id,
        record_year,
        record_month,
        employee_id,
        submission_date,
        approval_date,
        total_hours,
        comments,
        status,
        programs
    } = req.body;

    try {
        // Start transaction
        await db.beginTransaction();

        // Check for duplicate timesheet
        const checkTimesheetQuery = `
        SELECT * FROM timesheets
        WHERE tenant_id = ? AND record_year = ? AND record_month = ? AND employee_id = ? AND status = ?
    `;
        const [existingTimesheet] = await db.query(checkTimesheetQuery, [tenant_id, record_year, record_month, employee_id, status]);

        if (existingTimesheet.length > 0) {
            await db.rollback();
            return res.status(400).json({ message: "A timesheet with the same tenant_id, record_year, record_month, and employee_id already exists." });
        }

        // Insert new timesheet
        const insertTimesheetQuery = `
        INSERT INTO timesheets (tenant_id, record_year, record_month, employee_id, submission_date, approval_date, total_hours, comments, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        const [timesheetResult] = await db.execute(insertTimesheetQuery, [
            tenant_id,
            record_year,
            record_month,
            employee_id,
            submission_date,
            approval_date,
            total_hours,
            comments,
            status || "Pending",
        ]);

        const newTimesheetId = timesheetResult.insertId;

        // Prepare bulk insertion for timesheet entries
        const entries = programs.map(program => {
            const dayColumns = Array.from({ length: 31 }, (_, i) => `_${i + 1}`).join(", ");
            const dayValues = Array.from({ length: 31 }, (_, i) => {
                const day = program.days.find(d => d.day === `_${i + 1}`);

                return day ? day.value : 0;
            });

            return {
                query: `
                INSERT INTO timesheet_entries (timesheet_id, employee_id, program_id, ${dayColumns})
                VALUES (?, ?, ?, ${Array(31).fill("?").join(", ")})
            `,
                values: [newTimesheetId, employee_id, program.program_id, ...dayValues],
            };
        });

        // Execute bulk insertion
        for (const entry of entries) {
            // Check for duplicate entry
            const checkEntryQuery = `
            SELECT * FROM timesheet_entries
            WHERE timesheet_id = ? AND program_id = ? AND employee_id = ?
        `;
            const [existingEntry] = await db.query(checkEntryQuery, [newTimesheetId, entry.values[2], employee_id]);

            if (existingEntry.length > 0) {
                await db.rollback();
                return res.status(400).json({ message: `An entry with the same timesheet_id, program_id (${entry.values[2]}), and employee_id already exists.` });
            }

            // Insert entry
            await db.execute(entry.query, entry.values);
        }

        // Commit the transaction
        await db.commit();

        res.status(201).json({
            message: "Timesheet and entries created successfully",
            timesheet_id: newTimesheetId,
        });
    } catch (error) {
        // Rollback transaction in case of an error
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error creating timesheet and entries", error });
    }
    finally {
        await db.end();
    }


});

// Get timesheets with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["timesheet_id", "tenant_id", "record_year", "record_month", "employee_id", "total_hours", "submission_date", "approval_date", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT t.*, e.avatar,e.first_name, e.last_name, ten.tenant_name
            FROM timesheets t
            JOIN employees e ON t.employee_id = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.record_month LIKE ? OR t.record_year LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR ten.tenant_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM timesheets t
            JOIN employees e ON t.employee_id = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.record_month LIKE ? OR t.record_year LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR ten.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            timesheets: rows,
            pagination: {
                total: tenant > 0 ? rows.length : total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(tenant > 0 ? rows.length : total / limit),
            },
            sorting: {
                sortColumn: column,
                sortOrder: order,
            },
            search: search,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching timesheets", error });
    }
});


router.get("/employee/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "", tenant = 0, employee_id } = req.query;
    const offset = (page - 1) * limit;
    // const { id } = req.params.id
    // console.log(id)
    const allowedSortColumns = ["timesheet_id", "tenant_id", "record_year", "record_month", "employee_id", "total_hours", "submission_date", "approval_date", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT t.*, e.avatar,e.first_name, e.last_name, ten.tenant_name
            FROM timesheets t
            JOIN employees e ON t.employee_id = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.employee_id =? AND
            ( t.record_month LIKE ?
             OR t.record_year LIKE ?
              OR e.first_name LIKE ? OR
              e.last_name LIKE ? OR
               ten.tenant_name LIKE ?)
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM timesheets t
            JOIN employees e ON t.employee_id = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.record_month LIKE ? OR t.record_year LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR ten.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [employee_id, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            timesheets: rows,
            pagination: {
                total: tenant > 0 ? rows.length : total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(tenant > 0 ? rows.length : total / limit),
            },
            sorting: {
                sortColumn: column,
                sortOrder: order,
            },
            search: search,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching timesheets", error });
    }
});

router.get("/supervisor/:id", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;
    const { id } = req.params.id
    const allowedSortColumns = ["timesheet_id", "tenant_id", "record_year", "record_month", "employee_id", "total_hours", "submission_date", "approval_date", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT t.*, e.avatar,e.first_name, e.last_name, ten.tenant_name
            FROM timesheets t
            JOIN employees e ON t.employee_id = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE e.supervisor_id =? AND
            ( t.record_month LIKE ?
             OR t.record_year LIKE ?
              OR e.first_name LIKE ? OR
              e.last_name LIKE ? OR
               ten.tenant_name LIKE ?)
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM timesheets t
            JOIN employees e ON t.employee_id = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.record_month LIKE ? OR t.record_year LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR ten.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [id, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            timesheets: rows,
            pagination: {
                total: tenant > 0 ? rows.length : total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(tenant > 0 ? rows.length : total / limit),
            },
            sorting: {
                sortColumn: column,
                sortOrder: order,
            },
            search: search,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching timesheets", error });
    }
});

// Get a single timesheet by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT t.*, e.first_name, e.last_name, ten.tenant_name
            FROM timesheets t
            JOIN employees e ON t.employee_id = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.timesheet_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Timesheet not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching timesheet", error });
    }
});

// Update a timesheet
// router.put("/:id", [auth], async (req, res) => {
//     const { id } = req.params;
//     const { tenant_id, record_year, record_month, employee_id, submission_date, approval_date, total_hours, comments, status } = req.body;

//     try {
//         // Check for duplicate tenant_id, record_year, record_month, and employee_id
//         const checkQuery = `
//             SELECT * FROM timesheets
//             WHERE tenant_id = ? AND record_year = ? AND record_month = ? AND employee_id = ? AND timesheet_id != ?
//         `;
//         const [existingTimesheet] = await db.query(checkQuery, [tenant_id, record_year, record_month, employee_id, id]);

//         if (existingTimesheet.length > 0) {
//             return res.status(400).json({ message: "A timesheet with the same tenant_id, record_year, record_month, and employee_id already exists." });
//         }

//         const query = `
//             UPDATE timesheets
//             SET tenant_id = ?, record_year = ?, record_month = ?, employee_id = ?, submission_date = ?, approval_date = ?, total_hours = ?, comments = ?, status = ?
//             WHERE timesheet_id = ?
//         `;
//         const [result] = await db.execute(query, [
//             tenant_id,
//             record_year,
//             record_month,
//             employee_id,
//             submission_date,
//             approval_date,
//             total_hours,
//             comments,
//             status,
//             id,
//         ]);

//         if (result.affectedRows === 0) {
//             return res.status(404).json({ message: "Timesheet not found" });
//         }

//         res.status(200).json({ message: "Timesheet updated successfully" });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error updating timesheet", error });
//     }
// });


// Update a timesheet
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { comments, status } = req.body;

    try {
        // Check for duplicate tenant_id, record_year, record_month, and employee_id
        // const checkQuery = `
        //     SELECT * FROM timesheets
        //     WHERE tenant_id = ? AND record_year = ? AND record_month = ? AND employee_id = ? AND timesheet_id != ?
        // `;
        // const [existingTimesheet] = await db.query(checkQuery, [tenant_id, record_year, record_month, employee_id, id]);

        // if (existingTimesheet.length > 0) {
        //     return res.status(400).json({ message: "A timesheet with the same tenant_id, record_year, record_month, and employee_id already exists." });
        // }
        const now = new Date();
        const formattedDateTime = now.toISOString().slice(0, 19).replace('T', ' ');
        const query = `
            UPDATE timesheets
            SET approval_date = ?, comments = ?, status = ?
            WHERE timesheet_id = ?
        `;

        const [result] = await db.execute(query, [

            formattedDateTime,
            comments,
            status,
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Timesheet not found" });
        }

        res.status(200).json({ message: "Timesheet updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating timesheet", error });
    }
});

// Delete a timesheet
router.delete("/:id", [auth], async (req, res) => {
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    const { id } = req.params;
    try {
        // Start the transaction
        await db.beginTransaction();

        // Delete timesheet entries
        const deleteEntriesQuery = "DELETE FROM timesheet_entries WHERE timesheet_id = ?";
        const [deleteEntriesResult] = await db.execute(deleteEntriesQuery, [id]);

        if (deleteEntriesResult.affectedRows === 0) {
            await db.rollback();
            return res.status(404).json({ message: "Timesheet entry not found" });
        }

        // Delete timesheet
        const deleteTimesheetQuery = "DELETE FROM timesheets WHERE timesheet_id = ?";
        const [deleteTimesheetResult] = await db.execute(deleteTimesheetQuery, [id]);

        if (deleteTimesheetResult.affectedRows === 0) {
            await db.rollback();
            return res.status(404).json({ message: "Timesheet not found" });
        }

        // Commit the transaction
        await db.commit();
        res.status(200).json({ message: "Timesheet and associated entries deleted successfully" });
    } catch (error) {
        // Rollback on error
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error deleting timesheet or entries", error });
    }
    finally {
        await db.end();
    }
    // try {
    //     const query = "DELETE FROM timesheets WHERE timesheet_id = ?";
    //     const [result] = await db.execute(query, [id]);

    //     if (result.affectedRows === 0) {
    //         return res.status(404).json({ message: "Timesheet not found" });
    //     }

    //     res.status(200).json({ message: "Timesheet deleted successfully" });
    // } catch (error) {
    //     console.error(error);
    //     res.status(500).json({ message: "Error deleting timesheet", error });
    // }
});

module.exports = router;