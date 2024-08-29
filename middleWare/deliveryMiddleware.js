const { deliveryPartner } = require('../model/userSchema');

const deliveryMiddleware = async (req, res, next) => {
  const { email, deviceToken } = req.body;

  if (!email || !deviceToken) {
    return res.status(400).json({ message: 'Email and deviceToken are required for authentication' });
  }

  try {
    const restaurantAuth = await deliveryPartner.findOne({ email });

    if (restaurantAuth) {
      // Check if the deviceToken exists in the loginDevices array
      const deviceExists = restaurantAuth.loginDevices.some(device => device.deviceToken === deviceToken);

      if (!deviceExists) {
        return res.status(404).json({ message: "Device not found. Please login from a registered device." });
      }

      if (restaurantAuth.status === "inactive") {
        return res.status(401).json({ message: "Dear Delivery Partner,\n\nYour account needs activation. Please verify your documents and complete your profile for smooth operations. Thank you." });
      } else if (restaurantAuth.status === "suspended") {
        return res.status(401).json({ message: "Dear Delivery Partner,\n\nYour account has been suspended. Please review our policies and ensure compliance to reactivate your account. If you have any questions or need assistance, please don't hesitate to contact us. We appreciate your cooperation in maintaining our standards. Thank you." });
      } else {
        // Everything is okay for the delivery partner role, call next()
        return next();
      }
    } else {
      return res.status(404).json({ message: "User not found." });
    }
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = deliveryMiddleware;
