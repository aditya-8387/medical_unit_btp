const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs'); // Make sure bcrypt is imported
const cors = require('cors');
const { body, validationResult } = require('express-validator');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// --- File Upload Configuration ---
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads', 'certificates');
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (mkdirError) {
        console.error(`Error creating upload directory ${uploadDir}:`, mkdirError);
    }
}
const staticCertPath = path.relative(path.join(__dirname, 'public'), uploadDir).replace(/\\/g, '/');
app.use(`/${staticCertPath}`, express.static(uploadDir));

// --- Database Connection Pool ---
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medical_records',
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig).promise();

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to DB pool:', err);
        process.exit(1);
    }
    console.log('DB pool connected successfully.');
    if (connection) connection.release();
});

// --- Multer Setup ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        // Use patient_id from authenticated user or form body
        const patientId = req.user?.id || req.body.patient_id || 'unknown';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeId = patientId.replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `cert-${safeId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
    }
    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here', (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Forbidden: Invalid token.' });
        }
        req.user = user; // Attaches { id, name, role, sub_role? } to req
        next();
    });
};

// --- [NEW] Admin-Only Middleware ---
const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden: Admin access required.' });
    }
    next();
};


// --- ROUTES ---

// Homepage Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about_us.html'));
});

// --- Authentication Route ---

app.post('/login', async (req, res) => {
    // 'roll_no' from form now holds either roll_no or emp_code
    const { roll_no: userId, password, role } = req.body;
    
    if (!userId || !password || !role) {
        return res.status(400).json({ success: false, error: 'Missing fields.' });
    }

    let user = null;
    let tableName = '';
    let idColumn = '';
    let nameColumn = 'name';

    // 1. Determine which table to query based on the role
    switch (role) {
        case 'student':
            tableName = 'student';
            idColumn = 'roll_no';
            break;
        case 'employee':
            tableName = 'employee';
            idColumn = 'emp_code';
            break;
        case 'medical-staff':
            tableName = 'medical_staff';
            idColumn = 'emp_code';
            break;
        case 'admin':
            tableName = 'admin';
            idColumn = 'emp_code';
            break;
        default:
            return res.status(400).json({ success: false, error: 'Invalid role.' });
    }

    try {
        // 2. Find the user in the correct table
        const [users] = await pool.query(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`, [userId]);
        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'User not found.' });
        }
        user = users[0];

        // 3. Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Invalid credentials.' });
        }

        // 4. Create Token Payload
        const tokenPayload = {
            id: user[idColumn], // The user's actual ID (roll_no or emp_code)
            role: role,         // The high-level role (student, employee, etc.)
            name: user[nameColumn]
        };

        // Add sub-role for medical staff (doctor/nurse)
        if (role === 'medical-staff' && user.role) {
            tokenPayload.sub_role = user.role;
        }

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

        // 5. Send Response
        // We include all possible profile data to simplify frontend logic
       res.json({
            success: true,
            token,
            role: role,
            name: user[nameColumn],

            // --- ADD THIS LINE ---
            sub_role: tokenPayload.sub_role || null,
            // ---------------------

            // Student-specific fields
            hostel_no: user.hostel_no || null,
            room_no: user.room_no || null,
            // Employee-specific fields
            designation: user.designation || null,
            department: user.department || null
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});
// --- [NEW] STUDENT ACCOUNT ACTIVATION ROUTE ---
// This route is called by register.html
// It allows a student to set their password for the first time.


