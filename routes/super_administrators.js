const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");
const { generateAuthToken } = require("../helpers/token");
const { sendPasswordResetEmail, sendOtpEmail } = require("./../helpers/email");
const config = require("config");
const link = config.get("client_url")
// 🔍 READ a single Super Admin by Email
router.post("/auth/", async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM super_administrators WHERE email = ? AND status = ?", [req.body.SuperAdminAuthenticationIdentifier, "Active"]);
        if (rows.length === 0) return res.status(404).json({ error: "Super Admin not found" });
        const token = generateAuthToken(rows[0]);
        let fullName = rows[0].first_name + " " + rows[0].last_name;
        let link = ""
        sendOtpEmail(req.body.SuperAdminAuthenticationIdentifier, "OTP", req.body.otp, fullName, link);
        res.status(201).json({ message: "Super Admin Authenticated Successfully", token });
        //res.json({ token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🚀 CREATE a new Super Admin with email duplication check
router.post("/", [auth], async (req, res) => {
    try {
        const { first_name, last_name, email, phone_number, status = "Active" } = req.body;

        // Check if email already exists
        const [existing] = await db.execute("SELECT * FROM super_administrators WHERE email = ?", [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: "Email already exists" });
        }

        // Insert new super admin
        const [result] = await db.execute(
            "INSERT INTO super_administrators (first_name, last_name, email, phone_number, status) VALUES (?, ?, ?, ?, ?)",
            [first_name, last_name, email, phone_number, status]
        );

        res.status(201).json({ message: "Super Admin Created", super_admin_id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 READ all Super Admins with Pagination, Sorting, and Search
router.get("/", [auth], async (req, res) => {
    try {
        let { page = 1, limit = 10, search = "", sortColumn = "created_at", sortOrder = "ASC" } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // Allowed columns to sort
        const allowedSortColumns = ["super_admin_id", "first_name", "last_name", "email", "phone_number", "created_at", "updated_at", "status"];
        if (!allowedSortColumns.includes(sortColumn)) sortColumn = "created_at";
        sortOrder = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

        // Search query
        const searchQuery = `%${search}%`;

        // Query to fetch filtered and sorted data
        const [rows] = await db.execute(
            `SELECT * FROM super_administrators 
       WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? 
       ORDER BY ${sortColumn} ${sortOrder} 
       LIMIT ? OFFSET ?`,
            [searchQuery, searchQuery, searchQuery, limit, offset]
        );

        // Get total count for pagination
        const [[{ total }]] = await db.execute(
            `SELECT COUNT(*) AS total FROM super_administrators 
       WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?`,
            [searchQuery, searchQuery, searchQuery]
        );

        res.json({ total, page, limit, data: rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// 🔍 READ a single Super Admin by ID
router.get("/:id", [auth], async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM super_administrators WHERE super_admin_id = ?", [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: "Super Admin not found" });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✏️ UPDATE a Super Admin (With Duplicate Email Check)
router.put("/:id", [auth], async (req, res) => {
    try {
        const { first_name, last_name, email, phone_number, status } = req.body;
        const { id } = req.params;

        // Check if email already exists for a different super admin
        const [existing] = await db.execute("SELECT * FROM super_administrators WHERE email = ? AND super_admin_id != ?", [email, id]);
        if (existing.length > 0) {
            return res.status(400).json({ error: "Email already exists" });
        }

        // Update the record
        const [result] = await db.execute(
            "UPDATE super_administrators SET first_name=?, last_name=?, email=?, phone_number=?, status=?, updated_at=NOW() WHERE super_admin_id=?",
            [first_name, last_name, email, phone_number, status, id]
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: "Super Admin not found" });
        res.json({ message: "Super Admin Updated" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ❌ DELETE a Super Admin
router.delete("/:id", [auth], async (req, res) => {
    try {
        const [result] = await db.execute("DELETE FROM super_administrators WHERE super_admin_id = ?", [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Super Admin not found" });
        res.json({ message: "Super Admin Deleted" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;