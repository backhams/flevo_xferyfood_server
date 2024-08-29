// Import required modules
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cron = require('node-cron');
const mongoose = require("mongoose");
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const moment = require('moment');
// const { createClient } = require('redis');
const RedisClient = require('ioredis');

const otpUtils = require('./otpAssets/otpEncryptor');

const {
  menu,
  order,
  deliveryPartner,
  rating,
  restaurant,
  customer
} = require("./model/userSchema");
const { firebase } = require("./firebase/notificationService");
const verifyTokenAndDevice = require("./middleWare/verifyTokenAndDevice");
const socketAuth = require('./middleWare/socketAuth')
const restaurantMiddleware = require('./middleWare/restaurantMiddleware')
const deliveryMiddleware = require('./middleWare/deliveryMiddleware')

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Database connection
require("./db/conn");

// Create a Redis client with remote server details
const client = new RedisClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

// // Log Redis errors
client.on('error', (err) => {
  console.log('Redis Client Error', err.message);
});

// // Connect to Redis
client.on('connect', () => {
  console.log('Connected to remote Redis server');
});

// This is to parse JSON files into JavaScript objects
// app.use(express.json());

// Define a rate limit rule
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again after 15 minutes.'
// });

// // Apply the rate limit to all requests
// app.use(limiter);

// Middleware to parse JSON bodies and attach the raw body to req.rawBody
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
// Connection of router file
app.use(require("./router/auth"));


// Object to store pending orders and their timers
const pendingOrders = {};

// Function to check order status after a delay
async function checkOrderStatus({ orderId, title }) {
  // Wait for 1 minute
  await new Promise(resolve => setTimeout(resolve, 2.5 * 60 * 1000));

  // Fetch the order from the database
  const orderTimer = await order.findOne({ orderId });

  // If order is not confirmed, send cancellation notification to customer
  if (orderTimer && orderTimer.status === 'ordered') {
    // Update order status to "cancel"
    const email = orderTimer.customerEmail;

    let deviceTokens = [];

    // Find document with the given email and retrieve device tokens
    const user = await customer.findOne({ email });
    if (user) {
      deviceTokens = user.loginDevices.map(device => device.deviceToken);
    }

    await order.findOneAndUpdate({ orderId }, { $set: { status: 'cancel', cancelBy: 'Automated cancellation: Restaurant unavailable when you ordered.' } });

    // Update restaurant online status to "offline"
    await restaurant.findOneAndUpdate({ email: orderTimer.restaurantEmail }, { $set: { onlineStatus: 'offline' } });

    if (deviceTokens.length > 0) {
      await firebase.messaging().sendEachForMulticast({
        tokens: deviceTokens,
        notification: {
          title: "Order Canceled",
          body: `We're sorry, but your order for ${title} has been canceled due to restaurant unavailability.`,
        },
      });
    }
  }

  // Remove the order from pendingOrders
  delete pendingOrders[orderId];
}


// Create HTTP server and integrate with Express app
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*", // Adjust this to your React Native app's origin if needed
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true // This allows backward compatibility with clients using Engine.IO v3
});

// // Object to store data sent during connection
// let connectedData = {};

// // Object to store delivery partner responses
// let availabledelivery = {};

// Apply the middleware to all socket connections
io.use(socketAuth);

// Define a connection event handler
io.on("connection", (socket) => {
  // console.log("A client connected.");

  // Handle socket disconnection
  socket.on('disconnect', async () => {
    const socketId = socket.id;

    // Check if the socket ID is present in the Redis store
    const locationKey = 'active_users';
    try {
      const score = await client.zscore(locationKey, socketId);
      if (score !== null) {
        await client.zrem(locationKey, socketId);
      }
    } catch (err) {
      // Log error for removing location data
      console.log('Error removing location data from Redis', err.message);
    }
  });

  // Handle location updates from the client
  socket.on('locationUpdate', async (data) => {
    const socketId = socket.id; // Use socket ID as the identifier
    const latitude = data.latitude;
    const longitude = data.longitude;

    // Ensure latitude and longitude are numbers
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      // Log error for invalid data
      console.log('Invalid latitude or longitude');
      return;
    }

    // Store the latitude and longitude in Redis using GEOADD
    const locationKey = 'active_users';
    try {
      await client.geoadd(locationKey, longitude, latitude, socketId);
    } catch (err) {
      // Log error for storing location data
      console.log('Error storing location data in Redis', err.message);
    }

    // Emit the app version back to the same client
    const appVersion = process.env.CURRENT_APP_VERSION;
    socket.emit('appVersion', appVersion);
  });


  // Handle message event from client and emit back to the same client
  socket.on("message", async (orderId) => {

    try {
      // Query the database to find the document with the specified orderId
      const document = await order.findOne({ orderId });

      if (document) {
        // Extract the status field from the document
        const status = document.assignStatus;

        // Emit the status back to the same client
        socket.emit("message", status);
      } else {
        // If document not found, emit a message indicating so
        socket.emit("message", "Document not found");
      }
    } catch (error) {
      console.log("Error:", error.message);
      // Handle error and emit back to the client
      socket.emit("message", "Error occurred while processing request");
    }
  });
});

// // // Define a change stream with a pipeline to watch updates on the 'assignStatus' field
// const changeStream = order.watch([
//   { $match: { 'updateDescription.updatedFields.assignStatus': { $exists: true } } }
// ]);

// // Listen for changes in the 'order' collection
// changeStream.on('change', async (change) => {
//   // Check if the change corresponds to an update operation and 'assignStatus' field
//   if (change.operationType === 'update' && change.updateDescription.updatedFields && change.updateDescription.updatedFields.assignStatus) {
//     let orderId;
//     if (change.fullDocument) {
//       orderId = change.fullDocument.orderId;
//     } else {
//       const document = await order.findOne({ _id: change.documentKey._id });
//       if (document) {
//         orderId = document.orderId;
//       } else {
//         console.log('Document not found for change:', change);
//         return;
//       }
//     }
//     const newAssignStatus = change.updateDescription.updatedFields.assignStatus;

//     // Emit a socket event to all clients with orderId and newAssignStatus
//     io.emit("orderAssignStatusChange", orderId);
//   }
// });



async function orderAssign(nearestDeliveries, orderId) {
  try {

    let assignmentMade = false; // Flag variable to track assignment

    for (const delivery of nearestDeliveries) {
      const deliveryQuery = await deliveryPartner.findOne({ email: delivery.email });

      await order.updateOne(
        { orderId: orderId },
        { $set: { deliveryPartnerId: deliveryQuery._id, deliveryEmail: deliveryQuery.email, deliveryNumber: deliveryQuery.phoneNumber, deliveryProfile: deliveryQuery.profileImage, deliveryName: deliveryQuery.userName, assignAt: new Date() } }
      );

      const email = deliveryQuery.email;

      let deviceTokens = [];

      // Find document with the given email and retrieve device tokens
      const user = await deliveryPartner.findOne({ email });
      if (user) {
        deviceTokens = user.loginDevices.map(device => device.deviceToken);
      }

      if (deviceTokens.length > 0) {
        // Send notification to the delivery person
        await firebase.messaging().sendEachForMulticast({
          tokens: deviceTokens,
          notification: {
            title: "New Order",
            body: `You have a new order.`,
          },
        });
      }

      // Wait for 1 minutes
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minutes in milliseconds

      // Check order status
      const orderDetails = await order.findOne({ orderId });

      // if (!orderDetails) {
      //   throw new Error("Order not found");
      // }

      if (orderDetails && orderDetails.assignStatus === "yet to assign") {

        const email = orderDetails.deliveryEmail;

        let deviceTokens = [];

        // Find document with the given email and retrieve device tokens
        const user = await deliveryPartner.findOne({ email });
        if (user) {
          deviceTokens = user.loginDevices.map(device => device.deviceToken);
        }

        if (deviceTokens.length > 0) {
          // Send cancellation notification
          await firebase.messaging().sendEachForMulticast({
            tokens: deviceTokens,
            notification: {
              title: "Automated Order Cancel",
              body: `Order has been cancelled due to no response from you.`,
            },
          });
        }
      } else {

        const email = orderDetails.restaurantEmail;

        let deviceTokens = [];

        // Find document with the given email and retrieve device tokens
        const user = await restaurant.findOne({ email });
        if (user) {
          deviceTokens = user.loginDevices.map(device => device.deviceToken);
        }

        if (deviceTokens.length > 0) {
          // Send notification to the restaurant
          await firebase.messaging().sendEachForMulticast({
            tokens: deviceTokens,
            notification: {
              title: "Order Confirm",
              body: `Delivery partner will arrive shortly.`,
            },
          });
        }
        assignmentMade = true; // Set flag to true
        // Exit the loop early as the order is already confirmed
        break;
      }
    }

    if (!assignmentMade) {
      // If no assignment made, proceed with checkFinal code block
      const checkingFinal = await order.findOneAndUpdate(
        { orderId: orderId },
        { assignStatus: "not assign" },
        { new: true }
      );

      const email = checkingFinal.restaurantEmail;

      let deviceTokens = [];

      // Find document with the given email and retrieve device tokens
      const user = await restaurant.findOne({ email });
      if (user) {
        deviceTokens = user.loginDevices.map(device => device.deviceToken);
      }

      if (deviceTokens.length > 0) {
        await firebase.messaging().sendEachForMulticast({
          tokens: deviceTokens,
          notification: {
            title: "Partner Not Assign",
            body: `The order with ID ${orderId} did not assign delivery partner.`,
          },
        });
      }

    }

  } catch (error) {
    console.log("Error assigning orders:", error);
  }
}


