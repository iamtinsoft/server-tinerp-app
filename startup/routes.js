const express = require("express");
const error = require("../middleware/error");
const super_admins = require("../routes/super_administrators")
const modules = require("../routes/modules");
const plans = require("../routes/plans");
const conversation_replies = require("../routes/conversation_replies");
const conversations = require("../routes/conversations");
const departments = require("../routes/departments");
const designations = require("../routes/designations");
const employees = require("../routes/employees");
const holidays = require("../routes/holidays");
const leave_request_days = require("../routes/leave_request_days");
const leave_requests = require("../routes/leave_requests");
const leave_summary = require("../routes/leave_summary");
const leave_types = require("../routes/leave_types");
const notifications = require("../routes/notifications");
const plan_modules = require("../routes/plan_modules");
const programs = require("../routes/programs");
const subscriptions = require("../routes/subscriptions");
const tasks = require("../routes/tasks");
const tenants = require("../routes/tenants");

const tickets = require("../routes/tickets");
const ticket_logs = require("../routes/ticket_logs");
const ticket_comments = require("../routes/ticket_comments");
const ticket_attachments = require("../routes/ticket_attachments");

const transactions = require("../routes/transactions");
const invoices = require("../routes/invoices");
const timesheets = require("../routes/timesheets");
const timesheet_entries = require("../routes/timesheet_entries");
const avatarUploader = require("../routes/avatarUploader");
// const email = require("../routes/email");
// const upload = require("../routes/upload");
// const multiUploader = require("../routes/multiUploader");
// const auth = require("../routes/auth");

module.exports = function (app) {
  //console.log(socketIO)
  app.use(express.json());
  app.use("/api/super-admins", super_admins)
  app.use("/api/modules", modules);
  app.use("/api/plans", plans);
  app.use("/api/conversations-replies", conversation_replies);
  app.use("/api/conversations", conversations);
  app.use("/api/departments/", departments);
  app.use("/api/designations/", designations);
  app.use("/api/employees", employees);
  app.use("/api/holidays", holidays);
  app.use("/api/leave-request-days", leave_request_days);
  app.use("/api/leave-requests", leave_requests);
  app.use("/api/leave-summary", leave_summary);
  app.use("/api/leave-types", leave_types);
  app.use("/api/notifications", notifications);
  app.use("/api/plan-modules", plan_modules);
  app.use("/api/programs", programs);
  app.use("/api/subscriptions", subscriptions);
  app.use("/api/tasks", tasks);
  app.use("/api/tenants", tenants);

  app.use("/api/tickets", tickets);
  app.use("/api/ticket_logs", ticket_logs);
  app.use("/api/ticket_attachments", ticket_attachments);
  app.use("/api/ticket_comments", ticket_comments);

  app.use("/api/transactions", transactions);
  app.use("/api/invoices", invoices);
  app.use("/api/timesheets", timesheets);
  app.use("/api/timesheets-entries", timesheet_entries);
  app.use("/api/avatar-uploader", avatarUploader);
  // app.use("/api/auth", auth);


  // app.use("/api/leaves", leaves);


  // app.use("/api/messages", messages);
  // app.use("/api/email", email);
  // app.use("/api/events", events);
  // app.use("/api/notifications", notifications);
  // app.use("/api/upload", upload);
  // app.use("/api/multiUploader", multiUploader);
  app.use(error);

};
