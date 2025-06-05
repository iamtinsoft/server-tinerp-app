const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Get all tasks with pagination, sorting, and filtering
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "created_at",
        sortOrder = "DESC",
        tenant,
        search = "",
        status,
        priority,
        employee
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["task_id", "title", "priority", "status", "due_date", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
           SELECT
    t.*,
    (SELECT COUNT(tas.task_id)
     FROM task_activity_logs tas
     WHERE t.task_id = tas.task_id) AS total_activity_logs,
     (SELECT COUNT(tas.task_id)
     FROM task_activity_logs tas
     WHERE t.task_id = tas.task_id AND tas.action="added_comment") AS total_comments,
     (SELECT COUNT(tas.task_id)
     FROM task_activity_logs tas
     WHERE t.task_id = tas.task_id AND tas.action="added_attachment") AS total_attachments,
    tn.tenant_name,
    CASE
        WHEN t.entity_type != "Super Admin" THEN e.first_name
        ELSE NULL
    END AS creator_first_name,
    CASE
        WHEN t.entity_type != "Super Admin" THEN e.last_name
        ELSE NULL
    END AS creator_last_name,
    CASE
        WHEN t.entity_type != "Super Admin" THEN e.avatar
        ELSE NULL
    END AS creator_avatar,
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'employee_id', a.employee_id,
            'name', CONCAT(ae.first_name, ' ', ae.last_name),
            'avatar', ae.avatar
        )
    ) AS assignees
FROM
    tasks t
INNER JOIN
    tenants tn ON t.tenant_id = tn.tenant_id
LEFT JOIN
    employees e ON t.entity_type != "Super Admin" AND t.entity_id = e.employee_id
LEFT JOIN
    task_assignees a ON t.task_id = a.task_id
LEFT JOIN
    employees ae ON a.employee_id = ae.employee_id
WHERE 1=1
        `;
        const queryParams = [];

        // Add tenant filtering
        if (tenant) {
            query += ` AND t.tenant_id = ?`;
            queryParams.push(tenant);
        }

        // Add status filtering
        if (status) {
            query += ` AND t.status = ?`;
            queryParams.push(status);
        }

        // Add priority filtering
        if (priority) {
            query += ` AND t.priority = ?`;
            queryParams.push(priority);
        }

        // Add employee filtering (tasks assigned to specific employee)
        if (employee) {
            query += ` AND a.employee_id = ?`;
            queryParams.push(employee);
        }

        // Add search filtering
        if (search) {
            query += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // Group by to handle the GROUP_CONCAT
        query += ` GROUP BY t.task_id`;

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [tasks] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(DISTINCT t.task_id) AS total 
            FROM tasks t
            INNER JOIN tenants tn ON t.tenant_id = tn.tenant_id
           WHERE 1=1
        `;
        const countParams = [];

        if (tenant) {
            countQuery += ` AND t.tenant_id = ?`;
            countParams.push(tenant);
        }
        if (status) {
            countQuery += ` AND t.status = ?`;
            countParams.push(status);
        }
        if (priority) {
            countQuery += ` AND t.priority = ?`;
            countParams.push(priority);
        }
        if (employee) {
            countQuery += ` AND a.employee_id = ?`;
            countParams.push(employee);
        }
        if (search) {
            countQuery += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            tasks,
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
        res.status(500).json({ message: "Error fetching tasks", error: error.message });
    }
});

