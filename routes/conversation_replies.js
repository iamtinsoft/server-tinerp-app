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
// Create a conversation reply
router.post("/", [auth], async (req, res) => {
    // const { message, employee_id, conversation_id, status } = req.body;
    // console.log(req.body)
    // try {
    //     // Check for duplicate record
    //     const checkQuery = `
    //         SELECT * FROM conversation_reply
    //         WHERE conversation_id = ? AND employee_id = ? AND message = ? AND status = ?
    //     `;
    //     const [existingRecord] = await db.query(checkQuery, [conversation_id, employee_id, message, status]);

    //     if (existingRecord.length > 0) {
    //         return res.status(400).json({ message: "A reply with the same conversation, employee, message, and status already exists." });
    //     }

    //     // Insert new conversation reply
    //     const query = `
    //         INSERT INTO conversation_reply (message, employee_id, conversation_id, status)
    //         VALUES (?, ?, ?, ?)
    //     `;
    //     const [result] = await db.execute(query, [message, employee_id, conversation_id, status]);

    //     res.status(201).json({ message: "Reply created successfully", last_inserted_id: result.insertId });
    // } catch (error) {
    //     console.error(error);
    //     res.status(500).json({ message: "Error creating reply", error });
    // }
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    const { message, employee_id, conversation_id, status, media, created_at } = req.body;

    if (!employee_id || !conversation_id) {
        return res.status(400).json({ message: "Required fields are missing." });
    }

    // if (!Array.isArray(media)) {
    //     return res.status(400).json({ message: "Media must be an array." });
    // }

    // const connection = await db.getConnection();

    try {
        // Check for duplicate message
        const [duplicateCheck] = await db.execute(
            `SELECT COUNT(*) AS count FROM conversation_reply WHERE conversation_id = ? AND employee_id = ? AND message = ? AND status = ? AND created_at`,
            [conversation_id, employee_id, message, status, created_at]
        );

        if (duplicateCheck[0].count > 0) {
            return res.status(409).json({ message: "Duplicate message detected." });
        }

        // Start transaction
        await db.beginTransaction();

        // Insert into conversation_reply
        const [replyResult] = await db.execute(
            `
            INSERT INTO conversation_reply (message, employee_id, conversation_id, status)
            VALUES (?, ?, ?, 'New');
            `,
            [message, employee_id, conversation_id]
        );

        const conversation_reply_id = replyResult.insertId;

        // Insert media into conversation_reply_media
        if (media && media.length > 0) {
            const mediaInsertValues = media.map((item) => [
                conversation_reply_id,
                item.media_url,
                item.media_type,
                item.file_name || null,
                item.file_size || null,
            ]);

            await db.query(
                `
                INSERT INTO conversation_reply_media (conversation_reply_id, media_url, media_type, file_name, file_size)
                VALUES ?;
                `,
                [mediaInsertValues]
            );
        }

        // Commit transaction
        await db.commit();

        res.status(201).json({
            message: "Conversation reply and media inserted successfully.",
            conversation_reply_id,
        });
    } catch (error) {
        // Rollback transaction in case of error
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error inserting conversation reply or media.", error });
    } finally {
        // Release the db back to the pool
        db.end();
    }
});

// Get conversation replies with pagination, search, and sorting
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["conversation_reply_id", "message", "employee_id", "conversation_id", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT cr.*, e.first_name AS employee_name, c.conversation_id
            FROM conversation_reply cr
            JOIN employees e ON cr.employee_id = e.employee_id
            JOIN conversations c ON cr.conversation_id = c.conversation_id
            WHERE cr.message LIKE ? OR e.first_name LIKE ? OR c.conversation_id LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM conversation_reply cr
            JOIN employees e ON cr.employee_id = e.employee_id
            JOIN conversations c ON cr.conversation_id = c.conversation_id
            WHERE cr.message LIKE ? OR e.first_name LIKE ? OR c.conversation_id LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm]);

        res.status(200).json({
            replies: rows,
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
        res.status(500).json({ message: "Error fetching replies", error });
    }
});

