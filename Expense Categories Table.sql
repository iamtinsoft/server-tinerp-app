Expense Categories Table
sql
Copy
Edit
CREATE TABLE expense_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
Expenses Table
sql
Copy
Edit
CREATE TABLE expenses (
    expense_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    user_id INT NOT NULL,
    category_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    expense_date DATE NOT NULL,
    description TEXT,
    receipt_url VARCHAR(512),
    status ENUM('pending', 'approved', 'rejected', 'processed') DEFAULT 'pending',
    approved_by INT,
    processed_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES expense_categories(category_id),
    FOREIGN KEY (approved_by) REFERENCES users(user_id),
    FOREIGN KEY (processed_by) REFERENCES users(user_id)
);
Travel Requests Table
sql
Copy
Edit
CREATE TABLE travel_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    user_id INT NOT NULL,
    destination VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    purpose TEXT,
    budget DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
    approved_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (approved_by) REFERENCES users(user_id)
);
Travel Expenses Table
This links travel requests with related expenses for budget tracking.

sql
Copy
Edit
CREATE TABLE travel_expenses (
    travel_expense_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    travel_request_id INT NOT NULL,
    expense_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (travel_request_id) REFERENCES travel_requests(request_id),
    FOREIGN KEY (expense_id) REFERENCES expenses(expense_id)
);
Comments Table
(Optional for audit trails and communication between users for approvals.)

