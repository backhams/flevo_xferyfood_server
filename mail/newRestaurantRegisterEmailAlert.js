const nodemailer = require('nodemailer');

// Function to send welcome email
async function sendWelcomeEmailRestaurant(email,name) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'flevo.notification@gmail.com',
            pass: 'loqz taat oxgs izuw'
        }
    });

    const mailOptions = {
        from: 'flevo.notification@gmail.com',
        to: email,
        subject: 'Welcome to FleVo!',
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
                    .message {
                        margin-bottom: 20px;
                        color: #333;
                    }
                    .message p {
                        margin: 0;
                        line-height: 1.5;
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
                        background-color: #4CAF50;
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
                        background-color: #45a049;
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
                    <div class="message">
                        <p>Hello ${name},</p>
                        <p>Welcome to FleVo!</p>
                        <p>You are just one step away from accepting online orders.</p>
                        <p>Please complete your restaurant profile and submit your FSSAI certificates to start receiving orders from hungry customers!</p>
                        <p>Here are the steps:</p>
                        <ol>
                            <li>Login to your FleVo Restaurant account.</li>
                            <li>Go to your profile settings.</li>
                            <li>Complete your restaurant profile details.</li>
                            <li>Submit your FSSAI certificates.</li>
                        </ol>
                        <p>Once you've completed these steps, you'll be ready to serve delicious meals through FleVo.</p>
                        <a href="xferyfood://open" class="btn">Complete Profile Now</a>
                        <p>If you have any questions or need assistance, feel free to contact our support team at flevocares@gmail.com or whatsapp us at +91 9612557102.</p>
                        <p>Thank you for choosing Xfery Food as your partner in the food delivery business.</p>
                    </div>
                    <div class="footer">
                        <p>Powered by Xfery.com</p>
                        <p>Contact us: flevocares@gmail.com | +91 9612557102</p>
                        <p>Xfery office, Kamalanagar, MZ</p>
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

module.exports = sendWelcomeEmailRestaurant;
