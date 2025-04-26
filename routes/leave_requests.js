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
let moment = require('moment')
const created = moment().format('YYYY-MM-DD hh:mm:ss')
// Create a leave request
router.post("/", [auth], async (req, res) => {


    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });


    const { tenant_id, record_year, employee_id, leave_type_id, leave_dates, total_days = leave_dates.length, leave_reason, status = "Pending" } = req.body;

    if (!Array.isArray(leave_dates) || leave_dates.length === 0) {
        return res.status(400).json({ message: "Invalid leave_dates array." });
    }

    try {
        await db.beginTransaction(); // Start transaction

        // Validate if a duplicate leave request exists
        const checkLeaveRequestQuery = `
            SELECT * FROM leave_requests
            WHERE tenant_id = ? AND record_year = ? AND employee_id = ? 
            AND leave_type_id = ? AND leave_reason = ? AND total_days = ? AND status = ?
        `;
        const [existingLeaveRequest] = await db.query(checkLeaveRequestQuery, [
            tenant_id, record_year, employee_id, leave_type_id, leave_reason, total_days, status
        ]);

        if (existingLeaveRequest.length > 0) {
            await db.rollback();
            return res.status(400).json({ message: "A similar leave request already exists." });
        }

        // Insert into leave_requests table
        const insertLeaveRequestQuery = `
            INSERT INTO leave_requests (tenant_id, record_year, employee_id, leave_type_id, total_days, leave_reason, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [leaveRequestResult] = await db.execute(insertLeaveRequestQuery, [
            tenant_id, record_year, employee_id, leave_type_id, total_days, leave_reason, status
        ]);

        const leave_request_id = leaveRequestResult.insertId; // Get the inserted leave_request_id

        // Check for duplicate leave_request_days
        const placeholders = leave_dates.map(() => "(?, ?, ?,?, ?)").join(",");
        const values = [];
        leave_dates.forEach((leave_date) => {
            values.push(tenant_id, leave_request_id, employee_id, record_month = getMonthNameFromDate(leave_date), leave_date);
        });

        const checkLeaveRequestDayQuery = `
            SELECT leave_date FROM leave_request_days WHERE tenant_id = ? AND employee_id = ? AND leave_date IN (${leave_dates.map(() => "?").join(",")})
        `;
        const [existingLeaveRequestDays] = await db.query(checkLeaveRequestDayQuery, [
            tenant_id, employee_id, ...leave_dates
        ]);

        if (existingLeaveRequestDays.length > 0) {
            await db.rollback();
            return res.status(400).json({
                message: "Some leave dates already exist for this request.",
                existingDates: existingLeaveRequestDays.map((d) => d.leave_date),
            });
        }

        // Insert into leave_request_days table (bulk insert)
        const insertLeaveRequestDayQuery = `
            INSERT INTO leave_request_days (tenant_id, leave_request_id,employee_id, record_month, leave_date)
            VALUES ${placeholders}
        `;
        await db.execute(insertLeaveRequestDayQuery, values);

        await db.commit(); // Commit transaction

        res.status(201).json({
            message: "Leave request and leave request days created successfully",
            leave_request_id,
        });

    } catch (error) {
        await db.rollback(); // Rollback transaction in case of an error
        console.error(error);
        res.status(500).json({ message: "Error processing leave request", error });
    } finally {
        await db.end();
    }
});

// Get leave requests with pagination, search, and sorting
router.get("/", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["leave_request_id", "tenant_id", "record_year", "employee_id", "leave_type_id", "total_days", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT lr.*, lt.leave_name, e.first_name, e.last_name,e.avatar,t.tenant_name
            FROM leave_requests lr
            JOIN tenants t ON lr.tenant_id = t.tenant_id
            JOIN leave_types lt ON lr.leave_type_id = lt.leave_type_id
            JOIN employees e ON lr.employee_id = e.employee_id
            WHERE lr.tenant_id LIKE ? OR lr.record_year LIKE ? OR lt.leave_name LIKE ?
            OR e.first_name LIKE ? OR e.last_name LIKE ?
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM leave_requests lr
            JOIN leave_types lt ON lr.leave_type_id = lt.leave_type_id
            JOIN employees e ON lr.employee_id = e.employee_id
            WHERE lr.tenant_id LIKE ? OR lr.record_year LIKE ? OR lt.leave_name LIKE ?
            OR e.first_name LIKE ? OR e.last_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            leave_requests: rows,
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
        res.status(500).json({ message: "Error fetching leave requests", error });
    }
});

router.get("/employee/:id", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;
    const id = req.params.id;
    const allowedSortColumns = ["leave_request_id", "tenant_id", "record_year", "employee_id", "leave_type_id", "total_days", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT
    lr.*,
    lt.leave_name,
    e.first_name,
    e.last_name,
    e.avatar,
    t.tenant_name,
    (SELECT SUM(sub_lr.total_days)
     FROM leave_requests sub_lr
     WHERE sub_lr.employee_id = lr.employee_id) AS total_leaves,
     (SELECT SUM(sub_alr.total_days)
     FROM leave_requests sub_alr
     WHERE sub_alr.employee_id = lr.employee_id AND sub_alr.status="Approved") AS total_approved_leaves,

     (SELECT SUM(sub_alr.total_days)
     FROM leave_requests sub_alr
     WHERE sub_alr.employee_id = lr.employee_id AND sub_alr.status="Pending") AS total_pending_leaves,

     (SELECT SUM(sub_alr.total_days)
     FROM leave_requests sub_alr
     WHERE sub_alr.employee_id = lr.employee_id AND sub_alr.status="Rejected") AS total_rejected_leaves
FROM
    leave_requests lr
JOIN
    tenants t ON lr.tenant_id = t.tenant_id
JOIN
    leave_types lt ON lr.leave_type_id = lt.leave_type_id
JOIN
    employees e ON lr.employee_id = e.employee_id
WHERE
    lr.employee_id = ?
    AND (
        lr.tenant_id LIKE ?
        OR lr.record_year LIKE ?
        OR lt.leave_name LIKE ?
        OR e.first_name LIKE ?
        OR e.last_name LIKE ?
    )
ORDER BY
    ${column} ${order}
LIMIT ? OFFSET ?;
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM leave_requests lr
            JOIN leave_types lt ON lr.leave_type_id = lt.leave_type_id
            JOIN employees e ON lr.employee_id = e.employee_id
            WHERE lr.tenant_id LIKE ? OR lr.record_year LIKE ? OR lt.leave_name LIKE ?
            OR e.first_name LIKE ? OR e.last_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [id, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            leave_requests: rows,
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
        res.status(500).json({ message: "Error fetching leave requests", error });
    }
});

router.get("/supervisor/:id", [auth], async (req, res) => {
    const { page = 1, limit = 10, sortColumn = "created_at", sortOrder = "DESC", search = "", tenant = 0 } = req.query;
    const offset = (page - 1) * limit;
    const id = req.params.id;
    const allowedSortColumns = ["leave_request_id", "tenant_id", "record_year", "employee_id", "leave_type_id", "total_days", "status", "created_at", "updated_at"];
    const column = allowedSortColumns.includes(sortColumn) ? sortColumn : "created_at";
    const order = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    try {
        const query = `
            SELECT lr.*, lt.leave_name, e.first_name, e.last_name,e.avatar,t.tenant_name
            FROM leave_requests lr
            JOIN tenants t ON lr.tenant_id = t.tenant_id
            JOIN leave_types lt ON lr.leave_type_id = lt.leave_type_id
            JOIN employees e ON lr.employee_id = e.employee_id
            WHERE
    e.supervisor_id = ?
    AND (
        lr.tenant_id LIKE ?
        OR lr.record_year LIKE ?
        OR lt.leave_name LIKE ?
        OR e.first_name LIKE ?
        OR e.last_name LIKE ?
    )
            ORDER BY ${column} ${order}
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM leave_requests lr
            JOIN leave_types lt ON lr.leave_type_id = lt.leave_type_id
            JOIN employees e ON lr.employee_id = e.employee_id
            WHERE lr.tenant_id LIKE ? OR lr.record_year LIKE ? OR lt.leave_name LIKE ?
            OR e.first_name LIKE ? OR e.last_name LIKE ?
        `;

        const searchTerm = `%${search}%`;

        let [rows] = await db.query(query, [id, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
        rows = tenant > 0 ? rows.filter((d) => d.tenant_id == tenant) : rows
        res.status(200).json({
            leave_requests: rows,
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
        res.status(500).json({ message: "Error fetching leave requests", error });
    }
});

// Get a single leave request by ID
router.get("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT lr.*, lt.leave_name, e.first_name, e.last_name
            FROM leave_requests lr
            JOIN leave_types lt ON lr.leave_type_id = lt.leave_type_id
            JOIN employees e ON lr.employee_id = e.employee_id
            WHERE lr.leave_request_id = ?
        `;
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Leave request not found" });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching leave request", error });
    }
});

