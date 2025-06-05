const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Get all announcements with pagination, sorting, and filtering
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "created_at",
        sortOrder = "DESC",
        status,
        author,
        tenant_id,
        includeExpired = false
    } = req.query;
    console.log(req.query)
    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["announcements_id", "tenant_id", "title", "author_id", "created_at", "updated_at", "expired_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT 
                a.*,
                u.email as author_email,
                u.first_name as author_first_name,
                u.last_name as author_last_name
            FROM 
                announcements a
            INNER JOIN 
                employees u ON a.author_id = u.employee_id
            WHERE 
                1=1
        `;
        const queryParams = [];
        if (tenant_id) {
            query += ` AND a.tenant_id = ?`;
            queryParams.push(tenant_id);
        }


        // Filter out expired announcements by default
        if (!includeExpired || includeExpired === 'false') {
            query += ` AND (a.expired_at IS NULL OR a.expired_at > NOW())`;
        }

        // Add status filtering
        if (status) {
            query += ` AND a.status = ?`;
            queryParams.push(status);
        }

        // Add author filtering
        if (author) {
            query += ` AND a.author_id = ?`;
            queryParams.push(author);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [announcements] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM announcements a
            INNER JOIN employees u ON a.author_id = u.employee_id
            WHERE a.tenant_id = ?
        `;
        const countParams = [tenant_id];

        if (!includeExpired || includeExpired === 'false') {
            countQuery += ` AND (a.expired_at IS NULL OR a.expired_at > NOW())`;
        }
        if (status) {
            countQuery += ` AND a.status = ?`;
            countParams.push(status);
        }
        if (author) {
            countQuery += ` AND a.author_id = ?`;
            countParams.push(author);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            announcements,
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
        res.status(500).json({ message: "Error fetching announcements", error: error.message });
    }
});

// Get an announcement by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    try {
        const [announcements] = await db.query(`
            SELECT 
                a.*,
                u.email as author_email,
                u.first_name as author_first_name,
                u.last_name as author_last_name
            FROM 
                announcements a
            INNER JOIN 
                employees u ON a.author_id = u.employee_id
            WHERE 
                a.announcements_id = ?
        `, [id]);

        if (announcements.length === 0) {
            return res.status(404).json({ message: "Announcement not found" });
        }

        res.status(200).json(announcements[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching announcement", error: error.message });
    }
});

