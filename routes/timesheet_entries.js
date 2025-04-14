const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a timesheet entry
router.post("/", [auth], async (req, res) => {
    const { timesheet_id, employee_id, program_id, days } = req.body;

    try {
        // Validate no duplicate record for timesheet_id, program_id, and employee_id
        const checkQuery = `
            SELECT * FROM timesheet_entries
            WHERE timesheet_id = ? AND program_id = ? AND employee_id = ?
        `;
        const [existingEntry] = await db.query(checkQuery, [timesheet_id, program_id, employee_id]);

        if (existingEntry.length > 0) {
            return res.status(400).json({ message: "An entry with the same timesheet_id, program_id, and employee_id already exists." });
        }

        // Build dynamic columns for days (e.g., _1, _2, ..., _31)
        const dayColumns = Array.from({ length: 31 }, (_, i) => `_${i + 1}`).join(", ");
        const dayValues = Array.from({ length: 31 }, (_, i) => days[i + 1] || 0);

        const query = `
            INSERT INTO timesheet_entries (timesheet_id, employee_id, program_id, ${dayColumns})
            VALUES (?, ?, ?, ${Array(31).fill("?").join(", ")})
        `;
        const [result] = await db.execute(query, [timesheet_id, employee_id, program_id, ...dayValues]);

        res.status(201).json({ message: "Timesheet entry created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating timesheet entry", error });
    }
});

// Get timesheet entries with pagination, search, and sorting
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["timesheet_entries_id", "timesheet_id", "employee_id", "program_id", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT te.*, t.record_month, t.record_year, e.first_name, e.last_name, p.program_name
            FROM timesheet_entries te
            JOIN timesheets t ON te.timesheet_id = t.timesheet_id
            JOIN employees e ON te.employee_id = e.employee_id
            JOIN programs p ON te.program_id = p.program_id
            WHERE t.record_month LIKE ? OR t.record_year LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR p.program_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM timesheet_entries te
            JOIN timesheets t ON te.timesheet_id = t.timesheet_id
            JOIN employees e ON te.employee_id = e.employee_id
            JOIN programs p ON te.program_id = p.program_id
            WHERE t.record_month LIKE ? OR t.record_year LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR p.program_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);

        res.status(200).json({
            timesheet_entries: rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            },
            sorting: {
                sortColumn: column,
                sortOrder: order,
            },
            search: search,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching timesheet entries", error });
    }
});

// Get a single timesheet entry by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT te.*, t.record_month, t.record_year, e.first_name, e.last_name,p.program_id,p.program_code, p.program_name
            FROM timesheet_entries te
            JOIN timesheets t ON te.timesheet_id = t.timesheet_id
            JOIN employees e ON te.employee_id = e.employee_id
            JOIN programs p ON te.program_id = p.program_id
            WHERE te.timesheet_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Timesheet entry not found" });
        }
        console.log(rows)
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching timesheet entry", error });
    }
});

// Update a timesheet entry
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { timesheet_id, employee_id, program_id, days } = req.body;

    try {
        // Validate no duplicate record for timesheet_id, program_id, and employee_id
        const checkQuery = `
            SELECT * FROM timesheet_entries
            WHERE timesheet_id = ? AND program_id = ? AND employee_id = ? AND timesheet_entries_id != ?
        `;
        const [existingEntry] = await db.query(checkQuery, [timesheet_id, program_id, employee_id, id]);

        if (existingEntry.length > 0) {
            return res.status(400).json({ message: "An entry with the same timesheet_id, program_id, and employee_id already exists." });
        }

        // Build dynamic columns for days
        const dayUpdates = Array.from({ length: 31 }, (_, i) => `_${i + 1} = ?`).join(", ");
        const dayValues = Array.from({ length: 31 }, (_, i) => days[i + 1] || 0);

        const query = `
            UPDATE timesheet_entries
            SET timesheet_id = ?, employee_id = ?, program_id = ?, ${dayUpdates}
            WHERE timesheet_entries_id = ?
        `;
        const [result] = await db.execute(query, [timesheet_id, employee_id, program_id, ...dayValues, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Timesheet entry not found" });
        }

        res.status(200).json({ message: "Timesheet entry updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating timesheet entry", error });
    }
});

// Delete a timesheet entry
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM timesheet_entries WHERE timesheet_entries_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Timesheet entry not found" });
        }

        res.status(200).json({ message: "Timesheet entry deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting timesheet entry", error });
    }
});

module.exports = router;
