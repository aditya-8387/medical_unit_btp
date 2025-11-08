Institute Medical Center Management System
A comprehensive full-stack web application designed to digitalize operations for a university medical center. This system manages patient records, streamlines medicine inventory, and provides separate portals for students and medical staff.

 Features
Public Portal
Information Hub: Accessible pages for About Us, Medical Services, and latest Announcements.

Emergency Contacts: Quick access to ambulance and medical officer contact details.

Staff Directory: Detailed list of available doctors, specialists, and their visiting hours.

 Student Portal
Secure Login: Authentication using university Roll Number.

Personal Dashboard: View and update hostel/room details.

Medical History: Complete digital record of all past visits, diagnoses, and prescribed medications.

Digital Certificates: Download previously issued medical certificates directly as PDFs.

Emergency Action: One-click emergency call button.

 Medical Staff Portal
Patient Intake: Rapid data entry for new patient visits using Roll Numbers.

Smart Prescription System: Integrated medicine search with real-time stock visibility.

Inventory Management:

Auto-deduction of stock when medicines are prescribed.

Bulk update capability for restocking.

"Renew All" feature to reset stock to maximum levels.

Certificate Generation:

Generate official medical certificates with auto-filled patient data.

Digital Signature Pad: Doctors can sign certificates directly on-screen before issuance.

Certificates are saved as PDFs and linked to the patient's record.

🛠️ Tech Stack
Frontend: HTML5, CSS3, Vanilla JavaScript

Backend: Node.js, Express.js

Database: MySQL

Authentication: JSON Web Tokens (JWT) & bcrypt for password hashing

Key Libraries:

jspdf: For client-side PDF generation.

multer: For handling file uploads (certificates).

mysql2: For database connection pooling and transaction management.

Choices.js: For searchable medication dropdowns.

 Local Installation & Setup
Follow these steps to run the project locally.

Prerequisites
Node.js (v16 or higher recommended)

MySQL Server

1. Clone the Repository
Bash

git clone https://github.com/aditya-8387/medical_unit_btp.git
cd medical_unit_btp
2. Install Dependencies
Bash

npm install
3. Database Setup
Log in to your local MySQL server.

Create the database and user:

SQL

CREATE DATABASE medical_records;
-- Use a strong password for production
CREATE USER 'med_app_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON medical_records.* TO 'med_app_user'@'localhost';
FLUSH PRIVILEGES;
Import the schema from the provided SQL file (or run the CREATE TABLE commands found in the project documentation).

4. Environment Configuration
Create a .env file in the root directory and configure it with your credentials:

Ini, TOML

# Database Configuration
DB_HOST=localhost
DB_USER=med_app_user
DB_PASSWORD=your_password
DB_NAME=medical_records

# Server Configuration
PORT=3000
NODE_ENV=development

# Security Secrets (Use long random strings)
JWT_SECRET=your_jwt_secret_key
SESSION_SECRET=your_session_secret

# Storage
UPLOAD_DIR=public/uploads/certificates
MAX_FILE_SIZE=5242880
5. Start the Application
Bash

# For development with auto-restart
npm run dev

# OR standard start
node app.js
Access the application at http://localhost:3000.

 Project Structure
medical_unit_btp/
├── public/                 # Static files served by Express
│   ├── assets/             # Images and logos
│   ├── css/                # Stylesheets for all pages
│   ├── js/                 # Frontend JavaScript logic
│   ├── uploads/            # Storage for generated PDF certificates
│   └── *.html              # HTML views
├── app.js                  # Main application entry point & server logic
├── package.json            # Project dependencies
└── .env                    # Environment variables (not listed in repo)
 Security Notables
Transactions: Critical operations (like prescribing medicine) use SQL transactions to ensure inventory is only deducted if the patient record is successfully saved.

Password Hashing: User passwords are securely hashed using bcrypt.

Role-Based Access Control: Middleware ensures students cannot access staff API endpoints and vice-versa.

 Authors
Aditya Garg-22UCS006  
Dhruv Agrawal-22UCS235
Anirudh Daga-22UCC015
