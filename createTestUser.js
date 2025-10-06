const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Database connection configuration using environment variables
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function createTestUsers() {
    try {
        // Connect to the database
        await db.promise().connect();
        console.log('Connected to database');

        // Define the standard test password
        const testPassword = 'test123';
        console.log('Test password for all users:', testPassword);

        // Hash the password using bcrypt
        const saltRounds = 10; // Standard salt rounds
        const hashedPassword = await bcrypt.hash(testPassword, saltRounds);
        console.log('Hashed password:', hashedPassword);

        // Temporarily disable foreign key checks to allow truncating tables
        console.log('Disabling foreign key checks...');
        await db.promise().query('SET FOREIGN_KEY_CHECKS = 0');

        // Clear existing data from relevant tables
        console.log('Truncating tables: certificates, patient_data, users...');
        await db.promise().query('TRUNCATE TABLE certificates');
        await db.promise().query('TRUNCATE TABLE patient_data');
        await db.promise().query('TRUNCATE TABLE users');
        console.log('Tables truncated.');

        // Re-enable foreign key checks
        console.log('Re-enabling foreign key checks...');
        await db.promise().query('SET FOREIGN_KEY_CHECKS = 1');

        // --- Insert Test Users ---

        // 1. Medical Staff User
        await db.promise().query(
            'INSERT INTO users (roll_no, name, password, role) VALUES (?, ?, ?, ?)',
            ['medstaff', 'Dr. Chand Singh Panwar', hashedPassword, 'medical-staff'] // Using the actual doctor's name from template
        );
        console.log('Created medical staff user: medstaff');

        // 2. Initial Student Users
        const initialStudents = [
             { roll_no: '22UCS123', name: 'Alice Johnson' },
             { roll_no: '22MCS456', name: 'Bob Williams' }
        ];
        for (const student of initialStudents) {
            await db.promise().query(
                'INSERT INTO users (roll_no, name, password, role) VALUES (?, ?, ?, ?)',
                [student.roll_no, student.name, hashedPassword, 'student']
            );
            console.log(`Created student user: ${student.roll_no}`);
        }


        // 3. First Batch of Additional Students
        const firstBatchStudents = [
            { roll_no: '23UEC001', name: 'Pranjal Jain' },
            { roll_no: '21UCC055', name: 'Ayush Kumar' },
            { roll_no: '24PMA010', name: 'Anjali Sharma' }, // Example PG student
            { roll_no: '23PCE007', name: 'Vinod Kumar' }, // Example PG student
            { roll_no: '22UME111', name: 'Ramesh Sharma' }
        ];

        for (const student of firstBatchStudents) {
            await db.promise().query(
                'INSERT INTO users (roll_no, name, password, role) VALUES (?, ?, ?, ?)',
                [student.roll_no, student.name, hashedPassword, 'student']
            );
            console.log(`Created student user: ${student.roll_no}`);
        }

        // 4. Second Batch of Additional Students
        const secondBatchStudents = [
            { roll_no: '20UCS088', name: 'Harry Potter' },
            { roll_no: '21UEE032', name: 'Iris West' },
            { roll_no: '23UMT015', name: 'Jack Sparrow' },
            { roll_no: '22PDS002', name: 'Kara Danvers (PhD)' }, // Example PhD student
            { roll_no: '24PCS044', name: 'Luke Skywalker' }
        ];

        for (const student of secondBatchStudents) {
            await db.promise().query(
                'INSERT INTO users (roll_no, name, password, role) VALUES (?, ?, ?, ?)',
                [student.roll_no, student.name, hashedPassword, 'student']
            );
            console.log(`Created student user: ${student.roll_no}`);
        }

        // *** NEW BATCH START ***
        // 5. Third Batch of Additional Students (Your new students)
        const thirdBatchStudents = [
            { roll_no: '22UCS032', name: 'Ayush Bansal' },
            { roll_no: '22UEC021', name: 'Shubham Mittal' }
        ];

        console.log('\nCreating third batch of students...');
        for (const student of thirdBatchStudents) {
            // Insert student, assuming hostel and room are NULL initially
            await db.promise().query(
                'INSERT INTO users (roll_no, name, password, role, hostel_no, room_no) VALUES (?, ?, ?, ?, ?, ?)',
                [student.roll_no, student.name, hashedPassword, 'student', null, null] // Add nulls for hostel/room
            );
            console.log(`Created student user: ${student.roll_no} (${student.name})`);
        }
        // *** NEW BATCH END ***

        // --- End Insert Test Users ---


        // --- Log Summary ---
        console.log('\nTest Users Created Successfully!');
        console.log('----------------------------------------');
        console.log('Medical Staff Login:');
        console.log('  Username: medstaff');
        console.log('  Password:', testPassword);
        console.log('\nStudent Logins (Password for all:', testPassword, '):');
        // Combine ALL student lists for logging
        const allStudents = [
            ...initialStudents,
            ...firstBatchStudents,
            ...secondBatchStudents,
            ...thirdBatchStudents // Include the new batch
        ];
        allStudents.forEach(student => {
            console.log(`  Roll No: ${student.roll_no} (${student.name})`);
        });
        console.log('----------------------------------------');

        // Verify users were created by fetching them
        const [users] = await db.promise().query('SELECT roll_no, name, role FROM users ORDER BY role, roll_no');
        console.log('\nCurrent users in database:');
        users.forEach(user => {
            console.log(`  - ${user.role}: ${user.roll_no} (${user.name})`);
        });


    } catch (error) {
        // Log any errors that occur during the process
        console.error('Error creating test users:', error);
    } finally {
        // Ensure the database connection is closed
        console.log('Closing database connection.');
        db.end();
    }
}

// Execute the function to create users
createTestUsers();