const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");
const mysql = require("mysql2/promise");
const config = require("config");
const db_host = config.get("db_host");
const db_user = config.get("db_user");
const db_password = config.get("db_password");
const db_database = config.get("db_database");

// API to fetch tickets with pagination, sorting, and searching
router.get('/', [auth], async (req, res) => {
    const {
        ticket_id,
        tenant_id,
        employee_id,
        status,
        search,
        sort_by = 't.created_at',
        sort_order = 'DESC',
        page = 1,
        limit = 10,
    } = req.query;

    const offset = (page - 1) * limit;

    try {
        // Main query to fetch tickets and related data
        const query = `
            SELECT 
                t.ticket_id,
                t.title,
                t.description,
                t.employee_id,
                t.assigned_to,
                t.tenant_id,
                t.priority,
                t.status,
                t.created_at,
                t.updated_at,
                tn.tenant_name,
                e.first_name AS employee_first_name,
                e.last_name AS employee_last_name,
                e.avatar AS employee_avatar,
               
                 (SELECT COUNT(*) FROM ticket_logs tl WHERE tl.ticket_id = t.ticket_id) AS log_count,
               
                tl.log_id,
                tl.action AS log_action,
                tl.entity_type AS log_entity_type,
                tl.entity_id AS log_entity_id,
                tl.performed_at AS log_performed_at,
                tc.comment_id,
                tc.comment AS comment_text,
                tc.entity_type AS comment_entity_type,
                tc.entity_id AS comment_entity_id,
                tc.created_at AS comment_created_at,
                ta.attachment_id,
                ta.file_path,
                ta.file_type,
                ta.file_name,
                ta.file_size,
                ta.entity_type AS attachment_entity_type,
                ta.entity_id AS attachment_entity_id,
                ta.uploaded_at AS attachment_uploaded_at
            FROM tickets t
            INNER JOIN tenants tn ON t.tenant_id = tn.tenant_id
            INNER JOIN employees e ON t.employee_id = e.employee_id
            LEFT JOIN ticket_logs tl ON t.ticket_id = tl.ticket_id
            LEFT JOIN ticket_comments tc ON tl.log_id = tc.log_id
            LEFT JOIN ticket_attachments ta ON tl.log_id = ta.log_id
            WHERE 1=1
            ${ticket_id ? 'AND t.ticket_id = ?' : ''}
            ${tenant_id ? 'AND t.tenant_id = ?' : ''}
            ${employee_id ? 'AND t.employee_id = ?' : ''}
            ${status ? 'AND t.status = ?' : ''}
            ${search ? 'AND (t.title LIKE ? OR t.description LIKE ?)' : ''}
            ORDER BY ${sort_by} ${sort_order}
            LIMIT ? OFFSET ?;
        `;

        // Query parameters
        const queryParams = [];
        if (ticket_id) queryParams.push(ticket_id);
        if (tenant_id) queryParams.push(tenant_id);
        if (employee_id) queryParams.push(employee_id);
        if (status) queryParams.push(status);
        if (search) {
            const searchPattern = `%${search}%`;
            queryParams.push(searchPattern, searchPattern);
        }
        queryParams.push(Number(limit), Number(offset));

        // Execute the query
        const [results] = await db.query(query, queryParams);

        // Total count for pagination
        const countQuery = `
            SELECT COUNT(DISTINCT t.ticket_id) AS total
            FROM tickets t
            INNER JOIN tenants tn ON t.tenant_id = tn.tenant_id
            INNER JOIN employees e ON t.employee_id = e.employee_id
            WHERE 1=1
            ${ticket_id ? 'AND t.ticket_id = ?' : ''}
            ${tenant_id ? 'AND t.tenant_id = ?' : ''}
            ${employee_id ? 'AND t.employee_id = ?' : ''}
            ${status ? 'AND t.status = ?' : ''}
            ${search ? 'AND (t.title LIKE ? OR t.description LIKE ?)' : ''}
        `;
        const countParams = queryParams.slice(0, queryParams.length - 2); // Exclude LIMIT and OFFSET
        const [[{ total }]] = await db.query(countQuery, countParams);

        // Organize data into tickets
        const tickets = results.reduce((acc, row) => {
            let ticket = acc.find((t) => t.ticket_id === row.ticket_id);
            if (!ticket) {
                ticket = {
                    ticket_id: row.ticket_id,
                    title: row.title,
                    description: row.description,
                    employee_id: row.employee_id,
                    assigned_to: row.assigned_to,
                    tenant_id: row.tenant_id,
                    tenant_name: row.tenant_name,
                    first_name: row.employee_first_name,
                    last_name: row.employee_last_name,
                    avatar: row.employee_avatar,
                    priority: row.priority,
                    status: row.status,
                    log_count: row.log_count,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    logs: [],
                };
                acc.push(ticket);
            }

            // Add logs
            if (row.log_id) {
                let log = ticket.logs.find((l) => l.log_id === row.log_id);
                if (!log) {
                    log = {
                        log_id: row.log_id,
                        action: row.log_action,
                        entity_type: row.log_entity_type,
                        entity_id: row.log_entity_id,
                        performed_at: row.log_performed_at,
                        comments: [],
                        attachments: [],
                    };
                    ticket.logs.push(log);
                }

                // Add comments to the log
                if (row.comment_id) {
                    log.comments.push({
                        comment_id: row.comment_id,
                        comment: row.comment_text,
                        entity_type: row.comment_entity_type,
                        entity_id: row.comment_entity_id,
                        created_at: row.comment_created_at,
                    });
                }

                // Add attachments to the log
                if (row.attachment_id) {
                    log.attachments.push({
                        attachment_id: row.attachment_id,
                        file_path: row.file_path,
                        file_type: row.file_type,
                        file_name: row.file_name,
                        file_size: row.file_size,
                        entity_type: row.attachment_entity_type,
                        entity_id: row.attachment_entity_id,
                        uploaded_at: row.attachment_uploaded_at,
                    });
                }
            }

            return acc;
        }, []);

        // Response
        res.status(200).json({
            tickets,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }

});



// Get a single ticket by ID
router.get("/:ticketId", [auth], async (req, res) => {
    const { ticketId } = req.params;

    try {
        const [ticket] = await db.query(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);

        if (ticket.length === 0) {
            return res.status(404).json({ message: "Ticket not found" });
        }

        res.status(200).json(ticket[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching ticket", error });
    }
});

// Create a new ticket (with transaction)
router.post("/", [auth], async (req, res) => {
    const { title, description, employee_id, assigned_to, tenant_id, priority } = req.body;
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    // const connection = await db.getConnection();
    await db.beginTransaction();

    try {
        // Insert new ticket
        const [ticketResult] = await db.query(
            `INSERT INTO tickets (title, description, employee_id, assigned_to, tenant_id, priority)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [title, description, employee_id, assigned_to || null, tenant_id, priority || "Low"]
        );

        const ticket_id = ticketResult.insertId;

        // Log the creation of the ticket
        await db.query(
            `INSERT INTO ticket_logs (ticket_id, action, entity_type, entity_id)
             VALUES (?, ?, ?, ?)`,
            [ticket_id, "Created", "Tenant Admin", employee_id]
        );

        // Commit the transaction
        await db.commit();
        res.status(201).json({ message: "Ticket created successfully", ticket_id });
    } catch (error) {
        // Rollback in case of error
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error creating ticket", error });
    } finally {
        db.end();
    }
});
// Create a new ticketLog (with transaction)
router.post("/create-comment-log", [auth], async (req, res) => {
    const { ticket_id, entity_type, entity_id, comment } = req.body;
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    // const connection = await db.getConnection();
    await db.beginTransaction();

    try {
        // Insert new ticket
        const [ticketResult] = await db.query(
            `INSERT INTO ticket_logs (ticket_id, action, entity_type, entity_id)
             VALUES (?, ?, ?, ?)`,
            [ticket_id, "Commented", entity_type, entity_id]
        );

        const log_id = ticketResult.insertId;

        // Log the creation of the ticket
        await db.query(
            `INSERT INTO ticket_comments (ticket_id, log_id, entity_type, entity_id,comment)
             VALUES (?, ?, ?, ?,?)`,
            [ticket_id, log_id, entity_type, entity_id, comment]
        );

        // Commit the transaction
        await db.commit();
        res.status(201).json({ message: "Ticket Log created successfully", log_id });
    } catch (error) {
        // Rollback in case of error
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error creating ticket log", error });
    } finally {
        db.end();
    }
});

router.post("/create-attachment-log", [auth], async (req, res) => {
    const { ticket_id, entity_type, entity_id, file_path, file_type, file_name, file_size } = req.body;
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    // const connection = await db.getConnection();
    await db.beginTransaction();

    try {
        // Insert new ticket
        const [ticketResult] = await db.query(
            `INSERT INTO ticket_logs (ticket_id, action, entity_type, entity_id)
             VALUES (?, ?, ?, ?)`,
            [ticket_id, "Attachment", entity_type, entity_id]
        );

        const log_id = ticketResult.insertId;

        // Log the creation of the ticket
        await db.query(
            `INSERT INTO ticket_attachments (ticket_id, log_id,file_path,file_type,file_name,file_size, entity_type, entity_id)
             VALUES (?, ?, ?, ?,?, ?, ?, ?)`,
            [ticket_id, log_id, file_path, file_type, file_name, file_size, entity_type, entity_id]
        );

        // Commit the transaction
        await db.commit();
        res.status(201).json({ message: "Ticket Log created successfully", log_id });
    } catch (error) {
        // Rollback in case of error
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error creating ticket log", error });
    } finally {
        db.end();
    }
});

// Create a new ticketLog (with transaction)
router.post("/update-ticket-log", [auth], async (req, res) => {
    const { ticket_id, entity_type, entity_id, action_type } = req.body;
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    // const connection = await db.getConnection();
    await db.beginTransaction();

    try {

        // Update the ticket
        await db.query(
            `UPDATE tickets
             SET  status = ?, updated_at = NOW()
             WHERE ticket_id = ?`,
            [action_type, ticket_id]
        );
        //const log_id = ticketResult.insertId;

        //Log the creation of the ticket
        const [ticketResult] = await db.query(
            `INSERT INTO ticket_logs (ticket_id, action, entity_type, entity_id)
             VALUES (?, ?, ?, ?)`,
            [ticket_id, action_type, entity_type, entity_id]
        );

        // Commit the transaction
        await db.commit();
        res.status(201).json({ message: `Ticket Log ${action_type} successfully`, ticket_id });
    } catch (error) {
        // Rollback in case of error
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error creating ticket log", error });
    } finally {
        db.end();
    }
});

// Update an existing ticket (with transaction)
router.put("/:ticketId", [auth], async (req, res) => {
    const { ticketId } = req.params;
    const { title, description, assigned_to, priority, status, updated_by, updated_by_type } = req.body;

    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    // const connection = await db.getConnection();
    await db.beginTransaction();

    try {
        // Fetch the existing ticket to ensure it exists
        const [existingTicket] = await db.query(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
        if (existingTicket.length === 0) {
            return res.status(404).json({ message: "Ticket not found" });
        }

        // Update the ticket
        await db.query(
            `UPDATE tickets
             SET title = ?, description = ?, assigned_to = ?, priority = ?, status = ?, updated_at = NOW()
             WHERE ticket_id = ?`,
            [title, description, assigned_to || null, priority || "Low", status || "New", ticketId]
        );

        // Log the update action
        await db.query(
            `INSERT INTO ticket_logs (ticket_id, action, entity_type, entity_id)
             VALUES (?, ?, ?, ?)`,
            [ticketId, "Updated Ticket", updated_by_type || "Tenant Admin", updated_by]
        );

        // Commit the transaction
        await db.commit();
        res.status(200).json({ message: "Ticket updated successfully" });
    } catch (error) {
        // Rollback in case of error
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error updating ticket", error });
    } finally {
        db.end();
    }
});

// // Create a new ticket
// router.post("/", [auth], async (req, res) => {
//     const { title, description, status, priority } = req.body;

//     try {
//         const result = await db.query(
//             `INSERT INTO tickets (title, description, status, priority, created_at)
//              VALUES (?, ?, ?, ?, NOW())`,
//             [title, description, status || "Open", priority || "Medium"]
//         );

//         res.status(201).json({ message: "Ticket created successfully", ticket_id: result[0].insertId });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error creating ticket", error });
//     }
// });

// // Update a ticket by ID
// router.put("/:ticketId", [auth], async (req, res) => {
//     const { ticketId } = req.params;
//     const { title, description, status, priority } = req.body;

//     try {
//         const result = await db.query(
//             `UPDATE tickets SET title = ?, description = ?, status = ?, priority = ?, updated_at = NOW()
//              WHERE ticket_id = ?`,
//             [title, description, status, priority, ticketId]
//         );

//         if (result[0].affectedRows === 0) {
//             return res.status(404).json({ message: "Ticket not found" });
//         }

//         res.status(200).json({ message: "Ticket updated successfully" });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error updating ticket", error });
//     }
// });

// Delete a ticket by ID
router.delete("/:ticketId", [auth], async (req, res) => {
    const { ticketId } = req.params;

    try {
        const result = await db.query(`DELETE FROM tickets WHERE ticket_id = ?`, [ticketId]);

        if (result[0].affectedRows === 0) {
            return res.status(404).json({ message: "Ticket not found" });
        }

        res.status(200).json({ message: "Ticket deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting ticket", error });
    }
});


module.exports = router;
