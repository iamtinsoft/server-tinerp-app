const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a department
router.post("/", [auth], async (req, res) => {
    const { tenant_id, department_name, status } = req.body;

    try {
        // Check if the tenant_id and department_name combination already exists
        const checkQuery = `
            SELECT * FROM departments WHERE tenant_id = ? AND department_name = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, department_name]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This department name for the tenant already exists" });
        }

        const query = `
            INSERT INTO departments (tenant_id, department_name, status)
            VALUES (?, ?, ?)
        `;
        const [result] = await db.execute(query, [tenant_id, department_name, status || "Active"]);

        res.status(201).json({ message: "Department created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating department", error });
    }
});

// Get departments with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "ASC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["department_id", "tenant_id", "department_name", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT d.*, t.tenant_name
            FROM departments d
            JOIN tenants t ON d.tenant_id = t.tenant_id
            WHERE d.department_name LIKE ? OR t.tenant_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM departments d
            JOIN tenants t ON d.tenant_id = t.tenant_id
            WHERE d.department_name LIKE ? OR t.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            departments: rows,
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
        res.status(500).json({ message: "Error fetching departments", error });
    }
});

// Get a single department by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT d.*, t.tenant_name
            FROM departments d
            JOIN tenants t ON d.tenant_id = t.tenant_id
            WHERE d.department_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Department not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching department", error });
    }
});

// Update a department
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, department_name, status } = req.body;

    try {
        // Check if the new tenant_id and department_name combination already exists (excluding current department)
        const checkQuery = `
            SELECT * FROM departments WHERE tenant_id = ? AND department_name = ? AND department_id != ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, department_name, id]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This department name for the tenant already exists" });
        }

        const query = `
            UPDATE departments
            SET tenant_id = ?, department_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE department_id = ?
        `;
        const [result] = await db.execute(query, [tenant_id, department_name, status || "Active", id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Department not found" });
        }

        res.status(200).json({ message: "Department updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating department", error });
    }
});

// Delete a department
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM departments WHERE department_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Department not found" });
        }

        res.status(200).json({ message: "Department deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting department", error });
    }
});

module.exports = router;