const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Get all subtasks with pagination, sorting, and filtering
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "created_at",
        sortOrder = "DESC",
        taskId,
        search = "",
        status
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["subtask_id", "task_id", "title", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT 
                s.*,
                t.title as task_title,
                t.tenant_id
            FROM 
                subtasks s
            INNER JOIN 
                tasks t ON s.task_id = t.task_id
            WHERE 1=1
        `;
        const queryParams = [];

        // Add task_id filtering
        if (taskId) {
            query += ` AND s.task_id = ?`;
            queryParams.push(taskId);
        }

        // Add status filtering
        if (status) {
            query += ` AND s.status = ?`;
            queryParams.push(status);
        }

        // Add search filtering
        if (search) {
            query += ` AND (s.title LIKE ? OR t.title LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [subtasks] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM subtasks s
            INNER JOIN tasks t ON s.task_id = t.task_id
            WHERE 1=1
        `;
        const countParams = [];

        if (taskId) {
            countQuery += ` AND s.task_id = ?`;
            countParams.push(taskId);
        }
        if (status) {
            countQuery += ` AND s.status = ?`;
            countParams.push(status);
        }
        if (search) {
            countQuery += ` AND (s.title LIKE ? OR t.title LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            subtasks,
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
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching subtasks", error: error.message });
    }
});

// Get a subtask by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    try {
        const [subtasks] = await db.query(`
            SELECT 
                s.*,
                t.title as task_title,
                t.tenant_id,
                t.status as task_status
            FROM 
                subtasks s
            INNER JOIN 
                tasks t ON s.task_id = t.task_id
            WHERE 
                s.subtask_id = ?
        `, [id]);

        if (subtasks.length === 0) {
            return res.status(404).json({ message: "Subtask not found" });
        }

        res.status(200).json(subtasks[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching subtask", error: error.message });
    }
});

// Create a new subtask
router.post("/", [auth], async (req, res) => {
    const { task_id, title, status } = req.body;

    // Validate required fields
    const schema = Joi.object({
        task_id: Joi.number().required(),
        title: Joi.string().max(255).required(),
        status: Joi.string().valid('not_started', 'in_progress', 'completed').default('not_started')
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Check if task exists
        const [taskCheck] = await db.query(`SELECT tenant_id, title FROM tasks WHERE task_id = ?`, [task_id]);

        if (taskCheck.length === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Insert subtask
        const [result] = await db.query(
            `INSERT INTO subtasks (task_id, title, status)
             VALUES (?, ?, ?)`,
            [task_id, title, status || 'not_started']
        );

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                taskCheck[0].tenant_id,
                req.user.employee_id,
                'add_subtask',
                JSON.stringify({
                    task_id: task_id,
                    subtask_id: result.insertId,
                    task_title: taskCheck[0].title,
                    subtask_title: title
                })
            ]
        );

        res.status(201).json({
            message: "Subtask created successfully",
            subtask_id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating subtask", error: error.message });
    }
});

// Update a subtask
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { title, status } = req.body;

    // Validate required fields
    const schema = Joi.object({
        title: Joi.string().max(255),
        status: Joi.string().valid('not_started', 'in_progress', 'completed')
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Check if subtask exists and get task info
        const [subtaskCheck] = await db.query(`
            SELECT s.*, t.tenant_id, t.title as task_title 
            FROM subtasks s
            INNER JOIN tasks t ON s.task_id = t.task_id
            WHERE s.subtask_id = ?
        `, [id]);

        if (subtaskCheck.length === 0) {
            return res.status(404).json({ message: "Subtask not found" });
        }

        // Build update query
        let updateQuery = `UPDATE subtasks SET updated_at = NOW()`;
        const updateParams = [];

        if (title !== undefined) {
            updateQuery += `, title = ?`;
            updateParams.push(title);
        }

        if (status !== undefined) {
            updateQuery += `, status = ?`;
            updateParams.push(status);
        }

        updateQuery += ` WHERE subtask_id = ?`;
        updateParams.push(id);

        // Update subtask
        await db.query(updateQuery, updateParams);

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                subtaskCheck[0].tenant_id,
                req.user.employee_id,
                'update_subtask',
                JSON.stringify({
                    task_id: subtaskCheck[0].task_id,
                    subtask_id: id,
                    task_title: subtaskCheck[0].task_title,
                    subtask_title: title || subtaskCheck[0].title,
                    previous_status: subtaskCheck[0].status,
                    new_status: status || subtaskCheck[0].status
                })
            ]
        );

        // If all subtasks are completed, check if task status should be updated
        if (status === 'completed') {
            const [incompleteSubtasks] = await db.query(
                `SELECT COUNT(*) as count FROM subtasks 
                 WHERE task_id = ? AND status != 'completed'`,
                [subtaskCheck[0].task_id]
            );

            if (incompleteSubtasks[0].count === 0) {
                // All subtasks are completed, suggest updating task status
                return res.status(200).json({
                    message: "Subtask updated successfully",
                    allSubtasksCompleted: true
                });
            }
        }

        res.status(200).json({ message: "Subtask updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating subtask", error: error.message });
    }
});