// Create a new announcement
router.post("/", [auth], async (req, res) => {
    const { title, tenant_id, author_id, content, expired_at, status = 'Active' } = req.body;

    // Validate required fields
    const schema = Joi.object({
        tenant_id: Joi.number().min(1).required(),
        author_id: Joi.number().min(1).required(),
        title: Joi.string().max(255).required(),
        content: Joi.string().required(),
        expired_at: Joi.date().optional().allow(null),
        status: Joi.string().valid('Active', 'Inactive', 'Expired').default('Active')
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Insert announcement
        const [result] = await db.query(
            `INSERT INTO announcements (tenant_id, title, content, author_id, expired_at, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tenant_id, title, content, author_id, expired_at || null, status]
        );

        // Log activity (if you have an activity log system)
        // await db.query(
        //     `INSERT INTO activity_logs 
        //         (tenant_id, user_id, action, details) 
        //      VALUES (?, ?, ?, ?)`,
        //     [
        //         req.user.tenant_id,
        //         req.user.user_id,
        //         'create_announcement',
        //         JSON.stringify({
        //             announcements_id: result.insertId,
        //             title: title,
        //             status: status
        //         })
        //     ]
        // );

        res.status(201).json({
            message: "Announcement created successfully",
            announcements_id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating announcement", error: error.message });
    }
});

// Update an announcement
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { title, author_id, tenant_id, content, expired_at, status } = req.body;

    // Validate required fields
    const schema = Joi.object({
        tenant_id: Joi.number().min(1).required(),
        author_id: Joi.number().min(1).required(),
        announcements_id: Joi.number().min(1).required(),
        title: Joi.string().max(255).required(),
        content: Joi.string().required(),
        expired_at: Joi.date().optional().allow(null),
        status: Joi.string().valid('Active', 'Inactive', 'Expired').optional()
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Get announcement details for verification
        const [announcementCheck] = await db.query(`
            SELECT * FROM announcements 
            WHERE announcements_id = ? AND tenant_id = ?
        `, [id, tenant_id]);

        if (announcementCheck.length === 0) {
            return res.status(404).json({ message: "Announcement not found" });
        }

        // Check if user is the author of the announcement or has admin permissions
        // if (announcementCheck[0].author_id !== author_id) {
        //     return res.status(403).json({ message: "You can only edit your own announcements" });
        // }

        // Update announcement
        const [result] = await db.query(
            `UPDATE announcements 
             SET title = ?, content = ?, expired_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE announcements_id = ? AND tenant_id = ?`,
            [title, content, expired_at || null, status || announcementCheck[0].status, id, tenant_id]
        );

        // // Log activity
        // await db.query(
        //     `INSERT INTO activity_logs 
        //         (tenant_id, user_id, action, details) 
        //      VALUES (?, ?, ?, ?)`,
        //     [
        //         req.user.tenant_id,
        //         req.user.user_id,
        //         'update_announcement',
        //         JSON.stringify({
        //             announcements_id: id,
        //             title: title,
        //             status: status || announcementCheck[0].status
        //         })
        //     ]
        // );

        res.status(200).json({ message: "Announcement updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating announcement", error: error.message });
    }
});

// Delete an announcement
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id } = req.query;

    try {
        // Get announcement details for verification and logging
        const [announcementCheck] = await db.query(`
            SELECT * FROM announcements 
            WHERE announcements_id = ? AND tenant_id = ?
        `, [id, tenant_id]);

        if (announcementCheck.length === 0) {
            return res.status(404).json({ message: "Announcement not found" });
        }

        // Check if user is the author of the announcement or has admin permissions
        // if (announcementCheck[0].author_id !== req.user.user_id && !req.user.isAdmin) {
        //     return res.status(403).json({ message: "You can only delete your own announcements" });
        // }

        // Delete announcement
        const [result] = await db.query(
            `DELETE FROM announcements WHERE announcements_id = ?`,
            [id]
        );

        // Log activity
        // await db.query(
        //     `INSERT INTO activity_logs 
        //         (tenant_id, user_id, action, details) 
        //      VALUES (?, ?, ?, ?)`,
        //     [
        //         req.user.tenant_id,
        //         req.user.user_id,
        //         'delete_announcement',
        //         JSON.stringify({
        //             announcements_id: id,
        //             title: announcementCheck[0].title
        //         })
        //     ]
        // );

        res.status(200).json({ message: "Announcement deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting announcement", error: error.message });
    }
});

// Update announcement status (separate endpoint for status changes)
router.patch("/:id/status", [auth], async (req, res) => {
    const { id } = req.params;
    const { status, tenant_id } = req.body;

    // Validate status
    const schema = Joi.object({
        tenant_id: Joi.number().min(1).required(),
        status: Joi.string().valid('Active', 'Inactive', 'Expired').required()
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Get announcement details for verification
        const [announcementCheck] = await db.query(`
            SELECT * FROM announcements 
            WHERE announcements_id = ? AND tenant_id = ?
        `, [id, tenant_id]);

        if (announcementCheck.length === 0) {
            return res.status(404).json({ message: "Announcement not found" });
        }

        // // Check permissions
        // if (announcementCheck[0].author_id !== req.user.user_id && !req.user.isAdmin) {
        //     return res.status(403).json({ message: "You can only modify your own announcements" });
        // }

        // Update status
        const [result] = await db.query(
            `UPDATE announcements 
             SET status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE announcements_id = ? AND tenant_id = ?`,
            [status, id, tenant_id]
        );

        // Log activity
        // await db.query(
        //     `INSERT INTO activity_logs 
        //         (tenant_id, user_id, action, details) 
        //      VALUES (?, ?, ?, ?)`,
        //     [
        //         req.user.tenant_id,
        //         req.user.user_id,
        //         'update_announcement_status',
        //         JSON.stringify({
        //             announcements_id: id,
        //             title: announcementCheck[0].title,
        //             old_status: announcementCheck[0].status,
        //             new_status: status
        //         })
        //     ]
        // );

        res.status(200).json({ message: "Announcement status updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating announcement status", error: error.message });
    }
});

module.exports = router;