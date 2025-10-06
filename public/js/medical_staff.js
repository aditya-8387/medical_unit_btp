document.addEventListener("DOMContentLoaded", () => {
    // --- GLOBAL STATE ---
    let currentPrescription = [];
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = 'medical_login.html';
        return;
    }

    // --- ELEMENT REFERENCES ---
    const rollNoInput = document.getElementById("roll-no");
    const studentNameInput = document.getElementById("student-name");
    const recordForm = document.getElementById("record-form");
    const medicationSelect = document.getElementById('medication-select');
    const prescriptionTableBody = document.querySelector('#prescription-table tbody');
    const medicationsDisplay = document.getElementById('medications-display');
    const datePicker = document.getElementById("records-date-picker");

    // --- MODAL REFERENCES ---
    const modal = document.getElementById('prescription-modal');
    const addPrescriptionBtn = document.getElementById('add-prescription-btn');
    const closeModalBtn = document.querySelector('.close-btn');
    const confirmPrescriptionBtn = document.getElementById('confirm-prescription-btn');

    // --- INITIALIZATION ---
    const choices = new Choices(medicationSelect, {
        placeholder: true,
        placeholderValue: 'Type to search for a medicine...',
        searchResultLimit: 10,
    });

    populateMedicines();

    // --- EVENT LISTENERS ---
    addPrescriptionBtn.addEventListener('click', () => modal.style.display = 'block');
    closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target == modal) modal.style.display = 'none';
    });
    confirmPrescriptionBtn.addEventListener('click', handleConfirmPrescription);
    recordForm.addEventListener('submit', handleFormSubmit);
    rollNoInput.addEventListener('blur', fetchStudentName);

    medicationSelect.addEventListener('change', (event) => {
        if (!event.detail.value) return;
        const medName = event.detail.value;
        const isAlreadyAdded = currentPrescription.some(p => p.name === medName);
        if (!isAlreadyAdded) {
            currentPrescription.push({ name: medName, qty: 1 });
            updatePrescriptionTable();
        }
        choices.clearInput();
        choices.setChoiceByValue('');
        choices.hideDropdown();
    });

    if (datePicker) {
        const initialDate = getToday();
        datePicker.value = initialDate;
        datePicker.addEventListener('change', () => loadRecordsForDate(datePicker.value));
        loadRecordsForDate(initialDate);
    }

    // --- FUNCTIONS ---
    async function populateMedicines() {
        try {
            const response = await fetch('/api/inventory', { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            if (result.success) {
                const medicineOptions = result.data.map(med => ({
                    value: med.medicine,
                    label: `${med.medicine} (Stock: ${med.stock})`,
                    disabled: med.stock === 0
                }));
                medicineOptions.unshift({ value: '', label: 'Type to search...', selected: true, disabled: true });
                choices.setChoices(medicineOptions, 'value', 'label', false);
            }
        } catch (error) { console.error("Failed to load medicines:", error); }
    }

    function updatePrescriptionTable() {
        prescriptionTableBody.innerHTML = '';
        if (currentPrescription.length === 0) {
            prescriptionTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#888;">No medicines selected</td></tr>`;
        } else {
            currentPrescription.forEach((med, index) => {
                const row = prescriptionTableBody.insertRow();
                row.dataset.medicineName = med.name;
                row.innerHTML = `
                    <td>${med.name}</td>
                    <td><input type="number" min="1" value="${med.qty}" class="quantity-input" data-index="${index}"></td>
                    <td><button type="button" class="remove-med-btn" data-index="${index}">Remove</button></td>
                `;
            });
        }
        addTableEventListeners();
    }
    
    function addTableEventListeners() {
        prescriptionTableBody.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = e.target.dataset.index;
                currentPrescription[index].qty = parseInt(e.target.value, 10);
            });
        });
        prescriptionTableBody.querySelectorAll('.remove-med-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const index = e.target.dataset.index;
                currentPrescription.splice(index, 1);
                updatePrescriptionTable();
            });
        });
    }

    function handleConfirmPrescription() {
        const displayString = currentPrescription.map(p => `${p.name} (Qty: ${p.qty})`);
        medicationsDisplay.value = displayString.join(', ');
        modal.style.display = 'none';
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const remarksInput = document.getElementById("remarks");
        const record = {
            roll_no: rollNoInput.value.trim(),
            diagnosis: document.getElementById('diagnosis').value.trim(),
            remarks: remarksInput.value.trim(),
            medications: currentPrescription
        };
        if (!record.roll_no || !record.diagnosis) {
            alert('Please fill in Roll No and Diagnosis.');
            return;
        }
        try {
            const response = await fetch('/medical/staff/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(record)
            });
            const result = await response.json();
            if (response.ok && result.success) {
                alert('Record saved successfully!');
                recordForm.reset();
                medicationsDisplay.value = '';
                currentPrescription = [];
                updatePrescriptionTable();
                loadRecordsForDate(datePicker.value);
            } else {
                throw new Error(result.error || 'Failed to save record.');
            }
        } catch (error) { alert(`Error: ${error.message}`); }
    }

    async function fetchStudentName() {
        const rollNo = rollNoInput.value.trim();
        studentNameInput.value = '';
        if (!rollNo) return;
        try {
            const response = await fetch(`/student/${rollNo}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            studentNameInput.value = result.success ? result.name : 'Student not found';
        } catch(err) {
            studentNameInput.value = 'Error fetching name';
        }
    }

    async function loadRecordsForDate(targetDate) {
        const tableBody = document.querySelector("#records-table tbody");
        if (!tableBody) return;
        tableBody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
        try {
            const response = await fetch(`/medical/staff/records?date=${targetDate}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            
            tableBody.innerHTML = '';
            if (result.data.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="7">No records found for ${targetDate}</td></tr>`;
                return;
            }
            result.data.forEach(record => {
                const row = tableBody.insertRow();
                row.insertCell().textContent = new Date(record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                row.insertCell().textContent = escapeHtml(record.name);
                row.insertCell().textContent = escapeHtml(record.roll_no);
                row.insertCell().textContent = escapeHtml(record.diagnosis);
                row.insertCell().textContent = escapeHtml(record.medications || 'N/A');
                row.insertCell().textContent = escapeHtml(record.remarks || 'N/A');
                
                const actionCell = row.insertCell();
                const certButton = document.createElement('button');
                certButton.id = `issue-cert-btn-${record.recordId}`;
                certButton.className = 'issue-cert-btn';
                certButton.dataset.recordId = record.recordId;
                certButton.dataset.rollNo = record.roll_no;
                certButton.dataset.name = record.name;
                certButton.dataset.diagnosis = record.diagnosis;
                certButton.dataset.medications = record.medications;
                certButton.dataset.remarks = record.remarks;
                certButton.dataset.buttonId = certButton.id;

                if (record.hasCertificate) {
                    certButton.textContent = 'Certificate Issued';
                    certButton.disabled = true;
                    certButton.style.cssText = 'cursor: not-allowed; background-color: #6c757d;';
                } else {
                    certButton.textContent = '+ Issue Medical Certificate';
                    certButton.onclick = () => openCertificateTemplate(certButton.dataset);
                }
                actionCell.appendChild(certButton);
            });
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="7" style="color:red;">Error: ${error.message}</td></tr>`;
        }
    }
    
    function getToday() {
        return new Date().toISOString().slice(0, 10);
    }
    
    function openCertificateTemplate(data) {
        const certificateData = {
            recordId: data.recordId, rollNo: data.rollNo, name: data.name,
            diagnosis: data.diagnosis, medications: data.medications,
            remarks: data.remarks,
            date: getToday()
        };
        localStorage.setItem('certificateData', JSON.stringify(certificateData));
        localStorage.setItem('certificateButtonId', data.buttonId);
        window.open('certificate_template.html', '_blank');
    }

    window.disableCertificateButton = (buttonId) => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = true;
            button.textContent = 'Certificate Issued';
            button.style.cssText = 'cursor: not-allowed; background-color: #6c757d;';
            button.onclick = null;
        }
    };

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            if (unsafe == null) return '';
            try { unsafe = String(unsafe); } catch { return ''; }
        }
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    
    updatePrescriptionTable();
});