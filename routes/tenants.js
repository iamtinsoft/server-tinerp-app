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
const { generateAuthToken } = require("../helpers/token");
// 🔍 READ a single Super Admin by Email
router.post("/auth/", async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM tenants WHERE tenant_name = ? AND status = ?", [req.body.TenantAuthenticationIdentifier, "Active"]);
        if (rows.length === 0) return res.status(404).json({ error: "Tenant not found" });
        const token = generateAuthToken(rows[0]);
        res.status(201).json({ message: "Tenant Authenticated Successfully", token });
        //res.json({ token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a tenant
router.post("/", [auth], async (req, res) => {
    const { tenant_name, tenant_email, tenant_icon_url, plan_id } = req.body;
    const status = "Active";
    //console.log(tenant_name, tenant_email, tenant_icon_url, status, plan_id)
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,

    });
    await db.beginTransaction();
    try {
        // Insert into tenants table
        const tenantQuery = `
            INSERT INTO tenants (tenant_name, tenant_email, tenant_icon_url, status)
            VALUES (?, ?, ?, ?)
        `;
        const [tenantResult] = await db.execute(tenantQuery, [
            tenant_name,
            tenant_email,
            tenant_icon_url || null,
            status || "Active",
        ]);
        const tenant_id = tenantResult.insertId;

        // Check if the tenant_id and plan_id combination already exists in subscriptions
        const checkQuery = `
            SELECT * FROM subscriptions WHERE tenant_id = ? AND plan_id = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, plan_id]);

        if (existing.length > 0) {
            await db.rollback();
            return res.status(400).json({ message: "This tenant-plan combination already exists" });
        }

        //Insert into subscriptions table
        const subscriptionQuery = `
            INSERT INTO subscriptions (tenant_id, plan_id, status)
            VALUES (?, ?, ?)
        `;

        const [subscriptionResult] = await db.execute(subscriptionQuery, [
            tenant_id,
            plan_id,
            status || "Active",
        ]);

        // Commit the transaction
        await db.commit();

        res.status(201).json({
            message: "Tenant and subscription created successfully",
            tenant_id,
            subscription_id: subscriptionResult.insertId,
        });
    } catch (error) {
        // Rollback the transaction in case of any error
        await db.rollback();

        if (error.code === "ER_DUP_ENTRY") {
            res.status(400).json({ message: "Tenant name or email must be unique", error });
        } else {
            console.error(error);
            res.status(500).json({ message: "Error creating tenant or subscription", error });
        }
    }
    finally {
        await db.end();
    }
});

// Read all tenants with pagination, search, and sorting
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "tenant_name", sortOrder = "ASC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    // Whitelist allowed columns for sorting to prevent SQL injection
    const allowedSortColumns = ["tenant_id", "tenant_name", "tenant_email", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "tenant_name";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT t.*, p.plan_name,s.subscription_id
            FROM tenants t
            JOIN subscriptions s ON t.tenant_id = s.tenant_id
            JOIN plans p ON s.plan_id = p.plan_id
            WHERE t.tenant_name LIKE ? OR t.tenant_email LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM tenants t
            WHERE t.tenant_name LIKE ? OR t.tenant_email LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

        res.status(200).json({
            tenants: rows,
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
        res.status(500).json({ message: "Error fetching tenants", error });
    }
});

// Read a single tenant by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT t.*, p.plan_name,p.plan_id,s.subscription_id
            FROM tenants t
            JOIN subscriptions s ON t.tenant_id = s.tenant_id
            JOIN plans p ON s.plan_id = p.plan_id
            WHERE t.tenant_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching tenant", error });
    }
});

// Update a tenant
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id,
        tenant_name,
        tenant_email,
        tenant_icon_url,
        plan_id,
        subscription_id,
        status } = req.body;

    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    await db.beginTransaction();

    try {
        // Update the tenants table
        const tenantQuery = `
            UPDATE tenants
            SET tenant_name = ?, tenant_email = ?, tenant_icon_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE tenant_id = ?
        `;
        const [tenantResult] = await db.execute(tenantQuery, [
            tenant_name,
            tenant_email,
            tenant_icon_url || null,
            status || "Active",
            tenant_id,
        ]);

        if (tenantResult.affectedRows === 0) {
            await db.rollback();
            return res.status(404).json({ message: "Tenant not found" });
        }

        // Update the subscriptions table
        const subscriptionQuery = `
            UPDATE subscriptions
            SET tenant_id = ?, plan_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE subscription_id = ?
        `;
        const [subscriptionResult] = await db.execute(subscriptionQuery, [
            tenant_id,
            plan_id,
            status || "Active",
            subscription_id,
        ]);

        if (subscriptionResult.affectedRows === 0) {
            await db.rollback();
            return res.status(404).json({ message: "Subscription not found" });
        }

        // Commit the transaction
        await db.commit();

        res.status(200).json({
            message: "Tenant and subscription updated successfully",
        });
    } catch (error) {
        // Rollback the transaction in case of an error
        await db.rollback();

        if (error.code === "ER_DUP_ENTRY") {
            res.status(400).json({ message: "Tenant name or email must be unique", error });
        } else {
            console.error(error);
            res.status(500).json({ message: "Error updating tenant or subscription", error });
        }
    } finally {
        await db.end();
    }


    // try {
    //     const query = `
    //         UPDATE tenants
    //         SET tenant_name = ?, tenant_email = ?, tenant_icon_url = ?, plan_id = ?, subscription_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    //         WHERE tenant_id = ?
    //     `;
    //     const [result] = await db.execute(query, [
    //         tenant_name,
    //         tenant_email,
    //         tenant_icon_url || null,
    //         plan_id,
    //         subscription_id,
    //         status || "Active",
    //         id,
    //     ]);

    //     if (result.affectedRows === 0) {
    //         return res.status(404).json({ message: "Tenant not found" });
    //     }

    //     res.status(200).json({ message: "Tenant updated successfully" });
    // } catch (error) {
    //     if (error.code === "ER_DUP_ENTRY") {
    //         res.status(400).json({ message: "Tenant name or email must be unique", error });
    //     } else {
    //         console.error(error);
    //         res.status(500).json({ message: "Error updating tenant", error });
    //     }
    // }
});

// Delete a tenant
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM tenants WHERE tenant_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        res.status(200).json({ message: "Tenant deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting tenant", error });
    }
});

module.exports = router;

