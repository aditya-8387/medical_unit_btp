/**
 * Handles all logic for the Employee Portal (medical_emp.html)
 * - Fetches medical records
 * - Allows updating profile details (designation/department)
 * - Uses token-based authentication
 */
document.addEventListener("DOMContentLoaded", async () => {
    
    // --- 1. Get User Data from Storage ---
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const userId = localStorage.getItem('userId'); // This is the emp_code
    const name = localStorage.getItem('name');
    let currentDesignation = localStorage.getItem('designation');
    let currentDepartment = localStorage.getItem('department');
    
    // --- 2. Authentication Check ---
    if (!token || role !== 'employee') {
        localStorage.clear(); // Clear bad data
        window.location.href = 'medical_login.html';
        return;
    }

    // --- 3. Get Element References ---
    const idElement = document.getElementById('employee-id');
    const nameElement = document.getElementById('employee-name');
    const profileDetailsSection = document.querySelector('.profile-details');
    const designationDisplay = document.getElementById('employee-designation');
    const departmentDisplay = document.getElementById('employee-department');
    const designationInput = document.getElementById('edit-designation');
    const departmentInput = document.getElementById('edit-department');
    const editButton = document.getElementById('edit-details-btn');
    const saveButton = document.getElementById('save-details-btn');
    const cancelButton = document.getElementById('cancel-details-btn');
    const updateStatusElement = document.getElementById('update-status');
    const emergencyBtn = document.querySelector('.emergency-btn');

    // --- 4. Populate Static Page Data ---
    if (idElement) idElement.textContent = escapeHtml(userId);
    if (nameElement) nameElement.textContent = `Welcome, ${escapeHtml(name)}`;
    if (emergencyBtn) emergencyBtn.onclick = () => window.location.href = `tel:+911234567890`; // Example number

    /**
     * Helper to display profile details, showing "Not Set" if null/empty.
     */
    function displayProfileDetails(designation, department) {
        const displayValue = (value) => (value && value !== 'null' && value.trim() !== '') ? escapeHtml(value) : 'Not Set';
        if (designationDisplay) designationDisplay.textContent = displayValue(designation);
        if (departmentDisplay) departmentDisplay.textContent = displayValue(department);
    }
    displayProfileDetails(currentDesignation, currentDepartment); // Initial display

    /**
     * Toggles the edit/display mode for the profile section.
     */
    function toggleEditMode(isEditing) {
        if (!profileDetailsSection) return;
        profileDetailsSection.classList.toggle('editing', isEditing);
        updateStatusElement.textContent = ''; // Clear any old status messages
    }

    // --- 5. Event Listeners for Profile Edit ---
    if (editButton) {
        editButton.addEventListener('click', () => {
            designationInput.value = (currentDesignation && currentDesignation !== 'null') ? currentDesignation : '';
            departmentInput.value = (currentDepartment && currentDepartment !== 'null') ? currentDepartment : '';
            toggleEditMode(true);
        });
    }

    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            toggleEditMode(false);
        });
    }

    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            const newDesignation = designationInput.value.trim();
            const newDepartment = departmentInput.value.trim();
            
            saveButton.textContent = 'Saving...';
            saveButton.disabled = true;

            try {
                // *** THIS IS THE CORRECTED API CALL ***
                const response = await fetch('/api/profile/update', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` // Send token for auth
                    },
                    body: JSON.stringify({ 
                        designation: newDesignation, 
                        department: newDepartment 
                    })
                });
                
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Failed to save details.');
                
                // Update local state and storage
                currentDesignation = newDesignation || null;
                currentDepartment = newDepartment || null;
                localStorage.setItem('designation', currentDesignation || '');
                localStorage.setItem('department', currentDepartment || '');
                
                // Update UI
                displayProfileDetails(currentDesignation, currentDepartment);
                toggleEditMode(false);
                updateStatusElement.textContent = 'Details updated successfully!';
                updateStatusElement.style.color = 'green';
                
            } catch (error) {
                updateStatusElement.textContent = `Error: ${error.message}`;
                updateStatusElement.style.color = 'red';
            } finally {
                saveButton.textContent = 'Save Changes';
                saveButton.disabled = false;
                setTimeout(() => { updateStatusElement.textContent = ''; }, 3000);
            }
        });
    }

    // --- 6. Load Medical History ---
    /**
     * Fetches medical records using the user's token.
     */
    async function loadMedicalRecords() {
        const tableBody = document.getElementById('records-table');
        if (!tableBody) return;
        tableBody.innerHTML = `<tr><td colspan="5" class="table-message">Loading history...</td></tr>`;

        try {
            // *** THIS IS THE CORRECTED API CALL ***
            const response = await fetch('/api/my-records', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to fetch records.');

            const records = result.data || [];
            tableBody.innerHTML = ""; // Clear "Loading..."

            if (records.length > 0) {
                records.forEach((rec) => {
                    const row = tableBody.insertRow();
                    let formattedDate = new Date(rec.date).toLocaleDateString('en-GB'); // DD/MM/YYYY

                    row.insertCell().textContent = formattedDate;
                    row.insertCell().textContent = escapeHtml(rec.diagnosis);
                    row.insertCell().textContent = escapeHtml(rec.medications || 'N/A');
                    row.insertCell().textContent = escapeHtml(rec.remarks || 'N/A');

                    const certificateCell = row.insertCell();
                    if (rec.certificate_download_path) {
                        const downloadLink = document.createElement('a');
                        downloadLink.href = rec.certificate_download_path;
                        downloadLink.textContent = 'Download';
                        downloadLink.className = 'download-cert-link';
                        downloadLink.target = '_blank';
                        certificateCell.appendChild(downloadLink);
                    } else {
                        certificateCell.textContent = 'N/A';
                    }
                });
            } else {
                tableBody.innerHTML = `<tr><td colspan="5" class="table-message">No medical records found.</td></tr>`;
            }
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="5" class="table-message" style="color: red;">Error: ${escapeHtml(error.message)}</td></tr>`;
        }
    }

    // Initial load of medical history
    await loadMedicalRecords();
});

/**
 * Helper function to prevent XSS attacks
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        if (unsafe == null) return '';
        try { unsafe = String(unsafe); } catch { return ''; }
    }
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}