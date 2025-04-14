const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a task
router.post("/", [auth], async (req, res) => {
    const { tenant_id, task_name, task_description, assigned_to, due_date, status } = req.body;

    try {
        // Check for duplicate tenant_id, task_name, and assigned_to
        const checkQuery = `
            SELECT * FROM tasks
            WHERE tenant_id = ? AND task_name = ? AND assigned_to = ?
        `;
        const [existingTask] = await db.query(checkQuery, [tenant_id, task_name, assigned_to]);

        if (existingTask.length > 0) {
            return res.status(400).json({ message: "A task with the same tenant_id, task_name, and assigned_to already exists." });
        }

        const query = `
            INSERT INTO tasks (tenant_id, task_name, task_description, assigned_to, due_date, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [tenant_id, task_name, task_description, assigned_to, due_date, status || "Pending"]);

        res.status(201).json({ message: "Task created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating task", error });
    }
});

// Get tasks with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["task_id", "tenant_id", "task_name", "assigned_to", "due_date", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT t.*, e.first_name, e.last_name, ten.tenant_name
            FROM tasks t
            JOIN employees e ON t.assigned_to = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.task_name LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR ten.tenant_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM tasks t
            JOIN employees e ON t.assigned_to = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.task_name LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR ten.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm]);

        res.status(200).json({
            tasks: rows,
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
        res.status(500).json({ message: "Error fetching tasks", error });
    }
});

// Get a single task by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT t.*, e.first_name, e.last_name, ten.tenant_name
            FROM tasks t
            JOIN employees e ON t.assigned_to = e.employee_id
            JOIN tenants ten ON t.tenant_id = ten.tenant_id
            WHERE t.task_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching task", error });
    }
});

// Update a task
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, task_name, task_description, assigned_to, due_date, status } = req.body;

    try {
        // Check for duplicate tenant_id, task_name, and assigned_to
        const checkQuery = `
            SELECT * FROM tasks
            WHERE tenant_id = ? AND task_name = ? AND assigned_to = ? AND task_id != ?
        `;
        const [existingTask] = await db.query(checkQuery, [tenant_id, task_name, assigned_to, id]);

        if (existingTask.length > 0) {
            return res.status(400).json({ message: "A task with the same tenant_id, task_name, and assigned_to already exists." });
        }

        const query = `
            UPDATE tasks
            SET tenant_id = ?, task_name = ?, task_description = ?, assigned_to = ?, due_date = ?, status = ?
            WHERE task_id = ?
        `;
        const [result] = await db.execute(query, [tenant_id, task_name, task_description, assigned_to, due_date, status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        res.status(200).json({ message: "Task updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating task", error });
    }
});

// Delete a task
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM tasks WHERE task_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting task", error });
    }
});

module.exports = router;