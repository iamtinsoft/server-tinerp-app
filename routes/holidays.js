// const Joi = require("joi");
// const express = require("express");
// const router = express.Router();
// const db = require("../startup/db")();
// const auth = require("../middleware/auth");

// // Create a holiday record
// router.post("/", [auth], async (req, res) => {
//     const { tenant_id, holiday_name, holiday_date, recurring, status } = req.body;

//     try {
//         // Check if the combination of tenant_id, holiday_name, and holiday_date already exists
//         const checkQuery = `
//             SELECT * FROM holidays
//             WHERE tenant_id = ? AND holiday_name = ? AND holiday_date = ?
//         `;
//         const [existing] = await db.query(checkQuery, [tenant_id, holiday_name, holiday_date]);

//         if (existing.length > 0) {
//             return res.status(400).json({
//                 message: "A holiday with the same tenant, name, and date already exists.",
//             });
//         }

//         const query = `
//             INSERT INTO holidays (tenant_id, holiday_name, holiday_date, recurring, status)
//             VALUES (?, ?, ?, ?, ?)
//         `;
//         const [result] = await db.execute(query, [tenant_id, holiday_name, holiday_date, recurring, status]);

//         res.status(201).json({ message: "Holiday created successfully", last_inserted_id: result.insertId });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error creating holiday", error });
//     }
// });

// // Get holidays with pagination, sorting, and search
// router.get("/", [auth], async (req, res) => {
//     const { page = 1, limit = 10, sortColumn = "holiday_date", sortOrder = "ASC", search = "" } = req.query;
//     const offset = (page - 1) * limit;

//     const allowedSortColumns = [
//         "holiday_id",
//         "tenant_id",
//         "holiday_name",
//         "holiday_date",
//         "recurring",
//         "status",
//         "created_at",
//         "updated_at",
//     ];
//     const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "holiday_date";
//     const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

//     try {
//         const query = `
//             SELECT h.*, t.tenant_name
//             FROM holidays h
//             JOIN tenants t ON h.tenant_id = t.tenant_id
//             WHERE h.holiday_name LIKE ? OR t.tenant_name LIKE ?
//             ORDER BY ${column} ${order}
//             LIMIT ? OFFSET ?
//         `;
//         const countQuery = `
//             SELECT COUNT(*) AS total
//             FROM holidays h
//             JOIN tenants t ON h.tenant_id = t.tenant_id
//             WHERE h.holiday_name LIKE ? OR t.tenant_name LIKE ?
//         `;

//         const searchTerm = `%${search}%`;

//         const [rows] = await db.query(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
//         const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm]);

//         res.status(200).json({
//             holidays: rows,
//             pagination: {
//                 total,
//                 page: parseInt(page),
//                 limit: parseInt(limit),
//                 totalPages: Math.ceil(total / limit),
//             },
//             sorting: {
//                 sortColumn: column,
//                 sortOrder: order,
//             },
//             search: search,
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error fetching holidays", error });
//     }
// });

// // Get a single holiday by ID
// router.get("/:id", [auth], async (req, res) => {
//     const { id } = req.params;

//     try {
//         const query = `
//             SELECT h.*, t.tenant_name
//             FROM holidays h
//             JOIN tenants t ON h.tenant_id = t.tenant_id
//             WHERE h.holiday_id = ?
//         `;
//         const [rows] = await db.execute(query, [id]);

//         if (rows.length === 0) {
//             return res.status(404).json({ message: "Holiday not found" });
//         }

//         res.status(200).json(rows[0]);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error fetching holiday", error });
//     }
// });

// // Update a holiday
// router.put("/:id", [auth], async (req, res) => {
//     const { id } = req.params;
//     const { tenant_id, holiday_name, holiday_date, recurring, status } = req.body;

//     try {
//         // Check if the combination of tenant_id, holiday_name, and holiday_date already exists (excluding current record)
//         const checkQuery = `
//             SELECT * FROM holidays
//             WHERE tenant_id = ? AND holiday_name = ? AND holiday_date = ? AND holiday_id != ?
//         `;
//         const [existing] = await db.query(checkQuery, [tenant_id, holiday_name, holiday_date, id]);

//         if (existing.length > 0) {
//             return res.status(400).json({
//                 message: "A holiday with the same tenant, name, and date already exists.",
//             });
//         }

