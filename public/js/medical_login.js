document.querySelector('form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const role = document.getElementById('role').value;
    const rollno = document.getElementById('rollno').value;
    const pass = document.getElementById('pass').value;

    if (!role || !pass) {
        alert("Please fill all required fields.");
        return;
    }

    // For students, roll number is required
    if (role === 'student' && !rollno) {
        alert("Please enter your Roll Number.");
        return;
    }

    console.log('Attempting login with:', {
        roll_no: role === 'medical-staff' ? 'medstaff' : rollno, // Use 'medstaff' for staff role
        role: role,
        password: pass
    });

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roll_no: role === 'medical-staff' ? 'medstaff' : rollno, // Use 'medstaff' for staff role
                password: pass,
                role: role
            })
        });

        const data = await response.json();

        if (response.ok && data.success) { // Check data.success
            // Store common items
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            localStorage.setItem('studentName', data.name); // Store name

            // Store student-specific items
            if (role === 'student') {
                localStorage.setItem('rollno', rollno); // Store rollno used for login

                // Store hostel and room details if provided by backend
                if (data.hostel_no !== undefined && data.hostel_no !== null) {
                    localStorage.setItem('hostel_no', data.hostel_no);
                } else {
                     localStorage.removeItem('hostel_no'); // Clear if null/undefined
                }
                if (data.room_no !== undefined && data.room_no !== null) {
                     localStorage.setItem('room_no', data.room_no);
                } else {
                    localStorage.removeItem('room_no'); // Clear if null/undefined
                }
            }

            // Redirect based on role
            if (role === 'student') {
                window.location.href = 'medical_stu.html';
            } else if (role === 'medical-staff') {
                window.location.href = 'medical_staff.html';
            }
        } else {
            // Show error message from backend or a default one
            alert(data.error || 'Login failed. Please check credentials.');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('An error occurred during login. Please try again.');
    }
});

// Hide/show Roll No. field based on role selection
document.getElementById('role').addEventListener('change', function () {
    const rollField = document.getElementById('rollno-field');
    const rollInput = document.getElementById('rollno');
    if (this.value === 'medical-staff') {
        rollField.style.display = 'none';
        rollInput.required = false;
        rollInput.value = ''; // Clear value if switching to staff
    } else {
        rollField.style.display = 'block';
        rollInput.required = true;
    }
});

// Initialize roll number field visibility on page load
document.addEventListener('DOMContentLoaded', () => {
    const roleSelect = document.getElementById('role');
    if (roleSelect.value === 'medical-staff') {
        document.getElementById('rollno-field').style.display = 'none';
        document.getElementById('rollno').required = false;
    }
});