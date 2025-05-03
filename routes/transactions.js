const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");
const config = require("config");

// Utility function for validation
const validateTransaction = (transaction) => {
    const schema = Joi.object({
        invoice_id: Joi.number().required(),
        tenant_id: Joi.number().required(),
        transaction_type: Joi.string().valid("Payment", "Refund", "Adjustment").required(),
        transaction_amount: Joi.number().positive().required(),
        payment_method: Joi.string().valid("Credit Card", "Bank Transfer", "PayPal", "Other").optional(),
        reference_number: Joi.string().max(255).optional(),
        remarks: Joi.string().optional(),
    });
    return schema.validate(transaction);
};

// Create a Transaction
router.post("/", [auth], async (req, res) => {
    const { error } = validateTransaction(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const {
        invoice_id,
        tenant_id,
        transaction_type,
        transaction_amount,
        payment_method = "Other",
        reference_number,
        remarks,
    } = req.body;

    try {
        // Check for duplicate reference number
        if (reference_number) {
            const [existing] = await db.query(
                "SELECT * FROM transactions WHERE reference_number = ?",
                [reference_number]
            );
            if (existing.length > 0) {
                return res.status(409).json({ message: "Transaction with this reference number already exists" });
            }
        }

        // Insert new transaction
        const query = `
            INSERT INTO transactions (
                invoice_id, tenant_id, record_year, record_month, 
                transaction_type, transaction_amount, payment_method, 
                reference_number, remarks
            ) VALUES (?, ?, YEAR(CURDATE()), MONTHNAME(CURDATE()), ?, ?, ?, ?, ?)
        `;
        await db.query(query, [
            invoice_id,
            tenant_id,
            transaction_type,
            transaction_amount,
            payment_method,
            reference_number,
            remarks,
        ]);

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
        let query = `
            SELECT 
                q.*, i.invoice_number, t.tenant_name, t.tenant_email
            FROM 
                transactions q
            INNER JOIN 
                tenants t ON q.tenant_id = t.tenant_id
            INNER JOIN 
                invoices i ON q.invoice_id = i.invoice_id
            WHERE 1=1
        `;
        const queryParams = [];

        if (tenant) {
            query += " AND q.tenant_id = ?";
            queryParams.push(tenant);
        }

        if (search) {
            query += " AND (q.transaction_type LIKE ? OR q.payment_method LIKE ?)";
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const [transactions] = await db.query(query, queryParams);

        const countQuery = `
            SELECT COUNT(*) AS total 
            FROM transactions q
            INNER JOIN tenants t ON q.tenant_id = t.tenant_id
            WHERE 1=1
        `;
        const countParams = [...queryParams.slice(0, queryParams.length - 2)];
        const [[{ total }]] = await db.query(countQuery, countParams);

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

// Other endpoints remain unchanged except for minor adjustments
// for column references, validation, and default values.

module.exports = router;
