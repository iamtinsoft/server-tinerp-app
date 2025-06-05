const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a notification
router.post("/", [auth], async (req, res) => {
    const { tenant_id, employee_id, content, status } = req.body;

    try {
        const query = `
            INSERT INTO notifications (tenant_id, employee_id, content, status)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [tenant_id, employee_id, content, status || "New"]);

        res.status(201).json({ message: "Notification created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating notification", error });
    }
});

// Get notifications with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["notification_id", "tenant_id", "employee_id", "content", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT n.*, t.tenant_name, e.first_name, e.last_name
            FROM notifications n
            JOIN tenants t ON n.tenant_id = t.tenant_id
            JOIN employees e ON n.employee_id = e.employee_id
            WHERE n.content LIKE ? OR t.tenant_name LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM notifications n
            JOIN tenants t ON n.tenant_id = t.tenant_id
            JOIN employees e ON n.employee_id = e.employee_id
            WHERE n.content LIKE ? OR t.tenant_name LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm]);

        res.status(200).json({
            notifications: rows,
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
        res.status(500).json({ message: "Error fetching notifications", error });
    }
});

// Get a single notification by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT n.*, t.tenant_name, e.first_name, e.last_name
            FROM notifications n
            JOIN tenants t ON n.tenant_id = t.tenant_id
            JOIN employees e ON n.employee_id = e.employee_id
            WHERE n.notification_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Notification not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching notification", error });
    }
});

// Update a notification
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, employee_id, content, status } = req.body;

    try {
        const query = `
            UPDATE notifications
            SET tenant_id = ?, employee_id = ?, content = ?, status = ?
            WHERE notification_id = ?
        `;
        const [result] = await db.execute(query, [tenant_id, employee_id, content, status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Notification not found" });
        }

        res.status(200).json({ message: "Notification updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating notification", error });
    }
});

// Delete a notification
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM notifications WHERE notification_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Notification not found" });
        }

        res.status(200).json({ message: "Notification deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting notification", error });
    }
});

module.exports = router;