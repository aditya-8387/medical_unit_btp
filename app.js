const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { body, validationResult } = require('express-validator');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// File Upload Configuration
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

// Database Connection Pool
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

// Multer setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        const rollNo = req.body.rollNo || 'unknown_roll';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeRollNo = rollNo.replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `cert-${safeRollNo}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// Authentication Middleware
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
        req.user = user;
        next();
    });
};

// --- ROUTES ---


// Homepage Route: Serve the about_us.html page as the main entry point
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about_us.html'));
});

app.post('/login', async (req, res) => {
    const { roll_no, password, role } = req.body;
    if (!roll_no || !password || !role) {
        return res.status(400).json({ success: false, error: 'Missing fields.' });
    }
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE roll_no = ? AND role = ?', [roll_no, role]);
        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'User not found.' });
        }
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Invalid credentials.' });
        }
        const token = jwt.sign({ roll_no: user.roll_no, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, role: user.role, name: user.name });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

app.get('/student/:rollno', authenticateToken, async (req, res) => {
    try {
        const [results] = await pool.query('SELECT name FROM users WHERE roll_no = ? AND role = ?', [req.params.rollno, 'student']);
        if (results.length === 0) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        res.json({ success: true, name: results[0].name });
    } catch (error) {
        console.error(`Error fetching student data ${req.params.rollno}:`, error);
        res.status(500).json({ success: false, error: 'Server error fetching student data.' });
    }
});

