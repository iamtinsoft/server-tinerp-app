const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Get all task comments with pagination, sorting, and filtering
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "created_at",
        sortOrder = "DESC",
        taskId,
        employee
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["comment_id", "task_id", "employee_id", "created_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT 
                tc.*,
                e.first_name,
                e.last_name,
                e.email,
                t.title as task_title,
                t.tenant_id
            FROM 
                task_comments tc
            INNER JOIN 
                employees e ON tc.employee_id = e.employee_id
            INNER JOIN
                tasks t ON tc.task_id = t.task_id
            WHERE 1=1
        `;
        const queryParams = [];

        // Add task_id filtering
        if (taskId) {
            query += ` AND tc.task_id = ?`;
            queryParams.push(taskId);
        }

        // Add employee filtering
        if (employee) {
            query += ` AND tc.employee_id = ?`;
            queryParams.push(employee);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [comments] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM task_comments tc
            INNER JOIN employees e ON tc.employee_id = e.employee_id
            INNER JOIN tasks t ON tc.task_id = t.task_id
            WHERE 1=1
        `;
        const countParams = [];

        if (taskId) {
            countQuery += ` AND tc.task_id = ?`;
            countParams.push(taskId);
        }
        if (employee) {
            countQuery += ` AND tc.employee_id = ?`;
            countParams.push(employee);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            comments,
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
        res.status(500).json({ message: "Error fetching comments", error: error.message });
    }
});

// Get a comment by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    try {
        const [comments] = await db.query(`
            SELECT 
                tc.*,
                e.first_name,
                e.last_name,
                e.email,
                t.title as task_title,
                t.tenant_id
            FROM 
                task_comments tc
            INNER JOIN 
                employees e ON tc.employee_id = e.employee_id
            INNER JOIN
                tasks t ON tc.task_id = t.task_id
            WHERE 
                tc.comment_id = ?
        `, [id]);

        if (comments.length === 0) {
            return res.status(404).json({ message: "Comment not found" });
        }

        res.status(200).json(comments[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching comment", error: error.message });
    }
});

// Create a new comment
router.post("/", [auth], async (req, res) => {
    const { task_id, comment } = req.body;

    // Validate required fields
    const schema = Joi.object({
        task_id: Joi.number().required(),
        comment: Joi.string().required()
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Check if task exists
        const [taskCheck] = await db.query(`
            SELECT tenant_id, title FROM tasks WHERE task_id = ?
        `, [task_id]);

        if (taskCheck.length === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Insert comment
        const [result] = await db.query(
            `INSERT INTO task_comments (task_id, employee_id, comment)
             VALUES (?, ?, ?)`,
            [task_id, req.user.employee_id, comment]
        );

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                taskCheck[0].tenant_id,
                req.user.employee_id,
                'add_comment',
                JSON.stringify({
                    task_id: task_id,
                    comment_id: result.insertId,
                    task_title: taskCheck[0].title
                })
            ]
        );

        res.status(201).json({
            message: "Comment added successfully",
            comment_id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating comment", error: error.message });
    }
});

// Update a comment
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { comment } = req.body;

    // Validate required fields
    const schema = Joi.object({
        comment: Joi.string().required()
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Get comment details for verification and logging
        const [commentCheck] = await db.query(`
            SELECT 
                tc.*,
                t.tenant_id,
                t.title as task_title
            FROM 
                task_comments tc
            INNER JOIN
                tasks t ON tc.task_id = t.task_id
            WHERE 
                tc.comment_id = ?
        `, [id]);

        if (commentCheck.length === 0) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Check if user is the author of the comment
        if (commentCheck[0].employee_id !== req.user.employee_id) {
            return res.status(403).json({ message: "You can only edit your own comments" });
        }

        // Update comment
        const [result] = await db.query(
            `UPDATE task_comments SET comment = ? WHERE comment_id = ?`,
            [comment, id]
        );

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                commentCheck[0].tenant_id,
                req.user.employee_id,
                'update_comment',
                JSON.stringify({
                    task_id: commentCheck[0].task_id,
                    comment_id: id,
                    task_title: commentCheck[0].task_title
                })
            ]
        );

        res.status(200).json({ message: "Comment updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating comment", error: error.message });
    }
});

// Delete a comment
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        // Get comment details for verification and logging
        const [commentCheck] = await db.query(`
            SELECT 
                tc.*,
                t.tenant_id,
                t.title as task_title
            FROM 
                task_comments tc
            INNER JOIN
                tasks t ON tc.task_id = t.task_id
            WHERE 
                tc.comment_id = ?
        `, [id]);

        if (commentCheck.length === 0) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Check if user is the author of the comment or has admin permissions
        // This is a basic implementation; you might want to add role checks
        if (commentCheck[0].employee_id !== req.user.employee_id && !req.user.isAdmin) {
            return res.status(403).json({ message: "You can only delete your own comments" });
        }

        // Delete comment
        const [result] = await db.query(
            `DELETE FROM task_comments WHERE comment_id = ?`,
            [id]
        );

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                commentCheck[0].tenant_id,
                req.user.employee_id,
                'delete_comment',
                JSON.stringify({
                    task_id: commentCheck[0].task_id,
                    task_title: commentCheck[0].task_title
                })
            ]
        );

        res.status(200).json({ message: "Comment deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting comment", error: error.message });
    }
});

module.exports = router;