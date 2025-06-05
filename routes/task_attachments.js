const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Get all task attachments with pagination, sorting, and filtering
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "uploaded_at",
        sortOrder = "DESC",
        taskId,
        fileType,
        employee
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["attachment_id", "task_id", "uploaded_by", "file_name", "file_size", "file_type", "uploaded_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "uploaded_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT 
                ta.*,
                e.first_name,
                e.last_name,
                t.title as task_title,
                t.tenant_id
            FROM 
                task_attachments ta
            INNER JOIN 
                employees e ON ta.uploaded_by = e.employee_id
            INNER JOIN
                tasks t ON ta.task_id = t.task_id
            WHERE 1=1
        `;
        const queryParams = [];

        // Add task_id filtering
        if (taskId) {
            query += ` AND ta.task_id = ?`;
            queryParams.push(taskId);
        }

        // Add file_type filtering
        if (fileType) {
            query += ` AND ta.file_type = ?`;
            queryParams.push(fileType);
        }

        // Add employee filtering
        if (employee) {
            query += ` AND ta.uploaded_by = ?`;
            queryParams.push(employee);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [attachments] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM task_attachments ta
            INNER JOIN employees e ON ta.uploaded_by = e.employee_id
            INNER JOIN tasks t ON ta.task_id = t.task_id
            WHERE 1=1
        `;
        const countParams = [];

        if (taskId) {
            countQuery += ` AND ta.task_id = ?`;
            countParams.push(taskId);
        }
        if (fileType) {
            countQuery += ` AND ta.file_type = ?`;
            countParams.push(fileType);
        }
        if (employee) {
            countQuery += ` AND ta.uploaded_by = ?`;
            countParams.push(employee);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            attachments,
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
        res.status(500).json({ message: "Error fetching attachments", error: error.message });
    }
});

// Get an attachment by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    try {
        const [attachments] = await db.query(`
            SELECT 
                ta.*,
                e.first_name,
                e.last_name,
                t.title as task_title,
                t.tenant_id
            FROM 
                task_attachments ta
            INNER JOIN 
                employees e ON ta.uploaded_by = e.employee_id
            INNER JOIN
                tasks t ON ta.task_id = t.task_id
            WHERE 
                ta.attachment_id = ?
        `, [id]);

        if (attachments.length === 0) {
            return res.status(404).json({ message: "Attachment not found" });
        }

        res.status(200).json(attachments[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching attachment", error: error.message });
    }
});

// Create a new attachment
router.post("/", [auth], async (req, res) => {
    const { task_id, file_path, file_type, file_name, file_size } = req.body;

    // Validate required fields
    const schema = Joi.object({
        task_id: Joi.number().required(),
        file_path: Joi.string().required(),
        file_type: Joi.string().valid('image', 'video', 'audio', 'document', 'other').required(),
        file_name: Joi.string().max(100).required(),
        file_size: Joi.number().integer().min(0)
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

        // Insert attachment
        const [result] = await db.query(
            `INSERT INTO task_attachments 
                (task_id, uploaded_by, file_path, file_type, file_name, file_size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [task_id, req.user.employee_id, file_path, file_type, file_name, file_size]
        );

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                taskCheck[0].tenant_id,
                req.user.employee_id,
                'add_attachment',
                JSON.stringify({
                    task_id: task_id,
                    attachment_id: result.insertId,
                    task_title: taskCheck[0].title,
                    file_name: file_name
                })
            ]
        );

        res.status(201).json({
            message: "Attachment added successfully",
            attachment_id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating attachment", error: error.message });
    }
});

// Update an attachment
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { file_path, file_type, file_name, file_size } = req.body;

    // Validate required fields
    const schema = Joi.object({
        file_path: Joi.string().required(),
        file_type: Joi.string().valid('image', 'video', 'audio', 'document', 'other').required(),
        file_name: Joi.string().max(100).required(),
        file_size: Joi.number().integer().min(0)
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Get attachment details for verification and logging
        const [attachmentCheck] = await db.query(`
            SELECT 
                ta.*,
                t.tenant_id,
                t.title as task_title
            FROM 
                task_attachments ta
            INNER JOIN
                tasks t ON ta.task_id = t.task_id
            WHERE 
                ta.attachment_id = ?
        `, [id]);

        if (attachmentCheck.length === 0) {
            return res.status(404).json({ message: "Attachment not found" });
        }

        // Check if user is the one who uploaded the attachment
        if (attachmentCheck[0].uploaded_by !== req.user.employee_id && !req.user.isAdmin) {
            return res.status(403).json({ message: "You can only update your own attachments" });
        }

        // Update attachment
        const [result] = await db.query(
            `UPDATE task_attachments 
             SET file_path = ?, file_type = ?, file_name = ?, file_size = ?
             WHERE attachment_id = ?`,
            [file_path, file_type, file_name, file_size, id]
        );

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                attachmentCheck[0].tenant_id,
                req.user.employee_id,
                'update_attachment',
                JSON.stringify({
                    task_id: attachmentCheck[0].task_id,
                    attachment_id: id,
                    task_title: attachmentCheck[0].task_title,
                    file_name: file_name
                })
            ]
        );

        res.status(200).json({ message: "Attachment updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating attachment", error: error.message });
    }
});

// Delete an attachment
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        // Get attachment details for verification and logging
        const [attachmentCheck] = await db.query(`
            SELECT 
                ta.*,
                t.tenant_id,
                t.title as task_title
            FROM 
                task_attachments ta
            INNER JOIN
                tasks t ON ta.task_id = t.task_id
            WHERE 
                ta.attachment_id = ?
        `, [id]);

        if (attachmentCheck.length === 0) {
            return res.status(404).json({ message: "Attachment not found" });
        }

        // Check if user is the one who uploaded the attachment or has admin permissions
        if (attachmentCheck[0].uploaded_by !== req.user.employee_id && !req.user.isAdmin) {
            return res.status(403).json({ message: "You can only delete your own attachments" });
        }

        // Delete attachment
        const [result] = await db.query(
            `DELETE FROM task_attachments WHERE attachment_id = ?`,
            [id]
        );

        // Log activity
        await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, employee_id, action, details) 
             VALUES (?, ?, ?, ?)`,
            [
                attachmentCheck[0].tenant_id,
                req.user.employee_id,
                'delete_attachment',
                JSON.stringify({
                    task_id: attachmentCheck[0].task_id,
                    task_title: attachmentCheck[0].task_title,
                    file_name: attachmentCheck[0].file_name
                })
            ]
        );

        res.status(200).json({ message: "Attachment deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting attachment", error: error.message });
    }
});

module.exports = router;