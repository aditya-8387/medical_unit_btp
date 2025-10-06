document.addEventListener("DOMContentLoaded", async () => {
    const token = localStorage.getItem('token');
    const rollno = localStorage.getItem('rollno');
    let currentHostel = localStorage.getItem('hostel_no');
    let currentRoom = localStorage.getItem('room_no');
    const emergencyPhone = localStorage.getItem('emergency_phone') || '+911234567890';

    if (!token || !rollno) {
        window.location.href = 'medical_login.html';
        return;
    }

    const rollnoElement = document.getElementById('student-rollno');
    const studentNameElement = document.getElementById('student-name');
    const profileDetailsSection = document.querySelector('.profile-details');
    const hostelDisplay = document.getElementById('student-hostel');
    const roomDisplay = document.getElementById('student-room');
    const hostelInput = document.getElementById('edit-hostel');
    const roomInput = document.getElementById('edit-room');
    const editButton = document.getElementById('edit-details-btn');
    const saveButton = document.getElementById('save-details-btn');
    const cancelButton = document.getElementById('cancel-details-btn');
    const updateStatusElement = document.getElementById('update-status');

    if (rollnoElement) {
        rollnoElement.textContent = escapeHtml(rollno);
    }
    
    const emergencyBtn = document.querySelector('.emergency-btn');
    if (emergencyBtn) {
        emergencyBtn.onclick = () => window.location.href = `tel:${emergencyPhone}`;
    }

    if (studentNameElement) {
        const storedName = localStorage.getItem('studentName');
        if (storedName) {
            studentNameElement.textContent = `Welcome, ${escapeHtml(storedName)}`;
        }
    }

    function displayHostelRoom(hostel, room) {
        const displayValue = (value) => (value && value !== 'null' && value.trim() !== '') ? escapeHtml(value) : 'Not Set';
        if (hostelDisplay) hostelDisplay.textContent = displayValue(hostel);
        if (roomDisplay) roomDisplay.textContent = displayValue(room);
    }
    displayHostelRoom(currentHostel, currentRoom);

    function toggleEditMode(isEditing) {
        if (!profileDetailsSection) return;
        profileDetailsSection.classList.toggle('editing', isEditing);
        updateStatusElement.textContent = '';
    }

    if (editButton) {
        editButton.addEventListener('click', () => {
            hostelInput.value = (currentHostel && currentHostel !== 'null') ? currentHostel : '';
            roomInput.value = (currentRoom && currentRoom !== 'null') ? currentRoom : '';
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
            const newHostel = hostelInput.value.trim();
            const newRoom = roomInput.value.trim();
            saveButton.textContent = 'Saving...';
            saveButton.disabled = true;

            try {
                const updateResponse = await fetch('/student/hostel-details', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ hostel_no: newHostel, room_no: newRoom })
                });
                const updateResult = await updateResponse.json();
                if (updateResponse.ok && updateResult.success) {
                    currentHostel = newHostel || null;
                    currentRoom = newRoom || null;
                    localStorage.setItem('hostel_no', currentHostel || '');
                    localStorage.setItem('room_no', currentRoom || '');
                    displayHostelRoom(currentHostel, currentRoom);
                    toggleEditMode(false);
                    updateStatusElement.textContent = 'Details updated successfully!';
                    updateStatusElement.style.color = 'green';
                    setTimeout(() => { updateStatusElement.textContent = ''; }, 3000);
                } else {
                    throw new Error(updateResult.error || 'Failed to save details.');
                }
            } catch (error) {
                updateStatusElement.textContent = `Error: ${error.message}`;
                updateStatusElement.style.color = 'red';
            } finally {
                saveButton.textContent = 'Save Changes';
                saveButton.disabled = false;
            }
        });
    }

    await loadMedicalRecords(token, rollno);
});

async function loadMedicalRecords(token, rollno) {
    const tableBody = document.getElementById('records-table');
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="5" class="table-message">Loading history...</td></tr>`;

    try {
        const response = await fetch(`/records/${rollno}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Failed to fetch medical records`);
        }
        const records = result.data || [];
        tableBody.innerHTML = "";

        if (records.length > 0) {
            records.forEach((rec) => {
                const row = tableBody.insertRow();
                let formattedDate = new Date(rec.date).toLocaleDateString();

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
                    certificateCell.appendChild(downloadLink);
                } else {
                    certificateCell.textContent = 'NULL';
                }
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="5" class="table-message">No medical records found.</td></tr>`;
        }
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5" class="table-message" style="color: red;">Error loading records: ${escapeHtml(error.message)}</td></tr>`;
    }
}

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