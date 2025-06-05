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
const bcrypt = require("bcryptjs");
const { generateAuthToken } = require("../helpers/token");
const { sendPasswordResetEmail, sendOtpEmail } = require("./../helpers/email");

router.post("/admin/auth", async (req, res) => {
    const currentDateTime = new Date();
    try {
        const [rows] = await db.execute("SELECT e.*,s.subscription_id,p.*,t.* FROM employees e JOIN tenants t ON e.tenant_id = t.tenant_id JOIN subscriptions s ON t.tenant_id = s.tenant_id JOIN plans p ON p.plan_id = s.plan_id  WHERE t.tenant_name=? AND e.email =? AND e.status = ? AND e.is_admin =?", [req.body.TenantAuthenticationIdentifier,
        req.body.AdminAuthenticationIdentifier,
            "Active",
            "True",]);
        if (rows.length === 0) return res.status(404).json({ error: "Wrong Credentials Supplied" });
        const token = generateAuthToken(rows[0]);
        let fullName = rows[0].first_name + " " + rows[0].last_name;
        let link = ""
        sendOtpEmail(req.body.AdminAuthenticationIdentifier, "OTP", req.body.otp, fullName, link);
        res.status(201).json({ message: "Admin Authenticated Successfully", token });
        //res.json({ token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }

});

router.post("/auth", async (req, res) => {
    //const { error } = validateUser(req.body);

    const currentDateTime = new Date();
    // if (error) return res.status(400).send(error.details[0].message);
    try {
        const [rows] = await db.execute("SELECT e.*,s.status AS subscription_status,s.subscription_id,p.*,t.* FROM employees e JOIN tenants t ON e.tenant_id = t.tenant_id JOIN subscriptions s ON t.tenant_id = s.tenant_id JOIN plans p ON p.plan_id = s.plan_id  WHERE t.tenant_name=? AND e.email =? AND e.status = ? ", [req.body.TenantAuthenticationIdentifier,
        req.body.email,
            "Active"]);
        if (rows.length === 0) return res.status(404).json({ error: "Employee / Tenant Combination not Found" });
        const user = rows[0];
        const validPassword = await bcrypt.compare(
            req.body.password,
            user.password
        );

        if (!validPassword) {
            return res
                .status(500).json({ error: "Invalid Credentials Supplied . Please Try again" });
        }

        const token = generateAuthToken(rows[0], req.body.keepLoggedIn);
        let fullName = rows[0].first_name + " " + rows[0].last_name;
        let link = ""
        //sendOtpEmail(req.body.SuperAdminAuthenticationIdentifier, "OTP", req.body.otp, fullName, link);
        res.status(201).json({ message: "Employee Authenticated Successfully", token });
        //res.json({ token });
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

// Create an employee
router.post("/", [auth], async (req, res) => {
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    const {
        tenant_id,
        employee_number,
        supervisor_id,
        avatar = null,
        first_name,
        last_name,
        designation_id,
        department_id,
        email,
        phone_number,
        hire_date,
        date_of_birth,
        gender, // Added gender field
        is_supervisor,
        is_admin,
        status = "Active",
        leave_summary = [], // array of leave summary objects
        record_year,
    } = req.body;

    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash("@Password123", salt);

    try {
        await db.beginTransaction();

        // 1. Check for existing employee
        const checkEmployeeQuery = `
        SELECT employee_id FROM employees
        WHERE tenant_id = ? AND (email = ? OR employee_number = ?)
    `;
        const [existingEmployee] = await db.query(checkEmployeeQuery, [
            tenant_id,
            email,
            employee_number,
        ]);

        if (existingEmployee.length > 0) {
            await db.rollback();
            return res.status(400).json({
                message: "Employee already exists with given email or employee number.",
            });
        }

        // 2. Insert employee
        const insertEmployeeQuery = `
        INSERT INTO employees (
            tenant_id, employee_number, supervisor_id, avatar, first_name, last_name,
            designation_id, department_id, email, password, phone_number,
            hire_date, date_of_birth, gender, is_supervisor, is_admin, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        const [employeeResult] = await db.execute(insertEmployeeQuery, [
            tenant_id,
            employee_number || null,
            supervisor_id,
            avatar || null,
            first_name || null,
            last_name || null,
            designation_id,
            department_id,
            email || null,
            password,
            phone_number || null,
            hire_date || null,
            date_of_birth || null,
            gender || null, // Added gender field
            is_supervisor || "False",
            is_admin || "False",
            status || "Active",
        ]);

        const employee_id = employeeResult.insertId;

        // 3. Process leave summary array
        for (const leave of leave_summary) {
            const {
                leave_type_id,
                used_days = 0,
                max_days,
                carry_forward_days,
                balance_days = Number(max_days + carry_forward_days),
            } = leave;

            // Check for duplicate leave entry
            const checkLeaveQuery = `
            SELECT 1 FROM leave_summary
            WHERE tenant_id = ? AND record_year = ? AND employee_id = ? AND leave_type_id = ?
        `;
            const [existingLeave] = await db.query(checkLeaveQuery, [
                tenant_id,
                record_year,
                employee_id,
                leave_type_id,
            ]);

            if (existingLeave.length > 0) {
                await db.rollback();
                return res.status(400).json({
                    message: `Leave summary already exists for year ${record_year} and leave type ${leave_type_id}.`,
                });
            }

            // Insert leave summary
            const insertLeaveQuery = `
            INSERT INTO leave_summary (
                tenant_id, record_year, employee_id, leave_type_id, used_days, balance_days
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;
            await db.execute(insertLeaveQuery, [
                tenant_id,
                record_year,
                employee_id,
                leave_type_id,
                used_days,
                balance_days,
            ]);
        }

        await db.commit();

        res.status(201).json({
            message: "Employee and leave summaries created successfully.",
            employee_id,
        });
    } catch (error) {
        await db.rollback();
        console.error(error);

        if (error.code === "ER_DUP_ENTRY") {
            res.status(400).json({ message: "Duplicate entry", error });
        } else {
            res.status(500).json({ message: "Transaction failed", error });
        }
    } finally {
        await db.end();
    }
});

// Get employees with pagination, sorting, and filtering by tenant_id
router.get("/", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "first_name",
        sortOrder = "ASC",
        search = "",
        tenant = 0,
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = [
        "employee_id", "first_name", "last_name", "email", "gender",
        "hire_date", "status", "created_at", "updated_at"
    ];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "first_name";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT e.*, d.department_name, ds.designation_name, t.tenant_name
            FROM employees e
            JOIN departments d ON e.department_id = d.department_id
            JOIN designations ds ON e.designation_id = ds.designation_id
            JOIN tenants t ON e.tenant_id = t.tenant_id
            WHERE 1=1
        `;
        const queryParams = [];

        // Add search filtering
        if (search) {
            query += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Add tenant filtering
        if (tenant > 0) {
            query += ` AND e.tenant_id = ?`;
            queryParams.push(tenant);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        let [rows] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM employees e
            WHERE 1=1
        `;
        const countParams = [];

        if (search) {
            countQuery += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (tenant > 0) {
            countQuery += ` AND e.tenant_id = ?`;
            countParams.push(tenant);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            employees: rows,
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
        res.status(500).json({ message: "Error fetching employees", error });
    }
});

// Get supervisors with pagination, sorting, and filtering by tenant_id 
router.get("/supervisors", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "first_name",
        sortOrder = "ASC",
        search = "",
        tenant = 0,
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = [
        "employee_id", "first_name", "last_name", "email", "gender",
        "hire_date", "status", "created_at", "updated_at"
    ];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "first_name";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT e.*, d.department_name, ds.designation_name, t.tenant_name
            FROM employees e
            JOIN departments d ON e.department_id = d.department_id
            JOIN designations ds ON e.designation_id = ds.designation_id
            JOIN tenants t ON e.tenant_id = t.tenant_id
            WHERE e.is_supervisor = ?
        `;
        const queryParams = ["True"];

        // Add search filtering
        if (search) {
            query += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Add tenant filtering
        if (tenant > 0) {
            query += ` AND e.tenant_id = ?`;
            queryParams.push(tenant);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        let [rows] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM employees e
            WHERE e.is_supervisor = ?
        `;
        const countParams = ["True"];

        if (search) {
            countQuery += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (tenant > 0) {
            countQuery += ` AND e.tenant_id = ?`;
            countParams.push(tenant);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            employees: rows,
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
        res.status(500).json({ message: "Error fetching supervisors", error });
    }
});

// Get administrators with pagination, sorting, and filtering by tenant_id
router.get("/administrators", [auth], async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortColumn = "first_name",
        sortOrder = "ASC",
        search = "",
        tenant = 0,
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sortColumn and sortOrder
    const allowedSortColumns = [
        "employee_id", "first_name", "last_name", "email", "gender",
        "hire_date", "status", "created_at", "updated_at"
    ];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "first_name";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        // Base query
        let query = `
            SELECT e.*, d.department_name, ds.designation_name, t.tenant_name
            FROM employees e
            JOIN departments d ON e.department_id = d.department_id
            JOIN designations ds ON e.designation_id = ds.designation_id
            JOIN tenants t ON e.tenant_id = t.tenant_id
            WHERE e.is_admin = ?
        `;
        const queryParams = ["True"];

        // Add search filtering
        if (search) {
            query += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Add tenant filtering
        if (tenant > 0) {
            query += ` AND e.tenant_id = ?`;
            queryParams.push(tenant);
        }

        // Add sorting and pagination
        query += ` ORDER BY ${column} ${order} LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute the main query
        let [rows] = await db.query(query, queryParams);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) AS total 
            FROM employees e
            WHERE e.is_admin = ?
        `;
        const countParams = ["True"];

        if (search) {
            countQuery += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (tenant > 0) {
            countQuery += ` AND e.tenant_id = ?`;
            countParams.push(tenant);
        }

        const [[{ total }]] = await db.query(countQuery, countParams);

        // Send response
        res.status(200).json({
            employees: rows,
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
        res.status(500).json({ message: "Error fetching administrators", error });
    }
});

// Get a single employee by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT e.*, d.department_name, ds.designation_name, t.tenant_name
            FROM employees e
            JOIN departments d ON e.department_id = d.department_id
            JOIN designations ds ON e.designation_id = ds.designation_id
            JOIN tenants t ON e.tenant_id = t.tenant_id
            WHERE e.employee_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching employee", error });
    }
});

// Update an employee
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    console.log(req.params);
    const {
        tenant_id,
        employee_number,
        supervisor_id,
        avatar = null,
        first_name,
        last_name,
        designation_id,
        department_id,
        email,
        password,
        phone_number,
        hire_date,
        date_of_birth,
        gender, // Added gender field
        is_supervisor,
        is_admin,
        status,
    } = req.body;

    try {
        const query = `
            UPDATE employees
            SET tenant_id = ?, employee_number = ?, supervisor_id = ?, avatar = ?, first_name = ?, 
                last_name = ?, designation_id = ?, department_id = ?, email = ?, 
                phone_number = ?, hire_date = ?, date_of_birth = ?, gender = ?, is_supervisor = ?, 
                is_admin = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = ?
        `;
        const [result] = await db.execute(query, [
            tenant_id,
            employee_number || null,
            supervisor_id,
            avatar || null,
            first_name || null,
            last_name || null,
            designation_id,
            department_id,
            email || null,
            phone_number || null,
            hire_date || null,
            date_of_birth || null,
            gender || null, // Added gender field
            is_supervisor || "False",
            is_admin || "False",
            status || "Active",
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.status(200).json({ message: "Employee updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating employee", error });
    }
});


router.put("/account-password/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const {
        password,
    } = req.body;

    try {
        const salt = await bcrypt.genSalt(10);
        let cryptedPassword = await bcrypt.hash(password, salt);
        const query = `
            UPDATE employees
            SET  password = ?, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = ?
        `;
        const [result] = await db.execute(query, [
            cryptedPassword,
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.status(200).json({ message: "Employee Password updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating employee", error });
    }
});

// Update an employee profile
router.put("/profile/:id", [auth], async (req, res) => {
    const { id } = req.params;
    console.log(req.params);
    const {
        tenant_id,
        employee_number,
        supervisor_id,
        avatar = null,
        first_name,
        last_name,
        designation_id,
        department_id,
        email,
        phone_number,
        hire_date,
        date_of_birth,
        gender, // Added gender field
        is_supervisor,
        is_admin,
        status,
    } = req.body;

    try {
        const query = `
            UPDATE employees
            SET tenant_id = ?, employee_number = ?, supervisor_id = ?, avatar = ?, first_name = ?, 
                last_name = ?, designation_id = ?, department_id = ?, email = ?, 
                phone_number = ?, hire_date = ?, date_of_birth = ?, gender = ?, is_supervisor = ?, 
                is_admin = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = ?
        `;
        const [result] = await db.execute(query, [
            tenant_id,
            employee_number || null,
            supervisor_id,
            avatar || null,
            first_name || null,
            last_name || null,
            designation_id,
            department_id,
            email || null,
            phone_number || null,
            hire_date || null,
            date_of_birth || null,
            gender || null, // Added gender field
            is_supervisor || "False",
            is_admin || "False",
            status || "Active",
            id,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }
        const [rows] = await db.execute("SELECT e.*,s.status AS subscription_status,s.subscription_id,p.*,t.* FROM employees e JOIN tenants t ON e.tenant_id = t.tenant_id JOIN subscriptions s ON t.tenant_id = s.tenant_id JOIN plans p ON p.plan_id = s.plan_id WHERE e.employee_id =? ", [id]);
        const token = generateAuthToken(rows[0]);
        res.status(201).json({ message: "Employee updated successfully", token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating employee", error });
    }
});

// Delete an employee
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM employees WHERE employee_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.status(200).json({ message: "Employee deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting employee", error });
    }
});

module.exports = router;