async function reAssignOrder(nearestDeliveries, orderId) {
  try {

    let assignmentMade = false; // Flag variable to track assignment

    for (const delivery of nearestDeliveries) {
      const deliveryQuery = await deliveryPartner.findOne({ email: delivery.email });

      await order.updateOne(
        { orderId: orderId },
        {
          $set: {
            assignStatus: "yet to assign",
            deliveryEmail: deliveryQuery.email,
            deliveryPartnerId: deliveryQuery._id,
            deliveryNumber: deliveryQuery.phoneNumber,
            deliveryProfile: deliveryQuery.profileImage,
            deliveryName: deliveryQuery.userName,
            assignAt: new Date(),
            reOrderAssign: true
          }
        }
      );

      const email = deliveryQuery.email;

      let deviceTokens = [];

      // Find document with the given email and retrieve device tokens
      const user = await deliveryPartner.findOne({ email });
      if (user) {
        deviceTokens = user.loginDevices.map(device => device.deviceToken);
      }

      if (deviceTokens.length > 0) {
        // Send notification to the delivery person
        await firebase.messaging().sendEachForMulticast({
          tokens: deviceTokens,
          notification: {
            title: "New Order",
            body: `You have a new order.`,
          },
        });
      }

      // Wait for 1 minutes
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minutes in milliseconds

      // Check order status
      const orderDetails = await order.findOne({ orderId });

      // if (!orderDetails) {
      //   throw new Error("Order not found");
      // }

      if (orderDetails && orderDetails.assignStatus === "yet to assign") {

        const email = orderDetails.deliveryEmail;

        let deviceTokens = [];

        // Find document with the given email and retrieve device tokens
        const user = await deliveryPartner.findOne({ email });
        if (user) {
          deviceTokens = user.loginDevices.map(device => device.deviceToken);
        }

        if (deviceTokens.length > 0) {
          // Send cancellation notification
          await firebase.messaging().sendEachForMulticast({
            tokens: deviceTokens,
            notification: {
              title: "Automated Order Cancel",
              body: `Order has been cancelled due to no response from you.`,
            },
          });
        }
      } else {

        const email = orderDetails.restaurantEmail;

        let deviceTokens = [];

        // Find document with the given email and retrieve device tokens
        const user = await restaurant.findOne({ email });
        if (user) {
          deviceTokens = user.loginDevices.map(device => device.deviceToken);
        }

        if (deviceTokens.length > 0) {
          // Send notification to the restaurant
          await firebase.messaging().sendEachForMulticast({
            tokens: deviceTokens,
            notification: {
              title: "Order Confirm",
              body: `Delivery partner will arrive shortly.`,
            },
          });
        }
        assignmentMade = true; // Set flag to true
        // Exit the loop early as the order is already confirmed
        break;
      }
    }

    if (!assignmentMade) {
      // If no assignment made, proceed with checkFinal code block
      const checkingFinal = await order.findOneAndUpdate(
        { orderId: orderId },
        { assignStatus: "not assign", reOrderAssign: false },
        { new: true }
      );

      const email = checkingFinal.restaurantEmail;

      let deviceTokens = [];

      // Find document with the given email and retrieve device tokens
      const user = await restaurant.findOne({ email });
      if (user) {
        deviceTokens = user.loginDevices.map(device => device.deviceToken);
      }

      if (deviceTokens.length > 0) {
        await firebase.messaging().sendEachForMulticast({
          tokens: deviceTokens,
          notification: {
            title: "Partner Not Assign",
            body: `The order with ID ${orderId} did not assign delivery partner.`,
          },
        });
      }

    }

  } catch (error) {
    console.log("Error assigning orders:", error);
  }
}

// function to reset daily orders after midnight
async function resetDailyOrders() {
  try {

    // Reset daily_orders to 0 for documents where daily_orders is not already 0
    await deliveryPartner.updateMany(
      { dailyOrders: { $ne: 0 } }, // Filter for documents where daily_orders is not 0
      { $set: { dailyOrders: 0 } }
    );

    console.log('Daily orders have been reset to 0 for applicable documents');
  } catch (err) {
    console.log('Failed to reset daily orders:', err);
  }
}

// Schedule the task to run at 12 AM every day
cron.schedule('0 0 * * *', () => {
  console.log('Running the resetDailyOrders task at 12 AM');
  resetDailyOrders();
});


// Function to conditionally remove data from 'active_users' key when ser ver restart
async function clearActiveUsers() {
  const locationKey = 'active_users';

  try {
    // Check if the key exists and has data
    const exists = await client.exists(locationKey);
    if (exists) {
      const count = await client.zcard(locationKey);
      if (count > 0) {
        await client.del(locationKey);
        console.log(`Cleared all data from ${locationKey}`);
      } else {
        console.log(`${locationKey} is empty, no need to clear.`);
      }
    } else {
      console.log(`${locationKey} does not exist.`);
    }
  } catch (err) {
    console.error(`Error clearing data from ${locationKey}`, err.message);
  }
}

// Call the function to clear data on server restart
clearActiveUsers();