//         const query = `
//             UPDATE holidays
//             SET tenant_id = ?, holiday_name = ?, holiday_date = ?, recurring = ?, status = ?
//             WHERE holiday_id = ?
//         `;
//         const [result] = await db.execute(query, [tenant_id, holiday_name, holiday_date, recurring, status, id]);

//         if (result.affectedRows === 0) {
//             return res.status(404).json({ message: "Holiday not found" });
//         }

//         res.status(200).json({ message: "Holiday updated successfully" });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error updating holiday", error });
//     }
// });

// // Delete a holiday
// router.delete("/:id", [auth], async (req, res) => {
//     const { id } = req.params;

//     try {
//         const query = "DELETE FROM holidays WHERE holiday_id = ?";
//         const [result] = await db.execute(query, [id]);

//         if (result.affectedRows === 0) {
//             return res.status(404).json({ message: "Holiday not found" });
//         }

//         res.status(200).json({ message: "Holiday deleted successfully" });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Error deleting holiday", error });
//     }
// });

// module.exports = router;



const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");

// Create a public holiday
router.post("/", [auth], async (req, res) => {
    const schema = Joi.object({
        holiday_date: Joi.date().required(),
        name: Joi.string().max(255).required(),
        description: Joi.string().optional(),
        country_code: Joi.string().max(5).required(),
        year: Joi.number().integer().required(),
        type: Joi.string().max(50).optional(),
        status: Joi.string().valid("Active", "In Active").default("Active"),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    const { holiday_date, name, description, country_code, year, type, status } = value;

    try {
        // Check for duplicate holiday
        const checkQuery = `
            SELECT * FROM public_holidays WHERE holiday_date = ? AND country_code = ?
        `;
        const [existing] = await db.query(checkQuery, [holiday_date, country_code]);

        if (existing.length > 0) {
            return res.status(400).json({ message: "This holiday already exists for the given country and date." });
        }

        const insertQuery = `
            INSERT INTO public_holidays (holiday_date, name, description, country_code, year, type, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(insertQuery, [holiday_date, name, description, country_code, year, type, status]);

        res.status(201).json({ message: "Public holiday created successfully", last_inserted_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating public holiday", error });
    }
});

// Get all public holidays with pagination, sorting, and filtering
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 100000000, sortColumn = "holiday_date", sortOrder = "ASC", search = "", country_code = "" } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["id", "holiday_date", "name", "country_code", "year", "type", "status", "date_added"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "holiday_date";
    const order = "DESC";

    try {
        const query = `
            SELECT * FROM public_holidays WHERE primary_type="Public Holiday"`;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM public_holidays
            WHERE (name LIKE ? OR description LIKE ?)
            ${country_code ? "AND country_code = ?" : ""}
        `;

        const searchTerm = `%${search}%`;
        const params = country_code ? [searchTerm, searchTerm, country_code, parseInt(limit), parseInt(offset)] : [searchTerm, searchTerm, parseInt(limit), parseInt(offset)];
        const countParams = country_code ? [searchTerm, searchTerm, country_code] : [searchTerm, searchTerm];

        const [rows] = await db.query(query);
        const [[{ total }]] = await db.query(countQuery, countParams);

        res.status(200).json({
            public_holidays: rows,
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
        res.status(500).json({ message: "Error fetching public holidays", error });
    }
});

// Get a single public holiday by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "SELECT * FROM public_holidays WHERE id = ?";
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Public holiday not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching public holiday", error });
    }
});

// Update a public holiday
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    const schema = Joi.object({
        holiday_date: Joi.date().optional(),
        name: Joi.string().max(255).optional(),
        description: Joi.string().optional(),
        country_code: Joi.string().max(5).optional(),
        year: Joi.number().integer().optional(),
        type: Joi.string().max(50).optional(),
        status: Joi.string().valid("Active", "In Active").optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    const updates = Object.entries(value)
        .map(([key, _]) => `${key} = ?`)
        .join(", ");
    const params = [...Object.values(value), id];

    try {
        const query = `UPDATE public_holidays SET ${updates}, date_added = CURRENT_TIMESTAMP WHERE id = ?`;
        const [result] = await db.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Public holiday not found" });
        }

        res.status(200).json({ message: "Public holiday updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating public holiday", error });
    }
});

// Delete a public holiday
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM public_holidays WHERE id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Public holiday not found" });
        }

        res.status(200).json({ message: "Public holiday deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting public holiday", error });
    }
});

module.exports = router;