app.get('/api/inventory', authenticateToken, async (req, res) => {
    if (req.user.role !== 'medical-staff') {
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
    if (req.user.role !== 'medical-staff') {
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

// Route to update all medicines at once
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
        if (req.user.role !== 'medical-staff') {
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
    if (req.user.role !== 'medical-staff') {
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

app.post('/medical/staff/record', authenticateToken, async (req, res) => {
    if (req.user.role !== 'medical-staff') {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }

    const { roll_no, diagnosis, remarks, medications } = req.body;
    if (!roll_no || !diagnosis) {
        return res.status(400).json({ success: false, error: 'Missing required fields (roll_no, diagnosis).' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [patientResult] = await connection.query(
            'INSERT INTO patient_data (roll_no, diagnosis, remarks, created_at) VALUES (?, ?, ?, NOW())',
            [roll_no, diagnosis, remarks || null]
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

app.get('/medical/staff/records', authenticateToken, async (req, res) => {
    if (req.user.role !== 'medical-staff') {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    try {
        let targetDate = req.query.date;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!targetDate || !dateRegex.test(targetDate)) {
            targetDate = new Date().toISOString().slice(0, 10);
        }

        const query = `
            SELECT
                p.id AS recordId,
                u.name,
                p.roll_no,
                p.diagnosis,
                p.remarks,
                p.created_at,
                GROUP_CONCAT(CONCAT(dm.medicine_name, ' (Qty: ', dm.quantity, ')') SEPARATOR '; ') AS medications,
                MAX(CASE WHEN c.serial_no IS NOT NULL THEN TRUE ELSE FALSE END) AS hasCertificate
            FROM patient_data p
            JOIN users u ON p.roll_no = u.roll_no
            LEFT JOIN dispensed_medicines dm ON p.id = dm.patient_data_id
            LEFT JOIN certificates c ON c.patient_data_id = p.id
            WHERE DATE(p.created_at) = ?
            GROUP BY p.id, u.name
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

app.get('/records/:rollno', authenticateToken, async (req, res) => {
    const requestedRollno = req.params.rollno;
    const userRollno = req.user.roll_no;
    if (req.user.role === 'student' && userRollno !== requestedRollno) {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
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
            WHERE p.roll_no = ?
            GROUP BY p.id, c.file_path
            ORDER BY p.created_at DESC;
        `;
        const [results] = await pool.query(query, [requestedRollno]);
        const formattedResults = results.map(record => ({
            ...record,
            certificate_download_path: record.certificate_file_path ? `/${staticCertPath}/${record.certificate_file_path}` : null
        }));
        res.json({ success: true, data: formattedResults });
    } catch (error) {
        console.error(`Error fetching medical records for ${requestedRollno}:`, error);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

app.put('/student/hostel-details', authenticateToken,
    [
        body('hostel_no').optional({ nullable: true }).trim().isLength({ max: 50 }).escape(),
        body('room_no').optional({ nullable: true }).trim().isLength({ max: 50 }).escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        if (req.user.role !== 'student') {
            return res.status(403).json({ success: false, error: 'Forbidden.' });
        }
        const studentRollNo = req.user.roll_no;
        const { hostel_no, room_no } = req.body;
        const finalHostelNo = (hostel_no !== undefined && hostel_no !== '') ? hostel_no : null;
        const finalRoomNo = (room_no !== undefined && room_no !== '') ? room_no : null;
        try {
            const query = 'UPDATE users SET hostel_no = ?, room_no = ? WHERE roll_no = ? AND role = ?';
            const [result] = await pool.query(query, [finalHostelNo, finalRoomNo, studentRollNo, 'student']);
            if (result.affectedRows === 1) {
                res.json({ success: true, message: 'Hostel details updated successfully.' });
            } else {
                res.status(404).json({ success: false, error: 'Student not found or update failed.' });
            }
        } catch (error) {
            console.error(`Error updating hostel details for student ${studentRollNo}:`, error);
            res.status(500).json({ success: false, error: 'Server error updating details.' });
        }
    }
);

app.post('/generate-and-save-certificate', authenticateToken, upload.single('pdf'), async (req, res) => {
    if (req.user.role !== 'medical-staff') {
        if (req.file) fs.unlink(req.file.path, (err) => { if (err) console.error("Error deleting temp file:", err); });
       return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'PDF file is required.' });
    }

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

app.get('/student/certificates/:rollno', authenticateToken, async (req, res) => {
    const requestedRollno = req.params.rollno;
    if (req.user.role !== 'student' || req.user.roll_no !== requestedRollno) {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
    }
    try {
        const query = `
            SELECT
                c.id, DATE(pd.created_at) AS date, pd.diagnosis,
                GROUP_CONCAT(CONCAT(dm.medicine_name, ' (Qty: ', dm.quantity, ')') SEPARATOR '; ') AS medications,
                c.serial_no, c.file_path, c.created_at
            FROM certificates c
            JOIN patient_data pd ON c.patient_data_id = pd.id
            LEFT JOIN dispensed_medicines dm ON pd.id = dm.patient_data_id
            WHERE pd.roll_no = ?
            GROUP BY c.id
            ORDER BY pd.created_at DESC, c.created_at DESC
        `;
        const [results] = await pool.query(query, [requestedRollno]);
        const validCertificates = results
            .filter(cert => cert.file_path)
            .map(cert => ({ ...cert, downloadPath: `/${staticCertPath}/${cert.file_path}` }));
        res.json({ success: true, certificates: validCertificates });
    } catch (error) {
        console.error(`Error fetching certificates list for ${requestedRollno}:`, error);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

app.get('/download/certificate/:filename', authenticateToken, async (req, res) => {
     const filename = req.params.filename;
     if (filename.includes('..') || path.isAbsolute(filename)) {
        return res.status(400).json({ success: false, error: 'Invalid filename.' });
     }
     const filePath = path.join(uploadDir, filename);
     try {
         await fs.promises.access(filePath, fs.constants.R_OK);
         const [certResults] = await pool.query(`
            SELECT pd.roll_no
            FROM certificates c
            JOIN patient_data pd ON c.patient_data_id = pd.id
            WHERE c.file_path = ? LIMIT 1`,
            [filename]
         );
         if (certResults.length === 0) {
            return res.status(404).json({ success: false, error: 'Certificate record not found.' });
         }
         const ownerRollNo = certResults[0].roll_no;
         const isOwner = (req.user.role === 'student' && req.user.roll_no === ownerRollNo);
         const isStaff = (req.user.role === 'medical-staff');
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

// --- Error Handling Middleware ---
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

// --- 404 Not Found Handler ---
app.use((req, res, next) => {
    res.status(404).json({ success: false, error: 'Not Found' });
});

// --- Server Start ---
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