// Update a leave request
router.put("/approve/:id", [auth], async (req, res) => {
    // const { id } = req.params;
    // const { supervisor_comment, status } = req.body;

    // try {

    //     const query = `
    //         UPDATE leave_requests
    //         SET  supervisor_comment = ?, status = ?
    //         WHERE leave_request_id = ?
    //     `;
    //     const [result] = await db.execute(query, [
    //         supervisor_comment, status, id
    //     ]);

    //     if (result.affectedRows === 0) {
    //         return res.status(404).json({ message: "Leave request not found" });
    //     }

    //     res.status(200).json({ message: "Leave request updated successfully" });
    // } catch (error) {
    //     console.error(error);
    //     res.status(500).json({ message: "Error updating leave request", error });
    // }
    const db = await mysql.createConnection({
        host: db_host,
        user: db_user,
        password: db_password,
        database: db_database,
    });
    const { id: leave_request_id } = req.params;
    const {
        supervisor_comment,
        status,
        leave_summary_id,
        tenant_id,
        record_year,
        employee_id,
        leave_type_id,
        used_days,
        balance_days
    } = req.body;

    console.log(req.body)

    try {
        await db.beginTransaction();

        // 1. Update leave request
        const updateLeaveRequestQuery = `
        UPDATE leave_requests
        SET supervisor_comment = ?, status = ? ,approved_date =?
        WHERE leave_request_id = ?
    `;
        const [leaveRequestResult] = await db.execute(updateLeaveRequestQuery, [
            supervisor_comment,
            status,
            created,
            leave_request_id,
        ]);

        if (leaveRequestResult.affectedRows === 0) {
            await db.rollback();
            return res.status(404).json({ message: "Leave request not found" });
        }

        // 2. Update leave summary
        const updateLeaveSummaryQuery = `
        UPDATE leave_summary
        SET  used_days = ?, balance_days = ?
        WHERE leave_summary_id = ?
    `;
        const [leaveSummaryResult] = await db.execute(updateLeaveSummaryQuery, [
            used_days,
            balance_days,
            leave_summary_id,
        ]);

        if (leaveSummaryResult.affectedRows === 0) {
            await db.rollback();
            return res.status(404).json({ message: "Leave summary not found" });
        }

        await db.commit();

        res.status(200).json({ message: "Leave request and summary updated successfully" });

    } catch (error) {
        await db.rollback();
        console.error(error);
        res.status(500).json({ message: "Error updating leave request and summary", error });
    } finally {
        await db.end();
    }
});

// Update a leave request
router.put("/:id", [auth], async (req, res) => {
    const { id } = req.params;
    const { supervisor_comment, status } = req.body;

    try {

        const query = `
            UPDATE leave_requests
            SET  supervisor_comment = ?, status = ?
            WHERE leave_request_id = ?
        `;
        const [result] = await db.execute(query, [
            supervisor_comment, status, id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Leave request not found" });
        }

        res.status(200).json({ message: "Leave request updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating leave request", error });
    }
});

// Delete a leave request
router.delete("/:id", [auth], async (req, res) => {
    const { id } = req.params;

    try {
        const query = "DELETE FROM leave_requests WHERE leave_request_id = ?";
        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Leave request not found" });
        }

        res.status(200).json({ message: "Leave request deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting leave request", error });
    }
});
function getMonthNameFromDate(dateString, locale = "en-US") {
    const date = new Date(dateString); // Convert string to Date object

    if (isNaN(date.getTime())) {
        return "Invalid date"; // Handle invalid date input
    }

    return new Intl.DateTimeFormat(locale, { month: "long" }).format(date);
}
module.exports = router;