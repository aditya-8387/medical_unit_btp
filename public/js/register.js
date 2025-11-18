// js/register.js
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const rollno = document.getElementById('rollno').value;
    const pass = document.getElementById('pass').value;
    const confirmPass = document.getElementById('confirm-pass').value;

    if (pass !== confirmPass) {
        alert("Passwords do not match!");
        return;
    }

    try {
        const response = await fetch('/register/student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roll_no: rollno, password: pass })
        });
        const data = await response.json();

        if (data.success) {
            alert('Account activated! You will be redirected to the login page.');
            window.location.href = 'medical_login.html';
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert('An error occurred. Please try again.');
    }
});