// Delete a subtask
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        // Check if subtask exists and get task info
        const [subtaskCheck] = await db.query(`
            SELECT s.*, t.tenant_id, t.title as task_title 
            FROM subtasks s
            INNER JOIN tasks t ON s.task_id = t.task_id
            WHERE s.subtask_id = ?
        `, [id]);

        if (subtaskCheck.length === 0) {
            return res.status(404).json({ message: "Subtask not found" });
        }

        // Delete subtask
        await db.query(`DELETE FROM subtasks WHERE subtask_id = ?`, [id]);

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                subtaskCheck[0].tenant_id,
                req.user.employee_id,
                'delete_subtask',
                JSON.stringify({
                    task_id: subtaskCheck[0].task_id,
                    subtask_id: id,
                    task_title: subtaskCheck[0].task_title,
                    subtask_title: subtaskCheck[0].title
                })
            ]
        );

        res.status(200).json({ message: "Subtask deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting subtask", error: error.message });
    }
});

// Bulk update subtasks
router.patch("/bulk", [auth], async (req, res) => {
    const { subtask_ids, status } = req.body;

    // Validate required fields
    const schema = Joi.object({
        subtask_ids: Joi.array().items(Joi.number()).min(1).required(),
        status: Joi.string().valid('not_started', 'in_progress', 'completed').required()
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Update all subtasks
        await db.query(
            `UPDATE subtasks SET status = ?, updated_at = NOW()
             WHERE subtask_id IN (?)`,
            [status, subtask_ids]
        );

        // Get task info for logging
        const [subtaskInfo] = await db.query(`
            SELECT DISTINCT t.task_id, t.tenant_id, t.title as task_title
            FROM subtasks s
            INNER JOIN tasks t ON s.task_id = t.task_id
            WHERE s.subtask_id IN (?)
        `, [subtask_ids]);

        if (subtaskInfo.length > 0) {
            // Log activity for each task affected
            for (const task of subtaskInfo) {
                await db.query(
                    `INSERT INTO task_activity_logs 
                        (tenant_id, employee_id, action, details) 
                     VALUES (?, ?, ?, ?)`,
                    [
                        task.tenant_id,
                        req.user.employee_id,
                        'bulk_update_subtasks',
                        JSON.stringify({
                            task_id: task.task_id,
                            task_title: task.task_title,
                            subtask_ids: subtask_ids,
                            new_status: status,
                            count: subtask_ids.length
                        })
                    ]
                );
            }
        }

        res.status(200).json({
            message: `${subtask_ids.length} subtasks updated successfully`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating subtasks", error: error.message });
    }
});

module.exports = router;