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
// Get all invoices with pagination, sorting, and filtering by tenant_id
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "invoice_date",
        sortOrder = "DESC",
        tenant,
        search = ""
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["invoice_id", "tenant_id", "tenant_name", "invoice_number", "invoice_date", "due_date", "total_amount", "payment_status", "payment_date"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "invoice_date";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT 
                i.*, 
                t.tenant_name, 
                t.tenant_email,
                t.tenant_id
            FROM 
                invoices i
            INNER JOIN 
                tenants t ON i.tenant_id = t.tenant_id
            WHERE 1=1
        `;
        const queryParams = [];

        // Add tenant filtering
        if (tenant) {
            query += ` AND i.tenant_id = ?`;
            queryParams.push(tenant);
        }

        // Add search filtering
        if (search) {
            query += ` AND (i.invoice_number LIKE ? OR t.tenant_name LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [invoices] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM invoices i
            INNER JOIN tenants t ON i.tenant_id = t.tenant_id
            WHERE 1=1
        `;
        const countParams = [];

        if (tenant) {
            countQuery += ` AND i.tenant_id = ?`;
            countParams.push(tenant);
        }
        if (search) {
            countQuery += ` AND (i.invoice_number LIKE ? OR t.tenant_name LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            invoices,
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
        res.status(500).json({ message: "Error fetching invoices", error });
    }
});
// Get an invoice by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    try {
        const [invoices] = await db.query(`SELECT 
                i.*, 
                t.tenant_name, 
                t.tenant_email,
                t.tenant_id
            FROM 
                invoices i
            INNER JOIN 
                tenants t ON i.tenant_id = t.tenant_id WHERE i.invoice_id = ?`, [id]);

        if (invoices.length === 0) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        res.status(200).json(invoices[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching invoice", error });
    }
});

// Create a new invoice with duplicate check
router.post("/", [auth], async (req, res) => {
    const { tenant_id, invoice_date, due_date, total_amount, payment_status, payment_date, remarks } = req.body;
    let invoice_number = `INV-${generateInvoiceNumber()}`;
    try {
        // Check for duplicate invoices
        const [existing] = await db.query(`SELECT * FROM invoices WHERE invoice_number = ?`, [invoice_number]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "Duplicate invoice detected" });
        }

        const result = await db.query(
            `INSERT INTO invoices (tenant_id, invoice_number, invoice_date, due_date, total_amount, payment_status, payment_date, remarks)
             VALUES (?, ?, NOW(), ?, ?, ?, NULL, ?)`,
            [tenant_id, invoice_number, due_date, total_amount, payment_status || "Pending", remarks]
        );

        res.status(201).json({ message: "Invoice created successfully", invoice_id: result[0].insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating invoice", error });
    }
});

// Update an invoice by ID
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, invoice_number, due_date, total_amount, payment_status, payment_date, remarks } = req.body;

    try {
        const result = await db.query(
            `UPDATE invoices SET tenant_id = ?, invoice_number = ?,  due_date = ?, total_amount = ?, payment_status = ?, payment_date = ?, remarks = ?
             WHERE invoice_id = ?`,
            [tenant_id, invoice_number, due_date, total_amount, payment_status, payment_date, remarks, id]
        );

        if (result[0].affectedRows === 0) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        res.status(200).json({ message: "Invoice updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating invoice", error });
    }
});

// Delete an invoice by ID
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(`DELETE FROM invoices WHERE invoice_id = ?`, [id]);

        if (result[0].affectedRows === 0) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        res.status(200).json({ message: "Invoice deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting invoice", error });
    }
});
function generateInvoiceNumber() {
    const now = new Date();
    const year = now.getFullYear(); // Get the current year
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Get the current month (0-based, so +1)

    const prefix = `${year}${month}`; // Combine year and month
    const randomNumberLength = 12 - prefix.length; // Determine how many digits to add to make it 12 characters
    const randomNumber = Math.floor(Math.random() * Math.pow(10, randomNumberLength))
        .toString()
        .padStart(randomNumberLength, "0"); // Generate random digits with leading zeros if needed

    return `${prefix}${randomNumber}`;
}

// Example usage:
//console.log(generateInvoiceNumber());

module.exports = router;