app.post('/register/student', [
    // Validation
    body('roll_no').notEmpty().trim().escape(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    const { roll_no, password } = req.body;

    try {
        // 1. Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. Update the student's password ONLY IF it is currently empty or NULL
        // This prevents someone from hijacking an already-active account.
        const [result] = await pool.query(
            'UPDATE student SET password = ? WHERE roll_no = ? AND (password IS NULL OR password = "")',
            [hashedPassword, roll_no]
        );

        // 3. Check if the update worked
        if (result.affectedRows === 1) {
            // Success
            res.json({ success: true, message: 'Account activated successfully!' });
        } else {
            // This means the roll_no was not found, or the account was already active
            res.status(404).json({ success: false, error: 'Student not found or account is already active.' });
        }

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// --- Medical Staff Routes ---

// --- Medical Staff Routes ---

/**
 * [NEW] Finds a patient's name from either student or employee table.
 * Used by medical staff dashboard.
 */
app.get('/api/patient-lookup/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'medical-staff' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    
    const patientId = req.params.id;
    
    try {
        // Query both tables and combine results
        const query = `
            (SELECT roll_no as id, name FROM student WHERE roll_no = ?)
            UNION
            (SELECT emp_code as id, name FROM employee WHERE emp_code = ?)
        `;
        const [results] = await pool.query(query, [patientId, patientId]);
        
        if (results.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }
        res.json({ success: true, name: results[0].name });
        
    } catch (error) {
        console.error(`Error fetching patient data ${patientId}:`, error);
        res.status(500).json({ success: false, error: 'Server error fetching patient data.' });
    }
});

/**
 * [MODIFIED] Creates a new medical record for a patient (student or employee).
 */
app.post('/medical/staff/record', authenticateToken, async (req, res) => {
    if (req.user.role !== 'medical-staff' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }

    // Renamed 'roll_no' to 'patient_id'
    const { patient_id, diagnosis, remarks, medications } = req.body;
    if (!patient_id || !diagnosis) {
        return res.status(400).json({ success: false, error: 'Missing required fields (patient_id, diagnosis).' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Use patient_id
        const [patientResult] = await connection.query(
            'INSERT INTO patient_data (patient_id, diagnosis, remarks, created_at) VALUES (?, ?, ?, NOW())',
            [patient_id, diagnosis, remarks || null]
        );
        const patientDataId = patientResult.insertId;

        if (medications && medications.length > 0) {
            for (const med of medications) {
                await connection.query(
                    'INSERT INTO dispensed_medicines (patient_data_id, medicine_name, quantity) VALUES (?, ?, ?)',
                    [patientDataId, med.name, med.qty]
                );
                const [inventoryResult] = await connection.query(
                    'UPDATE inventory SET stock = stock - ? WHERE medicine = ? AND stock >= ?',
                    [med.qty, med.name, med.qty]
                );
                if (inventoryResult.affectedRows === 0) {
                    throw new Error(`Not enough stock for ${med.name}.`);
                }
            }
        }
        await connection.commit();
        res.status(201).json({ success: true, message: 'Record saved successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error submitting medical record:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * [MODIFIED] Gets daily records, joining with both student and employee tables.
 */
app.get('/medical/staff/records', authenticateToken, async (req, res) => {
     if (req.user.role !== 'medical-staff' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    try {
        let targetDate = req.query.date;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!targetDate || !dateRegex.test(targetDate)) {
            targetDate = new Date().toISOString().slice(0, 10);
        }

        // Use COALESCE to get the name from whichever table (student or employee) is not null
        const query = `
            SELECT
                p.id AS recordId,
                COALESCE(s.name, e.name) AS name,
                p.patient_id,
                p.diagnosis,
                p.remarks,
                p.created_at,
                GROUP_CONCAT(CONCAT(dm.medicine_name, ' (Qty: ', dm.quantity, ')') SEPARATOR '; ') AS medications,
                MAX(CASE WHEN c.serial_no IS NOT NULL THEN TRUE ELSE FALSE END) AS hasCertificate
            FROM patient_data p
            LEFT JOIN student s ON p.patient_id = s.roll_no
            LEFT JOIN employee e ON p.patient_id = e.emp_code
            LEFT JOIN dispensed_medicines dm ON p.id = dm.patient_data_id
            LEFT JOIN certificates c ON c.patient_data_id = p.id
            WHERE DATE(p.created_at) = ?
            GROUP BY p.id, name
            ORDER BY p.created_at DESC;
        `;
        const [results] = await pool.query(query, [targetDate]);
        
        const finalResults = results.map(record => ({
            ...record,
            hasCertificate: Boolean(record.hasCertificate)
        }));

        res.json({ success: true, data: finalResults });
    } catch (error) {
        console.error('Error fetching staff records:', error);
        res.status(500).json({ success: false, error: 'Server error fetching records.' });
    }
});

/**
 * [MODIFIED] Saves a generated certificate.
 */
app.post('/generate-and-save-certificate', authenticateToken, upload.single('pdf'), async (req, res) => {
    if (req.user.role !== 'medical-staff' && req.user.role !== 'admin') {
       if (req.file) fs.unlink(req.file.path, (err) => { if (err) console.error("Error deleting temp file:", err); });
       return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'PDF file is required.' });
    }

    // 'patient_id' is no longer in the form, it's part of the recordId logic.
    const { age, gender, relaxations, serialNo, recordId } = req.body;
    const filename = req.file.filename;

    if (!age || !gender || !serialNo || !filename || !recordId) {
         fs.unlink(req.file.path, (err) => { if (err) console.error("Error deleting file after validation fail:", err); });
        return res.status(400).json({ success: false, error: 'Missing required fields.' });
    }
    try {
        const query = `
            INSERT INTO certificates
            (serial_no, patient_data_id, age, gender, relaxations, file_path)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await pool.query(query,
            [serialNo, recordId, age, gender, relaxations || null, filename]
        );
        res.status(201).json({ success: true, message: 'Certificate saved successfully.' });
    } catch (error) {
        console.error('Error saving certificate to database:', error);
        fs.unlink(req.file.path, (err) => { if (err) console.error(`Error deleting orphaned file ${filename} after DB error:`, err); });
        if (error.code === 'ER_DUP_ENTRY') {
             return res.status(409).json({ success: false, error: 'Conflict: A certificate with this serial number already exists.' });
        }
        res.status(500).json({ success: false, error: 'Server error saving certificate.' });
    }
});


// --- Patient (Student/Employee) Routes ---

/**
 * [NEW] Generic endpoint for a user to get their *own* medical records.
 */
app.get('/api/my-records', authenticateToken, async (req, res) => {
    const patientId = req.user.id; // Get ID from token
    if (!patientId) {
        return res.status(403).json({ success: false, error: 'Forbidden: Invalid token.' });
    }

    try {
        const query = `
            SELECT
                p.id,
                DATE(p.created_at) AS date,
                p.diagnosis,
                p.remarks,
                GROUP_CONCAT(CONCAT(dm.medicine_name, ' (Qty: ', dm.quantity, ')') SEPARATOR '; ') AS medications,
                c.file_path AS certificate_file_path
            FROM patient_data p
            LEFT JOIN dispensed_medicines dm ON p.id = dm.patient_data_id
            LEFT JOIN certificates c ON c.patient_data_id = p.id
            WHERE p.patient_id = ?
            GROUP BY p.id, c.file_path
            ORDER BY p.created_at DESC;
        `;
        const [results] = await pool.query(query, [patientId]);
        const formattedResults = results.map(record => ({
            ...record,
            certificate_download_path: record.certificate_file_path ? `/${staticCertPath}/${record.certificate_file_path}` : null
        }));
        res.json({ success: true, data: formattedResults });
    } catch (error) {
        console.error(`Error fetching medical records for ${patientId}:`, error);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

/**
 * [NEW] Generic endpoint for a user to update their *own* profile.
 * Replaces the old '/student/hostel-details'
 */
app.put('/api/profile/update', authenticateToken, 
    [
        // Validation rules
        body('hostel_no').optional({ nullable: true }).trim().isLength({ max: 50 }).escape(),
        body('room_no').optional({ nullable: true }).trim().isLength({ max: 50 }).escape(),
        body('designation').optional({ nullable: true }).trim().isLength({ max: 50 }).escape(),
        body('department').optional({ nullable: true }).trim().isLength({ max: 50 }).escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const userId = req.user.id;
        const userRole = req.user.role;
        const { hostel_no, room_no, designation, department } = req.body;

        let query = '';
        let params = [];

        try {
            if (userRole === 'student') {
                const finalHostelNo = (hostel_no !== undefined && hostel_no !== '') ? hostel_no : null;
                const finalRoomNo = (room_no !== undefined && room_no !== '') ? room_no : null;
                query = 'UPDATE student SET hostel_no = ?, room_no = ? WHERE roll_no = ?';
                params = [finalHostelNo, finalRoomNo, userId];

            } else if (userRole === 'employee') {
                const finalDesignation = (designation !== undefined && designation !== '') ? designation : null;
                const finalDepartment = (department !== undefined && department !== '') ? department : null;
                query = 'UPDATE employee SET designation = ?, department = ? WHERE emp_code = ?';
                params = [finalDesignation, finalDepartment, userId];
            
            } else {
                return res.status(403).json({ success: false, error: 'Forbidden: Role cannot update profile.' });
            }

            const [result] = await pool.query(query, params);
            if (result.affectedRows === 1) {
                res.json({ success: true, message: 'Profile details updated successfully.' });
            } else {
                res.status(404).json({ success: false, error: 'User not found or update failed.' });
            }
        } catch (error) {
            console.error(`Error updating profile for ${userRole} ${userId}:`, error);
            res.status(500).json({ success: false, error: 'Server error updating details.' });
        }
    }
);


// --- Inventory API Routes (Unchanged) ---

app.get('/api/inventory', authenticateToken, async (req, res) => {
    if (req.user.role !== 'medical-staff' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    try {
        const [medicines] = await pool.query('SELECT medicine, stock FROM inventory ORDER BY medicine ASC');
        res.json({ success: true, data: medicines });
    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

app.get('/api/inventory/manage', authenticateToken, async (req, res) => {
     if (req.user.role !== 'medical-staff' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    try {
        const [inventory] = await pool.query('SELECT medicine AS id, medicine, stock, max_stock FROM inventory ORDER BY medicine ASC');
        res.json({ success: true, data: inventory });
    } catch (error) {
        console.error("Error fetching inventory for management:", error);
        res.status(500).json({ success: false, error: 'Server error fetching inventory.' });
    }
});

app.put('/api/inventory/update-all', authenticateToken,
    [
        body('updates').isArray().withMessage('Updates must be an array.'),
        body('updates.*.medicine').isString().notEmpty().withMessage('Medicine name is required.'),
        body('updates.*.stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, error: errors.array()[0].msg });
        }
        if (req.user.role !== 'medical-staff' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Forbidden.' });
        }

        const { updates } = req.body;
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();
            for (const item of updates) {
                await connection.query(
                    'UPDATE inventory SET stock = ? WHERE medicine = ?',
                    [item.stock, item.medicine]
                );
            }
            await connection.commit();
            res.json({ success: true, message: 'Inventory updated successfully.' });
        } catch (error) {
            await connection.rollback();
            console.error("Error updating bulk inventory:", error);
            res.status(500).json({ success: false, error: 'Server error during bulk update.' });
        } finally {
            connection.release();
        }
    }
);

app.post('/api/inventory/renew', authenticateToken, async (req, res) => {
     if (req.user.role !== 'medical-staff' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    try {
        await pool.query('UPDATE inventory SET stock = max_stock');
        res.json({ success: true, message: 'All stock renewed successfully.' });
    } catch (error) {
        console.error("Error renewing inventory stock:", error);
        res.status(500).json({ success: false, error: 'Server error renewing stock.' });
    }
});


// --- [NEW] Admin User Management Routes ---
// [NEW] SEARCH for users (Protected)
app.get('/api/admin/search', authenticateToken, isAdmin, async (req, res) => {
    const { term } = req.query;
    if (!term) {
        // Return an empty array if there's no search term
        return res.json([]); 
    }

    // Use '%' for partial matching in the LIKE clause
    const searchTerm = `%${term}%`; 

    try {
        // This query unions results from students, employees, and medical_staff
        // It searches by both ID (roll_no/emp_code) and name
        const query = `
            (SELECT 
                roll_no, 
                null as emp_code, 
                name, 
                'student' as role, 
                hostel_no, 
                null as designation, 
                null as department
            FROM student
            WHERE roll_no LIKE ? OR name LIKE ?)
            
            UNION
            
            (SELECT 
                null as roll_no, 
                emp_code, 
                name, 
                'employee' as role, 
                null as hostel_no, 
                designation, 
                department
            FROM employee
            WHERE emp_code LIKE ? OR name LIKE ?)
            
            UNION
            
            (SELECT 
                null as roll_no, 
                emp_code, 
                name, 
                role, 
                null as hostel_no, 
                null as designation, 
                null as department
            FROM medical_staff
            WHERE emp_code LIKE ? OR name LIKE ?);
        `;
        
        // Pass the search term for each part of the UNION query
        const [results] = await pool.query(query, [
            searchTerm, searchTerm, 
            searchTerm, searchTerm, 
            searchTerm, searchTerm
        ]);
        
        // Send the results array directly, as admin.js expects
        res.json(results); 

    } catch (error) {
        console.error('Admin search error:', error);
        // On error, send a 500 status and an error message
        res.status(500).json({ error: 'Server error during search.' }); 
    }
});

// GET all users (Protected)
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const [students] = await pool.query('SELECT roll_no, name FROM student ORDER BY name');
        const [employees] = await pool.query('SELECT emp_code, name, department FROM employee ORDER BY name');
        const [staff] = await pool.query('SELECT emp_code, name, role FROM medical_staff ORDER BY name');
        const [admins] = await pool.query('SELECT emp_code, name FROM admin ORDER BY name');

        res.json({
            success: true,
            students,
            employees,
            staff,
            admins
        });
    } catch (error) {
        console.error('Admin get users error:', error);
        res.status(500).json({ success: false, error: 'Server error fetching user list.' });
    }
});



// GET a single user's details for editing (Protected)
app.get('/api/admin/users/:role/:id', authenticateToken, isAdmin, async (req, res) => {
    const { role, id } = req.params;
    let tableName = '';
    let idColumn = '';

    switch (role) {
        case 'student': tableName = 'student'; idColumn = 'roll_no'; break;
        case 'employee': tableName = 'employee'; idColumn = 'emp_code'; break;
        case 'medical-staff': tableName = 'medical_staff'; idColumn = 'emp_code'; break;
        case 'admin': tableName = 'admin'; idColumn = 'emp_code'; break;
        default: return res.status(400).json({ success: false, error: 'Invalid role.' });
    }

    try {
        const [users] = await pool.query(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`, [id]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }
        // Don't send password back to frontend, even hashed
        delete users[0].password;
        res.json(users[0]);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// CREATE a new user (Protected)
app.post('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    const { id, name, password, role, hostel_no, room_no, designation, department, staff_role } = req.body;
    
    if (!id || !name || !password || !role) {
        return res.status(400).json({ success: false, error: 'Missing required fields.' });
    }

    let tableName = '';
    let columns = [];
    let values = [];

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        switch (role) {
            case 'student':
                tableName = 'student';
                columns = ['roll_no', 'name', 'password', 'hostel_no', 'room_no'];
                values = [id, name, hashedPassword, hostel_no || null, room_no || null];
                break;
            case 'employee':
                tableName = 'employee';
                columns = ['emp_code', 'name', 'password', 'designation', 'department'];
                values = [id, name, hashedPassword, designation || null, department || null];
                break;
            case 'medical-staff':
                tableName = 'medical_staff';
                columns = ['emp_code', 'name', 'password', 'role'];
                values = [id, name, hashedPassword, staff_role || 'nurse'];
                break;
            case 'admin':
                tableName = 'admin';
                columns = ['emp_code', 'name', 'password'];
                values = [id, name, hashedPassword];
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid role.' });
        }

        const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
        await pool.query(query, values);
        res.status(201).json({ success: true, message: `User ${name} created successfully as ${role}.` });

    } catch (error) {
        console.error('Admin create user error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: `User with ID ${id} already exists.` });
        }
        res.status(500).json({ success: false, error: 'Server error creating user.' });
    }
});

// UPDATE a user (Protected)
app.put('/api/admin/users/:role/:id', authenticateToken, isAdmin, async (req, res) => {
    const { role, id } = req.params; // Original role and ID
    const { name, password, hostel_no, room_no, designation, department, staff_role } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, error: 'Name is required.' });
    }

    let tableName = '';
    let idColumn = '';
    let setClauses = ['name = ?'];
    let values = [name];

    try {
        // Add password to update *only* if a new one was provided
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            setClauses.push('password = ?');
            values.push(hashedPassword);
        }

        // Add role-specific fields
        switch (role) {
            case 'student':
                tableName = 'student';
                idColumn = 'roll_no';
                setClauses.push('hostel_no = ?', 'room_no = ?');
                values.push(hostel_no || null, room_no || null);
                break;
            case 'employee':
                tableName = 'employee';
                idColumn = 'emp_code';
                setClauses.push('designation = ?', 'department = ?');
                values.push(designation || null, department || null);
                break;
            case 'medical-staff':
                tableName = 'medical_staff';
                idColumn = 'emp_code';
                setClauses.push('role = ?');
                values.push(staff_role || 'nurse');
                break;
            case 'admin':
                tableName = 'admin';
                idColumn = 'emp_code';
                // Only name and password can be updated for admin
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid role.' });
        }

        // Add the ID for the WHERE clause
        values.push(id); 

        const query = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${idColumn} = ?`;
        const [result] = await pool.query(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }
        res.json({ success: true, message: `User ${id} updated successfully.` });

    } catch (error) {
        console.error('Admin update user error:', error);
        res.status(500).json({ success: false, error: 'Server error updating user.' });
    }
});

// DELETE a user (Protected)
app.delete('/api/admin/users/:role/:id', authenticateToken, isAdmin, async (req, res) => {
    const { role, id } = req.params;
    
    // Prevent admin from deleting their own account
    if (role === 'admin' && id === req.user.id) {
        return res.status(403).json({ success: false, error: 'You cannot delete your own admin account.' });
    }

    let tableName = '';
    let idColumn = '';

    switch (role) {
        case 'student': tableName = 'student'; idColumn = 'roll_no'; break;
        case 'employee': tableName = 'employee'; idColumn = 'emp_code'; break;
        case 'medical-staff': tableName = 'medical_staff'; idColumn = 'emp_code'; break;
        case 'admin': tableName = 'admin'; idColumn = 'emp_code'; break;
        default: return res.status(400).json({ success: false, error: 'Invalid role.' });
    }

    try {
        // We must delete related records first to avoid foreign key errors
        if (role === 'student' || role === 'employee') {
            // Find all patient_data records
            const [records] = await pool.query('SELECT id FROM patient_data WHERE patient_id = ?', [id]);
            if (records.length > 0) {
                const recordIds = records.map(r => r.id);
                // Delete related certificates and dispensed medicines
                await pool.query('DELETE FROM certificates WHERE patient_data_id IN (?)', [recordIds]);
                await pool.query('DELETE FROM dispensed_medicines WHERE patient_data_id IN (?)', [recordIds]);
                // Delete patient_data records
                await pool.query('DELETE FROM patient_data WHERE patient_id = ?', [id]);
            }
        }
        
        // Now delete the user
        const [result] = await pool.query(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`, [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }
        res.json({ success: true, message: `User ${id} and all related records have been deleted.` });

    } catch (error) {
        console.error('Admin delete user error:', error);
        res.status(500).json({ success: false, error: 'Server error deleting user.' });
    }
});


// --- Certificate Download Route (MODIFIED) ---

app.get('/download/certificate/:filename', authenticateToken, async (req, res) => {
     const filename = req.params.filename;
     if (filename.includes('..') || path.isAbsolute(filename)) {
        return res.status(400).json({ success: false, error: 'Invalid filename.' });
     }
     const filePath = path.join(uploadDir, filename);

     try {
         await fs.promises.access(filePath, fs.constants.R_OK);

         // Security Check: Verify the user owns this cert or is staff
         const [certResults] = await pool.query(`
            SELECT pd.patient_id
            FROM certificates c
            JOIN patient_data pd ON c.patient_data_id = pd.id
            WHERE c.file_path = ? LIMIT 1`,
            [filename]
         );
         
         if (certResults.length === 0) {
            return res.status(404).json({ success: false, error: 'Certificate record not found.' });
         }
         
         const ownerId = certResults[0].patient_id;
         const isOwner = (req.user.role === 'student' || req.user.role === 'employee') && req.user.id === ownerId;
         const isStaff = (req.user.role === 'medical-staff' || req.user.role === 'admin');
         
         if (!isOwner && !isStaff) {
             return res.status(403).json({ success: false, error: 'Forbidden.' });
         }

         res.download(filePath, filename, (err) => {
            if (err) { console.error("File download error:", err); }
         });
     } catch (error) {
         if (error.code === 'ENOENT') return res.status(404).json({ success: false, error: 'File not found.' });
         console.error(`Certificate download error for ${filename}:`, error);
         if (!res.headersSent) res.status(500).json({ success: false, error: 'Server error.' });
     }
});

// --- Error Handling & Server Start ---

app.use((err, req, res, next) => {
    console.error("----- Unhandled Error Caught By Middleware -----");
    console.error(err.stack || err.message || err);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: `File is too large.` });
        return res.status(400).json({ success: false, error: `File upload error: ${err.message}` });
    }
    if (!res.headersSent) {
        return res.status(err.status || 500).json({ success: false, error: 'Internal Server Error' });
    }
    next(err);
});

app.use((req, res, next) => {
    res.status(404).json({ success: false, error: 'Not Found' });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

// --- Global Unhandled Error Handlers ---
process.on('uncaughtException', (err, origin) => { 
    console.error('CRITICAL: UNCAUGHT EXCEPTION:', err, origin);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => { 
    console.error('CRITICAL: UNHANDLED REJECTION:', reason, promise);
});