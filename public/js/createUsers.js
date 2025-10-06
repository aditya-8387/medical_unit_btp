const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function createUsers() {
    try {
        // Connect to database
        await db.promise().connect();
        console.log('Connected to database');

        // First, disable foreign key checks
        await db.promise().query('SET FOREIGN_KEY_CHECKS = 0');
        console.log('Disabled foreign key checks');

        // Clear existing data from all tables
        await db.promise().query('TRUNCATE TABLE certificates');
        console.log('Cleared certificates table');
        
        await db.promise().query('TRUNCATE TABLE patient_data');
        console.log('Cleared patient_data table');
        
        await db.promise().query('TRUNCATE TABLE users');
        console.log('Cleared users table');

        // Re-enable foreign key checks
        await db.promise().query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('Re-enabled foreign key checks');

        // Create medical staff user
        const medicalStaffPassword = 'medstaff123';
        const medicalStaffHash = await bcrypt.hash(medicalStaffPassword, 10);
        await db.promise().query(
            'INSERT INTO users (roll_no, password, role) VALUES (?, ?, ?)',
            ['MED001', medicalStaffHash, 'medical-staff']
        );
        console.log('Created medical staff user');
        console.log('Medical Staff Credentials:');
        console.log('Roll No: MED001');
        console.log('Password: medstaff123');

        // Create student user
        const studentPassword = 'student123';
        const studentHash = await bcrypt.hash(studentPassword, 10);
        await db.promise().query(
            'INSERT INTO users (roll_no, password, role) VALUES (?, ?, ?)',
            ['22UCS123', studentHash, 'student']
        );
        console.log('Created student user');
        console.log('Student Credentials:');
        console.log('Roll No: 22UCS123');
        console.log('Password: student123');

        // Insert some sample patient data
        await db.promise().query(
            'INSERT INTO patient_data (date, name, roll_no, diagnosis, medications) VALUES (?, ?, ?, ?, ?)',
            ['2024-03-15', 'John Doe', '22UCS123', 'Fever and cold', 'Paracetamol 500mg']
        );
        console.log('Added sample patient data');

        console.log('Users and sample data created successfully!');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        db.end();
    }
}

createUsers()