router.get("/assigned", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "created_at",
        sortOrder = "DESC",
        tenant,
        search = "",
        status,
        priority,
        employee, // Employee ID to filter by
    } = req.query;

    const offset = (page - 1) * limit;
    console.log("called")
    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["task_id", "title", "priority", "status", "due_date", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT
                t.*,
                (SELECT COUNT(tas.task_id)
                 FROM task_activity_logs tas
                 WHERE t.task_id = tas.task_id) AS total_activity_logs,
                (SELECT COUNT(tas.task_id)
                 FROM task_activity_logs tas
                 WHERE t.task_id = tas.task_id AND tas.action="added_comment") AS total_comments,
                (SELECT COUNT(tas.task_id)
                 FROM task_activity_logs tas
                 WHERE t.task_id = tas.task_id AND tas.action="added_attachment") AS total_attachments,
                tn.tenant_name,
                CASE
                    WHEN t.entity_type != "Super Admin" THEN e.first_name
                    ELSE NULL
                END AS creator_first_name,
                CASE
                    WHEN t.entity_type != "Super Admin" THEN e.last_name
                    ELSE NULL
                END AS creator_last_name,
                CASE
                    WHEN t.entity_type != "Super Admin" THEN e.avatar
                    ELSE NULL
                END AS creator_avatar,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'employee_id', a.employee_id,
                        'name', CONCAT(ae.first_name, ' ', ae.last_name),
                        'avatar', ae.avatar
                    )
                ) AS assignees
            FROM
                tasks t
            INNER JOIN
                tenants tn ON t.tenant_id = tn.tenant_id
            LEFT JOIN
                employees e ON t.entity_type != "Super Admin" AND t.entity_id = e.employee_id
            LEFT JOIN
                task_assignees a ON t.task_id = a.task_id
            LEFT JOIN
                employees ae ON a.employee_id = ae.employee_id
            WHERE 1=1
        `;
        const queryParams = [];

        // Add tenant filtering
        if (tenant) {
            query += ` AND t.tenant_id = ?`;
            queryParams.push(tenant);
        }

        // Add status filtering
        if (status) {
            query += ` AND t.status = ?`;
            queryParams.push(status);
        }

        // Add priority filtering
        if (priority) {
            query += ` AND t.priority = ?`;
            queryParams.push(priority);
        }

        // Add employee filtering (tasks where employee is in assignees)
        if (employee) {
            query += ` AND EXISTS (
                SELECT 1
                FROM task_assignees ta
                WHERE ta.task_id = t.task_id
                AND ta.employee_id = ?
            )`;
            queryParams.push(employee);
        }

        // Add search filtering
        if (search) {
            query += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // Group by to handle the JSON_ARRAYAGG
        query += ` GROUP BY t.task_id`;

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [tasks] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(DISTINCT t.task_id) AS total 
            FROM tasks t
            INNER JOIN tenants tn ON t.tenant_id = tn.tenant_id
            LEFT JOIN task_assignees a ON t.task_id = a.task_id
            WHERE 1=1
        `;
        const countParams = [];

        if (tenant) {
            countQuery += ` AND t.tenant_id = ?`;
            countParams.push(tenant);
        }
        if (status) {
            countQuery += ` AND t.status = ?`;
            countParams.push(status);
        }
        if (priority) {
            countQuery += ` AND t.priority = ?`;
            countParams.push(priority);
        }
        if (employee) {
            countQuery += ` AND EXISTS (
                SELECT 1
                FROM task_assignees ta
                WHERE ta.task_id = t.task_id
                AND ta.employee_id = ?
            )`;
            countParams.push(employee);
        }
        if (search) {
            countQuery += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            tasks,
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
        res.status(500).json({ message: "Error fetching tasks", error: error.message });
    }
});

