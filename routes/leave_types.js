const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a leave type
router.post("/", [auth], async (req, res) => {
    const { tenant_id, leave_name, leave_description, max_days, carry_forward_days, color_code, status } = req.body;

    try {
        // Check if the combination of tenant_id and leave_name already exists
        const checkQuery = `
            SELECT * FROM leave_types WHERE tenant_id = ? AND leave_name = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, leave_name]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This leave name already exists for the given tenant" });
        }

        const query = `
            INSERT INTO leave_types (tenant_id, leave_name, leave_description, max_days, carry_forward_days,color_code, status)
            VALUES (?, ?, ?, ?, ?, ?,?)
        `;
        const [result] = await db.execute(query, [
            tenant_id,
            leave_name,
            leave_description,
            max_days,
            carry_forward_days || 0,
            color_code,
            status || "Active",
        ]);

        res.status(201).json({ message: "Leave type created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating leave type", error });
    }
});

// Get leave types with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "ASC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["leave_type_id", "tenant_id", "leave_name", "max_days", "carry_forward_days", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT lt.*, t.tenant_name
            FROM leave_types lt
            JOIN tenants t ON lt.tenant_id = t.tenant_id
            WHERE lt.leave_name LIKE ? OR t.tenant_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM leave_types lt
            JOIN tenants t ON lt.tenant_id = t.tenant_id
            WHERE lt.leave_name LIKE ? OR t.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            leave_types: rows,
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
        res.status(500).json({ message: "Error fetching leave types", error });
    }
});

// Get a single leave type by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT lt.*, t.tenant_name
            FROM leave_types lt
            JOIN tenants t ON lt.tenant_id = t.tenant_id
            WHERE lt.leave_type_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Leave type not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching leave type", error });
    }
});

// Update a leave type
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, leave_name, leave_description, max_days, carry_forward_days, color_code, status } = req.body;

    try {
        // Check if the combination of tenant_id and leave_name already exists (excluding current leave type)
        const checkQuery = `
            SELECT * FROM leave_types WHERE tenant_id = ? AND leave_name = ? AND leave_type_id != ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, leave_name, id]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This leave name already exists for the given tenant" });
        }

        const query = `
            UPDATE leave_types
            SET tenant_id = ?, leave_name = ?, leave_description = ?, max_days = ?, carry_forward_days = ?,color_code=?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE leave_type_id = ?
        `;
        const [result] = await db.execute(query, [
            tenant_id,
            leave_name,
            leave_description,
            max_days,
            carry_forward_days || 0,
            color_code,
            status || "Active",
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Leave type not found" });
        }

        res.status(200).json({ message: "Leave type updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating leave type", error });
    }
});

// Delete a leave type
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM leave_types WHERE leave_type_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Leave type not found" });
        }

        res.status(200).json({ message: "Leave type deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting leave type", error });
    }
});

module.exports = router;