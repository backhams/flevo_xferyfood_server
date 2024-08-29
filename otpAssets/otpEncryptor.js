const Cryptr = require('cryptr');
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });
const cryptr = new Cryptr(process.env.ENCRYPTION_KEY);

// Function to generate OTP
function generateOTP() {
    // Generate a random 4-digit number
    const otp = Math.floor(1000 + Math.random() * 9000);
    return otp.toString();
}

// Function to encrypt OTP
function encryptOTP(otp) {
    return cryptr.encrypt(otp);
}

// Function to decrypt OTP
function decryptOTP(encryptedOTP) {
    return cryptr.decrypt(encryptedOTP);
}

module.exports = {
    generateOTP,
    encryptOTP,
    decryptOTP
};
