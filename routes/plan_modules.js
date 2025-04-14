const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a plan-module mapping
router.post("/", [auth], async (req, res) => {
    const { plan_id, module_id, status } = req.body;

    try {
        // Check if the plan_id and module_id combination already exists
        const checkQuery = `
            SELECT * FROM plan_modules WHERE plan_id = ? AND module_id = ?
        `;
        const [existing] = await db.query(checkQuery, [plan_id, module_id]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This plan-module combination already exists" });
        }

        const query = `
            INSERT INTO plan_modules (plan_id, module_id, status)
            VALUES (?, ?, ?)
        `;
        const [result] = await db.execute(query, [plan_id, module_id, "Active"]);

        res.status(201).json({ message: "Plan-module mapping created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating plan-module mapping", error });
    }
});

// Get plan-modules with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "ASC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["plan_module_id", "plan_id", "module_id", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT pm.*, p.plan_name, m.module_name
            FROM plan_modules pm
            JOIN plans p ON pm.plan_id = p.plan_id
            JOIN modules m ON pm.module_id = m.module_id
            WHERE p.plan_name LIKE ? OR m.module_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM plan_modules pm
            JOIN plans p ON pm.plan_id = p.plan_id
            JOIN modules m ON pm.module_id = m.module_id
            WHERE p.plan_name LIKE ? OR m.module_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

        res.status(200).json({
            planModules: rows,
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
        res.status(500).json({ message: "Error fetching plan-modules", error });
    }
});

// Get a single plan-module mapping by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT pm.*, p.plan_name, m.module_name
            FROM plan_modules pm
            JOIN plans p ON pm.plan_id = p.plan_id
            JOIN modules m ON pm.module_id = m.module_id
            WHERE pm.plan_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Plan-module mapping not found" });
        }

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching plan-module mapping", error });
    }
});

// Update a plan-module mapping
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { plan_id, module_id, status } = req.body;

    try {
        // Check if the new plan_id and module_id combination already exists (excluding current mapping)
        const checkQuery = `
            SELECT * FROM plan_modules WHERE plan_id = ? AND module_id = ? AND plan_module_id != ?
        `;
        const [existing] = await db.query(checkQuery, [plan_id, module_id, id]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This plan-module combination already exists" });
        }

        const query = `
            UPDATE plan_modules
            SET plan_id = ?, module_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE plan_module_id = ?
        `;
        const [result] = await db.execute(query, [plan_id, module_id, status || "Active", id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Plan-module mapping not found" });
        }

        res.status(200).json({ message: "Plan-module mapping updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating plan-module mapping", error });
    }
});

// Delete a plan-module mapping
router.delete("/:plan_id/:module_id", [auth], async (req, res) => {
    const { plan_id, module_id } = req.params;
    try {
        const query = "DELETE FROM plan_modules WHERE plan_id = ? AND module_id = ?";
        const [result] = await db.execute(query, [plan_id, module_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Plan-module mapping not found" });
        }

        res.status(200).json({ message: "Plan-module mapping deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting plan-module mapping", error });
    }
});

module.exports = router;