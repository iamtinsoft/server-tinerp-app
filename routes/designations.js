const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a designation
router.post("/", [auth], async (req, res) => {
    const { tenant_id, department_id, designation_name, status } = req.body;

    try {
        // Check if the tenant_id, department_id, and designation_name combination already exists
        const checkQuery = `
            SELECT * FROM designations WHERE tenant_id = ? AND department_id = ? AND designation_name = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, department_id, designation_name]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This designation name for the tenant and department already exists" });
        }

        const query = `
            INSERT INTO designations (tenant_id, department_id, designation_name, status)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [tenant_id, department_id, designation_name, status || "Active"]);

        res.status(201).json({ message: "Designation created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating designation", error });
    }
});

// Get designations with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "ASC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["designation_id", "tenant_id", "department_id", "designation_name", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT d.*, t.tenant_name, dep.department_name
            FROM designations d
            JOIN tenants t ON d.tenant_id = t.tenant_id
            JOIN departments dep ON d.department_id = dep.department_id
            WHERE d.designation_name LIKE ? OR t.tenant_name LIKE ? OR dep.department_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM designations d
            JOIN tenants t ON d.tenant_id = t.tenant_id
            JOIN departments dep ON d.department_id = dep.department_id
            WHERE d.designation_name LIKE ? OR t.tenant_name LIKE ? OR dep.department_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            designations: rows,
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
        res.status(500).json({ message: "Error fetching designations", error });
    }
});

// Get a single designation by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT d.*, t.tenant_name, dep.department_name
            FROM designations d
            JOIN tenants t ON d.tenant_id = t.tenant_id
            JOIN departments dep ON d.department_id = dep.department_id
            WHERE d.designation_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Designation not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching designation", error });
    }
});

// Update a designation
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, department_id, designation_name, status } = req.body;

    try {
        // Check if the new tenant_id, department_id, and designation_name combination already exists (excluding current designation)
        const checkQuery = `
            SELECT * FROM designations WHERE tenant_id = ? AND department_id = ? AND designation_name = ? AND designation_id != ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, department_id, designation_name, id]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This designation name for the tenant and department already exists" });
        }

        const query = `
            UPDATE designations
            SET tenant_id = ?, department_id = ?, designation_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE designation_id = ?
        `;
        const [result] = await db.execute(query, [tenant_id, department_id, designation_name, status || "Active", id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Designation not found" });
        }

        res.status(200).json({ message: "Designation updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating designation", error });
    }
});

// Delete a designation
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM designations WHERE designation_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Designation not found" });
        }

        res.status(200).json({ message: "Designation deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting designation", error });
    }
});

module.exports = router;