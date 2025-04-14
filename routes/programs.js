const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a program
router.post("/", [auth], async (req, res) => {
    const { tenant_id, program_name, program_code, status = "Active" } = req.body;

    try {
        // Check if the combination of tenant_id, program_name, and program_code already exists
        const checkQuery = `
            SELECT * FROM programs
            WHERE tenant_id = ? AND program_name = ? AND program_code = ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, program_name, program_code]);

        if (existing.length > 0) {
            return res.status(400).json({
                message: "A program with the same tenant, name, and code already exists.",
            });
        }

        const query = `
            INSERT INTO programs (tenant_id, program_name, program_code, status)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [tenant_id, program_name, program_code, status]);

        res.status(201).json({ message: "Program created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating program", error });
    }
});

// Get programs with pagination, sorting, and search
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "ASC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;
    const allowedSortColumns = [
        "program_id",
        "tenant_id",
        "program_name",
        "program_code",
        "created_at",
        "updated_at",
        "status",
    ];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT p.*, t.tenant_name
            FROM programs p
            JOIN tenants t ON p.tenant_id = t.tenant_id
            WHERE p.program_name LIKE ? OR p.program_code LIKE ? OR t.tenant_name = ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM programs p
            JOIN tenants t ON p.tenant_id = t.tenant_id
            WHERE p.program_name LIKE ? OR p.program_code LIKE ? OR t.tenant_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        let [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            programs: rows,
            pagination: {
                total: tenant > 0 ? rows.length : total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(tenant > 0 ? rows.length : total / limit),
            },
            sorting: {
                sortColumn: column,
                sortOrder: order,
            },
            search: search,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching programs", error });
    }
});

// Get a single program by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT p.*, t.tenant_name
            FROM programs p
            JOIN tenants t ON p.tenant_id = t.tenant_id
            WHERE p.program_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching program", error });
    }
});

// Update a program
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, program_name, program_code, status } = req.body;

    try {
        // Check if the combination of tenant_id, program_name, and program_code already exists (excluding current record)
        const checkQuery = `
            SELECT * FROM programs
            WHERE tenant_id = ? AND program_name = ? AND program_code = ? AND program_id != ?
        `;
        const [existing] = await db.query(checkQuery, [tenant_id, program_name, program_code, id]);

        if (existing.length > 0) {
            return res.status(400).json({
                message: "A program with the same tenant, name, and code already exists.",
            });
        }

        const query = `
            UPDATE programs
            SET tenant_id = ?, program_name = ?, program_code = ?, status = ?
            WHERE program_id = ?
        `;
        const [result] = await db.execute(query, [tenant_id, program_name, program_code, status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.status(200).json({ message: "Program updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating program", error });
    }
});

// Delete a program
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM programs WHERE program_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.status(200).json({ message: "Program deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting program", error });
    }
});

module.exports = router;