const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a conversation reply
router.post("/", [auth], async (req, res) => {
    const { message, employee_id, conversation_id, status } = req.body;

    try {
        // Check for duplicate record
        const checkQuery = `
            SELECT * FROM conversation_reply
            WHERE conversation_id = ? AND employee_id = ? AND message = ? AND status = ?
        `;
        const [existingRecord] = await db.query(checkQuery, [conversation_id, employee_id, message, status]);

        if (existingRecord.length > 0) {
            return res.status(400).json({ message: "A reply with the same conversation, employee, message, and status already exists." });
        }

        // Insert new conversation reply
        const query = `
            INSERT INTO conversation_reply (message, employee_id, conversation_id, status)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [message, employee_id, conversation_id, status]);

        res.status(201).json({ message: "Reply created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating reply", error });
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

// Get a single conversation reply by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT cr.*, e.first_name AS employee_name, c.conversation_id
            FROM conversation_reply cr
            JOIN employees e ON cr.employee_id = e.employee_id
            JOIN conversations c ON cr.conversation_id = c.conversation_id
            WHERE cr.conversation_reply_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Reply not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching reply", error });
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