router.get("/media/:id", async (req, res) => {
    const { page = 1, limit = 50, sortColumn = "created_at", sortOrder = "DESC", search = "" } = req.query;
    const offset = (page - 1) * limit;
    const { id } = req.params;
    const allowedSortColumns = ["media_id", "media_url", "media_type", "file_name", "file_size", "created_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT crm.*
            FROM conversation_reply_media crm
            JOIN conversation_reply cr ON crm.conversation_reply_id = cr.conversation_reply_id
            WHERE cr.conversation_id = ?
              AND (crm.file_name LIKE ? OR crm.media_type LIKE ?)
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;

        const countQuery = `
            SELECT COUNT(*) AS total
            FROM conversation_reply_media crm
            JOIN conversation_reply cr ON crm.conversation_reply_id = cr.conversation_reply_id
            WHERE cr.conversation_id = 5
              AND (crm.file_name LIKE ? OR crm.media_type LIKE ?)
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [id, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

        res.status(200).json({
            media: rows,
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
        res.status(500).json({ message: "Error fetching media", error });
    }
});


// Get a single conversation reply by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 100, sortColumn = "crm.created_at", sortOrder = "DESC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["conversation_reply_id", "message", "employee_id", "conversation_id", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "crm.created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT
    cr.*,
    e.*,
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'media_id', crm.media_id,
            'media_url', crm.media_url,
            'media_type', crm.media_type,
            'file_name', crm.file_name,
            'file_size', crm.file_size,
            'created_at', crm.created_at
        )
    ) AS media_items
FROM
    conversation_reply cr
LEFT JOIN
    conversation_reply_media crm ON cr.conversation_reply_id = crm.conversation_reply_id
JOIN
    employees e ON cr.employee_id = e.employee_id
WHERE
    cr.conversation_id = ?
GROUP BY
    cr.conversation_reply_id
ORDER BY
    cr.created_at DESC
LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM conversation_reply cr
            JOIN employees e ON cr.employee_id = e.employee_id
            JOIN conversations c ON cr.conversation_id = c.conversation_id
            WHERE cr.message LIKE ? OR e.first_name LIKE ? OR c.conversation_id LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [id, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm]);
        // Parse the media_items JSON
        // const formattedReplies = rows.map(reply => ({
        //     ...reply,
        //     media_items: reply.media_items.media_id != null
        //         ? rows.media_items.split(',').map(item => {
        //             try {
        //                 return JSON.parse(item);
        //             } catch (err) {
        //                 console.error('Error parsing media item:', item, err);
        //                 return null; // Handle parsing error gracefully
        //             }
        //         })
        //         : [],
        // }));

        res.status(200).json({
            replies: rows,
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
        res.status(500).json({ message: "Error fetching replies", error });
    }
});

// Update a conversation reply
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { message, employee_id, conversation_id, status } = req.body;

    try {
        // Check for duplicate record
        const checkQuery = `
            SELECT * FROM conversation_reply
            WHERE conversation_id = ? AND employee_id = ? AND message = ? AND status = ? AND conversation_reply_id != ?
        `;
        const [existingRecord] = await db.query(checkQuery, [conversation_id, employee_id, message, status, id]);

        if (existingRecord.length > 0) {
            return res.status(400).json({ message: "A reply with the same conversation, employee, message, and status already exists." });
        }

        // Update conversation reply
        const query = `
            UPDATE conversation_reply
            SET message = ?, employee_id = ?, conversation_id = ?, status = ?
            WHERE conversation_reply_id = ?
        `;
        const [result] = await db.execute(query, [message, employee_id, conversation_id, status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Reply not found" });
        }

        res.status(200).json({ message: "Reply updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating reply", error });
    }
});

// Delete a conversation reply
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM conversation_reply WHERE conversation_reply_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Reply not found" });
        }

        res.status(200).json({ message: "Reply deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting reply", error });
    }
});

module.exports = router;