app.get('/active_users', async (req, res) => {
  const locationKey = 'active_users';

  try {
    // Get all members (socket IDs) in the sorted set
    const members = await client.zrange(locationKey, 0, -1);
    if (members.length === 0) {
      return res.json([]);
    }

    // Get positions of all members
    const positions = await client.geopos(locationKey, ...members);

    // Combine members with their positions
    const users = members.map((member, index) => ({
      member,
      coordinates: positions[index]
    }));

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/restaurantActiveStatus", restaurantMiddleware, async (req, res) => {
  const { status, email } = req.body;

  try {
    if (status !== "online" && status !== "offline") {
      return res.status(401).json({ message: "Unauthorized request." });
    }

    // Check for dispute orders if the status is "online"
    if (status === "online") {
      const currentTime = new Date();
      const twoHoursAgo = new Date(currentTime.getTime() - 2 * 60 * 60 * 1000);

      const disputeOrders = await order.find({
        restaurantEmail: email,
        status: { $nin: ["cancel", "delivered", "ordered", "pick up", "ready"] },
        createdAt: { $lte: twoHoursAgo }
      });
      console.log(disputeOrders)
      if (disputeOrders.length > 0) {
        return res.status(403).json({ message: "You have dispute orders. Please resolve them first before coming online." });
      }

      // Find the restaurant to get its coordinates
      const restaurantDetails = await restaurant.findOne({ email });

      if (!restaurantDetails) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const { coordinates } = restaurantDetails.location;

      // Check for nearby delivery partners within a 500-meter radius
      const nearbyDeliveryPartner = await deliveryPartner.findOne({
        "location.coordinates": {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: coordinates
            },
            $maxDistance: 500
          }
        },
        onlineStatus: "online"
      });

      if (!nearbyDeliveryPartner) {
        return res.status(403).json({
          message: "There are currently no delivery partners available in your area. However, you can still come online and use the self-delivery features, or wait until a delivery partner comes online."
        });
      }
    }

    // Find the restaurant by email and update its status
    const restaurantStatusUpdate = await restaurant.findOneAndUpdate(
      { email },
      { onlineStatus: status },
      { new: true } // Return the updated document
    );

    if (!restaurantStatusUpdate) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    res.json({ message: "Restaurant status updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});

// endpoint for resturant to come online forcefully when their is no delivery partner
app.patch("/restaurantForceActiveStatus", async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(401).json({ message: "Unauthorized request." });
    }

    // Check for dispute orders if the status is "online"
    const currentTime = new Date();
    const twoHoursAgo = new Date(currentTime.getTime() - 2 * 60 * 60 * 1000);

    const disputeOrders = await order.find({
      restaurantEmail: email,
      status: { $nin: ["cancel", "delivered", "ordered", "pick up", "ready"] },
      createdAt: { $lte: twoHoursAgo }
    });

    if (disputeOrders.length > 0) {
      return res.status(403).json({ message: "You have dispute orders. Please resolve them first before coming online." });
    }

    // Find the restaurant by email and update its status
    const restaurantStatusUpdate = await restaurant.findOneAndUpdate(
      { email },
      { onlineStatus: "online" },
      { new: true } // Return the updated document
    );

    if (!restaurantStatusUpdate) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    res.json({ message: "Restaurant status updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});




app.patch("/deliveryActiveStatus", deliveryMiddleware, async (req, res) => {
  const { status, email, coordinates } = req.body;

  try {
    if (status !== "online" && status !== "offline") {
      return res.status(401).json({ message: "Unauthorized request." });
    }

    if (!coordinates || !coordinates.latitude || !coordinates.longitude) {
      return res.status(400).json({ message: "Coordinates are missing or invalid." });
    }

    const { latitude, longitude } = coordinates;

    if (isNaN(latitude) || isNaN(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ message: "Invalid latitude or longitude." });
    }

    let updateObject = { onlineStatus: status };

    if (status === "online") {
      const currentTime = new Date();
      const twoHoursAgo = new Date(currentTime.getTime() - 2 * 60 * 60 * 1000);

      const disputeOrders = await order.find({
        deliveryEmail: email,
        status: "pick up",
        assignStatus: "assign",
        createdAt: { $lte: twoHoursAgo }
      });

      if (disputeOrders.length > 0) {
        return res.status(403).json({ message: "You have dispute orders. Please resolve them first before coming online." });
      }

      const nearbyRestaurant = await restaurant.findOne({
        "location.coordinates": {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [longitude, latitude]
            },
            $maxDistance: 500
          }
        },
        onlineStatus: "online"
      });

      if (!nearbyRestaurant) {
        return res.status(403).json({ message: "Out of hotspot zone. Please move to a location within the hotspot zone." });
      }

      // Check if email exists in any restaurant's linkIds array
      const linkedRestaurant = await restaurant.findOne({ "linkIds.email": email });
      updateObject["linkStatus"] = linkedRestaurant ? "linked" : "unlinked";
      updateObject["location.coordinates"] = [longitude, latitude];
    }

    const deliveryStatusUpdate = await deliveryPartner.findOneAndUpdate(
      { email },
      { $set: updateObject },
      { new: true }
    );

    if (!deliveryStatusUpdate) {
      return res.status(404).json({ message: "Delivery partner not found." });
    }

    res.json({ message: "Delivery status updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});



app.post("/checkOnlineStatus", async (req, res) => {
  const { email, role } = req.body;
  try {
    let checkStatus;
    switch (role) {
      case "restaurant":
        checkStatus = await restaurant.findOne({ email }).select("onlineStatus");
        break;
      case "deliveryPartner":
        checkStatus = await deliveryPartner.findOne({ email }).select("onlineStatus");
        break;
      default:
        return res.status(400).json({ message: "Invalid role." });
    }
    if (!checkStatus) {
      return res.status(404).json({ message: "User not found." });
    }
    // Assuming onlineStatus is a field in the found document
    res.status(200).json({ onlineStatus: checkStatus.onlineStatus });
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});


app.get("/hotspotZone", async (req, res) => {
  const { latitude, longitude } = req.query;
  try {
    if (!latitude || !longitude) {
      return res.status(401).json({ message: "Coordinates Required." });
    }
    const nearbyHotspot = await restaurant.find({
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude]
          },
          $maxDistance: 3000
        }
      },
      onlineStatus: "online"
    });
    if (!nearbyHotspot || nearbyHotspot.length === 0) {
      return res.status(404).json({ message: "No hotspot zone currently available." });
    }
    // Extract only latitude and longitude fields from each object
    const simplifiedHotspotData = nearbyHotspot.map(({ location }) => ({
      latitude: location.coordinates[1], // latitude is at index 1
      longitude: location.coordinates[0] // longitude is at index 0
    }));
    res.status(200).json(simplifiedHotspotData);
  } catch (error) {
    res.status(500).json({ message: "Internal server error." });
  }
});




app.post("/availableDeliveryFinder", async (req, res) => {
  try {
    const { orderId, time, restaurantEmailId } = req.body;

    if (!orderId || !time) {
      return res.status(400).json({ error: "orderId,restaurantId and time are required." });
    }

    // Check the restaurant collection for the given restaurantEmailId
    const selfDeliveryStatus = await restaurant.findOne({ email: restaurantEmailId });

    if (!selfDeliveryStatus) {
      return res.status(404).json({ error: "Restaurant not found." });
    }

    const { selfDelivery, linkIds, latitude, longitude } = selfDeliveryStatus;

    // If selfDelivery is "on", return the linkIds array
    if (selfDelivery === "on") {
      return res.status(300).json(linkIds);
    }

    // Continue with the original task if selfDelivery is "off"
    // Filter available delivery partners based on orders value less than 3
    // Find delivery partners within 700 meters
    const deliveryPartners = await deliveryPartner.find({
      "location.coordinates": {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: 2500 // 2500 meters
        }
      },
      activeOrders: { $lt: 3 }, // Exclude those with 3 or more orders
      status: "active",
      onlineStatus: "online",
      linkStatus: "unlinked"
    })
      .limit(3)
      .lean();

    // Calculate combined score and sort
    const sortedDeliveryPartners = deliveryPartners.map(partner => {
      const combinedScore = partner.dailyOrders + partner.failedOrders;
      return { ...partner, combinedScore };
    }).sort((a, b) => a.combinedScore - b.combinedScore);

    // Limit the results to top 3
    const nearestDeliveries = sortedDeliveryPartners.slice(0, 3);

    if (nearestDeliveries.length === 0) {
      return res.status(404).send('No delivery partners found within the specified distance.');
    }

    const currentTime = new Date().toISOString();

    const orderDocument = await order.findOneAndUpdate(
      { orderId: orderId },
      {
        $set: {
          status: "preparing",
          preparationCreatedAt: currentTime,
          preparationTime: time,
          nearbyPartner: nearestDeliveries.length
        }
      },
      { new: true }
    );

    orderAssign(nearestDeliveries, orderId);

    const email = orderDocument.customerEmail;

    let deviceTokens = [];

    // Find document with the given email and retrieve device tokens
    const user = await customer.findOne({ email });
    if (user) {
      deviceTokens = user.loginDevices.map(device => device.deviceToken);
    }

    if (deviceTokens.length > 0) {
      await firebase.messaging().sendEachForMulticast({
        tokens: deviceTokens,
        notification: {
          title: "Order Confirm",
          body: `Your ${orderDocument.title} is preparing for you. It will be completed in ${time} minutes.`,
        },
      });
    }

    // Send response with details of the nearest delivery partners
    return res.status(200).json({ message: "Your order has been assigned to a delivery partner" });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
});



app.post("/handleSelfDelivery", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { latitude, longitude, orderId, time, restaurantEmailId, deliveryPartnerEmail } = req.body;

    if (!latitude || !longitude || !orderId || !time || !restaurantEmailId || !deliveryPartnerEmail) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "All fields are required." });
    }

    const deliveryActiveStatus = await deliveryPartner.findOne({ email: deliveryPartnerEmail }).session(session);

    if (!deliveryActiveStatus) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Delivery partner not found." });
    }

    const { onlineStatus } = deliveryActiveStatus;

    // If the delivery partner is offline, return an error message
    if (onlineStatus === "offline") {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "The delivery partner is currently offline." });
    }

    // Process for order confirmation 
    const currentTime = new Date().toISOString();

    const orderDocument = await order.findOneAndUpdate(
      { orderId: orderId },
      {
        $set: {
          status: "preparing",
          preparationCreatedAt: currentTime,
          preparationTime: time,
          nearbyPartner: 1,  // Assuming there's at least one partner
          deliveryStatus: "self"
        }
      },
      { new: true, session }
    );

    if (!orderDocument) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Order not found." });
    }

    const deliveryQuery = await deliveryPartner.findOne({ email: deliveryPartnerEmail }).session(session);

    if (!deliveryQuery) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Delivery partner not found." });
    }

    await order.updateOne(
      { orderId: orderId },
      {
        $set: {
          deliveryEmail: deliveryQuery.email,
          deliveryNumber: deliveryQuery.phoneNumber,
          deliveryProfile: deliveryQuery.profileImage,
          deliveryName: deliveryQuery.userName
        }
      },
      { session }
    );

    // Commit the transaction since all operations were successful
    await session.commitTransaction();
    session.endSession();

    // Now send notifications outside the transaction
    let deviceTokens = deliveryQuery.loginDevices.map(device => device.deviceToken);

    if (deviceTokens.length > 0) {
      try {
        // Send notification to the delivery person
        await firebase.messaging().sendEachForMulticast({
          tokens: deviceTokens,
          notification: {
            title: "New Order",
            body: `You have a new order.`,
          },
        });
      } catch (notificationError) {
        console.log(`Failed to send notification to delivery partner: ${notificationError.message}`);
        // Continue execution even if notification fails
      }
    }

    const customerEmail = orderDocument.customerEmail;
    const customerUser = await customer.findOne({ email: customerEmail });

    if (customerUser) {
      deviceTokens = customerUser.loginDevices.map(device => device.deviceToken);

      if (deviceTokens.length > 0) {
        try {
          await firebase.messaging().sendEachForMulticast({
            tokens: deviceTokens,
            notification: {
              title: "Order Confirm",
              body: `Your ${orderDocument.title} is preparing for you. It will be completed in ${time} minutes.`,
            },
          });
        } catch (notificationError) {
          // Continue execution even if notification fails
        }
      }
    }

    // Send response indicating success
    return res.status(200).json({ message: "Order updated and notifications sent." });

  } catch (error) {
    // If an error occurred, abort the transaction and log the error
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: "Internal server error." });
  }
});

