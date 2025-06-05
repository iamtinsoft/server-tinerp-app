const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");
// Create a plan
router.post("/", [auth], async (req, res) => {
    const { plan_name, plan_description, plan_price, status } = req.body;

    try {
        const query = `
            INSERT INTO plans (plan_name, plan_description, plan_price, status)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [
            plan_name,
            plan_description || null,
            plan_price,
            status || "Active",
        ]);

        res.status(201).json({ message: "Plan created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            res.status(400).json({ message: "Plan name must be unique", error });
        } else {
            console.error(error);
            res.status(500).json({ message: "Error creating plan", error });
        }
    }
});

// Read all plans with pagination, search, and sorting
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "plan_name", sortOrder = "ASC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    // Whitelist allowed columns for sorting to prevent SQL injection
    const allowedSortColumns = ["plan_id", "plan_name", "plan_price", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "plan_name";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT *
            FROM plans
            WHERE plan_name LIKE ? OR plan_description LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM plans
            WHERE plan_name LIKE ? OR plan_description LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

        res.status(200).json({
            plans: rows,
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
        res.status(500).json({ message: "Error fetching plans", error });
    }
});

// Read a single plan by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "SELECT * FROM plans WHERE plan_id = ?";
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Plan not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching plan", error });
    }
});

// Update a plan
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { plan_name, plan_description, plan_price, status } = req.body;

    try {
        const query = `
            UPDATE plans
            SET plan_name = ?, plan_description = ?, plan_price = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE plan_id = ?
        `;
        const [result] = await db.execute(query, [
            plan_name,
            plan_description || null,
            plan_price,
            status || "Active",
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Plan not found" });
        }

        res.status(200).json({ message: "Plan updated successfully" });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            res.status(400).json({ message: "Plan name must be unique", error });
        } else {
            console.error(error);
            res.status(500).json({ message: "Error updating plan", error });
        }
    }
});

// Delete a plan
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM plans WHERE plan_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Plan not found" });
        }

        res.status(200).json({ message: "Plan deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting plan", error });
    }
});
module.exports = router;
