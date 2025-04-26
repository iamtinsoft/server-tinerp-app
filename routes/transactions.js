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
// Utility function for validation
const validateTransaction = (transaction) => {
    const { invoice_id, tenant_id, transaction_type, transaction_amount } = transaction;
    return invoice_id && tenant_id && transaction_type && transaction_amount;
};

// Create a Transaction
router.post('/', [auth], async (req, res) => {
    const { invoice_id, tenant_id, transaction_type, transaction_amount, payment_method, reference_number, remarks } = req.body;

    if (!validateTransaction(req.body)) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    try {
        // Check for duplicate reference number
        const [existing] = await db.query('SELECT * FROM transactions WHERE reference_number = ?', [reference_number]);
        if (existing.length > 0) {
            return res.status(409).json({ message: "Transaction with this reference number already exists" });
        }

        // Insert new transaction
        const query = `
            INSERT INTO transactions (
                invoice_id, tenant_id, transaction_type, transaction_amount, 
                payment_method, reference_number, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(query, [invoice_id, tenant_id, transaction_type, transaction_amount, payment_method, reference_number, remarks]);

        res.status(201).json({ message: "Transaction created successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating transaction", error });
    }
});

// Get Transactions with Sorting and Pagination
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "transaction_date",
        sortOrder = "DESC",
        tenant,
        search = "",
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = [
        "transaction_date",
        "transaction_amount",
        "transaction_type",
        "payment_method",
    ];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "transaction_date";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT 
                q.*,i.invoice_number,
                t.tenant_name, 
                t.tenant_email,
                t.tenant_id
            FROM 
                transactions q
            INNER JOIN 
                tenants t ON q.tenant_id = t.tenant_id
                INNER JOIN
                invoices i ON q.invoice_id = i.invoice_id
            WHERE 1=1
        `;
        const queryParams = [];

        // Add tenant filtering
        if (tenant) {
            query += ` AND q.tenant_id = ?`;
            queryParams.push(tenant);
        }

        // Add search filtering
        if (search) {
            query += ` AND (q.transaction_type LIKE ? OR q.payment_method LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [transactions] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM transactions q
            INNER JOIN tenants t ON q.tenant_id = t.tenant_id
            WHERE 1=1
        `;
        const countParams = [];

        if (tenant) {
            countQuery += ` AND q.tenant_id = ?`;
            countParams.push(tenant);
        }
        if (search) {
            countQuery += ` AND (q.transaction_type LIKE ? OR q.payment_method LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            transactions,
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
        res.status(500).json({ message: "Error fetching transactions", error });
    }
});


// Get Transactions by Tenant ID
router.get('/tenant/:tenant_id', [auth], async (req, res) => {
    const { tenant_id } = req.params;
    const { page = 1, limit = 10, sortColumn = "transaction_date", sortOrder = "DESC" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["transaction_date", "transaction_amount", "transaction_type", "payment_method"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "transaction_date";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT * FROM transactions
            WHERE tenant_id = ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total FROM transactions
            WHERE tenant_id = ?
        `;

        const [transactions] = await db.query(query, [tenant_id, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [tenant_id]);

        res.status(200).json({
            transactions,
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
        res.status(500).json({ message: "Error fetching transactions for tenant", error });
    }
});

// Update Transaction
router.put('/:transaction_id', [auth], async (req, res) => {
    const { transaction_id } = req.params;
    const { transaction_type, transaction_amount, payment_method, remarks } = req.body;

    try {
        const query = `
            UPDATE transactions
            SET transaction_type = ?, transaction_amount = ?, payment_method = ?, remarks = ?
            WHERE transaction_id = ?
        `;
        await db.query(query, [transaction_type, transaction_amount, payment_method, remarks, transaction_id]);

        res.status(200).json({ message: "Transaction updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating transaction", error });
    }
});

// Delete Transaction
router.delete('/:transaction_id', [auth], async (req, res) => {
    const { transaction_id } = req.params;

    try {
        const query = `DELETE FROM transactions WHERE transaction_id = ?`;
        await db.query(query, [transaction_id]);

        res.status(200).json({ message: "Transaction deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting transaction", error });
    }
});

module.exports = router;