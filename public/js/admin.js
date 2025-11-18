/**
 * Admin Dashboard Script
 * Handles CRUD operations for all user types with a search-first approach.
 */
document.addEventListener("DOMContentLoaded", () => {
    // --- State & Auth ---
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('role');

    if (!token || userRole !== 'admin') {
        alert('Access Denied. You must be an admin to view this page.');
        window.location.href = 'medical_login.html';
        return;
    }

    // --- Form Elements ---
    const userForm = document.getElementById('user-form');
    const formTitle = document.getElementById('form-title');
    const userRoleSelect = document.getElementById('user-role');
    const userIdInput = document.getElementById('user-id');
    const userNameInput = document.getElementById('user-name');
    const userPasswordInput = document.getElementById('user-password');
    const editUserIdHidden = document.getElementById('edit-user-id');
    const clearFormBtn = document.getElementById('clear-form-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // --- Role-Specific Field Groups ---
    const studentFields = document.getElementById('student-fields');
    const employeeFields = document.getElementById('employee-fields');
    const staffFields = document.getElementById('staff-fields');

    // --- Search Elements ---
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results-container');

    // --- Headers for API calls ---
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // --- Functions ---

    /**
     * Shows/hides role-specific fields based on dropdown selection
     */
    const toggleRoleFields = () => {
        const role = userRoleSelect.value;
        studentFields.style.display = (role === 'student') ? 'grid' : 'none';
        employeeFields.style.display = (role === 'employee') ? 'grid' : 'none';
        staffFields.style.display = (role === 'medical-staff') ? 'grid' : 'none';
    };

    /**
     * Clears the form back to its "Add User" state
     */
    const resetForm = () => {
        formTitle.textContent = 'Add New User';
        userForm.reset();
        editUserIdHidden.value = '';
        userIdInput.disabled = false;
        userRoleSelect.disabled = false;
        
        // Password is required for new users
        userPasswordInput.placeholder = "Min. 6 characters. Required for new users.";
        userPasswordInput.required = true; 
        
        toggleRoleFields();
    };

    /**
     * Handles the form submission for both CREATE and UPDATE
     */
    const handleFormSubmit = async (e) => {
        e.preventDefault();

        const role = userRoleSelect.value;
        const id = userIdInput.value; // The new or current ID
        const editId = editUserIdHidden.value; // The original ID (if editing)
        const isEditing = !!editId;

        // Collect base data
        const userData = {
            id: id, // Send the new ID
            name: userNameInput.value,
            password: userPasswordInput.value || null, // Send null if empty
            role: role,
            // Role-specific data
            hostel_no: document.getElementById('student-hostel').value,
            room_no: document.getElementById('student-room').value,
            designation: document.getElementById('emp-designation').value,
            department: document.getElementById('emp-department').value,
            staff_role: document.getElementById('staff-role').value,
        };
        
        // Validation for new user password
        if (!isEditing && !userData.password) {
            alert('Password is required for new users.');
            return;
        }

        try {
            let response;
            if (isEditing) {
                // UPDATE (PUT)
                // We use the 'editId' (original ID) in the URL to find the user,
                // but send the new data (including a potentially new 'id') in the body.
                response = await fetch(`/api/admin/users/${role}/${editId}`, {
                    method: 'PUT',
                    headers: authHeaders,
                    body: JSON.stringify(userData)
                });
            } else {
                // CREATE (POST)
                response = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify(userData)
                });
            }

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to save user.');
            }

            alert(result.message);
            resetForm();
            // Refresh search results if the edited/added user matches the current search
            if (searchInput.value.trim()) {
                handleSearchSubmit(new Event('submit')); // Re-run the search
            }

        } catch (error) {
            console.error('Submit error:', error);
            alert(`Error: ${error.message}`);
        }
    };

    /**
     * Pre-fills the form for editing a user
     */
    const populateFormForEdit = async (role, id) => {
        try {
            const response = await fetch(`/api/admin/users/${role}/${id}`, { headers: authHeaders });
            if (!response.ok) throw new Error('Failed to fetch user data.');

            const user = await response.json();

            // Fill form
            formTitle.textContent = `Edit User: ${user.name}`;
            editUserIdHidden.value = id; // Store the original ID
            userRoleSelect.value = role;
            
            // Allow editing role and ID, as requested
            userRoleSelect.disabled = false; 
            userIdInput.disabled = false; 
            
            userIdInput.value = id;
            userNameInput.value = user.name;
            
            // Password is not required for edits
            userPasswordInput.placeholder = "Leave blank to keep unchanged";
            userPasswordInput.required = false;

            // Fill role-specific fields
            if (role === 'student') {
                document.getElementById('student-hostel').value = user.hostel_no || '';
                document.getElementById('student-room').value = user.room_no || '';
            } else if (role === 'employee') {
                document.getElementById('emp-designation').value = user.designation || '';
                document.getElementById('emp-department').value = user.department || '';
            } else if (role === 'medical-staff') {
                document.getElementById('staff-role').value = user.role || 'nurse';
            }

            toggleRoleFields();
            window.scrollTo(0, 0); // Scroll to top to see form
        } catch (error){
            alert(`Error: ${error.message}`);
        }
    };

    /**
     * Deletes a user after confirmation
     */
    const deleteUser = async (role, id) => {
        if (!confirm(`Are you sure you want to delete user ${id} (${role})? This cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${role}/${id}`, {
                method: 'DELETE',
                headers: authHeaders
            });
            
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete user.');
            }

            alert(result.message);
            // Re-run the search to show the user is gone
            handleSearchSubmit(new Event('submit')); 

        } catch (error) {
            console.error('Delete error:', error);
            alert(`Error: ${error.message}`);
        }
    };

    /**
     * Handles the search form submission
     */
    const handleSearchSubmit = async (e) => {
        if (e) e.preventDefault();
        const searchTerm = searchInput.value.trim();
        if (!searchTerm) {
            searchResultsContainer.innerHTML = '';
            return;
        }

        searchResultsContainer.innerHTML = '<p>Searching...</p>';

        try {
            // This requires a new backend endpoint: /api/admin/search
            const response = await fetch(`/api/admin/search?term=${encodeURIComponent(searchTerm)}`, {
                headers: authHeaders
            });

            if (!response.ok) {
                throw new Error('Search failed.');
            }

            const results = await response.json();
            displaySearchResults(results);

        } catch (error) {
            console.error('Search error:', error);
            searchResultsContainer.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
        }
    };

    /**
     * Displays the search results in a table
     */
    const displaySearchResults = (results) => {
        if (!results || results.length === 0) {
            searchResultsContainer.innerHTML = '<p>No users found matching your search.</p>';
            return;
        }

        let tableHTML = `
            <div class="table-wrapper" style="margin-top: 20px;">
                <table class="user-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Role</th>
                            <th>Details</th>
                            <th class="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        results.forEach(user => {
            const id = user.roll_no || user.emp_code;
            let role = user.role; // e.g., 'student', 'employee', 'doctor', 'nurse'
            let details = '';

            // Determine role and details
            if (user.roll_no) {
                role = 'student';
                details = `Hostel: ${user.hostel_no || 'N/A'}`;
            } else if (user.designation) {
                role = 'employee';
                details = `${user.designation} (${user.department || 'N/A'})`;
            } else if (role === 'doctor' || role === 'nurse') {
                role = 'medical-staff';
                details = `Role: ${user.role}`;
            }

            tableHTML += `
                <tr>
                    <td>${id}</td>
                    <td>${user.name}</td>
                    <td>${role}</td>
                    <td>${details}</td>
                    <td class="actions">
                        <button class="edit-btn" data-role="${role}" data-id="${id}">Edit</button>
                        <button class="delete-btn" data-role="${role}" data-id="${id}">Delete</button>
                    </td>
                </tr>
            `;
        });

        tableHTML += `
                    </tbody>
                </table>
            </div>
        `;
        
        searchResultsContainer.innerHTML = tableHTML;
    };

    /**
     * Logs the admin out
     */
    const logout = () => {
        localStorage.clear();
        window.location.href = 'medical_login.html';
    };

    // --- Event Listeners ---
    userRoleSelect.addEventListener('change', toggleRoleFields);
    userForm.addEventListener('submit', handleFormSubmit);
    clearFormBtn.addEventListener('click', resetForm);
    logoutBtn.addEventListener('click', logout);
    searchForm.addEventListener('submit', handleSearchSubmit);

    // Event Delegation for Edit/Delete buttons on search results
    searchResultsContainer.addEventListener('click', (e) => {
        const target = e.target;
        const role = target.dataset.role;
        const id = target.dataset.id;

        if (target.classList.contains('edit-btn')) {
            populateFormForEdit(role, id);
        }
        if (target.classList.contains('delete-btn')) {
            deleteUser(role, id);
        }
    });

    // --- Initial Load ---
    // No longer fetch all users. Page loads empty.
});