app.get("/personaliseHomePage", async (req, res) => {
  const { page, latitude, longitude, type, searchQuery } = req.query;

  try {
    if (!page || isNaN(parseInt(page)) || !latitude || !longitude) {
      return res.status(400).json({ error: "Invalid page number or missing latitude/longitude" });
    }

    const itemsPerPage = 5;  // Number of restaurants per page
    const menusPerRestaurant = 3;  // Number of menus per restaurant
    const skip = (parseInt(page) - 1) * itemsPerPage;  // Calculate how many restaurants to skip for pagination

    const userLatitude = parseFloat(latitude);
    const userLongitude = parseFloat(longitude);

    // Calculate date for two weeks ago
    const twoWeeksAgo = moment().subtract(2, 'weeks').toDate();

    // Base query to find restaurants within 3000 meters, active, and created within the last 2 weeks
    const restaurantQuery = {
      'location.coordinates': {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [userLongitude, userLatitude]
          },
          $maxDistance: 3000
        }
      },
      status: "active",
      // createdAt: { $gte: twoWeeksAgo }
    };

    // Fetch restaurants with high rating and created within the last 2 weeks
    const nearbyRestaurants = await restaurant.find(restaurantQuery)
      .sort({ ratingStar: -1, createdAt: -1 })  // Sort by ratingStar descending and createdAt descending
      .skip(skip)
      .limit(itemsPerPage);

    if (nearbyRestaurants.length === 0) {
      return res.json([]);
    }

    const restaurantToMenusMap = {};

    for (const restaurant of nearbyRestaurants) {
      const menuQuery = {
        email: restaurant.email,
        status: "Active"
      };

      // If type is provided, add condition for type filtering
      if (type && type !== "All") {
        menuQuery.type = type;
      }

      // Fetch up to 3 menus per restaurant
      const menus = await menu.find(menuQuery).limit(menusPerRestaurant);
      if (menus.length > 0) {
        restaurantToMenusMap[restaurant.email] = menus;
      }
    }

    const restaurantEmails = Object.keys(restaurantToMenusMap);

    // Construct the final response
    const response = restaurantEmails.map(email => {
      const restaurant = nearbyRestaurants.find(r => r.email === email);
      return {
        _id: restaurant._id,
        email: restaurant.email,
        restaurantName: restaurant.restaurantName,
        rating: restaurant.rating,
        ratingStar: restaurant.ratingStar,
        description: restaurant.description,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        createdAt: restaurant.createdAt,
        status: restaurant.status,
        onlineStatus: restaurant.onlineStatus,
        menus: restaurantToMenusMap[email]
      };
    });

    res.json(response);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/nearbySearch", async (req, res) => {
  const { page, latitude, longitude, type, searchQuery } = req.query;

  try {
    if (!page || isNaN(parseInt(page)) || !latitude || !longitude) {
      return res.status(400).json({ error: "Invalid page number or missing latitude/longitude" });
    }

    const restaurantsPerPage = 7;
    const menusPerRestaurant = 3;
    const skip = (parseInt(page) - 1) * restaurantsPerPage;

    // Convert latitude and longitude to float
    const userLatitude = parseFloat(latitude);
    const userLongitude = parseFloat(longitude);

    // Construct base query for geospatial search for menus
    let menuQuery = {
      status: "Active"
    };

    // If type is provided, add condition for type filtering
    if (type && type !== "All") {
      menuQuery.type = type;
    }

     // Add search query conditions and scoring
     let searchConditions = [];
    // If search query is provided, construct search conditions
    if (searchQuery) {
      const searchWords = searchQuery.split(" ").filter(word => word.trim() !== "");
      const searchConditions = searchWords.map(word => {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return {
          $or: [
            { title: { $regex: `.*${escapedWord}.*`, $options: 'i' } },
            { description: { $regex: `.*${escapedWord}.*`, $options: 'i' } },
            { restaurantName: { $regex: `.*${escapedWord}.*`, $options: 'i' } },
            { type: { $regex: `.*${escapedWord}.*`, $options: 'i' } }
          ]
        };
      });
      menuQuery.$and = searchConditions;
    }

    const menus = await menu.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [userLongitude, userLatitude] },
          distanceField: "distance",
          maxDistance: 3000,
          spherical: true,
          query: { ...menuQuery, status: "Active" },
          key: "location.coordinates"
        }
      },
      {
        $addFields: {
          searchMatchScore: {
            $reduce: {
              input: searchConditions,
              initialValue: 0,
              in: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: [{ $setIntersection: ["$$this", "$$ROOT"] }, []] } }, 0] },
                  { $add: ["$$value", 1] },
                  "$$value"
                ]
              }
            }
          },
          priorityScore: {
            $add: [
              {
                $cond: [
                  { $eq: ["$ads", true] },
                  { $add: [10, { $divide: ["$cpc", 10] }] }, // Prioritize ads with highest score and cpc
                  0
                ]
              },
              "$ratingStar", // Add rating to the score
              { $multiply: ["$searchMatchScore", 2] } // Add search match score
            ]
          }
        }
      },
      { $sort: { priorityScore: -1, ratingStar: -1 } }, // Sort by priority score and rating
      {
        $group: {
          _id: "$email",
          menus: { $push: "$$ROOT" },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 1,
          menus: { $slice: ["$menus", menusPerRestaurant] }
        }
      },
      { $skip: skip }, // Skip already processed pages
      { $limit: restaurantsPerPage } // Limit the results to the required number of restaurants per page
    ]);
    

    if (menus.length === 0) {
      return res.json([]);
    }

    // Extract restaurant emails
    const restaurantEmails = menus.map(group => group._id);

    // Fetch restaurant details for the emails
    const nearbyRestaurants = await restaurant.find(
      {
        email: { $in: restaurantEmails },
        status: "active"
      },
      {
        email: 1,
        restaurantName: 1,
        rating: 1,
        ratingStar: 1,
        description: 1,
        latitude: 1,
        longitude: 1,
        createdAt: 1,
        status: 1,
        onlineStatus: 1,
      }
    );
    
    // Create a map of restaurant email to their details
    const emailToRestaurantMap = nearbyRestaurants.reduce((map, restaurant) => {
      map[restaurant.email] = restaurant;
      return map;
    }, {});

    // Construct the final response
    const response = menus.map(menuGroup => {
      const restaurant = emailToRestaurantMap[menuGroup._id];
      if (!restaurant) {
        return null;
      }
      return {
        _id: restaurant._id,
        email: restaurant.email,
        restaurantName: restaurant.restaurantName,
        rating: restaurant.rating,
        ratingStar: restaurant.ratingStar,
        description: restaurant.description,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        createdAt: restaurant.createdAt,
        status: restaurant.status,
        onlineStatus: restaurant.onlineStatus,
        menus: menuGroup.menus
      };
    }).filter(item => item !== null); // Filter out any null values

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});






