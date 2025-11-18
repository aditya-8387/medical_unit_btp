/**
 * Handles login form submission for all user roles (Student, Employee, Staff, Admin)
 * and dynamic UI changes on the login page.
 */

document.addEventListener('DOMContentLoaded', () => {

    const loginForm = document.getElementById('loginForm');
    const roleSelect = document.getElementById('role');
    const rollnoField = document.getElementById('rollno-field'); // The div container
    const rollnoInput = document.getElementById('rollno');
    const rollnoLabel = rollnoField.querySelector('label');

    // --- Form Submission Handler ---
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const role = roleSelect.value;
        const userId = rollnoInput.value.trim(); // This is the ID (Roll No or Emp Code)
        const pass = document.getElementById('pass').value;

        if (!role || !userId || !pass) {
            alert("Please fill all required fields.");
            return;
        }

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    roll_no: userId, // The backend expects this key for the ID
                    password: pass,
                    role: role
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Login successful, store all data from server
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                localStorage.setItem('name', data.name);
                localStorage.setItem('userId', userId); // Store the ID they logged in with
                
                // --- MODIFICATION HERE ---
                // Store the sub_role (e.g., 'doctor', 'nurse') or an empty string
                localStorage.setItem('sub_role', data.sub_role || '');
                // --- END MODIFICATION ---

                // Store role-specific data (even if null, to clear old data)
                localStorage.setItem('hostel_no', data.hostel_no || '');
                localStorage.setItem('room_no', data.room_no || '');
                localStorage.setItem('designation', data.designation || '');
                localStorage.setItem('department', data.department || '');

                // === UPDATED REDIRECT LOGIC ===
                if (role === 'student') {
                    window.location.href = 'medical_stu.html';
                } else if (role === 'employee') {
                    window.location.href = 'medical_emp.html';
                } else if (role === 'medical-staff') {
                    window.location.href = 'medical_staff.html';
                } else if (role === 'admin') {
                    // *** NEW REDIRECT ***
                    window.location.href = 'admin.html';
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

    // --- Role Change Listener (for UI) ---
    // Updates the placeholder text for the ID field based on role.
    roleSelect.addEventListener('change', function () {
        const selectedRole = this.value;

        if (selectedRole === 'student') {
            rollnoLabel.textContent = 'Roll No.';
            rollnoInput.placeholder = 'e.g., 22UCS123';
            rollnoField.style.display = 'block';
            rollnoInput.required = true;
        } else if (selectedRole === 'employee') {
            rollnoLabel.textContent = 'Employee Code';
            rollnoInput.placeholder = 'e.g., E101';
            rollnoField.style.display = 'block';
            rollnoInput.required = true;
        } else if (selectedRole === 'medical-staff' || selectedRole === 'admin') {
            rollnoLabel.textContent = 'Employee Code / ID';
            rollnoInput.placeholder = 'Enter your staff ID';
            rollnoField.style.display = 'block';
            rollnoInput.required = true;
        } else {
            // Default state if no role is selected
            rollnoLabel.textContent = 'Roll No. / Employee Code';
            rollnoInput.placeholder = 'Enter your ID';
        }
    });

    // Initialize field state on page load (in case a role is pre-selected)
    roleSelect.dispatchEvent(new Event('change'));
});