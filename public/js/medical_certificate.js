document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem('token');
    if (!token) {
        console.warn("No auth token found. Redirecting to login.");
        window.location.href = 'medical_login.html';
        return;
    }

    const certificateDataString = localStorage.getItem('certificateData');
    if (!certificateDataString) {
        alert("Error: No certificate data found. Please go back to the staff dashboard and try again.");
        return;
    }

    const certificateData = JSON.parse(certificateDataString);
    console.log("Certificate page loaded with data:", certificateData);

    const nameField = document.getElementById("name");
    const dateField = document.getElementById("date");
    const diagnosisField = document.getElementById("diagnosis");
    const rxField = document.getElementById("rx");
    const serialNoElement = document.getElementById("serialNo");

    if (nameField && certificateData.name) nameField.value = certificateData.name;
    if (dateField && certificateData.date) dateField.value = certificateData.date;
    if (diagnosisField && certificateData.diagnosis) diagnosisField.value = certificateData.diagnosis;
    if (rxField && certificateData.medications) rxField.value = certificateData.medications;

    if (serialNoElement && !serialNoElement.textContent.trim()) {
        serialNoElement.textContent = "LNMIIT/MED/" + Math.floor(1000 + Math.random() * 9000);
    }

    const canvas = document.getElementById("signature-pad");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        let isDrawing = false;

        canvas.addEventListener("mousedown", () => isDrawing = true);
        canvas.addEventListener("mouseup", () => { isDrawing = false; ctx.beginPath(); });
        canvas.addEventListener("mouseleave", () => isDrawing = false);
        canvas.addEventListener("mousemove", (e) => draw(e, ctx, isDrawing));

        canvas.addEventListener("touchstart", (e) => {
            e.preventDefault();
            isDrawing = true;
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent("mousedown", {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        }, false);

        canvas.addEventListener("touchend", (e) => {
            e.preventDefault();
            isDrawing = false;
            const mouseEvent = new MouseEvent("mouseup", {});
            canvas.dispatchEvent(mouseEvent);
            ctx.beginPath();
        }, false);

        canvas.addEventListener("touchmove", (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent("mousemove", {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        }, false);
    } else {
        console.warn("Signature pad canvas element not found.");
    }

    window.certificateRollNo = certificateData.rollNo;

    console.log("Medical certificate page setup complete.");
});

function draw(e, ctx, isDrawing) {
    if (!isDrawing) return;

    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function clearSignature() {
    const canvas = document.getElementById("signature-pad");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
    }
}
