const { restaurant, deliveryPartner, order } = require('../model/userSchema');

const socketAuth = async (socket, next) => {
  const event = socket.handshake.query.event;
  // console.log(event)

  // Skip authentication if purpose is "uiUpdate" or "liveVisitor"
  if (event === "uiUpdate" || event === "liveVisitor") {
    return next();
  }

  const email = socket.handshake.query.auth;
  const role = socket.handshake.query.role;
  // console.log(email, role);

  const validRoles = ['restaurant', 'customer', 'deliveryPartner'];

  if (!email || !role) {
    const error = 'Email and role are required for authentication';
    return next({ message: error });
  } else if (!validRoles.includes(role)) {
    return next({ message: "Invalid role" });
  }

  if (role === 'restaurant') {
    try {
      const restaurantAuth = await restaurant.findOne({ email });
      if (restaurantAuth) {
        if (restaurantAuth.status === "inactive") {
          return next({ message: "Dear Restaurant Partner,\n\nYour account needs activation. Please verify your documents and complete your profile for smooth operations. Thank you." });
        } else if (restaurantAuth.status === "active") {
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const restaurantUnpaidOrders = await order.find({
            restaurantEmail: email,
            status: "delivered",
            billingStatus: "unpaid",
            createdAt: { $lte: twentyFourHoursAgo }
          });
          
          if (restaurantUnpaidOrders.length >= 1) {
            return next({ message: "Dear Restaurant Partner,\n\nWe hope this message finds you well. We wanted to kindly remind you that there are some unpaid daily orders pending. As per our agreement, we take a 27% commission from daily orders, and the due amount needs to be settled promptly to avoid any inconvenience. Your prompt attention to this matter is greatly appreciated. Thank you for your ongoing support and cooperation.\n\nWarm regards,\nXferyFood" });

          } else {
            // Everything is okay for the restaurant role, call next()
            return next();
          }
        }
      } else {
        return next({ message: "User not found." });
      }
    } catch (error) {
      return next({ message: "Internal server error." });
    }
  } else if (role === 'deliveryPartner') {
    try {
      const deliveryAuth = await deliveryPartner.findOne({ email });
      if (deliveryAuth) {
        if (deliveryAuth.status === "inactive") {
          return next({ message: "Dear Delivery Partner,\n\nYour account needs activation. Please verify your documents and complete your profile for smooth operations. Thank you." });
        } else {
          // Everything is okay for the delivery role, call next()
          return next();
        }
      } else {
        return next({ message: "User not found." });
      }
    } catch (error) {
      return next({ message: "Internal server error." });
    }
  } else {
    // For other roles, just attach the role to the socket object and proceed
    socket.role = role;
    next();
  }
};

module.exports = socketAuth;
