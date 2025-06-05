const express = require("express");
const router = express.Router();
const Joi = require("joi");
const bcrypt = require("bcryptjs");
const reader = require("xlsx");
const mysql = require("mysql2/promise");
const config = require("config");
const multiupload = require("../middleware/multi-multer");
const auth = require("../middleware/auth");
const { generateAuthToken } = require("../helpers/token");
const { sendPasswordResetEmail, sendOtpEmail } = require("../helpers/email");

// Database Configuration
const dbConfig = {
    host: config.get("db_host"),
    user: config.get("db_user"),
    password: config.get("db_password"),
    database: config.get("db_database"),
};

// Endpoint to handle single file upload and employee processing
router.post("/single", multiupload.single("myFile"), async (req, res) => {
    const file = req.file;
    const leaveSummary = req.body.leave_summary;
    if (!file) {
        return res.status(400).send("No file uploaded.");
    }
    const leaveSummaryArray = JSON.parse(leaveSummary);
    try {
        await ProcessEmployees(file.path, req, res, leaveSummaryArray);
        return res.status(200).send("File processed successfully.");
    } catch (error) {
        console.error("Error processing file:", error);
        return res.status(500).send("An error occurred while processing the file.");
    }
});

// Function to process employees from an Excel file
async function ProcessEmployees(filePath, req, res, leave_summary) {

    try {
        const workbook = reader.readFile(filePath, {
            type: "binary",
            cellDates: true,
            cellNF: false,
            cellText: false,
        });

        const sheets = workbook.SheetNames;

        for (const sheetName of sheets) {
            const sheetData = reader.utils.sheet_to_json(workbook.Sheets[sheetName]);

            for (const record of sheetData) {
                const processedData = transformEmployeeData(record);
                await bulkDBInsert(processedData, req, res, leave_summary);
            }
        }

        console.log("Employees processed successfully.");
    } catch (error) {
        console.error("Error processing employees:", error);
        throw new Error("Failed to process employees.");
    }
}

// Helper to transform raw Excel data into the expected format
function transformEmployeeData(record) {
    const {
        tenant_id,
        employee_number,
        supervisor_id,
        first_name,
        last_name,
        designation_id = 1,
        department_id = 1,
        email,
        phone_number,
        hire_date,
        date_of_birth,
        is_supervisor = false,
        is_admin = false,
    } = record;

    return {
        tenant_id,
        employee_number,
        supervisor_id,
        first_name,
        last_name,
        designation_id,
        department_id,
        email,
        phone_number,
        hire_date,
        date_of_birth,
        is_supervisor,
        is_admin,
        record_year: new Date().getFullYear(),
    };
}

// Function to insert employee data into the database
async function bulkDBInsert(data, req, res, leave_summary) {

    const db = await mysql.createConnection(dbConfig);

    try {
        await db.beginTransaction();

        const { tenant_id, employee_number, email, record_year } = data;

        // Check for existing employee
        const checkEmployeeQuery = `
            SELECT employee_id FROM employees
            WHERE tenant_id = ? AND (email = ? OR employee_number = ?)
        `;
        const [existingEmployee] = await db.query(checkEmployeeQuery, [tenant_id, email, employee_number]);

        if (existingEmployee.length > 0) {
            throw new Error("Employee already exists with the given email or employee number.");
        }

        // Insert employee
        const insertEmployeeQuery = `
            INSERT INTO employees (
                tenant_id, employee_number, supervisor_id, avatar, first_name, last_name,
                designation_id, department_id, email, password, phone_number,
                hire_date, date_of_birth, is_supervisor, is_admin, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const password = await bcrypt.hash("@Password123", 10);
        const employeeData = [
            data.tenant_id,
            data.employee_number || null,
            data.supervisor_id,
            data.avatar || null,
            data.first_name || null,
            data.last_name || null,
            data.designation_id,
            data.department_id,
            data.email || null,
            password,
            data.phone_number || null,
            data.hire_date || null,
            data.date_of_birth || null,
            data.is_supervisor ? "True" : "False",
            data.is_admin ? "True" : "False",
            "Active",
        ];
        const [employeeResult] = await db.execute(insertEmployeeQuery, employeeData);
        const employee_id = employeeResult.insertId;

        // Insert leave summaries
        if (leave_summary) {
            for (let index = 0; index < leave_summary.length; index++) {
                const leave = leave_summary[index];
                await insertLeaveSummary(db, tenant_id, record_year, employee_id, leave);
            }

        }

        await db.commit();
        console.log(`Employee with ID ${employee_id} created successfully.`);
    } catch (error) {
        await db.rollback();
        console.error("Error during employee insertion:", error);
        throw error;
    } finally {
        await db.end();
    }
}

// Helper to insert leave summary for an employee
async function insertLeaveSummary(db, tenant_id, record_year, employee_id, leave) {
    const { leave_type_id, used_days = 0, max_days = 0, carry_forward_days = 0, carried_over_days = 0 } = leave;
    const balance_days = max_days + carried_over_days - used_days;
    const checkLeaveQuery = `
        SELECT 1 FROM leave_summary
        WHERE tenant_id = ? AND record_year = ? AND employee_id = ? AND leave_type_id = ?
    `;
    const [existingLeave] = await db.query(checkLeaveQuery, [tenant_id, record_year, employee_id, leave_type_id]);

    if (existingLeave.length > 0) {
        throw new Error(`Leave summary already exists for year ${record_year} and leave type ${leave_type_id}.`);
    }

    const insertLeaveQuery = `
        INSERT INTO leave_summary (tenant_id, record_year, employee_id, leave_type_id, used_days, balance_days,carried_over_days)
        VALUES (?, ?, ?, ?, ?, ?,?)
    `;
    await db.execute(insertLeaveQuery, [tenant_id, record_year, employee_id, leave_type_id, used_days, balance_days, carried_over_days]);
}

module.exports = router;
