const { restaurant,order } = require('../model/userSchema');

const restaurantMiddleware = async (req, res, next) => {
  const { email, deviceToken,status } = req.body;

  if (!email || !deviceToken) {
    return res.status(400).json({ message: 'Email and deviceToken are required for authentication' });
  }

  try {
    const restaurantAuth = await restaurant.findOne({ email });

    if (restaurantAuth) {
      // Check if the deviceToken exists in the loginDevices array
      const deviceExists = restaurantAuth.loginDevices.some(device => device.deviceToken === deviceToken);

      if (!deviceExists) {
        return res.status(404).json({ message: "Device not found. Please login from a registered device." });
      }

      if (restaurantAuth.status === "inactive") {
        return res.status(401).json({ message: "Dear Restaurant Partner,\n\nYour account needs activation. Please verify your documents and complete your profile for smooth operations. Thank you." });
      } else if (restaurantAuth.status === "active") {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const restaurantUnpaidOrders = await order.find({
          restaurantEmail: email,
          status: "delivered",
          billingStatus: "unpaid",
          createdAt: { $lte: twentyFourHoursAgo }
        });
        
        if (restaurantUnpaidOrders.length >= 1 && status === 'online') {
          return res.status(401).json({ message: "Dear Restaurant Partner,\n\nWe hope this message finds you well. We wanted to kindly remind you that there are some unpaid daily orders pending. As per our agreement, we take a 27% commission from daily orders, and the due amount needs to be settled promptly to avoid any inconvenience. Your prompt attention to this matter is greatly appreciated. Thank you for your ongoing support and cooperation.\n\nWarm regards,\nFlavo" });
        } else {
          // Everything is okay for the restaurant role, call next()
          return next();
        }
      }
    } else {
      return res.status(404).json({ message: "User not found." });
    }
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = restaurantMiddleware;
