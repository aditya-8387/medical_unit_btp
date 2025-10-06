document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'medical_login.html';
        return;
    }

    const tableBody = document.getElementById('inventory-table-body');
    const renewStockBtn = document.getElementById('renew-stock-btn');
    const backToDashBtn = document.getElementById('back-to-dash-btn');
    const saveChangesBtn = document.getElementById('save-changes-btn');
    const statusMessage = document.getElementById('status-message');

    backToDashBtn.addEventListener('click', () => {
        window.location.href = 'medical_staff.html';
    });

    const showStatus = (message, isError = false) => {
        statusMessage.textContent = message;
        statusMessage.style.color = isError ? 'red' : 'green';
        setTimeout(() => { statusMessage.textContent = ''; }, 3500);
    };

    const loadInventory = async () => {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading inventory...</td></tr>`;
        try {
            const response = await fetch('/api/inventory/manage', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to fetch inventory.');
            }

            tableBody.innerHTML = '';
            result.data.forEach(item => {
                const row = tableBody.insertRow();
                row.innerHTML = `
                    <td>${item.medicine}</td>
                    <td>${item.stock}</td>
                    <td>${item.max_stock}</td>
                    <td class="actions-column">
                         <input type="number" class="stock-input" value="${item.stock}" min="0" data-medicine-name="${item.id}">
                    </td>
                `;
            });
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Error: ${error.message}</td></tr>`;
        }
    };

    saveChangesBtn.addEventListener('click', async () => {
        const updates = [];
        const inputs = tableBody.querySelectorAll('.stock-input');

        inputs.forEach(input => {
            const medicineName = input.dataset.medicineName;
            const newStock = parseInt(input.value, 10);

            if (!isNaN(newStock) && newStock >= 0) {
                updates.push({ medicine: medicineName, stock: newStock });
            }
        });

        if (updates.length === 0) {
            showStatus('No valid changes to save.', true);
            return;
        }

        try {
            const response = await fetch('/api/inventory/update-all', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ updates })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to save changes.');
            }
            showStatus('All changes saved successfully!');
            loadInventory();
        } catch (error) {
            showStatus(`Error: ${error.message}`, true);
        }
    });

    renewStockBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to reset all medicine stocks to their maximum value?')) {
            return;
        }

        try {
            const response = await fetch('/api/inventory/renew', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to renew stock.');
            }
            showStatus('All stock has been successfully renewed!');
            loadInventory();
        } catch (error) {
            showStatus(`Error: ${error.message}`, true);
        }
    });

    loadInventory();
});