router.get("/assigned-by-me", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "created_at",
        sortOrder = "DESC",
        tenant,
        search = "",
        status,
        priority,
        employee // Employee ID to filter by
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["task_id", "title", "priority", "status", "due_date", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT
                t.*,
                (SELECT COUNT(tas.task_id)
                 FROM task_activity_logs tas
                 WHERE t.task_id = tas.task_id) AS total_activity_logs,
                (SELECT COUNT(tas.task_id)
                 FROM task_activity_logs tas
                 WHERE t.task_id = tas.task_id AND tas.action="added_comment") AS total_comments,
                (SELECT COUNT(tas.task_id)
                 FROM task_activity_logs tas
                 WHERE t.task_id = tas.task_id AND tas.action="added_attachment") AS total_attachments,
                tn.tenant_name,
                CASE
                    WHEN t.entity_type != "Super Admin" THEN e.first_name
                    ELSE NULL
                END AS creator_first_name,
                CASE
                    WHEN t.entity_type != "Super Admin" THEN e.last_name
                    ELSE NULL
                END AS creator_last_name,
                CASE
                    WHEN t.entity_type != "Super Admin" THEN e.avatar
                    ELSE NULL
                END AS creator_avatar,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'employee_id', a.employee_id,
                        'name', CONCAT(ae.first_name, ' ', ae.last_name),
                        'avatar', ae.avatar
                    )
                ) AS assignees
            FROM
                tasks t
            INNER JOIN
                tenants tn ON t.tenant_id = tn.tenant_id
            LEFT JOIN
                employees e ON t.entity_type != "Super Admin" AND t.entity_id = e.employee_id
            LEFT JOIN
                task_assignees a ON t.task_id = a.task_id
            LEFT JOIN
                employees ae ON a.employee_id = ae.employee_id
            WHERE 1=1
        `;
        const queryParams = [];

        // Add tenant filtering
        if (tenant) {
            query += ` AND t.tenant_id = ?`;
            queryParams.push(tenant);
        }

        // Add status filtering
        if (status) {
            query += ` AND t.status = ?`;
            queryParams.push(status);
        }

        // Add priority filtering
        if (priority) {
            query += ` AND t.priority = ?`;
            queryParams.push(priority);
        }

        // Add employee filtering (entity_id matches the provided employee)
        if (employee) {
            query += ` AND t.entity_id = ?`;
            queryParams.push(employee);
        }

        // Add search filtering
        if (search) {
            query += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // Group by to handle the JSON_ARRAYAGG
        query += ` GROUP BY t.task_id`;

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [tasks] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(DISTINCT t.task_id) AS total 
            FROM tasks t
            INNER JOIN tenants tn ON t.tenant_id = tn.tenant_id
            WHERE 1=1
        `;
        const countParams = [];

        if (tenant) {
            countQuery += ` AND t.tenant_id = ?`;
            countParams.push(tenant);
        }
        if (status) {
            countQuery += ` AND t.status = ?`;
            countParams.push(status);
        }
        if (priority) {
            countQuery += ` AND t.priority = ?`;
            countParams.push(priority);
        }
        if (employee) {
            countQuery += ` AND t.entity_id = ?`;
            countParams.push(employee);
        }
        if (search) {
            countQuery += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            tasks,
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
        res.status(500).json({ message: "Error fetching tasks", error: error.message });
    }
});


// Get a task by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    try {
        // Get the task details
        const [tasks] = await db.query(`
            SELECT 
                t.*,
                tn.tenant_name,
                e.first_name as creator_first_name,
                e.last_name as creator_last_name
            FROM 
                tasks t
            INNER JOIN 
                tenants tn ON t.tenant_id = tn.tenant_id
            INNER JOIN
                employees e ON t.created_by = e.employee_id
            WHERE 
                t.task_id = ?
        `, [id]);

        if (tasks.length === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        const task = tasks[0];

        // Get assignees
        const [assignees] = await db.query(`
            SELECT 
                ta.employee_id,
                e.first_name,
                e.last_name,
                e.email,
                ta.assigned_at
            FROM 
                task_assignees ta
            INNER JOIN
                employees e ON ta.employee_id = e.employee_id
            WHERE
                ta.task_id = ?
        `, [id]);
        task.assignees = assignees;

        // Get subtasks
        const [subtasks] = await db.query(`
            SELECT * FROM subtasks WHERE task_id = ?
        `, [id]);
        task.subtasks = subtasks;

        // Get dependencies
        const [dependencies] = await db.query(`
            SELECT 
                td.*,
                t.title as dependency_title,
                t.status as dependency_status
            FROM 
                task_dependencies td
            INNER JOIN
                tasks t ON td.depends_on_task_id = t.task_id
            WHERE
                td.task_id = ?
        `, [id]);
        task.dependencies = dependencies;

        // Get comments
        const [comments] = await db.query(`
            SELECT 
                tc.*,
                e.first_name,
                e.last_name
            FROM 
                task_comments tc
            INNER JOIN
                employees e ON tc.employee_id = e.employee_id
            WHERE
                tc.task_id = ?
            ORDER BY
                tc.created_at DESC
        `, [id]);
        task.comments = comments;

        // Get attachments
        const [attachments] = await db.query(`
            SELECT 
                ta.*,
                e.first_name,
                e.last_name
            FROM 
                task_attachments ta
            INNER JOIN
                employees e ON ta.uploaded_by = e.employee_id
            WHERE
                ta.task_id = ?
        `, [id]);
        task.attachments = attachments;

        // Get custom fields
        const [customFields] = await db.query(`
            SELECT 
                cf.field_id,
                cf.field_name,
                cf.field_type,
                tcfv.field_value
            FROM 
                custom_fields cf
            INNER JOIN
                task_custom_field_values tcfv ON cf.field_id = tcfv.field_id
            WHERE
                tcfv.task_id = ?
        `, [id]);
        task.customFields = customFields;

        res.status(200).json(task);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching task", error: error.message });
    }
});

