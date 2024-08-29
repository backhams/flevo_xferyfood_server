const nodemailer = require('nodemailer');

// Function to send email notification
async function sendLoginEmailNotification(email, deviceName) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'flevologin@gmail.com',
            pass: 'axew yzib kjmu nltq'
        }
    });

    
    const newLoginDate = new Date(); // Get the current date and time

    // Function to format the date in 12-hour format with AM/PM
    function formatDateTo12Hour(date) {
        let hours = date.getHours();
        const minutes = ('0' + date.getMinutes()).slice(-2);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        return `${hours}:${minutes} ${ampm}`;
    }

    // Format new login date in human-readable format
    const newLoginFormatted = `${newLoginDate.getDate()} ${getMonthName(newLoginDate.getMonth())} ${newLoginDate.getFullYear()}, ${formatDateTo12Hour(newLoginDate)}`;

    const mailOptions = {
        from: 'flevologin@gmail.com',
        to: email,
        subject: '🔒 New Login Alert',
        html: `
        <html>
            <head>
                <style>
                    /* CSS styles */
                    body {
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                        background-color: #fff;
                        border-radius: 10px;
                        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                    }
                    .header {
                        background-color: #4CAF50;
                        padding: 10px;
                        border-radius: 10px 10px 0 0;
                        color: white;
                        text-align: center;
                    }
                    .message {
                        margin: 20px 0;
                        color: #333;
                    }
                    .message p {
                        margin: 0;
                        line-height: 1.6;
                    }
                    .bold {
                        font-weight: bold;
                    }
                    .footer {
                        text-align: center;
                        color: #999;
                        margin-top: 20px;
                    }
                    .btn {
                        background-color: #FF5733;
                        border: none;
                        color: white;
                        padding: 10px 20px;
                        text-align: center;
                        text-decoration: none;
                        display: inline-block;
                        font-size: 16px;
                        margin-top: 20px;
                        cursor: pointer;
                        border-radius: 5px;
                    }
                    .btn:hover {
                        background-color: #FF4500;
                    }
                    .social-icons {
                        margin-top: 20px;
                    }
                    .social-icons img {
                        width: 24px;
                        height: 24px;
                        margin: 0 10px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>New Login Alert!</h2>
                    </div>
                    <div class="message">
                        <p>👋 Hello,</p>
                        <p>We noticed a new login to your FleVo account from a device: <span class="bold">${deviceName}</span>.</p>
                        <p class="bold">🕒 Login Time:</p>
                        <p>${newLoginFormatted}</p>
                        <p>To ensure the security of your account, please review this login activity from your app settings. If you did not initiate this login, please take immediate action to secure your account by resetting your password and enabling two-factor authentication.</p>
                        <p>If this was you logging in from another device, no further action is required.</p>
                        <a href="yourapp://settings" class="btn">🔒 Review Login Activity</a>
                        <p>Thank you for using FleVo. Stay safe!</p>
                    </div>
                    <div class="footer">
                        <p>Powered by Xfery.com</p>
                        <p>📧 Contact us: flevocares@gmail.com</p>
                        <p>🏢 Xfery office, Kamalanagar, MZ</p>
                        <div class="social-icons">
                            <a href="https://www.facebook.com/xfery">
                                <img src="https://cdn-icons-png.flaticon.com/512/124/124010.png" alt="Facebook">
                            </a>
                            <a href="https://www.twitter.com/xfery">
                                <img src="https://cdn-icons-png.flaticon.com/512/124/124021.png" alt="Twitter">
                            </a>
                            <a href="https://www.instagram.com/flevonow">
                                <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" alt="Instagram">
                            </a>
                        </div>
                        <p>This is an automated message, please do not reply.</p>
                    </div>
                </div>
            </body>
        </html>`
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.log(error);
    }
}

// Function to get month name from month number
function getMonthName(monthNumber) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNumber];
}

module.exports = sendLoginEmailNotification;
