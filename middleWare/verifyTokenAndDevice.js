const jwt = require('jsonwebtoken');
const { customer, deliveryPartner, restaurant } = require('../model/userSchema');

const verifyTokenAndDevice = async (req, res, next) => {
    const token = req.headers.authorization
    const deviceToken = req.headers['x-device-token'];
    const userRole = req.headers['x-user-role'];
    // console.log(userRole)

    if (!token || !deviceToken || !userRole) {
        return res.status(401).json({ message: "Token, deviceToken, or userRole not provided" });
    }

    try {
        // Verify the JWT token
        const splitToken = await token.split(' ')[1];
        const decodedToken = jwt.verify(splitToken, process.env.SECRET_KEY);

        // Extract email from the token payload
        const email = decodedToken.email;

        let userDocument;

        // Find the user document based on the role and email
        switch (userRole) {
            case 'customer':
                userDocument = await customer.findOne({ email });
                break;
            case 'restaurant':
                userDocument = await restaurant.findOne({ email });
                break;
            case 'deliveryPartner':
                userDocument = await deliveryPartner.findOne({ email });
                break;
            default:
                return res.status(400).json({ message: "Invalid user role" });
        }

        if (!userDocument) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if device token exists in loginDevices field array
        const deviceExists = userDocument.loginDevices.some(deviceObj => deviceObj.deviceToken === deviceToken);

        // console.log(deviceExists)

        if (!deviceExists) {
            return res.status(401).json({ message: "Device token not authorized" });
        }

        // If verification succeeds, attach the user document to the request object
        req.user = userDocument;
        next();
    } catch (error) {
        console.log('Error verifying token:', error.message);
        return res.status(401).json({ message: "Invalid token" });
    }
};

module.exports = verifyTokenAndDevice;
