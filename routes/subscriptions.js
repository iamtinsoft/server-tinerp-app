const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a subscription
router.post("/", [auth], async (req, res) => {
    const { tenant_id, plan_id, status } = req.body;

    try {
        // Check if the tenant_id and plan_id combination already exists
        const checkQuery = `
            SELECT * FROM subscriptions WHERE tenant_id = ? AND plan_id = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, plan_id]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This tenant-plan combination already exists" });
        }

        const query = `
            INSERT INTO subscriptions (tenant_id, plan_id, status)
            VALUES (?, ?, ?)
        `;
        const [result] = await db.execute(query, [tenant_id, plan_id, status || "Active"]);

        res.status(201).json({ message: "Subscription created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating subscription", error });
    }
});

// Get subscriptions with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "ASC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["subscription_id", "tenant_id", "plan_id", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT s.*, t.tenant_name, p.plan_name
            FROM subscriptions s
            JOIN tenants t ON s.tenant_id = t.tenant_id
            JOIN plans p ON s.plan_id = p.plan_id
            WHERE t.tenant_name LIKE ? OR p.plan_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM subscriptions s
            JOIN tenants t ON s.tenant_id = t.tenant_id
            JOIN plans p ON s.plan_id = p.plan_id
            WHERE t.tenant_name LIKE ? OR p.plan_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

        res.status(200).json({
            subscriptions: rows,
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
        res.status(500).json({ message: "Error fetching subscriptions", error });
    }
});

// Get a single subscription by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT s.*, t.tenant_name, p.plan_name
            FROM subscriptions s
            JOIN tenants t ON s.tenant_id = t.tenant_id
            JOIN plans p ON s.plan_id = p.plan_id
            WHERE s.subscription_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Subscription not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching subscription", error });
    }
});

// Update a subscription
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, plan_id, status } = req.body;

    try {
        // Check if the new tenant_id and plan_id combination already exists (excluding current subscription)
        // const checkQuery = `
        //     SELECT * FROM subscriptions WHERE tenant_id = ? AND plan_id = ? AND subscription_id != ?
        // `;
        // const [existing] = await db.query(checkQuery, [tenant_id, plan_id, id]);

        // if (existing.length > 0) {
        //     return res.status(400).json({ message: "This tenant-plan combination already exists" });
        // }

        const query = `
            UPDATE subscriptions
            SET tenant_id = ?, plan_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE subscription_id = ?
        `;
        const [result] = await db.execute(query, [tenant_id, plan_id, status || "Active", id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Subscription not found" });
        }

        res.status(200).json({ message: "Subscription updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating subscription", error });
    }
});

// Delete a subscription
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM subscriptions WHERE subscription_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Subscription not found" });
        }

        res.status(200).json({ message: "Subscription deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting subscription", error });
    }
});

module.exports = router;