// Create a new task
router.post("/", [auth], async (req, res) => {
    const {
        tenant_id,
        entity_type,
        entity_id,
        title,
        description,
        priority,
        status,
        due_date,
        assignees,
        subtasks,
        dependencies,
        customFields
    } = req.body;
    console.log(req.body)
    // Validate required fields

    // Utility function for validation
    // const validateTask = (prop) => {
    //     const schema = Joi.object({
    //         tenant_id: Joi.number().required(),
    //         title: Joi.string().max(255).required(),
    //         description: Joi.string().allow('', null),
    //         priority: Joi.string().valid('Low', 'Medium', 'High').default('Medium'),
    //         entity_type: Joi.string().valid('Super Admin', 'Tenant Admin', 'Supervisor').default('Tenant Admin'),
    //         entity_id: Joi.number().required(),
    //         status: Joi.string().valid('Not Started', 'In Progress', 'Completed', 'Blocked', 'Overdue').default('Not Started'),
    //         due_date: Joi.date().allow(null),
    //         assignees: Joi.array().items(Joi.number()).default([]),
    //         subtasks: Joi.array().items(Joi.object({
    //             title: Joi.string().required(),
    //             status: Joi.string().valid('Not Started', 'In Progress', 'Completed', 'Blocked', 'Overdue').default('Not Started'),
    //         })).default([]),
    //         dependencies: Joi.array().items(Joi.number()).default([]),
    //         customFields: Joi.array().items(Joi.object({
    //             field_id: Joi.number().required(),
    //             field_value: Joi.string().required()
    //         })).default([])
    //     });
    //     return schema.validate(prop);
    // };
    // const { error } = validateTask(req.body);

    // if (error) {
    //     return res.status(400).json({ message: error.details[0].message });
    // }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Insert task
        const [taskResult] = await connection.query(
            `INSERT INTO tasks 
                (tenant_id, entity_type,entity_id, title, description, priority, status, due_date)
             VALUES (?, ?,?, ?, ?, ?, ?, ?)`,
            [
                tenant_id,
                entity_type,
                entity_id,
                title,
                description,
                priority || 'Medium',
                status || 'Not Started',
                due_date
            ]
        );

        const taskId = taskResult.insertId;

        // Insert assignees
        if (assignees && assignees.length > 0) {
            // Fetch existing assignees for the task
            const [existingAssignees] = await connection.query(
                `SELECT employee_id FROM task_assignees WHERE task_id = ?`,
                [taskId]
            );

            // Extract existing employee IDs into a set for quick lookup
            const existingEmployeeIds = new Set(existingAssignees.map(a => a.employee_id));

            // Filter out duplicates
            const newAssignees = assignees.filter(employee => !existingEmployeeIds.has(employee.employee_id));

            if (newAssignees.length > 0) {
                const assigneeValues = newAssignees.map(employee => [taskId, employee.employee_id]);
                await connection.query(
                    `INSERT INTO task_assignees (task_id, employee_id) VALUES ?`,
                    [assigneeValues]
                );
            }
        }

        // Insert subtasks
        if (subtasks && subtasks.length > 0) {
            const subtaskValues = subtasks.map(subtask => [
                taskId,
                subtask.title,
                subtask.status || 'Not Started'
            ]);
            await connection.query(
                `INSERT INTO subtasks (task_id, title, status) VALUES ?`,
                [subtaskValues]
            );
        }

        // Insert dependencies
        if (dependencies && dependencies.length > 0) {
            const dependencyValues = dependencies.map(dependsOnId => [taskId, dependsOnId]);
            await connection.query(
                `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ?`,
                [dependencyValues]
            );
        }

        // Insert custom field values
        if (customFields && customFields.length > 0) {
            const fieldValues = customFields.map(field => [
                taskId,
                field.field_id,
                field.field_value
            ]);
            await connection.query(
                `INSERT INTO task_custom_field_values (task_id, field_id, field_value) VALUES ?`,
                [fieldValues]
            );
        }

        // Log activity
        await connection.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, entity_type,entity_id, action, task_id)
             VALUES (?, ?,?, ?, ?)`,
            [
                tenant_id,
                entity_type, entity_id,
                'created_task',
                taskId
            ]
        );

        await connection.commit();
        res.status(201).json({
            message: "Task created successfully",
            task_id: taskId
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ message: "Error creating task", error: error.message });
    } finally {
        connection.release();
    }
});

// Update a task
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const {
        tenant_id,
        title,
        description,
        priority,
        status,
        due_date,
        assignees,
        subtasks,
        dependencies,
        customFields,
        entity_type,
        entity_id,
    } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Verify task exists
        const [existingTask] = await connection.query(
            `SELECT * FROM tasks WHERE task_id = ?`,
            [id]
        );

        if (existingTask.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Task not found" });
        }

        // Update task
        await connection.query(
            `UPDATE tasks 
             SET tenant_id = ?, title = ?, description = ?, priority = ?, 
                 status = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP
             WHERE task_id = ?`,
            [tenant_id, title, description, priority, status, due_date, id]
        );

        // Update assignees - remove existing and add new
        if (assignees) {
            await connection.query(`DELETE FROM task_assignees WHERE task_id = ?`, [id]);

            if (assignees.length > 0) {
                const assigneeValues = assignees.map(employeeId => [id, employeeId]);
                await connection.query(
                    `INSERT INTO task_assignees (task_id, employee_id) VALUES ?`,
                    [assigneeValues]
                );
            }
        }

        // Update subtasks - remove existing and add new
        if (subtasks) {
            await connection.query(`DELETE FROM subtasks WHERE task_id = ?`, [id]);

            if (subtasks.length > 0) {
                const subtaskValues = subtasks.map(subtask => [
                    id,
                    subtask.title,
                    subtask.status || 'Not Started'
                ]);
                await connection.query(
                    `INSERT INTO subtasks (task_id, title, status) VALUES ?`,
                    [subtaskValues]
                );
            }
        }

        // Update dependencies - remove existing and add new
        if (dependencies) {
            await connection.query(`DELETE FROM task_dependencies WHERE task_id = ?`, [id]);

            if (dependencies.length > 0) {
                const dependencyValues = dependencies.map(dependsOnId => [id, dependsOnId]);
                await connection.query(
                    `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ?`,
                    [dependencyValues]
                );
            }
        }

        // Update custom fields - remove existing and add new
        if (customFields) {
            await connection.query(`DELETE FROM task_custom_field_values WHERE task_id = ?`, [id]);

            if (customFields.length > 0) {
                const fieldValues = customFields.map(field => [
                    id,
                    field.field_id,
                    field.field_value
                ]);
                await connection.query(
                    `INSERT INTO task_custom_field_values (task_id, field_id, field_value) VALUES ?`,
                    [fieldValues]
                );
            }
        }

        // Log activity
        await connection.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, entity_type,entity_id, action, task_id)
             VALUES (?, ?,?, ?, ?)`,
            [
                tenant_id,
                entity_type, entity_id,
                'updated_task',
                id
            ]
        );

        await connection.commit();
        res.status(200).json({ message: "Task updated successfully" });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ message: "Error updating task", error: error.message });
    } finally {
        connection.release();
    }
});
// Update a task
router.put("/:id/status", [auth], async (req, res) => {
    const { id } = req.params;
    const {
        tenant_id,
        status,
        entity_type,
        entity_id,
    } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Verify task exists
        const [existingTask] = await connection.query(
            `SELECT * FROM tasks WHERE task_id = ?`,
            [id]
        );

        if (existingTask.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Task not found" });
        }

        // Update task
        await connection.query(
            `UPDATE tasks 
             SET 
                 status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE task_id = ?`,
            [status, id]
        );

        // Log activity
        await connection.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, entity_type,entity_id, action, task_id)
             VALUES (?, ?,?, ?, ?)`,
            [
                tenant_id,
                entity_type, entity_id,
                status == "Completed" ? 'completed_task' : 'updated_task',
                id
            ]
        );

        await connection.commit();
        res.status(200).json({ message: "Task updated successfully" });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ message: "Error updating task", error: error.message });
    } finally {
        connection.release();
    }
});
// // Update task status
// router.patch("/:id/status", [auth], async (req, res) => {
//     const { id } = req.params;
//     const { status } = req.body;

//     try {
//         // Validate status
//         if (!['not_started', 'in_progress', 'completed', 'blocked'].includes(status)) {
//             return res.status(400).json({ message: "Invalid status value" });
//         }

//         // Update task
//         const [result] = await db.query(
//             `UPDATE tasks SET status = ? WHERE task_id = ?`,
//             [status, id]
//         );

//         if (result.affectedRows === 0) {
//             return res.status(404).json({ message: "Task not found" });
//         }

//         // Get task info for activity log
//         const [taskInfo] = await db.query(
//             `SELECT tenant_id, title FROM tasks WHERE task_id = ?`,
//             [id]
//         );

//         // Log activity
//         await db.query(
//             `INSERT INTO task_activity_logs 
//                 (tenant_id, employee_id, action, details) 
//              VALUES (?, ?, ?, ?)`,
//             [
//                 taskInfo[0].tenant_id,
//                 req.user.employee_id,
//                 'update_task_status',
//                 JSON.stringify({ task_id: id, title: taskInfo[0].title, status })
//             ]
//         );

//         res.status(200).json({ message: "Task status updated successfully" });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error updating task status", error: error.message });
//     }
// });

// Delete a task
router.delete("/:id/:entity_type/:entity_id, ", [auth], async (req, res) => {
    const { id, entity_type, entity_id, } = req.params;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Get task info for activity log
        const [taskInfo] = await connection.query(
            `SELECT tenant_id, title FROM tasks WHERE task_id = ?`,
            [id]
        );

        if (taskInfo.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Task not found" });
        }

        // Delete task (cascade will delete related records)
        const [result] = await connection.query(
            `DELETE FROM tasks WHERE task_id = ?`,
            [id]
        );

        // Log activity
        await connection.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, entity_type,entity_id, action, task_id)
             VALUES (?, ?,? ?, ?)`,
            [
                taskInfo[0].tenant_id,
                entity_type, entity_id,
                'deleted_task',
                id
            ]
        );

        await connection.commit();
        res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ message: "Error deleting task", error: error.message });
    } finally {
        connection.release();
    }
});

// Add a comment to a task
router.post("/:id/comments", [auth], async (req, res) => {
    const { id } = req.params;
    const { comment, entity_type, entity_id } = req.body;

    try {
        // Validate comment
        if (!comment || comment.trim() === '') {
            return res.status(400).json({ message: "Comment cannot be empty" });
        }

        // Check if task exists
        const [taskCheck] = await db.query(
            `SELECT tenant_id FROM tasks WHERE task_id = ?`,
            [id]
        );

        if (taskCheck.length === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Log activity
        const [logResult] = await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, entity_type, entity_id, action, task_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
                taskCheck[0].tenant_id,
                entity_type,
                entity_id,
                'added_comment',
                id
            ]
        );

        const logId = logResult.insertId;

        // Add comment with the log_id
        const [commentResult] = await db.query(
            `INSERT INTO task_comments (task_id, entity_type, entity_id, comment, log_id)
             VALUES (?, ?, ?, ?, ?)`,
            [id, entity_type, entity_id, comment, logId]
        );

        res.status(201).json({
            message: "Comment added successfully",
            comment_id: commentResult.insertId,
            log_id: logId
        });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ message: "Error adding comment", error: error.message });
    }
});


// Add an attachment to a task
router.post("/:id/attachments", [auth], async (req, res) => {
    const { id } = req.params;
    const { file_path, file_type, file_name, file_size, entity_type, entity_id } = req.body;

    try {
        // Validate required fields
        if (!file_path || !file_type) {
            return res.status(400).json({ message: "File path and type are required" });
        }

        // Check if task exists
        const [taskCheck] = await db.query(
            `SELECT tenant_id FROM tasks WHERE task_id = ?`,
            [id]
        );

        if (taskCheck.length === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Log activity
        const [logResult] = await db.query(
            `INSERT INTO task_activity_logs 
                (tenant_id, entity_type, entity_id, action, task_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
                taskCheck[0].tenant_id,
                entity_type,
                entity_id,
                'added_attachment',
                id
            ]
        );

        const logId = logResult.insertId;

        // Add attachment with the log_id
        const [attachmentResult] = await db.query(
            `INSERT INTO task_attachments 
                (task_id, entity_type, entity_id, file_path, file_type, file_name, file_size, log_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, entity_type, entity_id, file_path, file_type, file_name, file_size, logId]
        );

        res.status(201).json({
            message: "Attachment added successfully",
            attachment_id: attachmentResult.insertId,
            log_id: logId
        });
    } catch (error) {
        console.error('Error adding attachment:', error);
        res.status(500).json({ message: "Error adding attachment", error: error.message });
    }
});


// Get activity logs for a task
// router.get("/:id/activity", [auth], async (req, res) => {
//     const { id } = req.params;
//     // const {
//     //     page = 1,
//     //     limit = 20
//     // } = req.query;

//     // const offset = (page - 1) * limit;

//     try {
//         // Check if task exists
//         const [taskCheck] = await db.query(
//             `SELECT * FROM tasks WHERE task_id = ?`,
//             [id]
//         );

//         if (taskCheck.length === 0) {
//             return res.status(404).json({ message: "Task not found" });
//         }

//         // Get activity logs
//         const [logs] = await db.query(`
//             SELECT 
//                 tal.*,CASE
//         WHEN tal.entity_type != "Super Admin" THEN e.first_name
//         ELSE NULL
//     END AS creator_first_name,
//     CASE
//         WHEN tal.entity_type != "Super Admin" THEN e.last_name
//         ELSE NULL
//     END AS creator_last_name,
//     CASE
//         WHEN tal.entity_type != "Super Admin" THEN e.avatar
//         ELSE NULL
//     END AS creator_avatar
//             FROM 
//                 task_activity_logs tal
//             INNER JOIN
//                 employees e ON tal.entity_id = e.employee_id
//             WHERE
//                 tal.task_id = ?
//             ORDER BY
//                 tal.created_at DESC

//         `, [id]);

//         // Count total logs
//         const [[{ total }]] = await db.query(`
//             SELECT COUNT(*) AS total
//             FROM task_activity_logs
//             WHERE task_id = ?
//         `, [id]);

//         res.status(200).json({
//             logs,
//             // pagination: {
//             //     total,
//             //     page: parseInt(page),
//             //     limit: parseInt(limit),
//             //     totalPages: Math.ceil(total / limit),
//             // }
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error fetching activity logs", error: error.message });
//     }
// });
router.get("/:id/activity", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        // Check if task exists
        const [taskCheck] = await db.query(
            `SELECT * FROM tasks WHERE task_id = ?`,
            [id]
        );

        if (taskCheck.length === 0) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Get activity logs with comments and attachments
        const [logs] = await db.query(`
            SELECT 
                tal.*,
                CASE
                    WHEN tal.entity_type != "Super Admin" THEN e.first_name
                    ELSE NULL
                END AS creator_first_name,
                CASE
                    WHEN tal.entity_type != "Super Admin" THEN e.last_name
                    ELSE NULL
                END AS creator_last_name,
                CASE
                    WHEN tal.entity_type != "Super Admin" THEN e.avatar
                    ELSE NULL
                END AS creator_avatar,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'comment_id', tc.comment_id,
                            'comment', tc.comment,
                            'created_at', tc.created_at,
                            'creator_first_name', 
                                CASE 
                                    WHEN tc.entity_type != "Super Admin" THEN ce.first_name 
                                    ELSE NULL 
                                END,
                            'creator_last_name', 
                                CASE 
                                    WHEN tc.entity_type != "Super Admin" THEN ce.last_name 
                                    ELSE NULL 
                                END,
                            'creator_avatar', 
                                CASE 
                                    WHEN tc.entity_type != "Super Admin" THEN ce.avatar 
                                    ELSE NULL 
                                END
                        )
                    )
                    FROM task_comments tc
                    LEFT JOIN employees ce 
                        ON tc.entity_type != "Super Admin" AND tc.entity_id = ce.employee_id
                    WHERE tc.log_id = tal.log_id
                ) AS comments,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'attachment_id', ta.attachment_id,
                            'file_path', ta.file_path,
                            'file_type', ta.file_type,
                            'file_name', ta.file_name,
                            'file_size', ta.file_size,
                            'uploaded_at', ta.uploaded_at
                        )
                    )
                    FROM task_attachments ta
                    WHERE ta.log_id = tal.log_id
                ) AS attachments
            FROM 
                task_activity_logs tal
            LEFT JOIN
                employees e ON tal.entity_type != "Super Admin" AND tal.entity_id = e.employee_id
            WHERE
                tal.task_id = ?
            ORDER BY
                tal.created_at DESC
        `, [id]);

        // Count total logs
        const [[{ total }]] = await db.query(`
            SELECT COUNT(*) AS total
            FROM task_activity_logs
            WHERE task_id = ?
        `, [id]);

        res.status(200).json({
            logs,
            total,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching activity logs", error: error.message });
    }
});


module.exports = router;