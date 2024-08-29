const nodemailer = require('nodemailer');

// Function to send welcome email
async function sendWelcomeEmailCustomer(email, name) {
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
        subject: '🍽️ Welcome to FleVo! 🍽️',
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
                        background-color: #FF69B4;
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
                        background-color: #FF1493;
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
                        <p>👋 Hello ${name},</p>
                        <p>🎉 Welcome to FleVo! 🎉</p>
                        <p>We are super excited to have you with us! At FleVo, we're all about bringing smiles and delicious food right to your doorstep. 😋</p>
                        <p>Here are a few things to get you started:</p>
                        <ol>
                            <li>🍕 Browse through our mouth-watering menu of restaurants.</li>
                            <li>🛒 Order your favorite dishes with just a few taps.</li>
                            <li>📦 Track your order as it makes its way to you.</li>
                        </ol>
                        <p>We're here to make sure you have the best experience ever! If you have any questions or need a hand, just give us a shout at flevocares@gmail.com.</p>
                        <a href="xferyfood://open" class="btn">🚀 Start Exploring Now</a>
                        <p>Thank you for choosing FleVo. Get ready to enjoy the yumminess! 🍔🍟🍣</p>
                    </div>
                    <div class="footer">
                        <p>Powered by Xfery.com</p>
                        <p>📧 Contact us: flevocares@gmail.com</p>
                        <p>🏢 Xfery office, Kamalanagar, MZ</p>
                        <div class="social-icons">
                            <a href="https://www.facebook.com/flevonow">
                                <img src="https://cdn-icons-png.flaticon.com/512/124/124010.png" alt="Facebook">
                            </a>
                            <a href="https://www.twitter.com/flevonow">
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

module.exports = sendWelcomeEmailCustomer;
