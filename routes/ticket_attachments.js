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

// Get all attachments for a ticket with pagination, sorting, and search
router.get("/:ticketId/attachments", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "uploaded_at",
        sortOrder = "DESC",
        search = ""
    } = req.query;
    const offset = (page - 1) * limit;

    try {
        const allowedSortColumns = ["attachment_id", "file_name", "file_type", "file_size", "uploaded_at"];
        const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "uploaded_at";
        const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

        // Base query with search
        let query = `
            SELECT * FROM ticket_attachments
            WHERE ticket_id = ? AND file_name LIKE ?
        `;
        const queryParams = [req.params.ticketId, `%${search}%`];

        // Sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute query
        const [attachments] = await db.query(query, queryParams);

        // Count query for total records
        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM ticket_attachments WHERE ticket_id = ? AND file_name LIKE ?`,
            [req.params.ticketId, `%${search}%`]
        );

        res.status(200).json({
            attachments,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            },
            sorting: { sortColumn: column, sortOrder: order },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching attachments", error });
    }
});


module.exports = router;
