const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a module
router.post("/", [auth], async (req, res) => {
    const { module_name, module_url, module_icon, module_description, status } = req.body;

    try {
        const query = `
            INSERT INTO modules (module_name, module_url, module_icon, module_description, status)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [
            module_name,
            module_url,
            module_icon,
            module_description || null,
            status || "Active",
        ]);

        res.status(201).json({ message: "Module created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            res.status(400).json({ message: "Module name must be unique", error });
        } else {
            console.error(error);
            res.status(500).json({ message: "Error creating module", error });
        }
    }
});

// Read all modules with pagination, search, and sorting
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "module_name", sortOrder = "ASC", search = "" } = req.query;
    const offset = (page - 1) * limit;

    // Whitelist allowed columns for sorting to prevent SQL injection
    const allowedSortColumns = ["module_id", "module_name", "module_url", "created_at", "updated_at", "status"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "module_name";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT *
            FROM modules
            WHERE module_name LIKE ? OR module_description LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM modules
            WHERE module_name LIKE ? OR module_description LIKE ?
        `;

        const searchTerm = `%${search}%`;

        const [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

        res.status(200).json({
            modules: rows,
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
        res.status(500).json({ message: "Error fetching modules", error });
    }
});

// Read a single module by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "SELECT * FROM modules WHERE module_id = ?";
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Module not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching module", error });
    }
});

// Update a module
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { module_name, module_url, module_icon, module_description, status } = req.body;

    try {
        const query = `
            UPDATE modules
            SET module_name = ?, module_url = ?, module_icon = ?, module_description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE module_id = ?
        `;
        const [result] = await db.execute(query, [
            module_name,
            module_url,
            module_icon,
            module_description || null,
            status || "Active",
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Module not found" });
        }

        res.status(200).json({ message: "Module updated successfully" });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            res.status(400).json({ message: "Module name must be unique", error });
        } else {
            console.error(error);
            res.status(500).json({ message: "Error updating module", error });
        }
    }
});

// Delete a module
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM modules WHERE module_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Module not found" });
        }

        res.status(200).json({ message: "Module deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting module", error });
    }
});



module.exports = router;
