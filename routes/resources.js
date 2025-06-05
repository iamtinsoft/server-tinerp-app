
const Joi = require("joi");
const express = require("express");
const router = express.Router();
const db = require("../startup/db")();
const auth = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = `uploads/${req.body.tenant_id || 'temp'}`;
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: function (req, file, cb) {
        // Define allowed file types
        const allowedTypes = {
            'image': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
            'video': ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
            'audio': ['.mp3', '.wav', '.flac', '.aac', '.ogg'],
            'document': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
            'other': [] // Allow any file type for 'other'
        };

        const ext = path.extname(file.originalname).toLowerCase();
        const fileType = req.body.file_type;

        if (fileType && fileType !== 'other' && allowedTypes[fileType]) {
            if (!allowedTypes[fileType].includes(ext)) {
                return cb(new Error(`Invalid file type for ${fileType}. Allowed: ${allowedTypes[fileType].join(', ')}`));
            }
        }

        cb(null, true);
    }
});

// Get all resources with pagination, sorting, and filtering
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        search,
        sortColumn = "uploaded_at",
        sortOrder = "DESC",
        file_type,
        entity_type,
        entity_id,
        tenant_id
    } = req.query;
    console.log(file_type)
    // if (file_type == "all") file_type = null;
    // Calculate offset for pagination
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = ["resource_id", "tenant_id", "file_name", "file_type", "file_size", "entity_type", "entity_id", "uploaded_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "uploaded_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT 
                r.*,
                e.email as uploader_email,
                e.first_name as uploader_first_name,
                e.last_name as uploader_last_name
            FROM 
                resources r
            LEFT JOIN 
                employees e ON r.entity_id = e.employee_id
             WHERE
                1=1
        `;
        //const queryParams = [tenant_id];
        const searchTerm = `%${search}%`;
        const queryParams = [];
        if (tenant_id) {
            query += ` AND r.tenant_id = ?`;
            queryParams.push(tenant_id);
        }
        // Add file_type filtering
        if (search) {
            query += ` AND r.file_name like ?`;
            queryParams.push(searchTerm);
        }
        if (file_type && file_type.length > 0) {
            query += ` AND r.file_type = ?`;
            queryParams.push(file_type);
        }

        // Add entity_type filtering
        if (entity_type) {
            query += ` AND r.entity_type = ?`;
            queryParams.push(entity_type);
        }

        // Add entity_id filtering
        if (entity_id) {
            query += ` AND r.entity_id = ?`;
            queryParams.push(entity_id);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        const [resources] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM resources r
            WHERE r.tenant_id = ?
        `;
        const countParams = [tenant_id];

        if (file_type) {
            countQuery += ` AND r.file_type = ?`;
            countParams.push(file_type);
        }
        if (entity_type) {
            countQuery += ` AND r.entity_type = ?`;
            countParams.push(entity_type);
        }
        if (entity_id) {
            countQuery += ` AND r.entity_id = ?`;
            countParams.push(entity_id);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Convert file sizes to human readable format
        const resourcesWithReadableSize = resources.map(resource => ({
            ...resource,
            file_size_readable: resource.file_size ? formatFileSize(resource.file_size) : null
        }));

        // Send response
        res.status(200).json({
            resources: resourcesWithReadableSize,
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
        res.status(500).json({ message: "Error fetching resources", error: error.message });
    }
});

// Get a resource by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id } = req.query;

    try {
        const [resources] = await db.query(`
            SELECT 
                r.*,
                e.email as uploader_email,
                e.first_name as uploader_first_name,
                e.last_name as uploader_last_name
            FROM 
                resources r
            LEFT JOIN 
                employees e ON r.entity_id = e.employee_id
            WHERE 
                r.resource_id = ? AND r.tenant_id = ?
        `, [id, tenant_id]);

        if (resources.length === 0) {
            return res.status(404).json({ message: "Resource not found" });
        }

        const resource = {
            ...resources[0],
            file_size_readable: resources[0].file_size ? formatFileSize(resources[0].file_size) : null
        };

        res.status(200).json(resource);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching resource", error: error.message });
    }
});