app.get("/checkRestaurantActiveStatus", async (req, res) => {
  const { restaurantEmail, customerEmail, latitude, longitude } = req.query;

  try {
    // Query the restaurant collection to find the restaurant with the provided email
    const restaurantData = await restaurant.findOne({ email: restaurantEmail });

    if (restaurantData) {
      // Check if the restaurant's onlineStatus field is "online"
      if (restaurantData.onlineStatus === "online") {
        // If the restaurant is online, proceed to check customer details
        const customerData = await customer.findOne({ email: customerEmail });
        console.log(customerData)

        if (customerData) {
          // If customer data is found, extract customerName and phoneNumber
          const { userName, phoneNumber } = customerData;
          let nearbyDeliveryPartners = false;
          let selfDelivery = false;

          // Check if the linkIds array is empty
          if (restaurantData.linkIds && restaurantData.linkIds.length > 0) {
            selfDelivery = true;
          } else {
            // Query the deliveryPartner collection to find nearby available delivery partners
            const deliveryPartnerQuery = {
              'location.coordinates': {
                $near: {
                  $geometry: {
                    type: "Point",
                    coordinates: [parseFloat(longitude), parseFloat(latitude)]
                  },
                  $maxDistance: 3000 // distance in meters
                }
              },
              status: "active",
              onlineStatus: "online",
              activeOrders: { $lt: 3 },
              linkStatus: "unlinked"
            };

            // Use findOne to check for at least one delivery partner meeting the criteria
            const deliveryPartnerDoc = await deliveryPartner.findOne(deliveryPartnerQuery);
            nearbyDeliveryPartners = !!deliveryPartnerDoc; // true if a document is found, otherwise false
          }

          const responseData = {
            // ...restaurantData.toObject(),
            userName,
            phoneNumber,
            nearbyDeliveryPartners,
            selfDelivery
          };
          // Send the response
          return res.status(200).json(responseData);
        } else {
          // If no customer data is found, send a response without customerName and phoneNumber
          return res.status(200).json({ message: 'User with the provided email does not exist' });
        }
      } else {
        // If the restaurant is not online, send a 503 response
        return res.status(503).json({ message: 'Currently, the restaurant is closed.' });
      }
    } else {
      // If no restaurant data is found, send a 404 response
      return res.status(404).json({ message: 'Restaurant with the provided email does not exist' });
    }
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.patch("/remeberUserForLater", async (req, res) => {
  const { userName, phoneNumber, email } = req.body;
  try {
    // Find the customer by email and update their information
    const customerExist = await customer.findOneAndUpdate(
      { email },
      { userName, phoneNumber },
      { new: true }
    );

    // If the customer is not found, you might want to handle that case
    if (!customerExist) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // You can send a success response with the updated customer document
    res.json({ message: 'Customer information updated successfully' });
  } catch (error) {
    // Handle any errors that occur during the update process
    res.status(500).json({ error: "Internal server error." });
  }
});


app.post("/placeOrder", verifyTokenAndDevice, async (req, res) => {
  const { menus, gst, deliveryFees, customerName, customerCoordinates, phoneNumber, customerEmail, distance, customerId,customerAddress } = req.body;

  // Check if all required fields are present in the request body
  if (!customerId || !menus || !gst || !deliveryFees || !customerCoordinates || !phoneNumber || !customerEmail || !distance || !customerName || !customerAddress) {
    return res.status(401).json({ error: "Missing required fields in request body" });
  } else if (distance >= 13) {
    return res.status(401).json({ error: "Unavailable delivery for this location." });
  }

  let session;
  let orderId;

  try {
    // Start a session
    session = await mongoose.startSession();
    session.startTransaction();

    // Extract all menu IDs from the request
    const menuIdsStock = menus.map(item => item._id);

    // Find all menu items with the given IDs
    const menuItems = await menu.find({ _id: { $in: menuIdsStock } }).session(session);

    if (!Array.isArray(menuItems)) {
      return res.status(401).json({ error: "Failed to retrieve menu items as an array" });
    }

    // Check if any menu item is out of stock and map to titles
    const outOfStockItems = menus.filter(item => {
      const menuItem = menuItems.find(mi => mi._id.toString() === item._id);
      return !menuItem || menuItem.availableStatus !== "in stock";
    }).map(item => item.title);

    if (outOfStockItems.length > 0) {
      let errorMessage;
      if (outOfStockItems.length === 1) {
        errorMessage = `${outOfStockItems[0]} is out of stock`;
      } else {
        errorMessage = `${outOfStockItems.join(', ')} are out of stock`;
      }
      return res.status(400).json({ error: errorMessage });
    }

      // Calculate the total amount spent on the items in the order
      const totalAmountSpent = menus.reduce((total, item) => total + (parseFloat(item.price) * parseInt(item.quantity)), 0);
    // Check how many times the customer has placed an order from this restaurant
    const restaurantId = menus[0].restaurantId;
    let numberOfOrder = 0;
    const currentTime = new Date();

    const existingCustomer = await customer.findOne({ email: customerEmail, "orderedRestaurant.restaurantId": restaurantId }).session(session);
    if (existingCustomer) {
      const existingRestaurant = existingCustomer.orderedRestaurant.find(r => r.restaurantId.toString() === restaurantId.toString());
      if (existingRestaurant) {
        numberOfOrder = existingRestaurant.numberOfOrder;
      }
    }

    // Update the number of orders for this restaurant and set the lastOrderAt field
    await customer.updateOne(
      { email: customerEmail, "orderedRestaurant.restaurantId": restaurantId },
      { 
        $inc: { "orderedRestaurant.$.numberOfOrder": 1, "orderedRestaurant.$.amountSpentOnItem": totalAmountSpent },
        $set: { "orderedRestaurant.$.lastOrderAt": currentTime }
      },
      { upsert: false, session }
    );

    await customer.findOneAndUpdate(
      { email: customerEmail, "orderedRestaurant.restaurantId": { $ne: restaurantId } },
      {
        $push: {
          orderedRestaurant: {
            restaurantId: restaurantId,
            numberOfOrder: 1,
            lastOrderAt: currentTime,
            amountSpentOnItem: totalAmountSpent
          }
        }
      },
      { new: true, session }
    );

    // Generate unique number with a specific range
    const uniqueNumber = Math.floor(Math.random() * 1000000000);

    // Pad the unique number to reach 8 characters in length
    const paddedNumber = uniqueNumber.toString().padStart(8, '0');

    // Generate order ID with prefix XF and padded unique number
    orderId = `XF${paddedNumber}`;

    // Extracting specific fields to arrays
    const titles = menus.map(item => item.title);
    const prices = menus.map(item => item.price);
    const menuIds = menus.map(item => item._id);
    const comparePrices = menus.map(item => item.comparePrice);
    const urls = menus.map(item => item.url);
    const quantities = menus.map(item => item.quantity);
    const descriptions = menus.map(item => item.description);
    const types = menus.map(item => item.type);
    const selectedVariants = menus
      .filter(item => item.selectedVariant && item.selectedVariant.trim() !== "")
      .map(item => ({ items: item.selectedVariant }));

    // Construct the order data
    const orderData = {
      orderId: orderId,
      title: titles,
      price: prices,
      menuId: menuIds,
      comparePrice: comparePrices,
      url: urls,
      quantity: quantities,
      description: descriptions,
      type: types,
      selectedVariant: selectedVariants,
      restaurantEmail: menus[0].email,
      restaurantId: menus[0].restaurantId,
      restaurantAddress: meunus[0].restaurantAddress,
      customerId: customerId,
      restaurantName: menus[0].restaurantName,
      customerEmail: customerEmail,
      restaurantLatitude: menus[0].latitude,
      restaurantLongitude: menus[0].longitude,
      numberOfOrder: numberOfOrder + 1, // Include the current order
      lastOrderAt: currentTime, // Add last order time
      customerLatitude: customerCoordinates.latitude,
      customerLongitude: customerCoordinates.longitude,
      customerNumber: phoneNumber,
      customerAddress:customerAddress,
      customerName: customerName,
      restaurantNumber: menus[0].phoneNumber,
      gst: gst,
      deliveryFees: deliveryFees,
    };

    // Save order details to MongoDB
    const orderModel = new order(orderData);
    await orderModel.save({ session });

    const email = menus[0].email;

    let deviceTokens = [];

    // Find document with the given email and retrieve device tokens
    const user = await restaurant.findOne({ email }).session(session);
    if (user) {
      deviceTokens = user.loginDevices.map(device => device.deviceToken);
    }

    // Calculate the total price of the order
    const totalPrice = menus.reduce((total, item) => total + (parseFloat(item.price) * parseInt(item.quantity)), 0);

    if (deviceTokens.length > 0) {
      await firebase.messaging().sendEachForMulticast({
        tokens: deviceTokens,
        notification: {
          title: "New Order",
          body: `You have a New order for ${titles.join(', ')} total ${menus.length} items. totaling : ₹${totalPrice}`,
        },
      });
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Start checking order status after 7 minutes
    checkOrderStatus({ orderId, title: menus.title });
    // If notification sent successfully, send response to user
    return res.status(200).json(orderId);
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

app.patch("/cancelOrder", verifyTokenAndDevice, async (req, res) => {
  const { orderId, title, reason, role } = req.body;
  const reasonData = ["Out of stock", "Delivery Unavailable", "Not Feeling Well", "Others"];

  if (!orderId || !role || !['customer', 'restaurant', 'delivery'].includes(role) || !title) {
    return res.status(401).json({ error: "Unauthorized request" });
  } else if (role === "restaurant" && !reason) {
    return res.status(401).json({ error: "Unauthorized request" });
  } else if (role === "restaurant" && !reasonData.includes(reason)) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  let session;

  try {
    // Start a session
    session = await mongoose.startSession();
    session.startTransaction();

    // Find document by orderId
    const ordersCollection = await order.findOne({ orderId }).session(session);

    if (!ordersCollection) {
      return res.status(404).json({ error: "Order not found" });
    } else if (ordersCollection.status === "cancel") {
      return res.status(400).json({ error: "Order already canceled" });
    }

    // Calculate the difference in minutes between current time and order creation time
    const currentTime = new Date();
    const orderCreatedAt = new Date(ordersCollection.createdAt);
    const timeDifferenceInMinutes = (currentTime - orderCreatedAt) / (1000 * 60);

    // Check if more than 3 minutes have passed since order creation
    if (timeDifferenceInMinutes > 300) {
      return res.status(400).json({ error: "Cannot cancel order after 3 minutes of creation" });
    }

    // Calculate the total amount spent for the order
    const totalAmountSpent = ordersCollection.price.reduce((total, price, index) => {
      return total + (parseFloat(price) * parseInt(ordersCollection.quantity[index]));
    }, 0);

    let reasonOfCancel = '';

    // If it's within 3 minutes, proceed to cancel the order
    switch (role) {
      case 'customer':
        if (ordersCollection.status === 'ordered') {
          reasonOfCancel = 'Order canceled by the customer because they no longer need it. As per policy, you will receive 0% compensation of the order value since it was canceled before confirmation';
        } else if (ordersCollection.status === 'preparing' || ordersCollection.status === 'ready') {
          const preparationCreatedAt = new Date(ordersCollection.preparationCreatedAt);
          const preparationTime = ordersCollection.preparationTime; // in minutes
          const preparationTimeElapsed = Math.floor((currentTime - preparationCreatedAt) / (1000 * 60));
          console.log(preparationTimeElapsed)
  
          if ((preparationTime <= 15 && preparationTimeElapsed <= 7) ||
              (preparationTime > 15 && preparationTime <= 30 && preparationTimeElapsed <= 20) ||
              (preparationTime > 30 && preparationTime <= 45 && preparationTimeElapsed <= 30)) {
            reasonOfCancel = 'Order canceled by the customer because they no longer need it. As per policy, you will receive 0% compensation of the order value since it was canceled before pick-up and the time gap between the start of preparation and the cancellation was minimal';
          } else {
            reasonOfCancel = 'Order canceled by the customer because they no longer need it. As per policy, you will receive 25% compensation of the order value since it was canceled before pick-up';
  
            // Update the restaurant's balance with 25% of the order value
            const compensation = parseFloat(totalAmountSpent) * 0.25;
            await restaurant.updateOne(
              { email: ordersCollection.restaurantEmail },
              { $inc: { balance: compensation } },
              { session }
            );
          }
        } else if(ordersCollection.status === 'pick up'){
          reasonOfCancel = 'Order canceled by the customer because they no longer need it. As per policy, you will receive 60% compensation of the order value since it was canceled after pick-up';
  
            // Update the restaurant's balance with 60% of the order value
            const compensation = parseFloat(totalAmountSpent) * 0.60;
            await restaurant.updateOne(
              { email: ordersCollection.restaurantEmail },
              { $inc: { balance: compensation } },
              { session }
            );

            const deliveryCompensation = parseInt(ordersCollection.deliveryFees) + parseInt(ordersCollection.processingFees);
            console.log(typeof deliveryCompensation)
            await deliveryPartner.updateOne(
              { email: ordersCollection.deliveryEmail },
              { $inc: { balance: deliveryCompensation } },
              { session }
            );

        } else {
          return res.status(400).json({ error: "Order cannot be canceled at this stage" });
        }
        // Update order status to cancel
        await order.updateOne({ orderId }, { $set: { status: 'cancel',reasonOfCancel, cancelBy: 'Order canceled by customer' } }).session(session);

        // Update the customer's total amount spent
        await customer.updateOne(
          { email: ordersCollection.customerEmail, "orderedRestaurant.restaurantId": ordersCollection.restaurantId },
          { 
            $inc: { "orderedRestaurant.$.amountSpentOnItem": -totalAmountSpent }
          },
          { session }
        );

        // Send notification to restaurant
        try {
          const email = ordersCollection.restaurantEmail;
          let deviceTokens = [];

          const user = await restaurant.findOne({ email }).session(session);
          if (user) {
            deviceTokens = user.loginDevices.map(device => device.deviceToken);
          }

          if (deviceTokens.length > 0) {
            await firebase.messaging().sendEachForMulticast({
              tokens: deviceTokens,
              notification: {
                title: "Order Cancelled",
                body: `Order for ${title} has been cancelled by the customer. Order ID: ${orderId}`,
              },
            });
          }
        } catch (error) {
          console.log('Error sending notification to restaurant:', error);
        }
        break;

      case 'restaurant':

        if (ordersCollection.status === 'ordered') {
          reasonOfCancel = `Order rejected by the restaurant Reason: ${reason}`;
        } else if (ordersCollection.status === 'preparing') {
  
          if (reason === "Delivery Unavailable") {
            reasonOfCancel = `Order canceled by the restaurant. Reason: ${reason}. As per policy, you will receive 25% compensation of the order value since it was canceled before pick-up.`;

            // Update the restaurant's balance with 25% of the order value
            const compensation = parseFloat(totalAmountSpent) * 0.25;
            await restaurant.updateOne(
              { email: ordersCollection.restaurantEmail },
              { $inc: { balance: compensation } },
              { session }
            );
            
          } else {
            reasonOfCancel = `Order canceled by the restaurant. Reason: ${reason}. As per policy, you will receive 0% compensation of the order value since the cancellation was due to ${reason}.`;
          }

        } else {
          return res.status(400).json({ error: "Order cannot be canceled at this stage" });
        }
        // Update order status to cancel
        await order.updateOne({ orderId }, { $set: { status: 'cancel', cancelBy: `Order canceled by restaurant ${reason}` } }).session(session);

        // Update the customer's total amount spent
        await customer.updateOne(
          { email: ordersCollection.customerEmail, "orderedRestaurant.restaurantId": ordersCollection.restaurantId },
          { 
            $inc: { "orderedRestaurant.$.amountSpentOnItem": -totalAmountSpent }
          },
          { session }
        );

        // Send notification to customer
        try {
          const email = ordersCollection.customerEmail;
          let deviceTokens = [];

          const user = await customer.findOne({ email }).session(session);
          if (user) {
            deviceTokens = user.loginDevices.map(device => device.deviceToken);
          }

          if (deviceTokens.length > 0) {
            await firebase.messaging().sendEachForMulticast({
              tokens: deviceTokens,
              notification: {
                title: "Order Cancelled",
                body: `Order for ${title} has been cancelled by the restaurant ${reason === "Others" ? "due to some reason" : reason}. Order ID: ${orderId}`,
              },
            });
          }
        } catch (error) {
          console.log('Error sending notification to customer:', error);
        }
        break;
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Order canceled successfully" });
  } catch (error) {
    console.log(error)
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
});



app.get("/orderInformation/:orderId/:role", verifyTokenAndDevice, async (req, res) => {
  const { orderId, role } = req.params;

  // Ensure that only requests from customers and delivery personnel are accepted
  if (role !== 'customer' && role !== 'delivery') {
    return res.status(403).json({ error: "Forbidden." });
  }

  if (!orderId) {
    return res.status(401).json({ error: "Unauthorized request." });
  }

  try {
    // Find the order document based on orderId
    const orderInfo = await order.findOne({ orderId });

    if (!orderInfo) {
      return res.status(404).json({ error: "Order not found." });
    }

    // Decrypt customerOtp if the role is customer and the otp is not verified or yet to set
    if (role === 'customer' && orderInfo.customerOtp !== 'verified' && orderInfo.customerOtp !== 'yet to set') {
      // Decrypt the customerOtp here (assuming you have a decryption function)
      // Replace 'decryptedOtp' with the actual decrypted OTP
      const decryptedOtp = otpUtils.decryptOTP(orderInfo.customerOtp);
      // Replace the encrypted OTP in orderInfo with the decrypted one
      orderInfo.customerOtp = decryptedOtp;
    }

    res.status(200).json(orderInfo);
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/orderList", async (req, res) => {
  const { email, role, status } = req.body;
  const { page } = req.query;
  const itemsPerPage = 15;
  let skip = 0;

  if (!email || !role) {
    return res.status(400).json("Unauthorized request.");
  }

  if (page && parseInt(page) > 1) {
    skip = (parseInt(page) - 1) * itemsPerPage;
  }

  try {
    let orderList;
    let query = {};

    switch (role) {
      case "customer":
        query.customerEmail = email;
        break;
      case "restaurant":
        query.restaurantEmail = email;
        // Remove the status filter if it is "dispute"
        if (status && status !== "dispute") {
          if (status !== "ordered" && status !== "delivered" && status !== "cancel") {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const twoHoursAgoString = twoHoursAgo.toISOString();
            query.preparationCreatedAt = { $gte: twoHoursAgoString };
            query.status = status;
          }
          else {
            query.status = status;
          }
        }
        // If status is "dispute", apply additional filter criteria
        if (status === "dispute") {
          query.status = { $nin: ["delivered", "cancel", "pick up", "ordered"] };
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
          const twoHoursAgoString = twoHoursAgo.toISOString();
          query.preparationCreatedAt = { $lte: twoHoursAgoString };
        }
        break;
      case "delivery":
        query.deliveryEmail = email;

        // Exclude documents created more than 3 minutes ago unless status is "dispute"
        if (status == "preparing") {
          query.status = "preparing";
          query.assignStatus = "yet to assign";
          const oneMinutesAgo = new Date(Date.now() - 1 * 60 * 1000); // Subtracting 1 minutes
          const oneMinutesAgoString = oneMinutesAgo.toISOString();
          query.assignAt = { $gte: oneMinutesAgoString };
        }
        else if (status === "assign") {
          query.status = "preparing";
          const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 60 * 1000); // Subtracting 3 hours
          const threeMinutesAgoString = threeMinutesAgo.toISOString();
          query.preparationCreatedAt = { $gte: threeMinutesAgoString };
          query.assignStatus = status;
        } else if (status && status !== "dispute") {
          // Remove the status filter if it is "dispute"
          if (status !== "ordered" && status !== "delivered") {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const twoHoursAgoString = twoHoursAgo.toISOString();
            query.preparationCreatedAt = { $gte: twoHoursAgoString };
            query.status = status;
          } else {
            query.status = status;
          }
        }
        // If status is "dispute", apply additional filter criteria
        else if (status === "dispute") {
          query.status = { $nin: ["delivered", "cancel", "ordered", "preparing"] };
          query.assignStatus = "assign"; // Ensure assignStatus is "assign"
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
          const twoHoursAgoString = twoHoursAgo.toISOString();
          query.preparationCreatedAt = { $lte: twoHoursAgoString };
        }

        break;
      default:
        return res.status(400).json("Invalid role.");
    }


    orderList = await order.find(query).sort({ createdAt: -1 }).skip(skip).limit(itemsPerPage);

    if (!orderList) {
      return res.status(404).json("Order not found.");
    }


    orderList = orderList.filter(order => {
      const isOrdered = order.status === "ordered";
      const currentTime = Date.now();

      // Check if the order is more than 2 minutes old
      const isMoreThan2_5MinutesOrdered = isOrdered && (currentTime - order.createdAt.getTime()) > (2.5 * 60 * 1000);

      // Return true if the order meets none of the filtering conditions
      return !(isMoreThan2_5MinutesOrdered);
    });


    // Decrypt OTP field for restaurant role
    if (role === "restaurant") {
      orderList = orderList.map(order => {
        if (order.restaurantOtp !== "yet to set" && order.restaurantOtp !== "verified") {
          const decryptedOTP = otpUtils.decryptOTP(order.restaurantOtp);
          order.restaurantOtp = decryptedOTP;
        }
        return order;
      });
    } else if (role === "customer") {
      orderList = orderList.map(order => {
        if (order.customerOtp !== "yet to set" && order.customerOtp !== "verified") {
          const decryptedOTP = otpUtils.decryptOTP(order.customerOtp);
          order.customerOtp = decryptedOTP;
        }
        return order;
      });
    }

    // If orderList is empty after filtering, return empty response
    if (orderList.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(orderList);
  } catch (error) {
    res.status(500).json("Internal Server Error.");
  }
});

// endpoint to mark orders as ready
app.patch("/restaurantOrderHandler", verifyTokenAndDevice, async (req, res) => {
  const { orderId } = req.body;

  try {
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    // Find and update the order document if it meets the conditions
    const result = await order.updateOne(
      {
        orderId,
        status: "preparing"
      },
      { $set: { status: "ready" } }
    );

    if (result.nModified === 0) {
      return res.status(400).json({ message: "Order is not in preparing status or Order ID does not exist." });
    }

    res.status(200).json({ message: "Order status updated to ready." });

  } catch (error) {
    res.status(500).json({ message: "Internal Server Error." });
  }
});




app.patch("/deliveryOrderHandler", verifyTokenAndDevice, async (req, res) => {
  const { orderId, event, otp } = req.body;

  try {
    // Input validation
    if (!orderId || !event) {
      return res.status(400).json({ error: "Event, order ID, and OTP are required." });
    }

    let update;
    switch (event) {
      case "accept":
        update = "assign";
        break;
      case "pick up":
        update = "pick up";
        break;
      case "delivered":
        update = "delivered";
        break;
      default:
        return res.status(400).json({ error: "Invalid event." });
    }

    let updatedOrder;

    if (event === "accept") {
      const verifyOtp = await order.findOne({ orderId });
      if (!verifyOtp || verifyOtp.assignStatus === "assign") {
        return res.status(401).json({ message: "Bad request." });
      } else {
        const generatedOTP = await otpUtils.generateOTP();
        const encryptedOTP = await otpUtils.encryptOTP(generatedOTP);

        updatedOrder = await order.findOneAndUpdate(
          { orderId },
          { $set: { assignStatus: update, restaurantOtp: encryptedOTP } },
          { new: true }
        );
        // Increment daily_orders and active_orders by 1
        await deliveryPartner.updateOne(
          { email: updatedOrder.deliveryEmail },
          { $inc: { dailyOrders: 1, activeOrders: 1 } }
        );
      }
    } else if (event === "pick up") {
      if (!otp) {
        return res.status(400).json({ error: "OTP is required for this event." });
      } else {
        const otpVerify = await order.findOne({ orderId });
        if (!otpVerify || otpVerify.status === "pick up") {
          return res.status(401).json({ message: "Bad request." });
        }

        const decryptedOTP = await otpUtils.decryptOTP(otpVerify.restaurantOtp);
        if (decryptedOTP === otp) {
          const generatedOTP = await otpUtils.generateOTP();
          const encryptedOTP = await otpUtils.encryptOTP(generatedOTP);

          updatedOrder = await order.findOneAndUpdate(
            { orderId },
            { $set: { status: update, customerOtp: encryptedOTP, restaurantOtp: "verified" } },
            { new: true }
          );
        } else {
          return res.status(401).json({ error: "Invalid OTP." });
        }
      }

    } else if (event === "delivered") {
      if (!otp) {
        return res.status(400).json({ error: "OTP is required for this event." });
      } else {
        const otpVerify = await order.findOne({ orderId });
        if (!otpVerify || otpVerify.status === "delivered") {
          return res.status(401).json({ message: "Bad request." });
        }

        const decryptedOTP = await otpUtils.decryptOTP(otpVerify.customerOtp);
        if (decryptedOTP === otp) {
          updatedOrder = await order.findOneAndUpdate(
            { orderId },
            { $set: { status: update, customerOtp: "verified" } },
            { new: true }
          );
          // Decrement active_orders by 1
          await deliveryPartner.updateOne(
            { email: updatedOrder.deliveryEmail },
            { $inc: { activeOrders: -1 } }
          );
        } else {
          return res.status(401).json({ error: "Invalid OTP." });
        }
      }

    }

    if (!updatedOrder) {
      return res.status(404).json({ error: "Order not found." });
    }

    res.status(200).json({ message: "otp verified" });
  } catch (error) {
    console.log(error.message)
    res.status(500).json({ error: "Internal server error" });
  }
});



app.get("/calculateDistance", async (req, res) => {
  const { startCoordinates, endCoordinates } = req.query;

  try {
    const accessToken = process.env.DISTANCE_KEY;
    const apiUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoordinates};${endCoordinates}?access_token=${accessToken}`;

    const response = await fetch(apiUrl, {
      method: 'GET' // Specify the HTTP method as GET
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: "Internal server error." });
    }

    const routeInfo = data.routes[0];

    const distanceInKm = (routeInfo.distance / 1000).toFixed(2); // Convert distance from meters to kilometers and round to 2 decimal places

    // Convert duration to hours, minutes, and seconds
    const durationInSeconds = routeInfo.duration;
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = Math.round(durationInSeconds % 60); // Round seconds to the nearest whole number

    let durationString = '';
    if (hours > 0) {
      durationString += `${hours} hour${hours > 1 ? 's' : ''} `;
    }
    if (minutes > 0) {
      durationString += `${minutes} minute${minutes > 1 ? 's' : ''} `;
    }
    if (seconds > 0) {
      durationString += `${seconds} second${seconds > 1 ? 's' : ''}`;
    }

    res.json({ distance: distanceInKm, duration: durationString });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

// endpoint for upadating rating after delivery complete
app.patch("/updateRating", async (req, res) => {
  const requestBody = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if all required fields are present in the request body
    if (!requestBody.orderId || requestBody.rating === undefined || !requestBody.email || !requestBody.profileImage || !requestBody.userName) {
      return res.status(400).json({ error: "Missing field(s) in the request body." });
    }

    // Find the order by its ID and update the rating and comment fields
    const updateDoc = await order.findOneAndUpdate(
      { orderId: requestBody.orderId },
      { $set: { starRating: requestBody.rating, review: requestBody.comment } },
      { new: true, session }
    );

    // Check if the order exists and is updated successfully
    if (!updateDoc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Order not found." });
    }

    // Find the restaurant document by its email and update the rating and ratingStar fields
    const restaurantUpdate = await restaurant.findOneAndUpdate(
      { email: updateDoc.restaurantEmail },
      { $inc: { rating: 1, ratingStar: requestBody.rating } },
      { new: true, session }
    );

    if (!restaurantUpdate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Restaurant not found." });
    }

    await session.commitTransaction();
    session.endSession();

    // Return a success message
    res.status(200).json({ message: "Review submission successful." });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: "Internal server error." });
  }
});



// rating 
app.post("/submitReview", verifyTokenAndDevice, async (req, res) => {
  const reviewData = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!reviewData.customerId || !reviewData.restuarantId || !reviewData.starRating || !reviewData.menuId || !reviewData.userEmail || !reviewData.profileImage || !reviewData.userName) {
      return res.status(401).json({ error: "Missing field." });
    }

    // Create a new instance of the Rating model
    const newRating = new rating({
      menuId: reviewData.menuId,
      restaurantId: reviewData.restaurantId,
      customerId: reviewData.customerId,
      starRating: reviewData.starRating,
      comment: reviewData.comment,
      userEmail: reviewData.userEmail,
      profileImage: reviewData.profileImage,
      userName: reviewData.userName
    });

    // Save the new rating document to the database
    await newRating.save({ session });

    // Update the rating fields in the menu schema within the transaction
    const updatedMenu = await menu.findOneAndUpdate(
      { _id: reviewData.menuId },
      {
        $inc: {
          ratingStar: reviewData.starRating, // Increment the total rating stars
          rating: 1 // Increment the total number of ratings
        }
      },
      { new: true, session }
    );

    if (!updatedMenu) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Menu not found." });
    }

    // Extract restaurantEmail from the updated menu
    const { email } = updatedMenu;

    // Update the restaurant's rating within the transaction
    await restaurant.findOneAndUpdate(
      { email: email },
      {
        $inc: {
          ratingStar: reviewData.starRating, // Increment the restaurant's total rating stars
          rating: 1 // Increment the restaurant's total number of ratings
        }
      },
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    // Return a success message
    res.status(200).json({ message: "Review submission successful." });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: "Internal server error." });
  }
});



app.patch("/editReview", verifyTokenAndDevice, async (req, res) => {
  const reviewData = req.body;
  const session = await mongoose.startSession();

  try {
    if (!reviewData.starRating || !reviewData.userEmail || !reviewData.menuId) {
      return res.status(401).json({ error: "Missing field." });
    }

    // Start the transaction
    session.startTransaction();

    // Find the existing review to calculate the difference in star ratings
    const filter = { userEmail: reviewData.userEmail, menuId: reviewData.menuId };
    const existingReview = await rating.findOne(filter).session(session);

    if (!existingReview) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Review not found." });
    }

    // Calculate the difference in star ratings
    const starRatingDifference = reviewData.starRating - existingReview.starRating;

    // Update the review document with the new star rating and comment
    const update = {
      starRating: reviewData.starRating,
      comment: reviewData.comment || existingReview.comment, // Retain the old comment if not provided
    };
    const updatedReview = await rating.findOneAndUpdate(filter, update, { new: true }).session(session);

    if (starRatingDifference !== 0) {
      // Update the ratingStar field in the menu document
      const updatedMenu = await menu.findOneAndUpdate(
        { _id: reviewData.menuId },
        { $inc: { ratingStar: starRatingDifference } },
        { new: true, session }
      );

      if (!updatedMenu) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ error: "Menu not found." });
      }

      // Update the restaurant's rating based on the menu's restaurantEmail
      await restaurant.findOneAndUpdate(
        { email: updatedMenu.email },
        {
          $inc: {
            ratingStar: starRatingDifference,
            // Optionally, you can also adjust the totalRatings if needed
            // totalRatings: 1 // Increment by 1 for new ratings, or do nothing if only stars change
          }
        },
        { new: true, session }
      );
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return a success message with the updated review
    res.status(200).json({
      message: "Review edited successfully.",
      updatedReview
    });
  } catch (error) {
    // Abort the transaction in case of error
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({ error: "Internal server error." });
  }
});




app.post("/getReviews", async (req, res) => {
  const { menuId, email } = req.body;
  const page = parseInt(req.body.page) || 1; // Default page to 1 if not provided
  const perPage = 7; // Default to 5 documents per page

  try {
    if (!menuId) {
      return res.status(400).json({ error: "MenuId required." });
    }

    // Query to get total number of reviews
    const totalReviews = await rating.countDocuments({ menuId: menuId });

    // Query to get the count of reviews for each star rating
    const ratingDistributionResult = await rating.aggregate([
      { $match: { menuId: menuId } },
      {
        $group: {
          _id: "$starRating",
          count: { $sum: 1 }
        }
      }
    ]);

    // Initialize counts for each star rating
    let count1Star = 0,
      count2Star = 0,
      count3Star = 0,
      count4Star = 0,
      count5Star = 0;

    // Update counts based on the result
    ratingDistributionResult.forEach((result) => {
      switch (result._id) {
        case 1:
          count1Star = result.count;
          break;
        case 2:
          count2Star = result.count;
          break;
        case 3:
          count3Star = result.count;
          break;
        case 4:
          count4Star = result.count;
          break;
        case 5:
          count5Star = result.count;
          break;
      }
    });

    // Query to get average rating
    const averageRatingResult = await rating.aggregate([
      { $match: { menuId: menuId } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$starRating" }
        }
      }
    ]);

    // Extract average rating from the result
    let averageRating = 0;
    if (averageRatingResult.length > 0) {
      averageRating = averageRatingResult[0].averageRating;
    }

    const totalPages = Math.ceil(totalReviews / perPage);
    const skip = (page - 1) * perPage;

    // Query to get paginated reviews
    let findReviews;
    if (page === 1) {
      if (email) {
        // Fetch the user's review document along with the paginated reviews
        findReviews = await rating.find({ menuId: menuId, userEmail: email })
          .sort({ createdAt: -1 }) // Sort by creation time
          .limit(1); // Limit to 1 document
        // If the document is found, fetch the remaining paginated reviews
        if (findReviews.length > 0) {
          const remainingReviews = await rating.find({ menuId: menuId, _id: { $ne: findReviews[0]._id } })
            .sort({ createdAt: -1 })
            .skip(0) // Skip 0 for the remaining reviews
            .limit(perPage - 1); // Limit to 1 less because we already fetched 1 document
          findReviews = findReviews.concat(remainingReviews);
        } else {
          // If the document is not found, fetch all paginated reviews
          findReviews = await rating.find({ menuId: menuId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(perPage);
        }
      } else {
        // Fetch only the paginated reviews
        findReviews = await rating.find({ menuId: menuId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(perPage);
      }
    } else {
      // Fetch only the paginated reviews
      findReviews = await rating.find({ menuId: menuId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage);
    }



    if (!findReviews || findReviews.length === 0) {
      return res.status(404).json({ error: "No reviews found for this menuId." });
    }

    // Send back the total number of reviews, counts for each star rating, average rating, and paginated reviews
    res.status(200).json({
      totalReviews: totalReviews,
      count1Star: count1Star,
      count2Star: count2Star,
      count3Star: count3Star,
      count4Star: count4Star,
      count5Star: count5Star,
      averageRating: averageRating,
      reviews: findReviews,
      totalPages: totalPages,
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});


app.patch("/requestMoreRider", async (req, res) => {
  try {
    const { order } = req.body;
    if (!order) {
      return res.status(401).json({ message: "Order payload is missing." });
    }

    // Find delivery partners within 3000 meters
    const deliveryPartners = await deliveryPartner.find({
      "location.coordinates": {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [order.restaurantLongitude, order.restaurantLatitude]
          },
          $maxDistance: 3000 // 3000 meters
        }
      },
      activeOrders: { $lt: 3 }, // Exclude those with 3 or more orders
      status: "active",
      onlineStatus: "online",
      linkStatus: "unlinked"
    })
      .limit(3) // Limit the result to 3 delivery partners
      .lean();

    // Calculate combined score and sort
    const sortedDeliveryPartners = deliveryPartners.map(partner => {
      const combinedScore = partner.dailyOrders + partner.failedOrders;
      return { ...partner, combinedScore };
    }).sort((a, b) => a.combinedScore - b.combinedScore);

    if (sortedDeliveryPartners.length === 0) {
      return res.status(404).send({
        message: 'Currently, there is no delivery partner available nearby. All partners are busy. Please contact the support team for assistance.'
      });
    }

    reAssignOrder(sortedDeliveryPartners, order.orderId);
    res.status(200).json({ message: "Request sent." });

  } catch (error) {
    console.log(error.message);
    res.status(500).json({ message: "Internal server error." });
  }
});



// Start the server
server.listen(PORT, () => {
  console.log(`Server is running at port no ${PORT}`);
});
