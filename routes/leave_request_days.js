const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");


// Create a leave request day
router.post("/", [auth], async (req, res) => {
    const { tenant_id, leave_request_id, record_month, leave_date } = req.body;

    try {
        // Check if the combination of tenant_id and leave_request_id already exists
        const checkQuery = `
            SELECT * FROM leave_request_days WHERE tenant_id = ? AND leave_request_id = ? AND leave_date = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, leave_request_id, leave_date]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This leave request ID already exists for the given tenant" });
        }

        const query = `
            INSERT INTO leave_request_days (tenant_id, leave_request_id, record_month, leave_date)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [
            tenant_id,
            leave_request_id,
            record_month,
            leave_date,
        ]);

        res.status(201).json({ message: "Leave request day created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating leave request day", error });
    }
});

// Get leave request days with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "record_month", sortOrder = "ASC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["leave_request_days_id", "tenant_id", "leave_request_id", "record_month", "leave_date"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "record_month";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT lrd.*, t.tenant_name
            FROM leave_request_days lrd
            JOIN tenants t ON lrd.tenant_id = t.tenant_id
            WHERE lrd.leave_request_id LIKE ? OR t.tenant_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM leave_request_days lrd
            JOIN tenants t ON lrd.tenant_id = t.tenant_id
            WHERE lrd.leave_request_id LIKE ? OR t.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

        res.status(200).json({
            leaveRequestDays: rows,
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
        res.status(500).json({ message: "Error fetching leave request days", error });
    }
});

// Get a single leave request day by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT lrd.*, t.tenant_name
            FROM leave_request_days lrd
            JOIN tenants t ON lrd.tenant_id = t.tenant_id
            WHERE lrd.leave_request_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Leave request day not found" });
        }

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching leave request day", error });
    }
});

// Get a single leave request day by ID
router.get("/details/:tenant_id/:employee_id/:record_month/:record_year/:status", [auth], async (req, res) => {
    const { tenant_id, employee_id, record_month, record_year, status } = req.params;

    try {
        const query = `
            SELECT lrd.*, t.tenant_name,lt.leave_name,lt.color_code
            FROM leave_request_days lrd
            JOIN tenants t ON lrd.tenant_id = t.tenant_id
             JOIN leave_requests lr ON lrd.leave_request_id = lr.leave_request_id
            JOIN leave_types lt ON lr.leave_type_id = lt.leave_type_id
            WHERE  lrd.employee_id = ? AND lrd.record_month = ? AND lr.record_year= ? AND lr.status =?
        `;
        let [rows] = await db.execute(query, [employee_id, record_month, record_year, status]);

        if (rows.length === 0) {

            //res.status(200).json(rows);
            // return res.status(404).json({ message: "Leave request day not found" });
        }
        rows = tenant_id > 0 ? rows.filter((d) => d.tenant_id == tenant_id) : rows
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching leave request day", error });
    }
});

// Update a leave request day
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, leave_request_id, record_month, leave_date } = req.body;

    try {
        // Check if the combination of tenant_id and leave_request_id already exists (excluding current record)
        const checkQuery = `
            SELECT * FROM leave_request_days WHERE tenant_id = ? AND leave_request_id = ? AND leave_request_days_id != ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, leave_request_id, id]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This leave request ID already exists for the given tenant" });
        }

        const query = `
            UPDATE leave_request_days
            SET tenant_id = ?, leave_request_id = ?, record_month = ?, leave_date = ?
            WHERE leave_request_days_id = ?
        `;
        const [result] = await db.execute(query, [
            tenant_id,
            leave_request_id,
            record_month,
            leave_date,
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Leave request day not found" });
        }

        res.status(200).json({ message: "Leave request day updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating leave request day", error });
    }
});

// Delete a leave request day
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM leave_request_days WHERE leave_request_days_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Leave request day not found" });
        }

        res.status(200).json({ message: "Leave request day deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting leave request day", error });
    }
});

module.exports = router;