// Upload/Create a new resource
router.post("/", [auth, upload.single('file')], async (req, res) => {
    const { tenant_id, file_type, entity_type = 'Tenant Admin', entity_id, file_name } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    // Validate required fields
    const schema = Joi.object({
        tenant_id: Joi.number().min(1).required(),
        file_name: Joi.string().min(2).required(),
        file_type: Joi.string().valid('image', 'video', 'audio', 'document', 'other').required(),
        entity_type: Joi.string().valid('Super Admin', 'Tenant Admin').default('Tenant Admin'),
        entity_id: Joi.number().min(1).required()
    });

    const { error } = schema.validate(req.body);

    if (error) {
        // Delete uploaded file if validation fails
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Insert resource record
        const [result] = await db.query(
            `INSERT INTO resources (tenant_id, file_path, file_type, file_name, file_size, entity_type, entity_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                tenant_id,
                file.path,
                file_type,
                file_name,
                file.size,
                entity_type,
                entity_id
            ]
        );

        // Log activity (if you have an activity log system)
        // await db.query(
        //     `INSERT INTO activity_logs 
        //         (tenant_id, user_id, action, details) 
        //      VALUES (?, ?, ?, ?)`,
        //     [
        //         tenant_id,
        //         entity_id,
        //         'upload_resource',
        //         JSON.stringify({
        //             resource_id: result.insertId,
        //             file_name: file.originalname,
        //             file_type: file_type,
        //             file_size: file.size
        //         })
        //     ]
        // );

        res.status(201).json({
            message: "Resource uploaded successfully",
            resource_id: result.insertId,
            file_name: file.originalname,
            file_size: file.size,
            file_size_readable: formatFileSize(file.size)
        });
    } catch (error) {
        // Delete uploaded file if database operation fails
        fs.unlinkSync(file.path);
        console.error(error);
        res.status(500).json({ message: "Error uploading resource", error: error.message });
    }
});

// Update resource metadata (not the file itself)
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id, file_type, file_name, entity_type, entity_id } = req.body;

    // Validate required fields
    const schema = Joi.object({
        tenant_id: Joi.number().min(1).required(),
        file_type: Joi.string().valid('image', 'video', 'audio', 'document', 'other').required(),
        file_name: Joi.string().max(100).optional(),
        entity_type: Joi.string().valid('Super Admin', 'Tenant Admin').required(),
        entity_id: Joi.number().min(1).required()
    });

    const { error } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    try {
        // Check if resource exists
        const [resourceCheck] = await db.query(`
            SELECT * FROM resources 
            WHERE resource_id = ? AND tenant_id = ?
        `, [id, tenant_id]);

        if (resourceCheck.length === 0) {
            return res.status(404).json({ message: "Resource not found" });
        }

        // Check permissions (only allow author or admin to update)
        // if (resourceCheck[0].entity_id !== entity_id && !req.user.isAdmin) {
        //     return res.status(403).json({ message: "You can only update your own resources" });
        // }

        // Update resource metadata
        const [result] = await db.query(
            `UPDATE resources 
             SET file_type = ?, file_name = ?, entity_type = ?, entity_id = ?
             WHERE resource_id = ? AND tenant_id = ?`,
            [file_type, file_name || resourceCheck[0].file_name, entity_type, entity_id, id, tenant_id]
        );

        // Log activity
        // await db.query(
        //     `INSERT INTO activity_logs 
        //         (tenant_id, user_id, action, details) 
        //      VALUES (?, ?, ?, ?)`,
        //     [
        //         tenant_id,
        //         entity_id,
        //         'update_resource',
        //         JSON.stringify({
        //             resource_id: id,
        //             file_name: file_name || resourceCheck[0].file_name,
        //             file_type: file_type
        //         })
        //     ]
        // );

        res.status(200).json({ message: "Resource updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating resource", error: error.message });
    }
});

// Delete a resource
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;


    try {
        // Get resource details for verification and file cleanup
        const [resourceCheck] = await db.query(`
            SELECT * FROM resources 
            WHERE resource_id = ?
        `, [id]);

        if (resourceCheck.length === 0) {
            return res.status(404).json({ message: "Resource not found" });
        }

        // Check permissions (only allow author or admin to delete)
        // if (resourceCheck[0].entity_id !== req.user.user_id && !req.user.isAdmin) {
        //     return res.status(403).json({ message: "You can only delete your own resources" });
        // }

        // Delete the physical file
        const filePath = resourceCheck[0].file_path;
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete resource record from database
        const [result] = await db.query(
            `DELETE FROM resources WHERE resource_id = ?`,
            [id]
        );

        // Log activity
        // await db.query(
        //     `INSERT INTO activity_logs 
        //         (tenant_id, user_id, action, details) 
        //      VALUES (?, ?, ?, ?)`,
        //     [
        //         tenant_id,
        //         resourceCheck[0].entity_id,
        //         'delete_resource',
        //         JSON.stringify({
        //             resource_id: id,
        //             file_name: resourceCheck[0].file_name,
        //             file_type: resourceCheck[0].file_type
        //         })
        //     ]
        // );

        res.status(200).json({ message: "Resource deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting resource", error: error.message });
    }
});

// Download/Serve a resource file
router.get("/:id/download", [auth], async (req, res) => {
    const { id } = req.params;
    const { tenant_id } = req.query;

    try {
        // Get resource details
        const [resources] = await db.query(`
            SELECT * FROM resources 
            WHERE resource_id = ? AND tenant_id = ?
        `, [id, tenant_id]);

        if (resources.length === 0) {
            return res.status(404).json({ message: "Resource not found" });
        }

        const resource = resources[0];
        const filePath = resource.file_path;

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: "File not found on server" });
        }

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${resource.file_name}"`);
        res.setHeader('Content-Type', getContentType(resource.file_type));

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        // Log download activity
        // await db.query(
        //     `INSERT INTO activity_logs 
        //         (tenant_id, user_id, action, details) 
        //      VALUES (?, ?, ?, ?)`,
        //     [
        //         tenant_id,
        //         req.user.user_id,
        //         'download_resource',
        //         JSON.stringify({
        //             resource_id: id,
        //             file_name: resource.file_name
        //         })
        //     ]
        // );

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error downloading resource", error: error.message });
    }
});

// Utility function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Utility function to get content type
function getContentType(fileType) {
    const contentTypes = {
        'image': 'image/*',
        'video': 'video/*',
        'audio': 'audio/*',
        'document': 'application/octet-stream',
        'other': 'application/octet-stream'
    };
    return contentTypes[fileType] || 'application/octet-stream';
}

module.exports = router;