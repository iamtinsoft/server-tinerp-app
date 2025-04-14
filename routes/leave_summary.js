const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a leave summary record
router.post("/", [auth], async (req, res) => {
    const { tenant_id, record_year, employee_id, leave_type_id, used_days, balance_days } = req.body;

    try {
        // Check if the combination of tenant_id, record_year, employee_id, and leave_type_id already exists
        const checkQuery = `
            SELECT * FROM leave_summary
            WHERE tenant_id = ? AND record_year = ? AND employee_id = ? AND leave_type_id = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, record_year, employee_id, leave_type_id]);

        if (existing.length > 0) {
            return res.status(400).json({
                message: "A leave summary for the given tenant, year, employee, and leave type already exists.",
            });
        }

        const query = `
            INSERT INTO leave_summary (tenant_id, record_year, employee_id, leave_type_id, used_days, balance_days)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [
            tenant_id,
            record_year,
            employee_id,
            leave_type_id,
            used_days,
            balance_days,
        ]);

        res.status(201).json({ message: "Leave summary created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating leave summary", error });
    }
});

// Get leave summaries with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "record_year", sortOrder = "ASC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = [
        "leave_summary_id",
        "tenant_id",
        "record_year",
        "employee_id",
        "leave_type_id",
        "used_days",
        "balance_days",
    ];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "record_year";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT ls.*, t.tenant_name, e.first_name AS employee_first_name, lt.leave_name
            FROM leave_summary ls
            JOIN tenants t ON ls.tenant_id = t.tenant_id
            JOIN employees e ON ls.employee_id = e.employee_id
            JOIN leave_types lt ON ls.leave_type_id = lt.leave_type_id
            WHERE t.tenant_name LIKE ? OR e.first_name LIKE ? OR lt.leave_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM leave_summary ls
            JOIN tenants t ON ls.tenant_id = t.tenant_id
            JOIN employees e ON ls.employee_id = e.employee_id
            JOIN leave_types lt ON ls.leave_type_id = lt.leave_type_id
            WHERE t.tenant_name LIKE ? OR e.first_name LIKE ? OR lt.leave_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm]);

        res.status(200).json({
            leaveSummaries: rows,
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
        res.status(500).json({ message: "Error fetching leave summaries", error });
    }
});

// Get a single leave summary by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT ls.*, t.tenant_name, e.first_name AS employee_first_name, lt.leave_name
            FROM leave_summary ls
            JOIN tenants t ON ls.tenant_id = t.tenant_id
            JOIN employees e ON ls.employee_id = e.employee_id
            JOIN leave_types lt ON ls.leave_type_id = lt.leave_type_id
            WHERE ls.leave_summary_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Leave summary not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching leave summary", error });
    }
});

router.get("/details/:tenant_id/:employee_id/:record_year/:leave_type_id", [auth], async (req, res) => {
    const { tenant_id, employee_id, record_year, leave_type_id } = req.params;

    try {
        const query = `
            SELECT ls.*, t.tenant_name, e.first_name AS employee_first_name, lt.leave_name
            FROM leave_summary ls
            JOIN tenants t ON ls.tenant_id = t.tenant_id
            JOIN employees e ON ls.employee_id = e.employee_id
            JOIN leave_types lt ON ls.leave_type_id = lt.leave_type_id
            WHERE ls.tenant_id = ? AND ls.employee_id =? AND ls.record_year=? AND ls.leave_type_id=?
        `;
        const [rows] = await db.execute(query, [tenant_id, employee_id, record_year, leave_type_id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Leave summary not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching leave summary", error });
    }
});
// Update a leave summary
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, record_year, employee_id, leave_type_id, used_days, balance_days } = req.body;

    try {


        const query = `
            UPDATE leave_summary
            SET tenant_id = ?, record_year = ?, employee_id = ?, leave_type_id = ?, used_days = ?, balance_days = ?
            WHERE leave_summary_id = ?
        `;
        const [result] = await db.execute(query, [
            tenant_id,
            record_year,
            employee_id,
            leave_type_id,
            used_days,
            balance_days,
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Leave summary not found" });
        }

        res.status(200).json({ message: "Leave summary updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating leave summary", error });
    }
});

// Delete a leave summary
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM leave_summary WHERE leave_summary_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Leave summary not found" });
        }

        res.status(200).json({ message: "Leave summary deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting leave summary", error });
    }
});

module.exports = router;