sql
Copy
Edit
CREATE TABLE comments (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    related_id INT NOT NULL,
    related_type ENUM('expense', 'travel_request'),
    user_id INT NOT NULL,
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
Workflow Overview
1. Expense Reimbursement:
Users submit expenses (expenses.status = 'pending').

Approvers review and approve/reject (expenses.status updated to approved/rejected).

Administrators process the approved expenses (status = 'processed').

2. Travel Planning:
Users submit travel requests (travel_requests.status = 'pending').

Approvers review requests and validate budgets.

Upon approval, expenses are linked via the travel_expenses table for real-time tracking.





Schema Design Overview
Multi-Tenant Structure:

Each tenant (organization) has isolated data.

Uses tenant_id for segregation.

Core Features:

Event creation (online, offline, or hybrid).

Attendee management (registration and tracking).

Zoom integration for online events.

Zoom Integration:

Links events to Zoom meetings via zoom_meeting_id and zoom_join_url.

Schema Definition
Tenants Table
Stores tenant-specific data to support multi-tenancy.

sql
Copy
Edit
CREATE TABLE tenants (
    tenant_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
Users Table
Defines users within a tenant, including roles (e.g., admin, organizer, attendee).

sql
Copy
Edit
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    role ENUM('admin', 'organizer', 'attendee') DEFAULT 'attendee',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
Event Categories Table
Allows categorization of events (e.g., webinar, workshop, conference).

sql
Copy
Edit
CREATE TABLE event_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
Events Table
Stores event information, including online/offline/hybrid details and Zoom integration.

sql
Copy
Edit
CREATE TABLE events (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    category_id INT NOT NULL,
    organizer_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location_type ENUM('online', 'offline', 'hybrid') NOT NULL,
    location_address TEXT, -- For offline or hybrid events
    zoom_meeting_id VARCHAR(255), -- Zoom Meeting ID for online/hybrid events
    zoom_join_url VARCHAR(512), -- Join URL for online/hybrid events
    zoom_start_url VARCHAR(512), -- Start URL for host (optional)
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    status ENUM('scheduled', 'ongoing', 'completed', 'cancelled') DEFAULT 'scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (category_id) REFERENCES event_categories(category_id),
    FOREIGN KEY (organizer_id) REFERENCES users(user_id)
);
Attendees Table
Tracks attendees registered for each event.

sql
Copy
Edit
CREATE TABLE attendees (
    attendee_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    status ENUM('registered', 'checked_in', 'cancelled') DEFAULT 'registered',
    check_in_time DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (event_id) REFERENCES events(event_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
Zoom Integration Table (Optional for Detailed Logs)
Tracks Zoom meeting details for online or hybrid events.

sql
Copy
Edit
CREATE TABLE zoom_meetings (
    zoom_meeting_id VARCHAR(255) PRIMARY KEY,
    event_id INT NOT NULL,
    tenant_id INT NOT NULL,
    host_email VARCHAR(255),
    start_time DATETIME NOT NULL,
    duration_minutes INT,
    meeting_url VARCHAR(512) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
Workflow Explanation
Event Creation:

An organizer creates an event in the events table.

If online or hybrid, they link a Zoom meeting using zoom_meeting_id and zoom_join_url.

Attendee Registration:

Users register for events via the attendees table.

Tracks attendance (status = 'checked_in').

Zoom Integration:

Store meeting details like zoom_meeting_id and URLs in events or zoom_meetings.

Use zoom_meetings for detailed integration logs (optional).

Event Tracking:

Use status fields (events and attendees) to manage event progress and attendee participation.




Schema Overview
Multi-Tenancy:

Use tenant_id to segregate data between organizations.

Shared schema for scalability.

Core Features:

Task Assignment: Tasks linked to projects, with deadlines, priorities, and assignees.

Progress Tracking: Monitor task and project statuses.

Collaborative Workspaces: Share documents, provide updates, and facilitate discussions.

Schema Definition
Tenants Table
Defines organizations using the system.

sql
Copy
Edit
CREATE TABLE tenants (
    tenant_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
Users Table
Defines users belonging to tenants, with roles (e.g., admin, member).

sql
Copy
Edit
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    role ENUM('admin', 'member') DEFAULT 'member',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
Projects Table
Stores project information, linking them to tenants.

sql
Copy
Edit
CREATE TABLE projects (
    project_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('not_started', 'in_progress', 'completed', 'archived') DEFAULT 'not_started',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
Tasks Table
Tracks tasks within projects, including assignments, deadlines, and priorities.

sql
Copy
Edit
CREATE TABLE tasks (
    task_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    project_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to INT, -- User assigned to the task
    priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    deadline DATE NOT NULL,
    status ENUM('not_started', 'in_progress', 'completed', 'blocked') DEFAULT 'not_started',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (assigned_to) REFERENCES users(user_id)
);
Documents Table
Allows users to share documents linked to projects or tasks.

sql
Copy
Edit
CREATE TABLE documents (
    document_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    related_id INT NOT NULL, -- Either project_id or task_id
    related_type ENUM('project', 'task') NOT NULL,
    uploaded_by INT NOT NULL,
    file_url VARCHAR(512) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);
Comments Table
Facilitates discussions and updates on tasks or projects.

sql
Copy
Edit
CREATE TABLE comments (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    related_id INT NOT NULL, -- Either project_id or task_id
    related_type ENUM('project', 'task') NOT NULL,
    user_id INT NOT NULL,
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
Activity Logs Table
Tracks actions taken on tasks or projects for auditing.

sql
Copy
Edit
CREATE TABLE activity_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    related_id INT NOT NULL, -- Either project_id or task_id
    related_type ENUM('project', 'task') NOT NULL,
    user_id INT NOT NULL,
    action VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
Workflow Description
Task Assignment:

Projects are created in the projects table.

Tasks are linked to projects and assigned to users via the tasks table.

Tasks are prioritized and have deadlines and statuses.

Progress Tracking:

Projects and tasks update their status fields as work progresses.

The activity_logs table records all updates for transparency.

Collaborative Workspaces:

Users upload files to the documents table.

Discussions happen in the comments table linked to tasks or projects.



Schema Overview
Multi-Tenancy:

Isolate data for different tenants using tenant_id.

Features:

Resource Library: Centralized repository of documents, videos, and manuals.

Categorization: Organize resources by type, category, and tags.

Access Control: Restrict access by roles or users.

Schema Definition
Tenants Table
Defines organizations using the system.

sql
Copy
Edit
CREATE TABLE tenants (
    tenant_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
Users Table
Defines users belonging to tenants, with roles (e.g., admin, trainer, member).

sql
Copy
Edit
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    role ENUM('admin', 'trainer', 'member') DEFAULT 'member',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
Categories Table
Organizes resources into hierarchical categories (e.g., "Guides" -> "Technical Manuals").

sql
Copy
Edit
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    parent_id INT DEFAULT NULL, -- Self-referencing for subcategories
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (parent_id) REFERENCES categories(category_id)
);
Resources Table
Stores information about resources, including type, category, and access levels.

sql
Copy
Edit
CREATE TABLE resources (
    resource_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    category_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type ENUM('manual', 'guide', 'video') NOT NULL,
    file_url VARCHAR(512) NOT NULL, -- URL or path to the resource
    created_by INT NOT NULL, -- User who uploaded the resource
    access_level ENUM('public', 'restricted') DEFAULT 'public', -- Access restriction
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);
Tags Table
Allows tagging of resources for better search and filtering.

sql
Copy
Edit
CREATE TABLE tags (
    tag_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
Resource Tags Table
Many-to-many relationship between resources and tags.

sql
Copy
Edit
CREATE TABLE resource_tags (
    resource_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (resource_id, tag_id),
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id),
    FOREIGN KEY (tag_id) REFERENCES tags(tag_id)
);
Access Logs Table
Tracks user access to resources for auditing purposes.

sql
Copy
Edit
CREATE TABLE access_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    resource_id INT NOT NULL,
    user_id INT NOT NULL,
    access_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
Workflow Explanation
Resource Library:

Resources are categorized using the categories table (e.g., "Manuals," "Videos").

Each resource is stored in the resources table, with metadata like type and access level.

Tags for Search and Filtering:

Tags (stored in the tags table) are associated with resources via the resource_tags table.

Users can filter or search for resources by tags.

Access Control:

access_level in the resources table restricts access to certain roles or users.

Access to resources is logged in the access_logs table.

Multi-Tenancy:

Data is isolated by tenant_id.

Each tenant can manage its own users, categories, and resources.

