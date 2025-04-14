const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a conversation
router.post("/", [auth], async (req, res) => {
    const { tenant_id, sender_id, receiver_id, status } = req.body;

    try {
        // Check for duplicate record
        const checkQuery = `
            SELECT * FROM conversations
            WHERE tenant_id = ? AND sender_id = ? AND receiver_id = ?
        `;
        const [existingRecord] = await db.query(checkQuery, [tenant_id, sender_id, receiver_id]);

        if (existingRecord.length > 0) {
            return res.status(400).json({ message: "A conversation with the same tenant, sender, and receiver already exists." });
        }

        // Insert new conversation
        const query = `
            INSERT INTO conversations (tenant_id, sender_id, receiver_id, status)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [tenant_id, sender_id, receiver_id, status]);

        res.status(201).json({ message: "Conversation created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating conversation", error });
    }
});

// Get conversations with pagination, search, and sorting
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["conversation_id", "tenant_id", "sender_id", "receiver_id", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT c.*, s.first_name AS sender_name, r.first_name AS receiver_name
            FROM conversations c
            JOIN employees s ON c.sender_id = s.employee_id
            JOIN employees r ON c.receiver_id = r.employee_id
            WHERE c.tenant_id LIKE ? OR s.first_name LIKE ? OR r.first_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM conversations c
            JOIN employees s ON c.sender_id = s.employee_id
            JOIN employees r ON c.receiver_id = r.employee_id
            WHERE c.tenant_id LIKE ? OR s.first_name LIKE ? OR r.first_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm]);

        res.status(200).json({
            conversations: rows,
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
        res.status(500).json({ message: "Error fetching conversations", error });
    }
});

// Get a single conversation by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT c.*, s.first_name AS sender_name, r.first_name AS receiver_name
            FROM conversations c
            JOIN employees s ON c.sender_id = s.employee_id
            JOIN employees r ON c.receiver_id = r.employee_id
            WHERE c.conversation_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching conversation", error });
    }
});

// Update a conversation
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, sender_id, receiver_id, status } = req.body;

    try {
        // Check for duplicate record
        const checkQuery = `
            SELECT * FROM conversations
            WHERE tenant_id = ? AND sender_id = ? AND receiver_id = ? AND conversation_id != ?
        `;
        const [existingRecord] = await db.query(checkQuery, [tenant_id, sender_id, receiver_id, id]);

        if (existingRecord.length > 0) {
            return res.status(400).json({ message: "A conversation with the same tenant, sender, and receiver already exists." });
        }

        // Update conversation
        const query = `
            UPDATE conversations
            SET tenant_id = ?, sender_id = ?, receiver_id = ?, status = ?
            WHERE conversation_id = ?
        `;
        const [result] = await db.execute(query, [tenant_id, sender_id, receiver_id, status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        res.status(200).json({ message: "Conversation updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating conversation", error });
    }
});

// Delete a conversation
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM conversations WHERE conversation_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        res.status(200).json({ message: "Conversation deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting conversation", error });
    }
});

module.exports = router;