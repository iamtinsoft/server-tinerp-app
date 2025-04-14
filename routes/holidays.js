const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a holiday record
router.post("/", [auth], async (req, res) => {
    const { tenant_id, holiday_name, holiday_date, recurring, status } = req.body;

    try {
        // Check if the combination of tenant_id, holiday_name, and holiday_date already exists
        const checkQuery = `
            SELECT * FROM holidays
            WHERE tenant_id = ? AND holiday_name = ? AND holiday_date = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, holiday_name, holiday_date]);

        if (existing.length > 0) {
            return res.status(400).json({
                message: "A holiday with the same tenant, name, and date already exists.",
            });
        }

        const query = `
            INSERT INTO holidays (tenant_id, holiday_name, holiday_date, recurring, status)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [tenant_id, holiday_name, holiday_date, recurring, status]);

        res.status(201).json({ message: "Holiday created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating holiday", error });
    }
});

// Get holidays with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "holiday_date", sortOrder = "ASC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = [
        "holiday_id",
        "tenant_id",
        "holiday_name",
        "holiday_date",
        "recurring",
        "status",
        "created_at",
        "updated_at",
    ];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "holiday_date";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT h.*, t.tenant_name
            FROM holidays h
            JOIN tenants t ON h.tenant_id = t.tenant_id
            WHERE h.holiday_name LIKE ? OR t.tenant_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM holidays h
            JOIN tenants t ON h.tenant_id = t.tenant_id
            WHERE h.holiday_name LIKE ? OR t.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

        res.status(200).json({
            holidays: rows,
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
        res.status(500).json({ message: "Error fetching holidays", error });
    }
});

// Get a single holiday by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT h.*, t.tenant_name
            FROM holidays h
            JOIN tenants t ON h.tenant_id = t.tenant_id
            WHERE h.holiday_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Holiday not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching holiday", error });
    }
});

// Update a holiday
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, holiday_name, holiday_date, recurring, status } = req.body;

    try {
        // Check if the combination of tenant_id, holiday_name, and holiday_date already exists (excluding current record)
        const checkQuery = `
            SELECT * FROM holidays
            WHERE tenant_id = ? AND holiday_name = ? AND holiday_date = ? AND holiday_id != ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, holiday_name, holiday_date, id]);

        if (existing.length > 0) {
            return res.status(400).json({
                message: "A holiday with the same tenant, name, and date already exists.",
            });
        }

        const query = `
            UPDATE holidays
            SET tenant_id = ?, holiday_name = ?, holiday_date = ?, recurring = ?, status = ?
            WHERE holiday_id = ?
        `;
        const [result] = await db.execute(query, [tenant_id, holiday_name, holiday_date, recurring, status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Holiday not found" });
        }

        res.status(200).json({ message: "Holiday updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating holiday", error });
    }
});

// Delete a holiday
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM holidays WHERE holiday_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Holiday not found" });
        }

        res.status(200).json({ message: "Holiday deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting holiday", error });
    }
});

module.exports = router;